## ADDED Requirements

### Requirement: 创建 Webhook endpoint
系统 SHALL 允许用户创建 Webhook endpoint，并在创建成功时生成唯一 slug 和一次性可见的 secret。

#### Scenario: 创建 endpoint 成功
- **WHEN** 用户提交合法 endpoint 名称
- **THEN** 系统返回 endpoint id、slug、接收地址和一次性可见 secret

#### Scenario: endpoint 名称非法
- **WHEN** 用户提交空名称或超长名称
- **THEN** 系统拒绝创建并返回中文校验错误

### Requirement: endpoint secret 安全存储
系统 MUST 不以明文形式持久化 endpoint secret，只能保存 secret 哈希；secret 明文仅在创建或重新生成时返回一次。

#### Scenario: 查看 endpoint 详情
- **WHEN** 用户打开 endpoint 详情
- **THEN** 系统展示 endpoint 元信息但不展示 secret 明文

### Requirement: 接收 Webhook 事件
系统 SHALL 通过 `POST /hooks/:slug` 接收入站 Webhook 请求，并持久化请求头、payload、接收时间和 endpoint 关联关系。

#### Scenario: 接收合法事件
- **WHEN** 外部系统向有效 endpoint slug 发送签名正确的 JSON payload
- **THEN** 系统保存事件并返回接收成功响应

#### Scenario: endpoint 不存在
- **WHEN** 外部系统向不存在的 endpoint slug 发送请求
- **THEN** 系统返回 404 并且不创建事件记录

### Requirement: HMAC 签名校验
系统 MUST 使用 endpoint secret 对原始请求体进行 HMAC SHA-256 校验，并拒绝缺失或错误的签名。

#### Scenario: 签名缺失
- **WHEN** 请求未携带 `X-Webhook-Flow-Signature`
- **THEN** 系统返回 401 并记录拒绝原因

#### Scenario: 签名错误
- **WHEN** 请求携带的签名与原始请求体不匹配
- **THEN** 系统返回 401 并且不创建事件记录

### Requirement: endpoint 启停控制
系统 SHALL 允许用户启用或停用 endpoint；停用 endpoint 不再接受新事件。

#### Scenario: 停用 endpoint 后收到事件
- **WHEN** 已停用 endpoint 收到签名正确的请求
- **THEN** 系统返回 403 并且不创建事件记录
