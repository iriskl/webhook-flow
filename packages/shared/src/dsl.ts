import YAML from "yaml";
import { z } from "zod";
import type { DslFormat } from "./types.js";

const retrySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10).default(1),
    backoffSeconds: z.number().int().min(0).max(3600).default(0)
  })
  .default({ maxAttempts: 1, backoffSeconds: 0 });

export const httpStepSchema = z.object({
  name: z.string().min(1, "步骤名称不能为空").max(80, "步骤名称不能超过 80 个字符"),
  type: z.literal("httpRequest"),
  when: z.string().min(1).optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  url: z.string().url("HTTP 请求 URL 不合法"),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().min(100).max(30000).default(5000),
  retry: retrySchema
});

export const workflowDslSchema = z.object({
  name: z.string().min(1, "workflow 名称不能为空").max(120, "workflow 名称不能超过 120 个字符"),
  trigger: z.object({
    endpoint: z.string().min(1, "trigger.endpoint 不能为空")
  }),
  filter: z
    .object({
      expr: z.string().min(1, "filter.expr 不能为空")
    })
    .optional(),
  steps: z.array(httpStepSchema).min(1, "workflow 至少需要一个 step")
});

export type WorkflowDsl = z.infer<typeof workflowDslSchema>;
export type HttpRequestStep = z.infer<typeof httpStepSchema>;

export interface ParseWorkflowResult {
  ok: boolean;
  format?: DslFormat;
  workflow?: WorkflowDsl;
  errors: string[];
}

export function detectDslFormat(text: string): DslFormat {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "yaml";
}

export function parseWorkflowDsl(text: string, format: DslFormat = detectDslFormat(text)): ParseWorkflowResult {
  try {
    // DSL 先解析为普通对象，再交给 Zod 做中文错误聚合，避免执行阶段才暴露配置问题。
    const raw = format === "json" ? JSON.parse(text) : YAML.parse(text);
    const parsed = workflowDslSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        format,
        errors: parsed.error.issues.map((issue) => {
          const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
          return `${path}${issue.message}`;
        })
      };
    }
    return { ok: true, format, workflow: parsed.data, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, format, errors: [`DSL 解析失败：${message}`] };
  }
}

export function buildDemoWorkflow(mockBaseUrl = "http://localhost:4001"): string {
  const target = `${mockBaseUrl.replace(/\/$/, "")}/messages`;
  return `name: event-router-demo
trigger:
  endpoint: github-demo
steps:
  - name: github-audit
    type: httpRequest
    when: "body.ref == 'refs/heads/main'"
    method: POST
    url: "${target}"
    headers:
      x-demo-source: github
      x-demo-target: audit
    body:
      text: "GitHub repo {{body.repository.name}} pushed by {{body.pusher.name}}"
      ref: "{{body.ref}}"
      repo: "{{body.repository.full_name}}"
  - name: github-notify
    type: httpRequest
    when: "body.ref == 'refs/heads/main'"
    method: POST
    url: "${target}"
    headers:
      x-demo-source: github
      x-demo-target: notify
    body:
      text: "Notify team for {{body.repository.name}}"
      repo: "{{body.repository.full_name}}"
  - name: alert-forward
    type: httpRequest
    when: "body.level == 'critical'"
    method: POST
    url: "${target}"
    headers:
      x-demo-source: monitor
    body:
      text: "Alert {{body.service}}: {{body.message}}"
      level: "{{body.level}}"
      region: "{{body.region}}"
  - name: payment-forward
    type: httpRequest
    when: "body.event == 'payment.succeeded'"
    method: POST
    url: "${target}"
    headers:
      x-demo-source: payment
    body:
      text: "Payment success {{body.orderId}}"
      amount: "{{body.amount}}"
      currency: "{{body.currency}}"
    retry:
      maxAttempts: 2
      backoffSeconds: 1
`;
}

export const defaultWorkflowYaml = buildDemoWorkflow();
