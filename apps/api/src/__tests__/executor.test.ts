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
});

describe("执行引擎", () => {
  it("filter 不命中时标记 skipped", async () => {
    const app = buildApp();
    const endpoint = (
      await app.inject({ method: "POST", url: "/api/endpoints", payload: { name: "GitHub Demo" } })
    ).json();
    await app.inject({
      method: "POST",
      url: "/api/workflows",
      payload: { endpointId: endpoint.id, dslText: defaultDemoWorkflow.replace("backoffSeconds: 1", "backoffSeconds: 0") }
    });
    const raw = JSON.stringify({ ...samplePayloads.githubPush.body, ref: "refs/heads/dev" });
    await app.inject({
      method: "POST",
      url: endpoint.hookUrl,
      headers: { "content-type": "application/json", [signatureHeaderName]: signPayload(endpoint.secret, raw) },
      payload: raw
    });
    const executions = (await app.inject({ method: "GET", url: "/api/executions" })).json().executions;
    expect(executions[0].status).toBe("skipped");
    await app.close();
  });

  it("失败后写入 RetryJob，再处理成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
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
    await app.inject({
      method: "POST",
      url: endpoint.hookUrl,
      headers: { "content-type": "application/json", [signatureHeaderName]: signPayload(endpoint.secret, raw) },
      payload: raw
    });
    await getPrisma().retryJob.updateMany({ data: { nextRunAt: new Date(0) } });
    await app.inject({ method: "POST", url: "/api/retry/process" });
    const executions = (await app.inject({ method: "GET", url: "/api/executions" })).json().executions;
    expect(executions[0].status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await app.close();
  });
});
