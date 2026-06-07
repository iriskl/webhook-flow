## ADDED Requirements

### Requirement: 事件列表查询
系统 SHALL 提供事件列表查询能力，展示事件 id、endpoint、接收时间、payload 摘要和关联 execution 数量。

#### Scenario: 查看事件列表
- **WHEN** 用户打开事件列表
- **THEN** 系统按接收时间倒序展示事件摘要

### Requirement: 事件详情查询
系统 SHALL 提供事件详情查询能力，展示原始 headers、payload、接收时间和关联 execution。

#### Scenario: 查看事件详情
- **WHEN** 用户打开某个事件详情
- **THEN** 系统展示格式化 JSON payload 和关联 execution 列表

### Requirement: execution 列表查询
系统 SHALL 提供 execution 列表查询能力，展示 workflow、事件、状态、开始时间、结束时间和错误摘要。

#### Scenario: 查看 execution 列表
- **WHEN** 用户打开 execution 列表
- **THEN** 系统按开始时间倒序展示执行记录

### Requirement: execution 详情查询
系统 SHALL 提供 execution 详情查询能力，展示状态、filter 结果、step log 时间线、每步输入输出和错误原因。

#### Scenario: 查看失败 execution
- **WHEN** 用户打开失败 execution 详情
- **THEN** 系统展示失败 step、错误信息、尝试次数和最后一次失败原因

### Requirement: 日志可用于定位问题
系统 MUST 保证每个 step log 至少包含 stepIndex、stepName、type、status、attempt、startedAt、finishedAt 和错误信息。

#### Scenario: HTTP step 超时
- **WHEN** HTTP 转发步骤超时失败
- **THEN** step log 记录 timeout 错误和对应 attempt

### Requirement: 敏感信息不进入日志
系统 MUST 避免将 endpoint secret 明文写入事件、execution 或 step log。

#### Scenario: 查看日志内容
- **WHEN** 用户查看事件详情和 execution 详情
- **THEN** 系统不展示 endpoint secret 明文
