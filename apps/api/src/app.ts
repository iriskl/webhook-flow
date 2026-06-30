import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  deriveSigningKey,
  generateEndpointSecret,
  parseWorkflowDsl,
  samplePayloads,
  signPayload,
  signatureHeaderName,
  verifyPayloadSignature
} from "@webhook-flow/shared";
import { getPrisma } from "./db/client.js";
import { fromJsonText, toJsonText } from "./db/json.js";
import { AppError, sendError } from "./services/errors.js";
import { createExecutionsForEvent, processDueRetryJobs } from "./services/executor.js";
import { randomSuffix, slugifyName } from "./services/slug.js";
import { previewWorkflow, validateWorkflowText } from "./services/workflow-preview.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  const prisma = getPrisma();

  app.register(cors, { origin: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] });

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    request.rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    try {
      done(null, body.length === 0 ? {} : JSON.parse(body.toString("utf8")));
    } catch {
      done(new AppError(400, "请求体不是合法 JSON", "BAD_JSON"));
    }
  });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  app.get("/health", async () => ({ ok: true, service: "webhook-flow-api" }));

  app.get("/api/overview", async () => {
    const [endpoints, workflows, events, executions, recentEvents, recentExecutions] = await Promise.all([
      prisma.endpoint.count(),
      prisma.workflow.count(),
      prisma.event.count(),
      prisma.execution.count(),
      prisma.event.findMany({
        take: 5,
        orderBy: { receivedAt: "desc" },
        include: { endpoint: true, executions: true }
      }),
      prisma.execution.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { workflow: true, event: { include: { endpoint: true } } }
      })
    ]);
    return {
      stats: { endpoints, workflows, events, executions },
      recentEvents: recentEvents.map(serializeEventSummary),
      recentExecutions: recentExecutions.map(serializeExecutionSummary)
    };
  });

  app.post("/api/endpoints", async (request, reply) => {
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name || name.length > 80) {
      throw new AppError(400, "endpoint 名称不能为空，且不能超过 80 个字符", "INVALID_ENDPOINT_NAME");
    }
    const secret = generateEndpointSecret();
    const slugBase = slugifyName(name) || "endpoint";
    const endpoint = await prisma.endpoint.create({
      data: {
        name,
        slug: `${slugBase}-${randomSuffix()}`,
        secretHash: deriveSigningKey(secret)
      }
    });
    reply.status(201);
    return { ...serializeEndpoint(endpoint), secret, hookUrl: `/hooks/${endpoint.slug}` };
  });

  app.get("/api/endpoints", async () => {
    const endpoints = await prisma.endpoint.findMany({ orderBy: { createdAt: "desc" } });
    return { endpoints: endpoints.map(serializeEndpoint) };
  });

  app.get("/api/endpoints/:id", async (request) => {
    const { id } = request.params as { id: string };
    const endpoint = await prisma.endpoint.findUnique({
      where: { id },
      include: { workflows: true, events: { take: 5, orderBy: { receivedAt: "desc" } } }
    });
    if (!endpoint) throw new AppError(404, "endpoint 不存在", "ENDPOINT_NOT_FOUND");
    return {
      ...serializeEndpoint(endpoint),
      workflows: endpoint.workflows.map(serializeWorkflow),
      recentEvents: endpoint.events.map(serializeEventSummary)
    };
  });

  app.patch("/api/endpoints/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { enabled?: boolean; name?: string };
    const endpoint = await prisma.endpoint.update({
      where: { id },
      data: {
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        name: body.name?.trim() || undefined
      }
    });
    return serializeEndpoint(endpoint);
  });

  app.post("/api/endpoints/:id/rotate-secret", async (request) => {
    const { id } = request.params as { id: string };
    const secret = generateEndpointSecret();
    const endpoint = await prisma.endpoint.update({
      where: { id },
      data: { secretHash: deriveSigningKey(secret) }
    });
    return { ...serializeEndpoint(endpoint), secret };
  });

  app.post("/api/workflows/validate", async (request) => {
    const body = request.body as { dslText?: string };
    const result = validateWorkflowText(body.dslText ?? "");
    return {
      ok: result.ok,
      format: result.format,
      workflow: result.workflow,
      errors: result.errors
    };
  });

  app.post("/api/workflows", async (request, reply) => {
    const body = request.body as { endpointId?: string; dslText?: string; enabled?: boolean };
    const endpoint = await prisma.endpoint.findUnique({ where: { id: body.endpointId ?? "" } });
    if (!endpoint) throw new AppError(400, "绑定的 endpoint 不存在", "ENDPOINT_NOT_FOUND");
    const parsed = validateWorkflowText(body.dslText ?? "");
    if (!parsed.ok || !parsed.workflow || !parsed.format) {
      throw new AppError(400, parsed.errors.join("; "), "INVALID_WORKFLOW_DSL");
    }
    const workflow = await prisma.workflow.create({
      data: {
        name: parsed.workflow.name,
        endpointId: endpoint.id,
        dslText: body.dslText ?? "",
        dslFormat: parsed.format,
        enabled: body.enabled ?? true
      }
    });
    reply.status(201);
    return serializeWorkflow(workflow);
  });

  app.get("/api/workflows", async () => {
    const workflows = await prisma.workflow.findMany({
      orderBy: { updatedAt: "desc" },
      include: { endpoint: true }
    });
    return {
      workflows: workflows.map((workflow) => ({
        ...serializeWorkflow(workflow),
        endpoint: serializeEndpoint(workflow.endpoint)
      }))
    };
  });

  app.get("/api/workflows/:id", async (request) => {
    const { id } = request.params as { id: string };
    const workflow = await prisma.workflow.findUnique({ where: { id }, include: { endpoint: true } });
    if (!workflow) throw new AppError(404, "workflow 不存在", "WORKFLOW_NOT_FOUND");
    return { ...serializeWorkflow(workflow), endpoint: serializeEndpoint(workflow.endpoint) };
  });

  app.put("/api/workflows/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { endpointId?: string; dslText?: string; enabled?: boolean };
    const parsed = body.dslText ? validateWorkflowText(body.dslText) : undefined;
    if (parsed && (!parsed.ok || !parsed.workflow || !parsed.format)) {
      throw new AppError(400, parsed.errors.join("; "), "INVALID_WORKFLOW_DSL");
    }
    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        endpointId: body.endpointId,
        dslText: body.dslText,
        dslFormat: parsed?.format,
        name: parsed?.workflow?.name,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined
      }
    });
    return serializeWorkflow(workflow);
  });

  app.post("/api/workflows/:id/test", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { payload?: unknown; headers?: Record<string, string> };
    const workflow = await prisma.workflow.findUnique({ where: { id }, include: { endpoint: true } });
    if (!workflow) throw new AppError(404, "workflow 不存在", "WORKFLOW_NOT_FOUND");
    const parsed = parseWorkflowDsl(workflow.dslText, workflow.dslFormat as "yaml" | "json");
    if (!parsed.ok || !parsed.workflow) throw new AppError(400, parsed.errors.join("; "), "INVALID_WORKFLOW_DSL");
    return previewWorkflow(parsed.workflow, {
      body: body.payload ?? {},
      headers: body.headers ?? {},
      event: { endpointSlug: workflow.endpoint.slug }
    });
  });

  app.get("/api/events", async () => {
    const events = await prisma.event.findMany({
      take: 100,
      orderBy: { receivedAt: "desc" },
      include: { endpoint: true, executions: true }
    });
    return { events: events.map(serializeEventSummary) };
  });

  app.get("/api/events/:id", async (request) => {
    const { id } = request.params as { id: string };
    const event = await prisma.event.findUnique({
      where: { id },
      include: { endpoint: true, executions: { include: { workflow: true, stepLogs: true } } }
    });
    if (!event) throw new AppError(404, "事件不存在", "EVENT_NOT_FOUND");
    return {
      ...serializeEventSummary(event),
      headers: fromJsonText(event.headersJson),
      payload: fromJsonText(event.payloadJson),
      executions: event.executions.map(serializeExecutionDetail)
    };
  });

  app.get("/api/executions", async (request) => {
    const query = request.query as { status?: string };
    const executions = await prisma.execution.findMany({
      take: 100,
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { workflow: true, event: { include: { endpoint: true } } }
    });
    return { executions: executions.map(serializeExecutionSummary) };
  });

  app.get("/api/executions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const execution = await prisma.execution.findUnique({
      where: { id },
      include: {
        workflow: true,
        event: { include: { endpoint: true } },
        stepLogs: { orderBy: [{ stepIndex: "asc" }, { attempt: "asc" }] },
        retryJobs: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!execution) throw new AppError(404, "execution 不存在", "EXECUTION_NOT_FOUND");
    return serializeExecutionDetail(execution);
  });

  app.post("/api/demo/send-sample", async (request) => {
    const body = request.body as { endpointId?: string; sample?: keyof typeof samplePayloads; secret?: string };
    const endpoint = await prisma.endpoint.findUnique({ where: { id: body.endpointId ?? "" } });
    if (!endpoint) throw new AppError(404, "endpoint 不存在", "ENDPOINT_NOT_FOUND");
    if (!body.secret) {
      throw new AppError(400, "请提供 endpoint secret；如已丢失，请重新生成 secret", "SECRET_REQUIRED");
    }
    const sample = samplePayloads[body.sample ?? "githubPush"] ?? samplePayloads.githubPush;
    const raw = JSON.stringify(sample.body);
    const signature = signPayload(body.secret, raw);
    const response = await app.inject({
      method: "POST",
      url: `/hooks/${endpoint.slug}`,
      headers: { "content-type": "application/json", [signatureHeaderName]: signature },
      payload: raw
    });
    return {
      statusCode: response.statusCode,
      result: response.json(),
      sample: sample.label
    };
  });

  app.post("/hooks/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const endpoint = await prisma.endpoint.findUnique({ where: { slug } });
    if (!endpoint) throw new AppError(404, "endpoint 不存在", "ENDPOINT_NOT_FOUND");
    if (!endpoint.enabled) throw new AppError(403, "endpoint 已停用", "ENDPOINT_DISABLED");

    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const signature = request.headers[signatureHeaderName] as string | undefined;
    // 数据库只保存由 secret 派生出的签名 key，不保存 secret 明文；校验时使用该 key 做常量时间比较。
    if (!verifyPayloadSignature(endpoint.secretHash, rawBody, signature)) {
      throw new AppError(401, "Webhook 签名缺失或不正确", "BAD_SIGNATURE");
    }

    const event = await prisma.event.create({
      data: {
        endpointId: endpoint.id,
        headersJson: toJsonText(request.headers),
        payloadJson: toJsonText(request.body),
        sourceIp: request.ip
      }
    });
    const result = await createExecutionsForEvent(prisma, event);
    reply.status(202);
    return result;
  });

  app.post("/api/retry/process", async () => ({ processed: await processDueRetryJobs(prisma) }));

  return app;
}

function serializeEndpoint(endpoint: any) {
  return {
    id: endpoint.id,
    name: endpoint.name,
    slug: endpoint.slug,
    enabled: endpoint.enabled,
    hookUrl: `/hooks/${endpoint.slug}`,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt
  };
}

function serializeWorkflow(workflow: any) {
  return {
    id: workflow.id,
    name: workflow.name,
    endpointId: workflow.endpointId,
    dslText: workflow.dslText,
    dslFormat: workflow.dslFormat,
    enabled: workflow.enabled,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt
  };
}

function serializeEventSummary(event: any) {
  const payload = fromJsonText<Record<string, unknown>>(event.payloadJson);
  return {
    id: event.id,
    endpointId: event.endpointId,
    endpoint: event.endpoint ? serializeEndpoint(event.endpoint) : undefined,
    receivedAt: event.receivedAt,
    payloadSummary: summarizePayload(payload),
    executionCount: event.executions?.length ?? 0
  };
}

function serializeExecutionSummary(execution: any) {
  return {
    id: execution.id,
    eventId: execution.eventId,
    workflowId: execution.workflowId,
    workflowName: execution.workflow?.name,
    endpointName: execution.event?.endpoint?.name,
    status: execution.status,
    skippedReason: execution.skippedReason,
    errorMessage: execution.errorMessage,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    createdAt: execution.createdAt
  };
}

function serializeExecutionDetail(execution: any) {
  return {
    ...serializeExecutionSummary(execution),
    workflow: execution.workflow ? serializeWorkflow(execution.workflow) : undefined,
    event: execution.event
      ? {
          ...serializeEventSummary(execution.event),
          headers: fromJsonText(execution.event.headersJson),
          payload: fromJsonText(execution.event.payloadJson)
        }
      : undefined,
    stepLogs: (execution.stepLogs ?? []).map((log: any) => ({
      id: log.id,
      stepIndex: log.stepIndex,
      stepName: log.stepName,
      type: log.type,
      status: log.status,
      input: fromJsonText(log.inputJson),
      output: fromJsonText(log.outputJson),
      errorMessage: log.errorMessage,
      attempt: log.attempt,
      startedAt: log.startedAt,
      finishedAt: log.finishedAt
    })),
    retryJobs: execution.retryJobs ?? []
  };
}

function summarizePayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "空 payload";
  if (typeof payload.ref === "string") return `Git push ${payload.ref}`;
  if (typeof payload.event === "string") return String(payload.event);
  if (typeof payload.message === "string") return String(payload.message);
  return JSON.stringify(payload).slice(0, 120);
}
