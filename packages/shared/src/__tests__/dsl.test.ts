import { describe, expect, it } from "vitest";
import { buildDemoWorkflow, defaultWorkflowYaml, parseWorkflowDsl } from "../dsl.js";
import { evaluateExpression } from "../expression.js";
import { signPayload, verifyPayloadSignature, deriveSigningKey } from "../signature.js";
import { renderTemplateValue } from "../template.js";

describe("workflow DSL", () => {
  it("解析合法 YAML", () => {
    const result = parseWorkflowDsl(defaultWorkflowYaml);
    expect(result.ok).toBe(true);
    expect(result.workflow?.steps[0]?.type).toBe("httpRequest");
  });

  it("可按部署环境生成 mock receiver 目标地址", () => {
    const result = parseWorkflowDsl(buildDemoWorkflow("http://mock-receiver:4001/"));
    expect(result.ok).toBe(true);
    expect(result.workflow?.steps[0]?.url).toBe("http://mock-receiver:4001/messages/audit");
  });

  it("拒绝缺少 steps 的 DSL", () => {
    const result = parseWorkflowDsl("name: bad\ntrigger:\n  endpoint: demo\n");
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("steps");
  });

  it("拒绝未知 step 类型", () => {
    const result = parseWorkflowDsl(
      "name: bad\ntrigger:\n  endpoint: demo\nsteps:\n  - name: x\n    type: shell\n"
    );
    expect(result.ok).toBe(false);
  });
});

describe("受限表达式", () => {
  const context = {
    body: { ref: "refs/heads/main", count: 3, repository: { name: "webhook-flow" } },
    headers: {},
    event: {}
  };

  it("支持字段比较", () => {
    expect(evaluateExpression("body.ref == 'refs/heads/main'", context).value).toBe(true);
    expect(evaluateExpression("body.count >= 3", context).value).toBe(true);
  });

  it("拒绝危险语法", () => {
    expect(evaluateExpression("process.exit()", context).ok).toBe(false);
  });
});

describe("模板和签名", () => {
  it("渲染模板字段", () => {
    const rendered = renderTemplateValue(
      { text: "Repo {{body.repository.name}}" },
      { body: { repository: { name: "webhook-flow" } }, headers: {}, event: {} }
    );
    expect(rendered).toEqual({ text: "Repo webhook-flow" });
  });

  it("使用派生 key 验证签名", () => {
    const secret = "wfsec_test";
    const body = JSON.stringify({ ok: true });
    const signature = signPayload(secret, body);
    expect(verifyPayloadSignature(deriveSigningKey(secret), body, signature)).toBe(true);
    expect(verifyPayloadSignature(deriveSigningKey(secret), body, "sha256=bad")).toBe(false);
  });
});
