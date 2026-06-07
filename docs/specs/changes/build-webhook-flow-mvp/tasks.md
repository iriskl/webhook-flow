## 1. 工程初始化

- [x] 1.1 初始化 pnpm workspace，建立 `apps/api`、`apps/web`、`apps/mock-receiver`、`packages/shared`、`prisma` 目录结构
- [x] 1.2 配置根目录 `package.json`、`pnpm-workspace.yaml`、TypeScript、ESLint、Prettier 和基础 npm scripts
- [x] 1.3 为 API、Web、Mock Receiver 分别配置开发、构建、测试脚本，确保命令在 macOS、Linux、Windows 可运行
- [x] 1.4 建立 `.env.example`，说明 API 端口、Web 端口、Mock Receiver 端口、SQLite 路径和基础配置
- [x] 1.5 添加 README 初稿，包含项目定位、技术栈、本地启动和 Docker Compose 启动方式

## 2. 数据模型与持久化

- [x] 2.1 编写 Prisma schema，覆盖 Endpoint、Workflow、Event、Execution、StepLog、RetryJob、MockMessage
- [x] 2.2 配置 SQLite 数据源和 Prisma migration，生成本地开发数据库
- [x] 2.3 实现 Prisma client 封装，提供统一的数据库访问入口
- [x] 2.4 为数据库模型添加测试 fixture，覆盖 endpoint、workflow、event 和 execution 示例数据
- [x] 2.5 编写数据层单元测试，验证基础创建、查询、状态更新和关联查询

## 3. 后端基础 API

- [x] 3.1 初始化 Fastify 应用，配置 JSON body、错误处理、请求日志和健康检查接口
- [x] 3.2 实现统一错误响应格式，错误信息面向控制台展示时使用中文描述
- [x] 3.3 实现 endpoint 创建接口，生成 slug 和一次性 secret，并仅保存 secret 哈希
- [x] 3.4 实现 endpoint 列表、详情、启用、停用和重新生成 secret 接口
- [x] 3.5 实现 workflow 创建、更新、列表、详情、启用和停用接口
- [x] 3.6 实现 event 列表、详情接口和 execution 列表、详情接口
- [x] 3.7 为 endpoint 和 workflow API 编写集成测试

## 4. Webhook 接收与签名校验

- [x] 4.1 实现 `POST /hooks/:slug`，按 slug 查找 endpoint 并处理不存在或停用状态
- [x] 4.2 实现基于原始请求体的 HMAC SHA-256 签名校验
- [x] 4.3 在签名校验、secret 哈希、原始 body 处理处添加简洁中文注释，解释安全边界
- [x] 4.4 将合法入站事件保存为 Event，记录 headers、payload、sourceIp 和 receivedAt
- [x] 4.5 为签名正确、签名缺失、签名错误、endpoint 不存在、endpoint 停用编写测试

## 5. Workflow DSL

- [x] 5.1 在 `packages/shared` 定义 workflow DSL TypeScript 类型和 Zod schema
- [x] 5.2 实现 YAML/JSON 解析，返回结构化 DSL 或中文校验错误
- [x] 5.3 实现受限表达式求值器，只允许读取 `body`、`headers`、`event` 字段
- [x] 5.4 实现模板渲染能力，用于 HTTP step 的 headers 和 body 生成
- [x] 5.5 实现 `POST /api/workflows/validate`，用于前端实时校验 DSL
- [x] 5.6 实现 `POST /api/workflows/:id/test`，返回 filter 结果、步骤计划和 HTTP 请求预览
- [x] 5.7 在 DSL 解析、表达式求值和模板渲染关键逻辑添加中文注释
- [x] 5.8 编写 DSL 单元测试，覆盖合法 YAML、合法 JSON、缺字段、非法枚举、非法表达式和 retry 边界

## 6. 执行引擎与重试

- [x] 6.1 实现事件接收后匹配启用 workflow，并创建 Execution
- [x] 6.2 实现 workflow filter，不命中时将 execution 标记为 skipped 并记录原因
- [x] 6.3 实现顺序 step 执行框架，按 DSL 顺序创建 StepLog
- [x] 6.4 实现 step.when 条件跳过，并继续后续步骤
- [x] 6.5 实现 `httpRequest` step，支持 method、url、headers、body、timeout 和响应摘要记录
- [x] 6.6 实现 RetryJob 表驱动重试调度，支持 maxAttempts 和 backoffSeconds
- [x] 6.7 实现 worker 循环处理到期 RetryJob，并更新 StepLog 和 Execution 状态
- [x] 6.8 在执行状态机、重试调度和失败归因处添加中文注释
- [x] 6.9 编写执行引擎测试，覆盖顺序成功、filter 跳过、step.when 跳过、HTTP 成功、重试后成功、最终失败

## 7. Mock Receiver 与演示事件

- [x] 7.1 实现 mock receiver 服务，提供接收 HTTP 消息、保存 MockMessage、查询列表和清空消息接口
- [x] 7.2 实现 GitHub push、监控告警、支付成功三类样例 payload fixture
- [x] 7.3 实现 `POST /api/demo/send-sample`，按 endpoint secret 自动签名并发送样例事件
- [x] 7.4 编写 mock receiver 和样例发送集成测试，验证样例事件能进入执行链路

## 8. 前端控制台

- [x] 8.1 初始化 React + Vite + TypeScript 前端应用，配置路由、API client 和基础状态管理
- [x] 8.2 设计工程控制台视觉系统：左侧导航、紧凑表格、状态标签、详情抽屉、代码编辑器区域和中文文案
- [x] 8.3 实现 Overview 页面，展示 endpoint、workflow、event、execution 统计和最近记录
- [x] 8.4 实现 Endpoints 页面，支持创建、查看详情、复制接收地址、启停、重新生成 secret
- [x] 8.5 实现 Workflows 页面，支持 YAML/JSON 编辑、保存、校验错误展示和测试按钮
- [x] 8.6 实现 Executions 页面，支持列表、状态筛选、详情时间线、step log、payload 和错误原因查看
- [x] 8.7 实现 Mock Receiver 页面，准实时展示收到的消息并支持清空
- [x] 8.8 实现样例事件发送入口，支持选择 GitHub push、监控告警、支付成功并发送到指定 endpoint
- [x] 8.9 使用图标按钮、tooltip、稳定尺寸和响应式约束，确保桌面和窄屏不重叠、不溢出
- [x] 8.10 编写前端关键行为测试，覆盖 workflow 校验、发送样例事件、查看 execution 详情和 mock receiver 展示

## 9. 端到端演示与部署

- [x] 9.1 编写 Dockerfile 和 Docker Compose，启动 API、Web、Mock Receiver，并挂载 SQLite 数据目录
- [x] 9.2 编写本地开发启动说明，覆盖 macOS、Linux、Windows 的 Node.js/pnpm 前置条件
- [x] 9.3 编写部署验收脚本或文档步骤，跑通创建 endpoint、创建 workflow、发送样例事件、mock receiver 收到消息
- [x] 9.4 使用 Playwright 或等价工具验证控制台关键页面可访问、无明显布局重叠、核心按钮可点击
- [x] 9.5 记录课堂演示脚本：控制台浏览、创建 endpoint、编辑 workflow、发送样例事件、查看 execution log、查看 mock receiver

## 10. 质量收尾

- [x] 10.1 运行后端单元测试和集成测试，修复失败用例
- [x] 10.2 运行前端测试，修复关键交互和渲染问题
- [x] 10.3 运行 lint、typecheck、build，确保所有 workspace 包通过
- [x] 10.4 检查复杂逻辑中文注释覆盖，重点包括签名校验、DSL 解析、表达式求值、执行状态机和重试调度
- [x] 10.5 完成 README、API 示例、DSL 示例和演示验收说明
- [x] 10.6 使用本地启动和 Docker Compose 各执行一次完整验收链路

## 11. 前端用户视角验收修正

- [x] 11.1 修正默认 workflow mock receiver URL，使 Docker Compose 下从控制台保存默认 YAML 后也能由 API 容器转发到 mock receiver
- [x] 11.2 在 API 服务启动时运行 RetryJob 后台轮询，避免失败重试 execution 长时间停留 running
- [x] 11.3 在 Endpoint 页面展示创建/重置后的一次性 secret、slug、接收地址和启停状态
- [x] 11.4 在 Execution 详情展示原始 payload，并为 Execution 列表提供状态筛选
- [x] 11.5 将 Mock Receiver 控制台刷新间隔调整到 1 秒内，满足准实时演示
- [x] 11.6 补充测试覆盖并重新通过 build/test/typecheck/lint/comment 检查
- [x] 11.7 使用浏览器从前端重新验收创建 endpoint、保存 workflow、发送样例、查看 execution 和 mock receiver
