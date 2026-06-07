import { defaultWorkflowYaml } from "./dsl.js";

export const samplePayloads = {
  githubPush: {
    label: "GitHub push",
    body: {
      ref: "refs/heads/main",
      repository: { name: "webhook-flow", full_name: "course/webhook-flow" },
      pusher: { name: "demo-user" },
      commits: [{ id: "abc123", message: "feat: demo webhook flow" }]
    }
  },
  alert: {
    label: "监控告警",
    body: {
      level: "critical",
      service: "payment-api",
      region: "local",
      message: "5xx rate above threshold"
    }
  },
  payment: {
    label: "支付成功",
    body: {
      event: "payment.succeeded",
      orderId: "ORDER-2026-0001",
      amount: 19900,
      currency: "CNY",
      userId: "user_demo"
    }
  }
} as const;

export type SamplePayloadKey = keyof typeof samplePayloads;

export const defaultDemoWorkflow = defaultWorkflowYaml;
