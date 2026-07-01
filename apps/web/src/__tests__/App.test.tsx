import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { App } from "../App.js";

const mockFetch = vi.fn();
let endpointEnabled = true;

const workflows = [
  {
    id: "workflow-new",
    name: "新工作流",
    endpointId: "endpoint-1",
    dslText: "name: new-workflow\ntrigger:\n  endpoint: class-demo\nsteps: []\n",
    dslFormat: "yaml",
    enabled: true
  },
  {
    id: "workflow-old",
    name: "旧工作流",
    endpointId: "endpoint-1",
    dslText: "name: old-workflow\ntrigger:\n  endpoint: class-demo\nsteps: []\n",
    dslFormat: "yaml",
    enabled: true
  }
];

beforeEach(() => {
  endpointEnabled = true;
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
    if (url.includes("/api/workflows")) return json({ workflows });
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
        stepLogs: [{ id: "step-1", stepIndex: 0, stepName: "notify-mock", type: "httpRequest", status: "success", attempt: 1 }]
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
    expect(within(nav).getByText("Mock Receiver")).toBeInTheDocument();
  });

  it("可进入 workflow 页面并看到校验按钮", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Workflows/ }));
    expect(screen.getByLabelText("Workflow 操作流程")).toBeInTheDocument();
    expect(screen.getByLabelText("事件流关系")).toBeInTheDocument();
    expect(screen.getByText("绑定和保存")).toBeInTheDocument();
    expect(screen.getByText("高级配置")).toBeInTheDocument();
    expect(screen.getByText("查看或手动编辑 DSL")).toBeInTheDocument();
    expect(screen.getByText("事件输入")).toBeInTheDocument();
    expect(screen.getByText("下游输出")).toBeInTheDocument();
    expect(screen.getByText("预设下游")).toBeInTheDocument();
    expect(screen.getByText("自定义下游")).toBeInTheDocument();
  });

  it("可新增下游并生成多下游 workflow", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Workflows/ }));

    fireEvent.change(screen.getByLabelText("下游名称"), { target: { value: "数据归档" } });
    fireEvent.change(screen.getByLabelText("下游路径"), { target: { value: "archive" } });
    fireEvent.click(screen.getByRole("button", { name: "新增下游" }));
    expect(screen.getByText("数据归档")).toBeInTheDocument();
    expect(screen.getByText("/messages/archive")).toBeInTheDocument();
    await screen.findByText(/已新增下游/);

    fireEvent.click(screen.getByRole("button", { name: "用选中下游生成 workflow" }));
    await waitFor(() => expect(screen.getByDisplayValue(/name: custom-downstream-flow/)).toBeInTheDocument());
    expect(screen.getByDisplayValue(/forward-audit/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/forward-archive/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(screen.getByDisplayValue("新建或选择 workflow")).toBeInTheDocument();
  });

  it("支持自定义事件 payload", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Workflows/ }));
    fireEvent.change(screen.getByDisplayValue("GitHub push"), { target: { value: "custom" } });
    expect(screen.getByLabelText("自定义事件 JSON")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("自定义事件 JSON"), {
      target: { value: '{ "event": "order.refunded", "orderId": "R-1" }' }
    });
    expect(screen.getByDisplayValue(/order.refunded/)).toBeInTheDocument();
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
