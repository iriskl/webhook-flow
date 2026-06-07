import type { FastifyReply } from "fastify";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "APP_ERROR"
  ) {
    super(message);
  }
}

export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: `服务内部错误：${message}` } });
}
