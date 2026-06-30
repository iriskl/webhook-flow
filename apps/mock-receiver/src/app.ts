import cors from "@fastify/cors";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";

export function buildMockReceiver(prisma = new PrismaClient()) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true, methods: ["GET", "POST", "DELETE", "OPTIONS"] });

  app.get("/health", async () => ({ ok: true, service: "webhook-flow-mock-receiver" }));

  async function saveMessage(request: { headers: unknown; body: unknown }, target: string, reply: { status: (code: number) => void }) {
    const message = await prisma.mockMessage.create({
      data: {
        headersJson: JSON.stringify({ ...(request.headers as Record<string, unknown>), "x-mock-target": target }),
        bodyJson: JSON.stringify(request.body ?? {})
      }
    });
    reply.status(201);
    return serializeMessage(message);
  }

  app.post("/messages", async (request, reply) => {
    return saveMessage(request, "default", reply);
  });

  app.post("/messages/:target", async (request, reply) => {
    const { target } = request.params as { target: string };
    return saveMessage(request, target, reply);
  });

  app.get("/messages", async () => {
    const messages = await prisma.mockMessage.findMany({ take: 100, orderBy: { receivedAt: "desc" } });
    return { messages: messages.map(serializeMessage) };
  });

  app.delete("/messages", async () => {
    await prisma.mockMessage.deleteMany();
    return { ok: true };
  });

  return app;
}

function serializeMessage(message: { id: string; headersJson: string; bodyJson: string; receivedAt: Date }) {
  const headers = JSON.parse(message.headersJson);
  return {
    id: message.id,
    target: headers["x-mock-target"] ?? "default",
    headers,
    body: JSON.parse(message.bodyJson),
    receivedAt: message.receivedAt
  };
}
