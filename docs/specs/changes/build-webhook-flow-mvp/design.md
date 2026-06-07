## Context

本项目当前只有选题报告和 cadk 配置，还没有应用代码。MVP 需要从零搭建一个“开发者使用的 Webhook 编排工具”，重点不是复刻 n8n、Temporal 或 BPM 平台，而是完成一个短链路、可观察、可课堂演示的闭环：

```text
Webhook endpoint -> 原始事件入库 -> 匹配 workflow -> 执行步骤 -> 转发到 mock/外部 HTTP -> 查看日志
```

用户确认的技术栈为：

- 后端：TypeScript、Node.js、Fastify
- 前端：React、Vite、TypeScript
- 数据库：SQLite、Prisma
- DSL：YAML/JSON，运行前结构校验
- 队列与重试：SQLite 表驱动的轻量队列
- 部署：本地 npm/pnpm 启动 + Docker Compose
- 演示：控制台、本地模拟事件、mock receiver

前端设计使用 `frontend-design` 的方向，但本项目是工程控制台，不做营销首页。UI 应保持克制、清晰、密度适中，突出事件流、状态和错误定位。

## Goals / Non-Goals

**Goals:**

- 提供 endpoint 创建、secret 生成、事件接收和事件持久化。
- 提供 YAML/JSON workflow DSL，能定义触发 endpoint、过滤条件、顺序步骤、HTTP 转发和重试策略。
- 提供轻量执行引擎，能顺序执行步骤、条件跳过、失败重试，并记录每一步执行结果。
- 提供事件、execution、step log 的查询 API 和前端详情页。
- 提供课堂演示能力：内置 GitHub push、监控告警、支付成功三类模拟 payload；mock receiver 可展示收到的转发结果。
- 保证中文注释和中文界面文案，关键复杂逻辑必须有简洁中文注释。
- 保证核心链路测试覆盖，并提供部署验收清单。
- 支持 macOS、Linux、Windows 本地运行和 Docker Compose 运行。

**Non-Goals:**

- 不实现拖拽式低代码画布。
- 不实现多租户、RBAC、OAuth 登录或团队权限。
- 不实现复杂 DAG、并行分支、人工审批、长时间等待节点。
- 不集成真实 Slack、Lark、GitHub App 等第三方授权体系；MVP 使用通用 HTTP 转发和本地 mock receiver。
- 不依赖 Redis、Postgres、Kafka、Temporal、Airflow 等额外基础设施。

## Decisions

### 1. 使用 TypeScript 全栈 monorepo

采用 pnpm workspace 组织工程：

```text
apps/
  api/              Fastify API 与执行引擎
  web/              React + Vite 控制台
  mock-receiver/    演示用 mock 下游服务
packages/
  shared/           共享类型、DSL schema、测试 fixture
prisma/
  schema.prisma
```

选择 TypeScript 的原因：

- 后端、前端、DSL schema 和测试 fixture 可以共享类型。
- React 控制台不可避免需要 TypeScript，避免后端再引入 Python 造成上下文切换。
- Node.js 在 macOS、Linux、Windows 上安装和运行方式一致。

备选方案是 Python FastAPI + React，但会产生双语言边界；对课程 MVP 来说，TypeScript 全栈更利于统一实现和测试。

### 2. 使用 SQLite + Prisma 作为默认存储

SQLite 用于存储 endpoint、workflow、event、execution、step log、retry job 和 mock receiver 消息。Prisma 负责 schema、迁移和类型安全访问。

核心表建议：

- `Endpoint`: id、name、slug、secretHash、createdAt、updatedAt、enabled
- `Workflow`: id、name、endpointId、dslText、dslFormat、enabled、createdAt、updatedAt
- `Event`: id、endpointId、headersJson、payloadJson、receivedAt、sourceIp
- `Execution`: id、eventId、workflowId、status、startedAt、finishedAt、errorMessage
- `StepLog`: id、executionId、stepIndex、stepName、type、status、inputJson、outputJson、errorMessage、attempt、startedAt、finishedAt
- `RetryJob`: id、executionId、stepIndex、attempt、nextRunAt、lockedUntil、status、lastError
- `MockMessage`: id、headersJson、bodyJson、receivedAt

secret 原文只在创建时返回一次，数据库只保存哈希，避免日志和页面泄漏。

### 3. Webhook 接收先做 HMAC secret 校验

每个 endpoint 生成随机 secret。入站请求使用原始 body 和 secret 计算 HMAC SHA-256，客户端通过 `X-Webhook-Flow-Signature` 传入签名。演示控制台发送模拟事件时自动使用该 secret 签名。

这样比 query token 更接近真实 Webhook 安全模型，但实现仍然足够轻量。

### 4. DSL 使用声明式 YAML/JSON，校验和执行分离

DSL 先定义为稳定的 MVP 子集：

```yaml
name: github-main-push
trigger:
  endpoint: github-demo
filter:
  expr: "body.ref == 'refs/heads/main'"
steps:
  - name: notify-mock
    type: httpRequest
    when: "body.repository.name != ''"
    method: POST
    url: "http://localhost:4001/messages"
    body:
      text: "Repo {{body.repository.name}} pushed by {{body.pusher.name}}"
    retry:
      maxAttempts: 3
      backoffSeconds: 2
```

DSL 校验分两层：

- 结构校验：Zod 校验字段类型、必填项、枚举值和 retry 范围。
- 表达式校验：MVP 使用受限表达式求值器，只允许读取 `body`、`headers`、`event`，禁止执行任意 JavaScript。

模板渲染使用简单变量替换或成熟模板库，但必须限制能力边界，避免任意代码执行。

### 5. 执行引擎采用 SQLite 队列表，不引入 Redis

事件入库后立即创建 execution。执行器从数据库读取待执行任务，按 workflow steps 顺序执行：

```text
running -> success
        -> skipped
        -> retry_scheduled -> running
        -> failed
```

失败重试写入 `RetryJob.nextRunAt`，worker 周期扫描到期任务。该方案吞吐不如 Redis 队列，但部署简单、跨平台稳定，符合课程 MVP 的演示和验收目标。

### 6. 前端采用“工业控制台”风格

UI 目标用户是开发者和课程评审老师。界面应强调状态、链路和错误定位：

- 左侧固定导航：Overview、Endpoints、Workflows、Executions、Mock Receiver。
- 主区域以表格、详情抽屉、代码编辑器和状态标签为主。
- 色彩采用浅色或中性背景，配合少量高对比状态色；避免大面积紫蓝渐变、营销 hero 和装饰性卡片堆叠。
- YAML 编辑器使用等宽字体，支持校验错误定位。
- execution 详情用时间线展示 step 状态。
- 按钮使用图标 + 中文短文本，危险操作明确确认。
- 移动端不作为主要场景，但页面宽度收窄时必须不重叠、不溢出。

### 7. API 边界

建议 API：

- `POST /api/endpoints`
- `GET /api/endpoints`
- `GET /api/endpoints/:id`
- `POST /hooks/:slug`
- `POST /api/workflows`
- `PUT /api/workflows/:id`
- `POST /api/workflows/validate`
- `POST /api/workflows/:id/test`
- `GET /api/events`
- `GET /api/events/:id`
- `GET /api/executions`
- `GET /api/executions/:id`
- `POST /api/demo/send-sample`
- `GET /api/mock/messages`
- `DELETE /api/mock/messages`

### 8. 测试策略

测试覆盖按风险排序：

- DSL schema 单元测试：合法/非法 YAML、缺字段、错误枚举、retry 边界。
- HMAC 单元测试：签名正确、签名错误、缺签名。
- endpoint API 集成测试：创建 endpoint、接收事件、入库。
- 执行引擎测试：filter 命中、filter 跳过、HTTP 成功、HTTP 失败后重试、最终失败。
- execution log 测试：状态、错误原因、step log 内容完整。
- 前端关键行为测试：workflow 编辑校验、发送模拟事件、查看 execution 详情、mock receiver 收到消息。
- 部署验收：本地命令和 Docker Compose 启动后，跑通一条模拟事件到 mock receiver 的链路。

## Risks / Trade-offs

- [SQLite 队列并发能力有限] → MVP 限定单机演示和轻量使用；代码中保留执行器抽象，后续可替换为 Redis/BullMQ。
- [DSL 表达式存在安全风险] → 禁止 `eval` 和任意 JavaScript，仅允许受限表达式读取 payload 字段。
- [真实第三方 Webhook 验签差异大] → MVP 实现平台自有 HMAC；GitHub/Lark 等 provider 适配作为后续扩展。
- [Windows 环境 shell 差异] → npm scripts 使用跨平台 Node 脚本，避免依赖 bash、make 和 Unix-only 命令。
- [前端过度设计影响交付] → 采用简洁工程控制台，不做拖拽画布和营销页；重点打磨执行详情与演示链路。
- [课堂网络不稳定] → 演示默认使用本地模拟事件和 mock receiver；真实外部 Webhook 只作为可选加分项。

## Migration Plan

这是从零开始的新项目，无历史数据迁移。

实施顺序：

1. 初始化 TypeScript monorepo、基础 lint/test/build。
2. 建立 Prisma schema 和 SQLite 数据库。
3. 实现后端 endpoint/workflow/event/execution API。
4. 实现 DSL 校验和执行引擎。
5. 实现前端控制台和 mock receiver。
6. 补齐测试、中文注释、部署文档和验收脚本。

回滚策略：

- MVP 阶段没有线上用户；若某个模块失败，可回退到上一个可运行提交。
- Docker Compose 和本地启动均应使用 `.env.example`，避免环境配置不可恢复。

## Implementation Notes After Frontend Acceptance

- 默认 workflow 的 mock receiver URL 需要区分“浏览器访问地址”和“API 容器执行地址”。本地 pnpm 默认使用 `http://localhost:4001`，Docker Compose 前端构建时注入 `VITE_WORKFLOW_MOCK_BASE_URL=http://mock-receiver:4001`，保证从控制台保存默认 YAML 后 API 容器可以访问 mock receiver。
- API 服务启动时需要后台轮询到期 RetryJob；否则失败后重试只在手动调用 `/api/retry/process` 时推进，前端演示会长时间停留在 running。
- Endpoint 创建或重新生成 secret 后，控制台只展示最近一次返回的 secret，不从数据库读取明文，符合“一次性可见”的安全边界。

## Open Questions

- 是否需要把 endpoint secret 在 UI 中支持重新生成？建议 MVP 支持“重新生成”但需要确认弹窗。
- 是否需要 workflow 版本历史？建议 MVP 暂不做，只保留 updatedAt。
- 是否要支持 JSON DSL 的图形化表单编辑？建议 MVP 只做 YAML/JSON 文本编辑和校验。
