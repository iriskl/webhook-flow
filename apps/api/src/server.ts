import { buildApp } from "./app.js";
import { disconnectPrisma } from "./db/client.js";
import { getPrisma } from "./db/client.js";
import { processDueRetryJobs } from "./services/executor.js";

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";
const app = buildApp();
const retryIntervalMs = Number(process.env.RETRY_WORKER_INTERVAL_MS ?? 1000);

// API 服务自带轻量重试 worker，保证演示时失败重试会自动推进，不依赖手动调用管理接口。
const retryTimer = setInterval(() => {
  void processDueRetryJobs(getPrisma()).catch((error) => app.log.error(error));
}, retryIntervalMs);

app.listen({ port, host }).catch((error) => {
  app.log.error(error);
  clearInterval(retryTimer);
  process.exit(1);
});

process.on("SIGINT", async () => {
  clearInterval(retryTimer);
  await app.close();
  await disconnectPrisma();
  process.exit(0);
});
