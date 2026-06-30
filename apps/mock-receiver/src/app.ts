import cors from "@fastify/cors";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";

export function buildMockReceiver(prisma = new PrismaClient()) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true, methods: ["GET", "POST", "DELETE", "OPTIONS"] });

  app.get("/health", async () => ({ ok: true, service: "webhook-flow-mock-receiver" }));

  app.post("/messages", async (request, reply) => {
    const message = await prisma.mockMessage.create({
      data: {
        headersJson: JSON.stringify(request.headers),
        bodyJson: JSON.stringify(request.body ?? {})
      }
    });
    reply.status(201);
    return serializeMessage(message);
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
  return {
    id: message.id,
    headers: JSON.parse(message.headersJson),
    body: JSON.parse(message.bodyJson),
    receivedAt: message.receivedAt
  };
}
