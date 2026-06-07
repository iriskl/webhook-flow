import type { PrismaClient, Workflow, Event, Execution } from "@prisma/client";
import {
  evaluateExpression,
  parseWorkflowDsl,
  renderTemplateValue,
  type HttpRequestStep,
  type WorkflowDsl,
  type WorkflowRuntimeContext
} from "@webhook-flow/shared";
import { fromJsonText, toJsonText } from "../db/json.js";

export interface ExecuteEventResult {
  eventId: string;
  executionIds: string[];
}

export async function createExecutionsForEvent(
  prisma: PrismaClient,
  event: Event
): Promise<ExecuteEventResult> {
  const workflows = await prisma.workflow.findMany({
    where: { endpointId: event.endpointId, enabled: true }
  });
  const executionIds: string[] = [];
  for (const workflow of workflows) {
    const execution = await prisma.execution.create({
      data: { eventId: event.id, workflowId: workflow.id, status: "pending" }
    });
    executionIds.push(execution.id);
    await runExecution(prisma, execution.id);
  }
  return { eventId: event.id, executionIds };
}

export async function runExecution(prisma: PrismaClient, executionId: string): Promise<void> {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { event: true, workflow: true }
  });
  if (!execution) return;

  const parsed = parseWorkflowDsl(execution.workflow.dslText, execution.workflow.dslFormat as "yaml" | "json");
  if (!parsed.ok || !parsed.workflow) {
    await prisma.execution.update({
      where: { id: execution.id },
      data: { status: "failed", errorMessage: parsed.errors.join("; "), finishedAt: new Date() }
    });
    return;
  }

  const context = buildContext(execution.event);
  const filter = evaluateExpression(parsed.workflow.filter?.expr, context);
  if (!filter.ok || filter.value === false) {
    await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: "skipped",
        skippedReason: filter.error ?? "workflow filter 未命中",
        startedAt: new Date(),
        finishedAt: new Date()
      }
    });
    return;
  }

  await prisma.execution.update({
    where: { id: execution.id },
    data: { status: "running", startedAt: new Date(), errorMessage: null }
  });

  for (const [index, step] of parsed.workflow.steps.entries()) {
    const ok = await runStep(prisma, execution, parsed.workflow, step, index, context, 1);
    if (!ok) return;
  }

  await prisma.execution.update({
    where: { id: execution.id },
    data: { status: "success", finishedAt: new Date() }
  });
}

export async function processDueRetryJobs(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  const jobs = await prisma.retryJob.findMany({
    where: { status: "pending", nextRunAt: { lte: now } },
    take: 20,
    orderBy: { nextRunAt: "asc" }
  });
  for (const job of jobs) {
    await prisma.retryJob.update({
      where: { id: job.id },
      data: { status: "running", lockedUntil: new Date(Date.now() + 30_000) }
    });
    const execution = await prisma.execution.findUnique({
      where: { id: job.executionId },
      include: { event: true, workflow: true }
    });
    if (!execution) continue;
    const parsed = parseWorkflowDsl(execution.workflow.dslText, execution.workflow.dslFormat as "yaml" | "json");
    const step = parsed.workflow?.steps[job.stepIndex];
    if (!parsed.workflow || !step) continue;

    // 重试任务恢复到原 execution，避免重复创建事件；状态机由 StepLog 和 RetryJob 共同记录尝试历史。
    const ok = await runStep(
      prisma,
      execution,
      parsed.workflow,
      step,
      job.stepIndex,
      buildContext(execution.event),
      job.attempt
    );
    await prisma.retryJob.update({ where: { id: job.id }, data: { status: ok ? "done" : "failed" } });
    if (ok) {
      await continueAfterRetry(prisma, execution, parsed.workflow, job.stepIndex + 1);
    }
  }
  return jobs.length;
}

async function continueAfterRetry(
  prisma: PrismaClient,
  execution: Execution & { event: Event; workflow: Workflow },
  workflow: WorkflowDsl,
  startIndex: number
): Promise<void> {
  const context = buildContext(execution.event);
  for (let index = startIndex; index < workflow.steps.length; index += 1) {
    const step = workflow.steps[index];
    if (!step) continue;
    const ok = await runStep(prisma, execution, workflow, step, index, context, 1);
    if (!ok) return;
  }
  await prisma.execution.update({
    where: { id: execution.id },
    data: { status: "success", finishedAt: new Date(), errorMessage: null }
  });
}

async function runStep(
  prisma: PrismaClient,
  execution: Execution & { event: Event; workflow: Workflow },
  _workflow: WorkflowDsl,
  step: HttpRequestStep,
  stepIndex: number,
  context: WorkflowRuntimeContext,
  attempt: number
): Promise<boolean> {
  const when = evaluateExpression(step.when, context);
  if (!when.ok || when.value === false) {
    await prisma.stepLog.create({
      data: {
        executionId: execution.id,
        stepIndex,
        stepName: step.name,
        type: step.type,
        status: "skipped",
        attempt,
        errorMessage: when.error ?? "step.when 条件不匹配",
        startedAt: new Date(),
        finishedAt: new Date()
      }
    });
    return true;
  }

  const startedAt = new Date();
  const input = {
    method: step.method,
    url: step.url,
    headers: step.headers,
    body: renderTemplateValue(step.body ?? {}, context)
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), step.timeoutMs);
    const response = await fetch(step.url, {
      method: step.method,
      headers: { "content-type": "application/json", ...step.headers },
      body: step.method === "GET" ? undefined : JSON.stringify(input.body),
      signal: controller.signal
    });
    clearTimeout(timer);
    const responseText = await response.text();
    const output = {
      statusCode: response.status,
      body: responseText.slice(0, 2000)
    };
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 300)}`);
    }
    await prisma.stepLog.create({
      data: {
        executionId: execution.id,
        stepIndex,
        stepName: step.name,
        type: step.type,
        status: "success",
        inputJson: toJsonText(input),
        outputJson: toJsonText(output),
        attempt,
        startedAt,
        finishedAt: new Date()
      }
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.stepLog.create({
      data: {
        executionId: execution.id,
        stepIndex,
        stepName: step.name,
        type: step.type,
        status: "failed",
        inputJson: toJsonText(input),
        errorMessage: message,
        attempt,
        startedAt,
        finishedAt: new Date()
      }
    });

    if (attempt < step.retry.maxAttempts) {
      // 失败不直接终结 execution，而是写入轻量重试队列表，由 worker 到期后恢复执行。
      await prisma.retryJob.create({
        data: {
          executionId: execution.id,
          stepIndex,
          attempt: attempt + 1,
          nextRunAt: new Date(Date.now() + step.retry.backoffSeconds * 1000),
          status: "pending",
          lastError: message
        }
      });
      await prisma.execution.update({
        where: { id: execution.id },
        data: { status: "running", errorMessage: `等待重试：${message}` }
      });
      return false;
    }

    await prisma.execution.update({
      where: { id: execution.id },
      data: { status: "failed", errorMessage: message, finishedAt: new Date() }
    });
    return false;
  }
}

function buildContext(event: Event): WorkflowRuntimeContext {
  return {
    body: fromJsonText(event.payloadJson),
    headers: fromJsonText<Record<string, string | string[] | undefined>>(event.headersJson),
    event: { id: event.id, receivedAt: event.receivedAt.toISOString() }
  };
}
