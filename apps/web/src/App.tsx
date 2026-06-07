import {
  Activity,
  Boxes,
  Clipboard,
  FlaskConical,
  GitBranch,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Server,
  Shield,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildDemoWorkflow, samplePayloads } from "@webhook-flow/shared/browser";
import { apiGet, apiSend, mockDelete, mockGet } from "./api.js";

type Page = "overview" | "endpoints" | "workflows" | "executions" | "mock";

interface Endpoint {
  id: string;
  name: string;
  slug: string;
  hookUrl: string;
  enabled: boolean;
  createdAt: string;
  secret?: string;
}

interface WorkflowItem {
  id: string;
  name: string;
  endpointId: string;
  dslText: string;
  dslFormat: string;
  enabled: boolean;
}

interface ExecutionItem {
  id: string;
  workflowId: string;
  eventId: string;
  workflowName?: string;
  endpointName?: string;
  status: string;
  errorMessage?: string;
  skippedReason?: string;
  createdAt: string;
  stepLogs?: StepLog[];
  event?: { payload: unknown };
}

interface StepLog {
  id: string;
  stepIndex: number;
  stepName: string;
  type: string;
  status: string;
  attempt: number;
  errorMessage?: string;
  input?: unknown;
  output?: unknown;
}

interface MockMessage {
  id: string;
  headers: Record<string, unknown>;
  body: unknown;
  receivedAt: string;
}

const workflowMockBaseUrl = import.meta.env.VITE_WORKFLOW_MOCK_BASE_URL ?? "http://localhost:4001";

const navItems: Array<{ page: Page; label: string; icon: typeof Activity }> = [
  { page: "overview", label: "概览", icon: Activity },
  { page: "endpoints", label: "Endpoints", icon: Server },
  { page: "workflows", label: "Workflows", icon: Workflow },
  { page: "executions", label: "Executions", icon: GitBranch },
  { page: "mock", label: "Mock Receiver", icon: Boxes }
];

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [mockMessages, setMockMessages] = useState<MockMessage[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionItem | null>(null);
  const [endpointName, setEndpointName] = useState("GitHub Demo");
  const [endpointSecretMap, setEndpointSecretMap] = useState<Record<string, string>>({});
  const [workflowText, setWorkflowText] = useState(buildDemoWorkflow(workflowMockBaseUrl));
  const [selectedEndpointId, setSelectedEndpointId] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [sampleKey, setSampleKey] = useState<keyof typeof samplePayloads>("githubPush");
  const [executionStatusFilter, setExecutionStatusFilter] = useState("all");
  const [notice, setNotice] = useState("准备就绪");
  const [error, setError] = useState("");
  const stats = useMemo(
    () => ({
      endpoints: endpoints.length,
      workflows: workflows.length,
      executions: executions.length,
      mockMessages: mockMessages.length
    }),
    [endpoints, workflows, executions, mockMessages]
  );

  async function refreshAll() {
    try {
      setError("");
      const [endpointData, workflowData, executionData, mockData] = await Promise.all([
        apiGet<{ endpoints: Endpoint[] }>("/api/endpoints"),
        apiGet<{ workflows: WorkflowItem[] }>("/api/workflows"),
        apiGet<{ executions: ExecutionItem[] }>("/api/executions"),
        mockGet<{ messages: MockMessage[] }>("/messages").catch(() => ({ messages: [] }))
      ]);
      setEndpoints(endpointData.endpoints);
      setWorkflows(workflowData.workflows);
      setExecutions(executionData.executions);
      setMockMessages(mockData.messages);
      if (!selectedEndpointId && endpointData.endpoints[0]) setSelectedEndpointId(endpointData.endpoints[0].id);
      if (!selectedWorkflowId && workflowData.workflows[0]) setSelectedWorkflowId(workflowData.workflows[0].id);
      setNotice("数据已刷新");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refreshAll();
    const timer = window.setInterval(() => {
      void refreshAll();
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function createEndpoint() {
    const endpoint = await apiSend<Endpoint>("/api/endpoints", { name: endpointName });
    setEndpointSecretMap((current) => ({ ...current, [endpoint.id]: endpoint.secret ?? "" }));
    setSelectedEndpointId(endpoint.id);
    setNotice(`已创建 endpoint：${endpoint.name}`);
    await refreshAll();
  }

  async function rotateSecret(endpoint: Endpoint) {
    const result = await apiSend<Endpoint>(`/api/endpoints/${endpoint.id}/rotate-secret`);
    setEndpointSecretMap((current) => ({ ...current, [endpoint.id]: result.secret ?? "" }));
    setNotice(`已重新生成 ${endpoint.name} 的 secret`);
  }

  async function toggleEndpoint(endpoint: Endpoint) {
    await apiSend(`/api/endpoints/${endpoint.id}`, { enabled: !endpoint.enabled }, "PATCH");
    await refreshAll();
  }

  async function saveWorkflow() {
    if (!selectedEndpointId) throw new Error("请先选择 endpoint");
    const result = await apiSend<WorkflowItem>("/api/workflows", {
      endpointId: selectedEndpointId,
      dslText: workflowText
    });
    setSelectedWorkflowId(result.id);
    setNotice(`已保存 workflow：${result.name}`);
    await refreshAll();
  }

  async function validateWorkflow() {
    const result = await apiSend<{ ok: boolean; errors: string[] }>("/api/workflows/validate", {
      dslText: workflowText
    });
    setNotice(result.ok ? "DSL 校验通过" : `DSL 校验失败：${result.errors.join("；")}`);
  }

  async function testWorkflow() {
    if (!selectedWorkflowId) throw new Error("请先选择 workflow");
    const result = await apiSend(`/api/workflows/${selectedWorkflowId}/test`, {
      payload: samplePayloads[sampleKey].body
    });
    setNotice(`测试结果：${JSON.stringify(result).slice(0, 160)}`);
  }

  async function sendSample() {
    if (!selectedEndpointId) throw new Error("请先选择 endpoint");
    const secret = endpointSecretMap[selectedEndpointId];
    if (!secret) {
      setError("缺少 endpoint secret，请创建 endpoint 后立即发送，或重新生成 secret");
      return;
    }
    await apiSend("/api/demo/send-sample", { endpointId: selectedEndpointId, sample: sampleKey, secret });
    setNotice(`已发送样例事件：${samplePayloads[sampleKey].label}`);
    await refreshAll();
  }

  async function openExecution(id: string) {
    const detail = await apiGet<ExecutionItem>(`/api/executions/${id}`);
    setSelectedExecution(detail);
  }

  async function clearMockMessages() {
    await mockDelete("/messages");
    setNotice("mock receiver 消息已清空");
    await refreshAll();
  }

  const activeEndpoint = endpoints.find((endpoint) => endpoint.id === selectedEndpointId);
  const visibleExecutions = executions.filter((execution) =>
    executionStatusFilter === "all" ? true : execution.status === executionStatusFilter
  );

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <Shield size={22} />
          <div>
            <strong>Webhook Flow</strong>
            <span>事件编排控制台</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                className={page === item.page ? "nav active" : "nav"}
                onClick={() => setPage(item.page)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">本地演示环境</p>
            <h1>{navItems.find((item) => item.page === page)?.label}</h1>
          </div>
          <button className="iconButton" onClick={() => void refreshAll()} title="刷新数据">
            <RefreshCw size={18} />
            刷新
          </button>
        </header>

        {error ? <div className="alert error">{error}</div> : <div className="alert">{notice}</div>}

        {page === "overview" && (
          <section className="grid">
            {Object.entries(stats).map(([key, value]) => (
              <div className="metric" key={key}>
                <span>{metricLabel(key)}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <div className="panel wide">
              <h2>最近 executions</h2>
              <ExecutionTable executions={executions.slice(0, 6)} onOpen={openExecution} />
            </div>
          </section>
        )}

        {page === "endpoints" && (
          <section className="stack">
            <div className="toolbar">
              <input value={endpointName} onChange={(event) => setEndpointName(event.target.value)} />
              <button onClick={() => void createEndpoint()}>
                <Server size={16} />
                创建 endpoint
              </button>
            </div>
            <div className="split">
              <div className="panel">
              <h2>Endpoint 列表</h2>
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>地址</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((endpoint) => (
                    <tr key={endpoint.id}>
                      <td>{endpoint.name}</td>
                      <td>
                        <code>{endpoint.hookUrl}</code>
                      </td>
                      <td>
                        <Status value={endpoint.enabled ? "enabled" : "disabled"} />
                      </td>
                      <td className="actions">
                        <button onClick={() => setSelectedEndpointId(endpoint.id)}>详情</button>
                        <button title="复制地址" onClick={() => navigator.clipboard?.writeText(endpoint.hookUrl)}>
                          <Clipboard size={15} />
                        </button>
                        <button onClick={() => void toggleEndpoint(endpoint)}>
                          {endpoint.enabled ? "停用" : "启用"}
                        </button>
                        <button onClick={() => void rotateSecret(endpoint)}>
                          <RotateCcw size={15} />
                          重置 secret
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <EndpointDetail endpoint={activeEndpoint} secret={activeEndpoint ? endpointSecretMap[activeEndpoint.id] : ""} />
            </div>
          </section>
        )}

        {page === "workflows" && (
          <section className="split">
            <div className="panel">
              <h2>Workflow DSL</h2>
              <div className="formRow">
                <select value={selectedEndpointId} onChange={(event) => setSelectedEndpointId(event.target.value)}>
                  <option value="">选择 endpoint</option>
                  {endpoints.map((endpoint) => (
                    <option key={endpoint.id} value={endpoint.id}>
                      {endpoint.name}
                    </option>
                  ))}
                </select>
                <select value={selectedWorkflowId} onChange={(event) => setSelectedWorkflowId(event.target.value)}>
                  <option value="">选择 workflow</option>
                  {workflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea value={workflowText} onChange={(event) => setWorkflowText(event.target.value)} />
              <div className="toolbar">
                <button onClick={() => void validateWorkflow()}>
                  <FlaskConical size={16} />
                  校验
                </button>
                <button onClick={() => void saveWorkflow()}>
                  <Save size={16} />
                  保存
                </button>
                <button onClick={() => void testWorkflow()}>
                  <Play size={16} />
                  测试
                </button>
              </div>
            </div>
            <DemoSender
              activeEndpoint={activeEndpoint}
              sampleKey={sampleKey}
              onSampleChange={setSampleKey}
              onSend={sendSample}
            />
          </section>
        )}

        {page === "executions" && (
          <section className="split">
            <div className="panel">
              <div className="panelHeader">
                <h2>Execution 列表</h2>
                <select
                  value={executionStatusFilter}
                  onChange={(event) => setExecutionStatusFilter(event.target.value)}
                  aria-label="Execution 状态筛选"
                >
                  <option value="all">全部状态</option>
                  <option value="success">成功</option>
                  <option value="running">运行中</option>
                  <option value="failed">失败</option>
                  <option value="skipped">跳过</option>
                </select>
              </div>
              <ExecutionTable executions={visibleExecutions} onOpen={openExecution} />
            </div>
            <ExecutionDetail execution={selectedExecution} />
          </section>
        )}

        {page === "mock" && (
          <section className="panel">
            <div className="panelHeader">
              <h2>Mock Receiver 消息</h2>
              <button onClick={() => void clearMockMessages()}>清空</button>
            </div>
            <div className="messageList">
              {mockMessages.map((message) => (
                <article key={message.id} className="message">
                  <time>{formatTime(message.receivedAt)}</time>
                  <pre>{JSON.stringify({ headers: message.headers, body: message.body }, null, 2)}</pre>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function EndpointDetail({ endpoint, secret }: { endpoint?: Endpoint; secret?: string }) {
  if (!endpoint) {
    return (
      <div className="panel">
        <h2>Endpoint 详情</h2>
        <p className="muted">创建或选择 endpoint 后查看接收地址和一次性 secret。</p>
      </div>
    );
  }
  return (
    <div className="panel detailPanel">
      <h2>Endpoint 详情</h2>
      <dl>
        <dt>名称</dt>
        <dd>{endpoint.name}</dd>
        <dt>Slug</dt>
        <dd>
          <code>{endpoint.slug}</code>
        </dd>
        <dt>接收地址</dt>
        <dd>
          <code>{endpoint.hookUrl}</code>
        </dd>
        <dt>状态</dt>
        <dd>
          <Status value={endpoint.enabled ? "enabled" : "disabled"} />
        </dd>
        <dt>一次性 secret</dt>
        <dd>
          {secret ? (
            <code>{secret}</code>
          ) : (
            <span className="muted">仅创建或重置后展示；丢失请点击“重置 secret”。</span>
          )}
        </dd>
      </dl>
    </div>
  );
}

function DemoSender({
  activeEndpoint,
  sampleKey,
  onSampleChange,
  onSend
}: {
  activeEndpoint?: Endpoint;
  sampleKey: keyof typeof samplePayloads;
  onSampleChange: (key: keyof typeof samplePayloads) => void;
  onSend: () => Promise<void>;
}) {
  return (
    <div className="panel">
      <h2>样例事件发送</h2>
      <p className="muted">目标 endpoint：{activeEndpoint?.name ?? "未选择"}</p>
      <select value={sampleKey} onChange={(event) => onSampleChange(event.target.value as keyof typeof samplePayloads)}>
        {Object.entries(samplePayloads).map(([key, value]) => (
          <option key={key} value={key}>
            {value.label}
          </option>
        ))}
      </select>
      <pre className="sample">{JSON.stringify(samplePayloads[sampleKey].body, null, 2)}</pre>
      <button className="primary" onClick={() => void onSend()}>
        <Send size={16} />
        发送样例事件
      </button>
    </div>
  );
}

function ExecutionTable({
  executions,
  onOpen
}: {
  executions: ExecutionItem[];
  onOpen: (id: string) => Promise<void>;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Workflow</th>
          <th>Endpoint</th>
          <th>状态</th>
          <th>时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {executions.map((execution) => (
          <tr key={execution.id}>
            <td>{execution.workflowName ?? execution.workflowId}</td>
            <td>{execution.endpointName ?? "-"}</td>
            <td>
              <Status value={execution.status} />
            </td>
            <td>{formatTime(execution.createdAt)}</td>
            <td>
              <button onClick={() => void onOpen(execution.id)}>详情</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExecutionDetail({ execution }: { execution: ExecutionItem | null }) {
  if (!execution) {
    return (
      <div className="panel">
        <h2>Execution 详情</h2>
        <p className="muted">选择一条 execution 查看步骤时间线。</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>Execution 详情</h2>
      <Status value={execution.status} />
      <p className="muted">{execution.errorMessage ?? execution.skippedReason ?? "无错误"}</p>
      <h3>事件 payload</h3>
      <pre>{JSON.stringify(execution.event?.payload ?? {}, null, 2)}</pre>
      <div className="timeline">
        {(execution.stepLogs ?? []).map((step) => (
          <article className="step" key={step.id}>
            <div>
              <strong>
                #{step.stepIndex + 1} {step.stepName}
              </strong>
              <span>attempt {step.attempt}</span>
            </div>
            <Status value={step.status} />
            {step.errorMessage ? <p className="errorText">{step.errorMessage}</p> : null}
            <pre>{JSON.stringify(step.output ?? step.input ?? {}, null, 2)}</pre>
          </article>
        ))}
      </div>
    </div>
  );
}

function Status({ value }: { value: string }) {
  return <span className={`status ${value}`}>{statusLabel(value)}</span>;
}

function metricLabel(key: string) {
  return (
    {
      endpoints: "Endpoints",
      workflows: "Workflows",
      executions: "Executions",
      mockMessages: "Mock 消息"
    }[key] ?? key
  );
}

function statusLabel(value: string) {
  return (
    {
      enabled: "启用",
      disabled: "停用",
      pending: "等待",
      running: "运行中",
      success: "成功",
      failed: "失败",
      skipped: "跳过"
    }[value] ?? value
  );
}

function formatTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
