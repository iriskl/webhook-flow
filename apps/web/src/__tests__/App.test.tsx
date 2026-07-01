import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { App } from "../App.js";

const mockFetch = vi.fn();
let endpointEnabled = true;
let savedWorkflowText = "";
let sentDemoBody: any = null;
let savedWorkflowMethod = "";

const workflows = [
  {
    id: "workflow-new",
    name: "新工作流",
    endpointId: "endpoint-1",
    dslText: 'name: new-workflow\ntrigger:\n  endpoint: class-demo\nsteps:\n  - name: forward-new\n    type: httpRequest\n    url: "http://localhost:4001/messages/new"\n',
    dslFormat: "yaml",
    enabled: true,
    endpoint: { id: "endpoint-1", name: "课堂 Demo", slug: "class-demo", hookUrl: "/hooks/class-demo", enabled: true, createdAt: "2026-06-05T00:00:00.000Z" }
  },
  {
    id: "workflow-old",
    name: "旧工作流",
    endpointId: "endpoint-1",
    dslText: 'name: old-workflow\ntrigger:\n  endpoint: class-demo\nsteps:\n  - name: forward-old\n    type: httpRequest\n    url: "http://localhost:4001/messages/old"\n',
    dslFormat: "yaml",
    enabled: true,
    endpoint: { id: "endpoint-1", name: "课堂 Demo", slug: "class-demo", hookUrl: "/hooks/class-demo", enabled: true, createdAt: "2026-06-05T00:00:00.000Z" }
  }
];

beforeEach(() => {
  endpointEnabled = true;
  savedWorkflowText = "";
  sentDemoBody = null;
  savedWorkflowMethod = "";
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes("/api/endpoints/endpoint-1") && init?.method === "PATCH") {
      endpointEnabled = Boolean(JSON.parse(String(init.body)).enabled);
      return json(endpoint(endpointEnabled));
    }
    if (url.includes("/api/endpoints") && init?.method === "POST") {
      return json({
        id: "endpoint-1",
        name: "课堂 Demo",
        slug: "class-demo",
        hookUrl: "/hooks/class-demo",
        enabled: true,
        createdAt: "2026-06-05T00:00:00.000Z",
        secret: "whsec_once"
      });
    }
    if (url.includes("/api/endpoints")) {
      return json({
        endpoints: [endpoint(endpointEnabled)]
      });
    }
    if (url.includes("/api/workflows") && init?.method === "POST") {
      savedWorkflowText = String(JSON.parse(String(init.body)).dslText);
      savedWorkflowMethod = "POST";
      return json({
        id: "workflow-saved",
        name: "custom-downstream-flow",
        endpointId: "endpoint-1",
        dslText: savedWorkflowText,
        dslFormat: "yaml",
        enabled: true
      });
    }
    if (url.includes("/api/workflows/workflow-old") && init?.method === "PUT") {
      savedWorkflowText = String(JSON.parse(String(init.body)).dslText);
      savedWorkflowMethod = "PUT";
      return json({ ...workflows[1], dslText: savedWorkflowText });
    }
    if (url.includes("/api/workflows")) return json({ workflows });
    if (url.includes("/api/demo/send-sample")) {
      sentDemoBody = JSON.parse(String(init?.body));
      return json({ statusCode: 202, result: { accepted: true }, sample: "GitHub push" });
    }
    if (url.includes("/api/executions/execution-1")) {
      return json({
        id: "execution-1",
        workflowId: "workflow-1",
        eventId: "event-1",
        workflowName: "github-main-push",
        endpointName: "课堂 Demo",
        status: "success",
        createdAt: "2026-06-05T00:00:00.000Z",
        event: { payload: { ref: "refs/heads/main" } },
        stepLogs: [
          {
            id: "step-1",
            stepIndex: 0,
            stepName: "notify-mock",
            type: "httpRequest",
            status: "success",
            attempt: 1,
            input: { url: "http://localhost:4001/messages/notify" }
          },
          {
            id: "step-2",
            stepIndex: 1,
            stepName: "payment-forward",
            type: "httpRequest",
            status: "skipped",
            attempt: 1,
            errorMessage: "step.when 条件不匹配"
          }
        ]
      });
    }
    if (url.includes("/api/executions")) {
      return json({
        executions: [
          {
            id: "execution-1",
            workflowId: "workflow-1",
            eventId: "event-1",
            workflowName: "github-main-push",
            endpointName: "课堂 Demo",
            status: "success",
            createdAt: "2026-06-05T00:00:00.000Z"
          }
        ]
      });
    }
    if (url.includes("/messages")) {
      return json({
        messages: [
          {
            id: "message-1",
            target: "audit",
            headers: { "x-demo-source": "webhook-flow" },
            body: { text: "Repo webhook-flow pushed by demo-user" },
            receivedAt: "2026-06-05T00:00:00.000Z"
          }
        ]
      });
    }
    return json({});
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Webhook Flow 控制台", () => {
  it("展示中文导航和核心页面", async () => {
    render(<App />);
    expect(await screen.findByText("Webhook Flow")).toBeInTheDocument();
    const nav = screen.getByLabelText("主导航");
    expect(within(nav).getByText("概览")).toBeInTheDocument();
    expect(within(nav).getByText("事件发送")).toBeInTheDocument();
    expect(within(nav).getByText("Mock Receiver")).toBeInTheDocument();
  });

  it("Workflows 页面先选择 workflow，再绑定 endpoint 和下游", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Workflows/ }));
    expect(screen.getByText("Workflow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建空白 workflow" })).toBeInTheDocument();
    expect(screen.getByLabelText("Workflow 名称")).toBeInTheDocument();
    expect(screen.getByText("绑定 endpoint")).toBeInTheDocument();
    expect(screen.getByText("查看或手动编辑 DSL")).toBeInTheDocument();
    expect(screen.getByText("下游输出")).toBeInTheDocument();
    expect(screen.getByText("预设下游")).toBeInTheDocument();
    expect(screen.getByText("自定义下游")).toBeInTheDocument();
    expect(screen.queryByText("事件输入")).not.toBeInTheDocument();
  });

  it("可新增下游并生成多下游 workflow", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Workflows/ }));

    fireEvent.change(screen.getByLabelText("Workflow 名称"), { target: { value: "归档流" } });
    fireEvent.change(screen.getByLabelText("下游名称"), { target: { value: "数据归档" } });
    fireEvent.change(screen.getByLabelText("下游路径"), { target: { value: "archive" } });
    fireEvent.click(screen.getByRole("button", { name: "新增下游" }));
    expect(screen.getByText("数据归档")).toBeInTheDocument();
    expect(screen.getByText("/messages/archive")).toBeInTheDocument();
    await screen.findByText(/已新增下游/);

    fireEvent.click(screen.getByRole("button", { name: "用选中下游生成 workflow" }));
    await waitFor(() => expect(screen.getByDisplayValue(/name: 归档流/)).toBeInTheDocument());
    expect(screen.getByDisplayValue(/forward-audit/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/forward-archive/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.queryByText("数据归档")).not.toBeInTheDocument();
    expect(screen.queryByText("/messages/archive")).not.toBeInTheDocument();
  });

  it("已有 workflow 有改动时保存需要确认", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Workflows/ }));
    const workflowSelect = await screen.findByDisplayValue("新工作流");
    fireEvent.change(workflowSelect, { target: { value: "workflow-old" } });
    fireEvent.click(screen.getByText("查看或手动编辑 DSL"));
    fireEvent.change(screen.getByDisplayValue(/name: old-workflow/), {
      target: { value: `${workflows[1]!.dslText}\n` }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存 workflow" }));

    expect(await screen.findByRole("dialog", { name: "覆盖已有 workflow？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await waitFor(() => expect(savedWorkflowMethod).toBe("PUT"));
    expect(savedWorkflowText).toContain("name: old-workflow");
  });

  it("支持自定义事件 payload", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /事件发送/ }));
    fireEvent.change(screen.getByDisplayValue("GitHub push"), { target: { value: "custom" } });
    expect(screen.getByLabelText("自定义事件 JSON")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("自定义事件 JSON"), {
      target: { value: '{ "event": "order.refunded", "orderId": "R-1" }' }
    });
    expect(screen.getByDisplayValue(/order.refunded/)).toBeInTheDocument();
  });

  it("发送页选择具体 workflow DSL 后发送事件", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /事件发送/ }));
    expect(screen.getByLabelText("选择验收 workflow")).toBeInTheDocument();
    expect(screen.getByText(/当前 DSL 包含/)).toBeInTheDocument();
    expect(screen.getByText(/个下游 step/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("选择验收 workflow"), { target: { value: "workflow-old" } });
    fireEvent.click(screen.getByRole("button", { name: "发送 workflow 验收" }));

    await waitFor(() => expect(sentDemoBody?.workflowId).toBe("workflow-old"));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/demo/send-sample"), expect.anything());
  });

  it("创建 endpoint 后展示一次性 secret 和详情", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Endpoints/ }));
    fireEvent.click(await screen.findByRole("button", { name: /创建 endpoint/ }));
    expect(await screen.findByText("whsec_once")).toBeInTheDocument();
    expect(screen.getByText("class-demo")).toBeInTheDocument();
    expect(screen.getByText(/已创建 endpoint/)).toBeInTheDocument();
  });

  it("停用 endpoint 后立即更新状态", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Endpoints/ }));
    fireEvent.click(await screen.findByRole("button", { name: "停用" }));
    expect(await screen.findByRole("button", { name: "启用" })).toBeInTheDocument();
    expect(screen.getByText(/已停用 endpoint/)).toBeInTheDocument();
  });

  it("切换旧 workflow 后不会被自动刷新改回最新项", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Workflows/ }));
    const workflowSelect = await screen.findByDisplayValue("新工作流");
    fireEvent.change(workflowSelect, { target: { value: "workflow-old" } });
    expect(screen.getByDisplayValue("旧工作流")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/name: old-workflow/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(screen.getByDisplayValue("旧工作流")).toBeInTheDocument();
  });

  it("execution 详情展示原始 payload", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Executions/ }));
    fireEvent.click(await screen.findByRole("button", { name: "详情" }));
    expect(await screen.findByText("事件 payload")).toBeInTheDocument();
    expect(screen.getByText("已执行下游")).toBeInTheDocument();
    expect(screen.getByText(/未命中条件的 step/)).toBeInTheDocument();
    expect(screen.getByText(/notify-mock/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/refs\/heads\/main/)).toBeInTheDocument());
  });

  it("概览详情按钮会进入 execution 详情页", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "详情" }));
    expect(await screen.findByRole("heading", { name: "Executions" })).toBeInTheDocument();
    expect(await screen.findByText("事件 payload")).toBeInTheDocument();
    expect(screen.getByText(/refs\/heads\/main/)).toBeInTheDocument();
  });

  it("mock receiver 展示 headers 和 body", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Mock Receiver/ }));
    expect(await screen.findByText("/messages/audit")).toBeInTheDocument();
    expect(await screen.findByText(/x-demo-source/)).toBeInTheDocument();
    expect(screen.getByText(/Repo webhook-flow pushed/)).toBeInTheDocument();
  });
});

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body)
  });
}

function endpoint(enabled: boolean) {
  return {
    id: "endpoint-1",
    name: "课堂 Demo",
    slug: "class-demo",
    hookUrl: "/hooks/class-demo",
    enabled,
    createdAt: "2026-06-05T00:00:00.000Z"
  };
}
