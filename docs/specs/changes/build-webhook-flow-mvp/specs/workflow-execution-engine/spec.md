## ADDED Requirements

### Requirement: 创建 execution
系统 SHALL 在合法事件被接收后，为匹配 endpoint 的每个启用 workflow 创建 execution。

#### Scenario: 事件匹配一个 workflow
- **WHEN** endpoint 收到合法事件且存在一个启用 workflow
- **THEN** 系统创建一个 execution 并进入执行流程

#### Scenario: endpoint 无启用 workflow
- **WHEN** endpoint 收到合法事件但没有启用 workflow
- **THEN** 系统保存事件但不创建 execution

### Requirement: 顺序执行步骤
系统 MUST 按 workflow steps 的声明顺序执行步骤，前一步成功或跳过后才进入下一步。

#### Scenario: 多步骤顺序成功
- **WHEN** workflow 包含多个可执行步骤且每一步成功
- **THEN** execution 状态最终为 success，step log 顺序与 DSL 一致

### Requirement: 条件跳过
系统 SHALL 在 step.when 表达式为 false 时跳过该步骤，并继续执行后续步骤。

#### Scenario: step 条件不满足
- **WHEN** step.when 对当前事件计算结果为 false
- **THEN** 系统将该步骤标记为 skipped 并继续下一步骤

### Requirement: HTTP 转发执行
系统 SHALL 根据 `httpRequest` step 配置发送 HTTP 请求，并记录响应状态码、响应体摘要和错误信息。

#### Scenario: HTTP 转发成功
- **WHEN** mock receiver 返回 2xx 响应
- **THEN** 系统将该步骤标记为 success 并记录响应摘要

#### Scenario: HTTP 转发失败
- **WHEN** 下游服务返回 5xx 或请求超时
- **THEN** 系统将该次尝试标记为 failed 并进入重试判断

### Requirement: 失败重试
系统 MUST 按 step.retry 配置进行失败重试，达到最大次数后将步骤和 execution 标记为 failed。

#### Scenario: 重试后成功
- **WHEN** HTTP step 第一次失败且第二次成功
- **THEN** 系统记录两次尝试并将 execution 最终标记为 success

#### Scenario: 达到最大重试次数
- **WHEN** HTTP step 连续失败直到达到 maxAttempts
- **THEN** 系统将该步骤和 execution 标记为 failed 并记录最终错误原因

### Requirement: 执行状态机
系统 MUST 使用明确状态表示 execution 生命周期，至少包含 pending、running、success、failed、skipped。

#### Scenario: filter 不命中
- **WHEN** workflow filter 对事件计算结果为 false
- **THEN** 系统将 execution 标记为 skipped 并记录跳过原因
