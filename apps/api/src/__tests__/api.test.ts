import { execFileSync } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultDemoWorkflow, samplePayloads, signPayload, signatureHeaderName } from "@webhook-flow/shared";
import { buildApp } from "../app.js";
import { getPrisma } from "../db/client.js";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:../data/test.db";

beforeAll(() => {
  execFileSync("corepack", ["pnpm", "db:push"], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
  });
});

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.retryJob.deleteMany();
  await prisma.stepLog.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.event.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.endpoint.deleteMany();
  await prisma.mockMessage.deleteMany();
});

describe("API endpoint 和 workflow", () => {
  it("允许浏览器预检 PATCH endpoint 状态更新", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/endpoints/demo",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type"
      }
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    await app.close();
  });

  it("创建 endpoint 时返回一次性 secret，详情不返回 secret", async () => {
    const app = buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/endpoints",
      payload: { name: "GitHub Demo" }
    });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.secret).toMatch(/^wfsec_/);

    const detail = await app.inject({ method: "GET", url: `/api/endpoints/${body.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().secret).toBeUndefined();
    await app.close();
  });

  it("保存 workflow 并校验 DSL", async () => {
    const app = buildApp();
    const endpoint = (
      await app.inject({ method: "POST", url: "/api/endpoints", payload: { name: "GitHub Demo" } })
    ).json();
    const workflow = await app.inject({
      method: "POST",
      url: "/api/workflows",
      payload: { endpointId: endpoint.id, dslText: defaultDemoWorkflow }
    });
    expect(workflow.statusCode).toBe(201);
    expect(workflow.json().name).toBe("github-main-push");

    const bad = await app.inject({
      method: "POST",
      url: "/api/workflows/validate",
      payload: { dslText: "name: bad\ntrigger:\n  endpoint: demo\n" }
    });
    expect(bad.json().ok).toBe(false);
    await app.close();
  });
});

describe("Webhook 接收和执行", () => {
  it("拒绝缺失或错误签名", async () => {
    const app = buildApp();
    const endpoint = (
      await app.inject({ method: "POST", url: "/api/endpoints", payload: { name: "GitHub Demo" } })
    ).json();
    const missing = await app.inject({
      method: "POST",
      url: endpoint.hookUrl,
      payload: samplePayloads.githubPush.body
    });
    expect(missing.statusCode).toBe(401);

    const bad = await app.inject({
      method: "POST",
      url: endpoint.hookUrl,
      headers: { [signatureHeaderName]: "sha256=bad" },
      payload: samplePayloads.githubPush.body
    });
    expect(bad.statusCode).toBe(401);
    await app.close();
  });

  it("接收合法事件并执行 workflow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ received: true }), { status: 201 }))
    );
    const app = buildApp();
    const endpoint = (
      await app.inject({ method: "POST", url: "/api/endpoints", payload: { name: "GitHub Demo" } })
    ).json();
    await app.inject({
      method: "POST",
      url: "/api/workflows",
      payload: { endpointId: endpoint.id, dslText: defaultDemoWorkflow }
    });
    const raw = JSON.stringify(samplePayloads.githubPush.body);
    const accepted = await app.inject({
      method: "POST",
      url: endpoint.hookUrl,
      headers: { "content-type": "application/json", [signatureHeaderName]: signPayload(endpoint.secret, raw) },
      payload: raw
    });
    expect(accepted.statusCode).toBe(202);
    const executions = await app.inject({ method: "GET", url: "/api/executions" });
    expect(executions.json().executions[0].status).toBe("success");
    await app.close();
  });
});
