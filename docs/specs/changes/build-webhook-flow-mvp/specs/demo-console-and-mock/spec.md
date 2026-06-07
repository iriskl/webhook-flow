## ADDED Requirements

### Requirement: 控制台导航
系统 SHALL 提供中文演示控制台，包含 Overview、Endpoints、Workflows、Executions、Mock Receiver 主要页面。

#### Scenario: 打开控制台首页
- **WHEN** 用户访问前端控制台
- **THEN** 系统展示关键统计、最近事件、最近 execution 和清晰的左侧导航

### Requirement: endpoint 管理界面
系统 SHALL 在控制台提供 endpoint 创建、列表、详情、启停和接收地址复制能力。

#### Scenario: 创建 endpoint 后复制地址
- **WHEN** 用户在控制台创建 endpoint
- **THEN** 页面展示接收地址、一次性 secret 和复制按钮

#### Scenario: 查看 endpoint 演示信息
- **WHEN** 用户选择某个 endpoint
- **THEN** 页面展示 endpoint slug、接收地址、启停状态和最近一次可见 secret 提示

### Requirement: workflow 编辑界面
系统 SHALL 提供 YAML/JSON 编辑器、中文校验错误、保存按钮和测试按钮。

#### Scenario: YAML 校验失败
- **WHEN** 用户编辑 workflow 时提交非法 YAML
- **THEN** 页面展示中文错误信息且不保存 workflow

#### Scenario: 测试 workflow
- **WHEN** 用户点击测试按钮并选择样例 payload
- **THEN** 页面展示 filter 结果、步骤预览和可能的 HTTP 请求预览

### Requirement: 模拟事件发送
系统 SHALL 内置 GitHub push、监控告警、支付成功三类样例 payload，并允许用户一键发送到指定 endpoint。

#### Scenario: 发送 GitHub push 样例
- **WHEN** 用户选择 GitHub push 样例并点击发送
- **THEN** 系统向目标 endpoint 发送带正确签名的模拟 Webhook 请求

### Requirement: mock receiver 展示
系统 SHALL 提供 mock receiver 页面，实时或准实时展示收到的 HTTP 转发消息。

#### Scenario: mock receiver 收到转发
- **WHEN** workflow 的 HTTP step 转发到 mock receiver
- **THEN** mock receiver 页面在 1 秒内展示新消息的 headers、body 和接收时间

#### Scenario: Docker Compose 控制台演示
- **WHEN** 用户按 Docker Compose 启动后，在控制台使用默认 workflow 并发送 GitHub push 样例
- **THEN** execution 最终为 success，且 mock receiver 页面展示对应转发消息

### Requirement: execution 详情时间线
系统 SHALL 在控制台用时间线展示 execution 的每个步骤状态、耗时、尝试次数和错误信息。

#### Scenario: 查看重试 execution
- **WHEN** 用户打开发生过重试的 execution
- **THEN** 页面展示每次尝试和最终状态

#### Scenario: 查看 execution payload
- **WHEN** 用户打开任意 execution 详情
- **THEN** 页面展示原始事件 payload、步骤状态、尝试次数和错误原因

### Requirement: 工程控制台视觉风格
系统 MUST 使用简洁、可扫描、偏工程工具的视觉设计；页面不得使用营销 hero、装饰性大图或影响信息密度的浮夸布局。

#### Scenario: 桌面端展示
- **WHEN** 用户在桌面浏览器打开控制台
- **THEN** 页面以导航、表格、详情、编辑器和状态标签为核心，关键文本不重叠、不溢出

#### Scenario: 窄屏展示
- **WHEN** 用户在较窄窗口打开控制台
- **THEN** 页面布局自适应，按钮和表格内容不发生不可读重叠

### Requirement: 中文注释和中文说明
系统 MUST 在复杂执行逻辑、DSL 解析、重试调度和签名校验处保留简洁中文注释，并在 UI 中使用中文说明。

#### Scenario: 阅读关键模块代码
- **WHEN** 开发者查看 DSL 解析、执行引擎、重试调度或签名校验代码
- **THEN** 关键逻辑旁有简洁中文注释解释意图和边界

### Requirement: 部署验收入口
系统 SHALL 提供本地启动和 Docker Compose 启动说明，并提供一条可重复执行的端到端验收路径。

#### Scenario: Docker Compose 验收
- **WHEN** 用户按文档运行 Docker Compose
- **THEN** 控制台、API 和 mock receiver 均可访问，且样例事件能转发到 mock receiver
