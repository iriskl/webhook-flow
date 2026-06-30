import { execFileSync } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildMockReceiver } from "../app.js";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:../data/test.db";

beforeAll(() => {
  execFileSync("corepack", ["pnpm", "db:push"], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
  });
});

beforeEach(async () => {
  const prisma = new PrismaClient();
  await prisma.mockMessage.deleteMany();
  await prisma.$disconnect();
});

describe("mock receiver", () => {
  it("允许浏览器预检 DELETE 清空消息", async () => {
    const app = buildMockReceiver();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/messages",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE"
      }
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    await app.close();
  });

  it("接收、查询并清空消息", async () => {
    const app = buildMockReceiver();
    const created = await app.inject({ method: "POST", url: "/messages", payload: { text: "hello" } });
    expect(created.statusCode).toBe(201);
    const list = await app.inject({ method: "GET", url: "/messages" });
    expect(list.json().messages[0].body.text).toBe("hello");
    await app.inject({ method: "DELETE", url: "/messages" });
    const empty = await app.inject({ method: "GET", url: "/messages" });
    expect(empty.json().messages).toHaveLength(0);
    await app.close();
  });
});
