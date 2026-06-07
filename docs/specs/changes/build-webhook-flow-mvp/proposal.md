## Why

当前项目需要把选题报告中的“事件驱动 Webhook 编排与轻量工作流平台”落成一个可开发、可测试、可演示的 MVP。该 MVP 需要聚焦 Webhook 接收、规则配置、轻量执行、日志观测和课堂演示闭环，避免过早扩展成完整低代码平台或重量级工作流引擎。

## What Changes

- 新建 TypeScript 全栈 Webhook Flow MVP，后端使用 Node.js + Fastify，前端使用 React + Vite。
- 使用 SQLite + Prisma 持久化 endpoint、secret、workflow、event、execution、step log 和重试状态。
- 提供 Webhook endpoint 管理能力：创建 endpoint、生成 secret、接收事件、记录原始 payload。
- 提供 YAML/JSON 工作流 DSL：定义触发条件、顺序步骤、条件跳过、HTTP 转发和失败重试。
- 提供轻量执行引擎：按步骤顺序执行 workflow，记录每一步输入、输出、状态和错误。
- 提供事件与执行日志查询能力：控制台可查看 payload、执行状态、步骤日志和错误原因。
- 提供演示控制台：简洁、偏工程工具风格的 UI，支持 endpoint/workflow/execution 查看，YAML 编辑/校验/测试按钮，本地模拟事件发送。
- 提供 Mock 下游服务：用于课堂演示 HTTP 转发效果，并实时展示收到的消息。
- 提供跨 macOS、Linux、Windows 的本地运行和 Docker Compose 部署验收方案。

## Capabilities

### New Capabilities

- `webhook-endpoint-management`: 管理 Webhook endpoint、生成 secret、接收和持久化入站事件。
- `workflow-definition-dsl`: 用 YAML/JSON 定义 workflow、触发条件、步骤和重试策略，并进行结构校验。
- `workflow-execution-engine`: 执行 workflow 步骤，支持顺序执行、条件跳过、HTTP 转发和失败重试。
- `event-execution-log`: 查询事件、执行实例、步骤状态、payload、错误原因和重试记录。
- `demo-console-and-mock`: 提供演示控制台、本地模拟事件发送和 mock receiver 实时展示。

### Modified Capabilities

无。

## Impact

- 新增 TypeScript monorepo 工程结构，包括后端 API、前端控制台、mock receiver、共享类型和测试。
- 新增 Prisma schema、SQLite 迁移、数据访问层和测试夹具。
- 新增 HTTP API：endpoint 管理、workflow 管理、事件接收、execution 查询、模拟事件发送。
- 新增前端页面：概览、endpoint 列表/详情、workflow 编辑、execution 列表/详情、mock receiver 视图。
- 新增自动化测试：DSL 校验、endpoint 接收、执行引擎、失败重试、API 集成、关键 UI 行为。
- 新增部署文档和验收脚本，覆盖本地启动、Docker Compose 启动和跨平台注意事项。
