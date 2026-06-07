const API = process.env.PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const MOCK = process.env.PUBLIC_MOCK_BASE_URL ?? "http://localhost:4001";
const WORKFLOW_MOCK = process.env.WORKFLOW_MOCK_BASE_URL ?? MOCK;

async function main() {
  await ensureOk(`${API}/health`, "API 健康检查失败");
  await ensureOk(`${MOCK}/health`, "Mock Receiver 健康检查失败");

  const endpoint = await post(`${API}/api/endpoints`, { name: `验收 Endpoint ${Date.now()}` });
  const workflowText = `name: verify-flow
trigger:
  endpoint: ${endpoint.slug}
steps:
  - name: send-to-mock
    type: httpRequest
    method: POST
    url: "${WORKFLOW_MOCK}/messages"
    body:
      text: "验收 {{body.repository.name}}"
    retry:
      maxAttempts: 2
      backoffSeconds: 0
`;
  const workflow = await post(`${API}/api/workflows`, { endpointId: endpoint.id, dslText: workflowText });
  await post(`${API}/api/demo/send-sample`, {
    endpointId: endpoint.id,
    sample: "githubPush",
    secret: endpoint.secret
  });

  const execution = await poll(async () => {
    const data = await get(`${API}/api/executions`);
    return data.executions.find((item) => item.workflowId === workflow.id && item.status === "success");
  }, "execution 未在预期时间内成功");

  const mockMessage = await poll(async () => {
    const data = await get(`${MOCK}/messages`);
    return data.messages.find((item) => JSON.stringify(item.body).includes("webhook-flow"));
  }, "mock receiver 未收到验收消息");

  console.log("端到端验收通过");
  console.log(`endpoint=${endpoint.id}`);
  console.log(`workflow=${workflow.id}`);
  console.log(`execution=${execution.id}`);
  console.log(`mockMessage=${mockMessage.id}`);
}

async function ensureOk(url, message) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(message);
}

async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 请求失败：${response.status}`);
  return response.json();
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? `${url} 请求失败：${response.status}`);
  return data;
}

async function poll(fn, errorMessage) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(errorMessage);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
