import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { App } from "../App.js";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
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
        endpoints: [
          {
            id: "endpoint-1",
            name: "课堂 Demo",
            slug: "class-demo",
            hookUrl: "/hooks/class-demo",
            enabled: true,
            createdAt: "2026-06-05T00:00:00.000Z"
          }
        ]
      });
    }
    if (url.includes("/api/workflows")) return json({ workflows: [] });
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
    expect(screen.getByText("Workflow DSL")).toBeInTheDocument();
    expect(screen.getByText("校验")).toBeInTheDocument();
  });

  it("创建 endpoint 后展示一次性 secret 和详情", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Endpoints/ }));
    fireEvent.click(await screen.findByRole("button", { name: /创建 endpoint/ }));
    expect(await screen.findByText("whsec_once")).toBeInTheDocument();
    expect(screen.getByText("class-demo")).toBeInTheDocument();
  });

  it("execution 详情展示原始 payload", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Executions/ }));
    fireEvent.click(await screen.findByRole("button", { name: "详情" }));
    expect(await screen.findByText("事件 payload")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/refs\/heads\/main/)).toBeInTheDocument());
  });

  it("mock receiver 展示 headers 和 body", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Mock Receiver/ }));
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
