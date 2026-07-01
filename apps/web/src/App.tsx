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
import { useEffect, useMemo, useRef, useState } from "react";
import { buildDemoWorkflow, samplePayloads } from "@webhook-flow/shared/browser";
import { apiGet, apiSend, mockDelete, mockGet } from "./api.js";

type Page = "overview" | "endpoints" | "workflows" | "executions" | "mock";
type EventChoice = keyof typeof samplePayloads | "custom";

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
  target?: string;
  headers: Record<string, unknown>;
  body: unknown;
  receivedAt: string;
}

interface DownstreamTarget {
  id: string;
  name: string;
  path: string;
}

const workflowMockBaseUrl = import.meta.env.VITE_WORKFLOW_MOCK_BASE_URL ?? "http://localhost:4001";

const navItems: Array<{ page: Page; label: string; icon: typeof Activity }> = [
  { page: "overview", label: "概览", icon: Activity },
  { page: "endpoints", label: "Endpoints", icon: Server },
  { page: "workflows", label: "Workflows", icon: Workflow },
  { page: "executions", label: "Executions", icon: GitBranch },
  { page: "mock", label: "Mock Receiver", icon: Boxes }
];

const defaultDownstreams: DownstreamTarget[] = [
  { id: "audit", name: "GitHub 审计", path: "/messages/audit" },
  { id: "notify", name: "GitHub 通知", path: "/messages/notify" },
  { id: "monitor", name: "监控告警", path: "/messages/monitor" },
  { id: "payment", name: "支付成功", path: "/messages/payment" }
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
  const workflowDraftRef = useRef(false);
  const [downstreamTargets, setDownstreamTargets] = useState(defaultDownstreams);
  const [selectedDownstreamIds, setSelectedDownstreamIds] = useState(["audit", "notify"]);
  const [downstreamName, setDownstreamName] = useState("研发通知");
  const [downstreamPath, setDownstreamPath] = useState("/messages/dev");
  const [sampleKey, setSampleKey] = useState<EventChoice>("githubPush");
  const [customEventText, setCustomEventText] = useState(
    JSON.stringify({ event: "custom.created", title: "自定义事件", userId: "user_demo" }, null, 2)
  );
  const [executionStatusFilter, setExecutionStatusFilter] = useState("all");
  const [notice, setNotice] = useState("准备就绪");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const stats = useMemo(
    () => ({
      endpoints: endpoints.length,
      workflows: workflows.length,
      executions: executions.length,
      mockMessages: mockMessages.length
    }),
    [endpoints, workflows, executions, mockMessages]
  );

  async function refreshAll(options: { silent?: boolean } = {}) {
    try {
      if (!options.silent) setError("");
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
      setSelectedEndpointId((current) => current || endpointData.endpoints[0]?.id || "");
      setSelectedWorkflowId((current) => (workflowDraftRef.current ? current : current || workflowData.workflows[0]?.id || ""));
      if (!options.silent) setNotice("数据已刷新");
    } catch (err) {
      if (!options.silent) setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refreshAll({ silent: true });
    const timer = window.setInterval(() => {
      void refreshAll({ silent: true });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function runAction(label: string, action: () => Promise<void>, doneMessage?: string) {
    setError("");
    setNotice(`${label}处理中...`);
    setBusyAction(label);
    try {
      await action();
      if (doneMessage) setNotice(doneMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  }

  async function createEndpoint() {
    const endpoint = await apiSend<Endpoint>("/api/endpoints", { name: endpointName });
    setEndpointSecretMap((current) => ({ ...current, [endpoint.id]: endpoint.secret ?? "" }));
    setSelectedEndpointId(endpoint.id);
    await refreshAll({ silent: true });
    setNotice(`已创建 endpoint：${endpoint.name}`);
  }

  async function rotateSecret(endpoint: Endpoint) {
    const result = await apiSend<Endpoint>(`/api/endpoints/${endpoint.id}/rotate-secret`);
    setEndpointSecretMap((current) => ({ ...current, [endpoint.id]: result.secret ?? "" }));
    setNotice(`已重新生成 ${endpoint.name} 的 secret`);
  }

  async function toggleEndpoint(endpoint: Endpoint) {
    const updated = await apiSend<Endpoint>(`/api/endpoints/${endpoint.id}`, { enabled: !endpoint.enabled }, "PATCH");
    setEndpoints((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setNotice(`已${endpoint.enabled ? "停用" : "启用"} endpoint：${endpoint.name}`);
  }

  function selectWorkflow(id: string) {
    setSelectedWorkflowId(id);
    workflowDraftRef.current = false;
    const workflow = workflows.find((item) => item.id === id);
    if (workflow) setWorkflowText(workflow.dslText);
  }

  function selectedDownstreams() {
    return downstreamTargets.filter((target) => selectedDownstreamIds.includes(target.id));
  }

  function toggleDownstream(id: string) {
    setSelectedDownstreamIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function addDownstream() {
    const name = downstreamName.trim();
    if (!name) throw new Error("下游名称不能为空");
    const path = normalizeDownstreamPath(downstreamPath);
    const id = path.split("/").pop() || `target-${Date.now()}`;
    if (downstreamTargets.some((target) => target.path === path)) throw new Error("下游路径已存在");
    setDownstreamTargets((current) => [...current, { id, name, path }]);
    setSelectedDownstreamIds((current) => [...current, id]);
    setDownstreamName("");
    setDownstreamPath("/messages/");
    setNotice(`已新增下游：${name}`);
  }

  function applyDownstreamsToWorkflow() {
    const targets = selectedDownstreams();
    if (targets.length === 0) throw new Error("请至少选择一个下游");
    setSelectedWorkflowId("");
    workflowDraftRef.current = true;
    setWorkflowText(buildWorkflowForDownstreams(targets, workflowMockBaseUrl));
    setNotice(`已生成 ${targets.length} 个下游的 workflow DSL`);
  }

  async function saveWorkflow() {
    if (!selectedEndpointId) throw new Error("请先选择 endpoint");
    const result = await apiSend<WorkflowItem>("/api/workflows", {
      endpointId: selectedEndpointId,
      dslText: workflowText
    });
    setSelectedWorkflowId(result.id);
    workflowDraftRef.current = false;
    await refreshAll({ silent: true });
    setNotice(`已保存 workflow：${result.name}`);
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
      payload: currentEventPayload(sampleKey, customEventText)
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
    const payload = sampleKey === "custom" ? currentEventPayload(sampleKey, customEventText) : undefined;
    await apiSend("/api/demo/send-sample", { endpointId: selectedEndpointId, sample: sampleKey === "custom" ? "githubPush" : sampleKey, payload, secret });
    await refreshAll({ silent: true });
    setNotice(`已发送事件：${eventLabel(sampleKey)}`);
  }

  async function openExecution(id: string) {
    const detail = await apiGet<ExecutionItem>(`/api/executions/${id}`);
    setSelectedExecution(detail);
    setPage("executions");
    setNotice(`已打开 execution：${id.slice(0, 8)}`);
  }

  async function clearMockMessages() {
    await mockDelete("/messages");
    await refreshAll({ silent: true });
    setNotice("mock receiver 消息已清空");
  }

  function dismissStatus() {
    setError("");
    setNotice("准备就绪");
  }

  async function copyHookUrl(hookUrl: string) {
    if (!navigator.clipboard) {
      throw new Error("当前浏览器不支持自动复制，请手动复制接收地址");
    }
    await navigator.clipboard.writeText(hookUrl);
  }

  const activeEndpoint = endpoints.find((endpoint) => endpoint.id === selectedEndpointId);
  const visibleExecutions = executions.filter((execution) =>
    executionStatusFilter === "all" ? true : execution.status === executionStatusFilter
  );
  const mockGroups = groupMockMessages(mockMessages);
  const isBusy = Boolean(busyAction);

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
          <button
            className="iconButton"
            disabled={isBusy}
            onClick={() => void runAction("刷新数据", () => refreshAll())}
            title="刷新数据"
          >
            <RefreshCw size={18} />
            刷新
          </button>
        </header>

        <StatusPopup message={error || notice} kind={error ? "error" : "info"} onDismiss={dismissStatus} />

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
              <ExecutionTable
                executions={executions.slice(0, 6)}
                onOpen={(id) => runAction("打开 execution", () => openExecution(id))}
              />
            </div>
          </section>
        )}

        {page === "endpoints" && (
          <section className="stack">
            <div className="toolbar">
              <input value={endpointName} onChange={(event) => setEndpointName(event.target.value)} />
              <button disabled={isBusy} onClick={() => void runAction("创建 endpoint", createEndpoint)}>
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
                        <button
                          disabled={isBusy}
                          onClick={() => {
                            setSelectedEndpointId(endpoint.id);
                            setNotice(`已选择 endpoint：${endpoint.name}`);
                          }}
                        >
                          详情
                        </button>
                        <button
                          disabled={isBusy}
                          title="复制地址"
                          onClick={() => void runAction("复制地址", () => copyHookUrl(endpoint.hookUrl), "地址已复制")}
                        >
                          <Clipboard size={15} />
                        </button>
                        <button disabled={isBusy} onClick={() => void runAction("切换 endpoint 状态", () => toggleEndpoint(endpoint))}>
                          {endpoint.enabled ? "停用" : "启用"}
                        </button>
                        <button disabled={isBusy} onClick={() => void runAction("重置 secret", () => rotateSecret(endpoint))}>
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
          <section className="stack">
            <WorkflowGuide hasEndpoint={Boolean(activeEndpoint)} hasWorkflow={Boolean(selectedWorkflowId)} />
            <div className="flowRelation" aria-label="事件流关系">
              <span>事件 payload</span>
              <strong>生成 workflow</strong>
              <span>转发到勾选下游</span>
              <span>Execution / Mock Receiver 验收</span>
            </div>
            <section className="panel">
              <div className="panelHeader">
                <div>
                  <h2>绑定和保存</h2>
                  <p className="muted">先绑定 endpoint，再用下方向导生成 workflow，最后保存。</p>
                </div>
              </div>
              <div className="formRow workflowSelectors">
                <label>
                  <span>绑定 endpoint</span>
                  <select value={selectedEndpointId} onChange={(event) => setSelectedEndpointId(event.target.value)}>
                    <option value="">选择 endpoint</option>
                    {endpoints.map((endpoint) => (
                      <option key={endpoint.id} value={endpoint.id}>
                        {endpoint.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>已有 workflow</span>
                  <select value={selectedWorkflowId} onChange={(event) => selectWorkflow(event.target.value)}>
                    <option value="">新建或选择 workflow</option>
                    {workflows.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary" disabled={isBusy} onClick={() => void runAction("保存 workflow", saveWorkflow)}>
                  <Save size={16} />
                  保存为 workflow
                </button>
              </div>
            </section>
              <DemoSender
                activeEndpoint={activeEndpoint}
                downstreamTargets={downstreamTargets}
                selectedDownstreamIds={selectedDownstreamIds}
                downstreamName={downstreamName}
              downstreamPath={downstreamPath}
              onDownstreamNameChange={setDownstreamName}
              onDownstreamPathChange={setDownstreamPath}
              onAddDownstream={() => runAction("新增下游", async () => addDownstream())}
              onToggleDownstream={toggleDownstream}
              onApplyDownstreams={() => runAction("生成 workflow DSL", async () => applyDownstreamsToWorkflow())}
              sampleKey={sampleKey}
              onSampleChange={setSampleKey}
              customEventText={customEventText}
              onCustomEventTextChange={setCustomEventText}
              onSend={() => runAction("发送当前事件", sendSample)}
              onOpenMock={() => setPage("mock")}
              disabled={isBusy}
            />
            <section className="panel">
              <h2>高级配置</h2>
              <p className="muted">通常不用手改。只有需要自定义匹配条件、Header 或重试策略时再展开。</p>
              <details className="advancedDsl">
                <summary>查看或手动编辑 DSL</summary>
                <textarea value={workflowText} onChange={(event) => setWorkflowText(event.target.value)} />
                <div className="toolbar workflowActions">
                  <button disabled={isBusy} onClick={() => void runAction("校验 DSL", validateWorkflow)}>
                    <FlaskConical size={16} />
                    校验 DSL
                  </button>
                  <button disabled={isBusy} onClick={() => void runAction("测试 workflow", testWorkflow)}>
                    <Play size={16} />
                    测试匹配
                  </button>
                </div>
              </details>
            </section>
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
              <ExecutionTable
                executions={visibleExecutions}
                onOpen={(id) => runAction("打开 execution", () => openExecution(id))}
              />
            </div>
            <ExecutionDetail execution={selectedExecution} />
          </section>
        )}

        {page === "mock" && (
          <section className="panel">
            <div className="panelHeader">
              <h2>Mock Receiver 消息</h2>
              <button disabled={isBusy} onClick={() => void runAction("清空 mock receiver", clearMockMessages)}>
                清空
              </button>
            </div>
            <div className="messageList">
              {mockGroups.map(([target, messages]) => (
                <section className="messageGroup" key={target}>
                  <h3>/messages/{target}</h3>
                  {messages.map((message) => (
                    <article key={message.id} className="message">
                      <time>{formatTime(message.receivedAt)}</time>
                      <pre>{JSON.stringify({ headers: message.headers, body: message.body }, null, 2)}</pre>
                    </article>
                  ))}
                </section>
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

function WorkflowGuide({ hasEndpoint, hasWorkflow }: { hasEndpoint: boolean; hasWorkflow: boolean }) {
  return (
    <div className="workflowGuide" aria-label="Workflow 操作流程">
      <div className={hasEndpoint ? "guideItem done" : "guideItem"}>
        <strong>1. 绑定 endpoint</strong>
        <span>没有 endpoint 先去 Endpoints 创建。</span>
      </div>
      <div className={hasWorkflow ? "guideItem done" : "guideItem"}>
        <strong>2. 准备事件</strong>
        <span>选择样例或粘贴自定义 JSON。</span>
      </div>
      <div className="guideItem">
        <strong>3. 配置下游</strong>
        <span>新增目标，勾选一个或多个下游。</span>
      </div>
      <div className="guideItem">
        <strong>4. 生成并验收</strong>
        <span>生成 workflow、保存，再发送当前事件。</span>
      </div>
    </div>
  );
}

function StatusPopup({
  message,
  kind,
  onDismiss
}: {
  message: string;
  kind: "info" | "error";
  onDismiss: () => void;
}) {
  if (message === "准备就绪") return null;
  return (
    <div className={`statusPopup ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span>{message}</span>
      <button onClick={onDismiss}>知道了</button>
    </div>
  );
}

function DemoSender({
  activeEndpoint,
  downstreamTargets,
  selectedDownstreamIds,
  downstreamName,
  downstreamPath,
  onDownstreamNameChange,
  onDownstreamPathChange,
  onAddDownstream,
  onToggleDownstream,
  onApplyDownstreams,
  sampleKey,
  onSampleChange,
  customEventText,
  onCustomEventTextChange,
  onSend,
  onOpenMock,
  disabled
}: {
  activeEndpoint?: Endpoint;
  downstreamTargets: DownstreamTarget[];
  selectedDownstreamIds: string[];
  downstreamName: string;
  downstreamPath: string;
  onDownstreamNameChange: (value: string) => void;
  onDownstreamPathChange: (value: string) => void;
  onAddDownstream: () => Promise<void>;
  onToggleDownstream: (id: string) => void;
  onApplyDownstreams: () => Promise<void>;
  sampleKey: EventChoice;
  onSampleChange: (key: EventChoice) => void;
  customEventText: string;
  onCustomEventTextChange: (value: string) => void;
  onSend: () => Promise<void>;
  onOpenMock: () => void;
  disabled?: boolean;
}) {
  const presetTargets = downstreamTargets.filter((target) => defaultDownstreams.some((item) => item.id === target.id));
  const customTargets = downstreamTargets.filter((target) => !defaultDownstreams.some((item) => item.id === target.id));

  return (
    <div className="panel downstreamPanel">
      <section className="eventBuilder">
        <h2>事件输入</h2>
        <p className="muted">这里决定发什么事件；workflow 会把这个 payload 转发给勾选的下游。</p>
        <select value={sampleKey} onChange={(event) => onSampleChange(event.target.value as EventChoice)}>
          {Object.entries(samplePayloads).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
          <option value="custom">自定义事件</option>
        </select>
        {sampleKey === "custom" ? (
          <textarea
            className="eventJson"
            aria-label="自定义事件 JSON"
            value={customEventText}
            onChange={(event) => onCustomEventTextChange(event.target.value)}
          />
        ) : (
          <pre className="sample">{JSON.stringify(samplePayloads[sampleKey].body, null, 2)}</pre>
        )}
      </section>

      <section className="downstreamBuilder">
        <h2>下游输出</h2>
        <p className="muted">目标 endpoint：{activeEndpoint?.name ?? "未选择"}；预设和自定义下游可以一起勾选。</p>
        <section className="targetGroup">
          <h3>预设下游</h3>
          <div className="targetList" aria-label="预设下游">
            {presetTargets.map((target) => (
            <label key={target.id} className="targetChoice">
              <input
                type="checkbox"
                checked={selectedDownstreamIds.includes(target.id)}
                onChange={() => onToggleDownstream(target.id)}
              />
              <span>{target.name}</span>
              <code>{target.path}</code>
            </label>
          ))}
          </div>
        </section>
        <section className="targetGroup">
          <h3>自定义下游</h3>
          {customTargets.length === 0 ? <p className="muted">还没有自定义下游，先新增一个。</p> : null}
          {customTargets.length > 0 ? (
            <div className="targetList" aria-label="自定义下游">
              {customTargets.map((target) => (
                <label key={target.id} className="targetChoice">
                  <input
                    type="checkbox"
                    checked={selectedDownstreamIds.includes(target.id)}
                    onChange={() => onToggleDownstream(target.id)}
                  />
                  <span>{target.name}</span>
                  <code>{target.path}</code>
                </label>
              ))}
            </div>
          ) : null}
          <div className="downstreamForm">
            <input
              aria-label="下游名称"
              value={downstreamName}
              onChange={(event) => onDownstreamNameChange(event.target.value)}
              placeholder="下游名称"
            />
            <input
              aria-label="下游路径"
              value={downstreamPath}
              onChange={(event) => onDownstreamPathChange(event.target.value)}
              placeholder="/messages/dev"
            />
            <button disabled={disabled} onClick={() => void onAddDownstream()}>
              新增下游
            </button>
          </div>
        </section>
        <button disabled={disabled} onClick={() => void onApplyDownstreams()}>
          <Workflow size={16} />
          用选中下游生成 workflow
        </button>
      </section>

      <section className="verifyBuilder">
        <h2>验收</h2>
        <button className="primary" disabled={disabled} onClick={() => void onSend()}>
          <Send size={16} />
          发送当前事件
        </button>
        <button disabled={disabled} onClick={onOpenMock}>
          <Boxes size={16} />
          查看下游消息
        </button>
      </section>
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

function groupMockMessages(messages: MockMessage[]) {
  const groups = new Map<string, MockMessage[]>();
  for (const message of messages) {
    const target = message.target ?? String(message.headers["x-mock-target"] ?? "default");
    groups.set(target, [...(groups.get(target) ?? []), message]);
  }
  return [...groups.entries()];
}

function normalizeDownstreamPath(value: string) {
  const raw = value.trim().replace(/^\/+/, "");
  const slug = raw
    .replace(/^messages\/?/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("下游路径不能为空");
  return `/messages/${slug}`;
}

function buildWorkflowForDownstreams(targets: DownstreamTarget[], mockBaseUrl: string) {
  const base = mockBaseUrl.replace(/\/$/, "");
  const steps = targets
    .map((target) => {
      const targetName = target.path.split("/").pop() || target.id;
      return `  - name: forward-${targetName}
    type: httpRequest
    method: POST
    url: "${base}${target.path}"
    headers:
      x-demo-target: ${targetName}
    body:
      target: "${target.name}"
      payload: "{{body}}"`;
    })
    .join("\n");
  return `name: custom-downstream-flow
trigger:
  endpoint: custom-demo
steps:
${steps}
`;
}

function currentEventPayload(key: EventChoice, customText: string) {
  if (key !== "custom") return samplePayloads[key].body;
  try {
    return JSON.parse(customText);
  } catch {
    throw new Error("自定义事件 JSON 不合法");
  }
}

function eventLabel(key: EventChoice) {
  return key === "custom" ? "自定义事件" : samplePayloads[key].label;
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
