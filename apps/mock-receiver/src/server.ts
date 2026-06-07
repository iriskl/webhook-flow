import { buildMockReceiver } from "./app.js";

const app = buildMockReceiver();
const port = Number(process.env.MOCK_RECEIVER_PORT ?? 4001);
const host = process.env.MOCK_RECEIVER_HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
