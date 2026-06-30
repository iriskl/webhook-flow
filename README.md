# Webhook Flow

事件驱动 Webhook 编排与轻量工作流平台 MVP。项目面向开发者和课程演示，提供 Webhook endpoint 管理、YAML/JSON workflow DSL、顺序执行引擎、HTTP 转发、失败重试、执行日志、演示控制台和本地 mock receiver。

## 技术栈

- 后端：TypeScript、Node.js、Fastify
- 前端：React、Vite、TypeScript
- 数据库：SQLite、Prisma
- DSL：YAML/JSON、Zod 校验、受限表达式
- 部署：本地 pnpm 启动、Docker Compose

## 本地运行

前置条件：

- macOS、Linux、Windows 均可运行
- Node.js 24 或较新 LTS 版本
- pnpm 6+，如未安装可执行 `corepack enable`

启动步骤：

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:push
pnpm build
pnpm dev
```

说明：项目保留 Prisma schema 和 migration SQL；`pnpm db:push` 会用本地 `sqlite3` 执行初始化 SQL，避免不同平台上 Prisma CLI apply 阶段的兼容性差异。

默认地址：

- 控制台：http://localhost:5173
- API：http://localhost:4000
- Mock Receiver：http://localhost:4001

## Docker Compose 运行

```bash
docker compose up --build
```

首次启动后数据库文件位于 `data/dev.db`。如需清空演示数据，可停止服务后删除该文件，再重新启动。

## DSL 示例

```yaml
name: event-router-demo
trigger:
  endpoint: github-demo
steps:
  - name: github-audit
    type: httpRequest
    when: "body.ref == 'refs/heads/main'"
    method: POST
    url: "http://localhost:4001/messages/audit"
    headers:
      x-demo-source: github
    body:
      text: "GitHub repo {{body.repository.name}} pushed by {{body.pusher.name}}"
  - name: payment-forward
    type: httpRequest
    when: "body.event == 'payment.succeeded'"
    method: POST
    url: "http://localhost:4001/messages/payment"
    headers:
      x-demo-source: payment
    body:
      text: "Payment success {{body.orderId}}"
```

表达式限制：只能读取 `body`、`headers`、`event`，禁止执行任意 JavaScript。支持 `==`、`!=`、`>`、`>=`、`<`、`<=`，以及 `&&`、`||` 组合。

## API 示例

创建 endpoint：

```bash
curl -X POST http://localhost:4000/api/endpoints \
  -H 'content-type: application/json' \
  -d '{"name":"GitHub Demo"}'
```

校验 workflow：

```bash
curl -X POST http://localhost:4000/api/workflows/validate \
  -H 'content-type: application/json' \
  -d '{"dslText":"name: demo\ntrigger:\n  endpoint: github-demo\nsteps:\n  - name: notify\n    type: httpRequest\n    method: POST\n    url: http://localhost:4001/messages\n"}'
```

## 端到端验收

在 API、Web、Mock Receiver 已启动后执行：

```bash
pnpm verify:e2e
```

Docker Compose 场景下 API 容器访问 mock receiver 需要使用容器服务名：

```bash
WORKFLOW_MOCK_BASE_URL=http://mock-receiver:4001 pnpm verify:e2e
```

控制台默认 YAML 也区分浏览器访问地址和 API 执行地址：本地运行默认转发到 `http://localhost:4001/messages/<target>`，Docker Compose 构建前端时会注入 `VITE_WORKFLOW_MOCK_BASE_URL=http://mock-receiver:4001`，因此课堂演示可直接保存默认 workflow 并发送样例事件。Mock Receiver 用 `/messages/audit`、`/messages/notify`、`/messages/monitor`、`/messages/payment` 模拟多个下游接收系统，并在控制台按目标路径分组展示。

验收脚本会自动：

1. 检查 API 和 Mock Receiver 健康状态。
2. 创建 endpoint。
3. 创建 workflow。
4. 发送 GitHub push 样例事件。
5. 等待 execution 成功。
6. 确认 mock receiver 收到转发消息。

## 课堂演示脚本

1. 打开控制台 `http://localhost:5173`，展示概览页统计和导航。
2. 进入 Endpoints，创建 `GitHub Demo` endpoint，复制接收地址，保留一次性 secret。
3. 进入 Workflows，选择 endpoint，使用默认 YAML，点击“校验”和“保存”。
4. 在样例事件发送区选择 `GitHub push`，点击“发送样例事件”。
5. 进入 Executions，打开最新执行详情，展示步骤时间线、状态、输入输出和错误原因。
6. 进入 Mock Receiver，展示按 `/messages/<target>` 分组的 HTTP 转发消息。
7. 可切换监控告警或支付成功样例，演示同一平台可处理不同事件源。

### 使用真实 git 提交演示

如果课堂要求体现 git/GitHub 的实际使用，可以先在控制台创建 endpoint 并保存 workflow，然后在任意 git 仓库中提交一次改动，再把最新提交转换成 GitHub push 格式事件发送到平台：

```bash
git add .
git commit -m "demo: trigger webhook flow"
pnpm demo:git-push <endpoint-slug> <endpoint-secret> .
```

脚本会读取当前分支、最新 commit、remote.origin.url、提交人信息，生成 GitHub push payload，并按 endpoint secret 签名发送到 `/hooks/:slug`。默认 workflow 中 GitHub 相关步骤匹配 `refs/heads/main`，如果当前分支不是 `main`，请切到 main 分支演示，或把 workflow 的 GitHub step.when 改成当前分支。

如果必须使用 GitHub 网页上的真实 Webhook 配置，需要先用 ngrok、Cloudflare Tunnel 或同类工具把本地 API 暴露为公网地址，再在 GitHub 仓库 Settings -> Webhooks 中配置 Payload URL 为 `<公网地址>/hooks/<slug>`，Secret 填 endpoint secret，Content type 选 `application/json`。

## 测试和质量检查

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm check:comments
```

测试覆盖 DSL 校验、HMAC 签名、endpoint 接收、执行引擎、失败重试、mock receiver 和前端关键页面。
