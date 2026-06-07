## ADDED Requirements

### Requirement: YAML/JSON workflow 定义
系统 SHALL 支持用户使用 YAML 或 JSON 定义 workflow，包括名称、触发 endpoint、可选 filter、steps 和 retry 配置。

#### Scenario: 保存合法 YAML workflow
- **WHEN** 用户提交结构合法的 YAML workflow
- **THEN** 系统保存 workflow 并将其绑定到指定 endpoint

#### Scenario: 保存合法 JSON workflow
- **WHEN** 用户提交结构合法的 JSON workflow
- **THEN** 系统保存 workflow 并记录 DSL 格式

### Requirement: DSL 结构校验
系统 MUST 在保存或测试 workflow 前校验 DSL 结构，校验内容包括必填字段、字段类型、枚举值、URL 格式和 retry 范围。

#### Scenario: 缺少 steps
- **WHEN** 用户提交缺少 steps 的 workflow
- **THEN** 系统拒绝保存并返回中文错误信息

#### Scenario: step 类型不支持
- **WHEN** 用户提交未知 step type
- **THEN** 系统拒绝保存并指出不支持的 step type

### Requirement: 受限表达式
系统 MUST 支持 filter 和 step.when 表达式读取 `body`、`headers`、`event` 字段，并禁止执行任意 JavaScript。

#### Scenario: filter 表达式命中
- **WHEN** 事件 payload 满足 workflow filter 表达式
- **THEN** 系统允许 workflow 进入执行阶段

#### Scenario: 表达式包含禁用语法
- **WHEN** 用户提交需要执行任意代码的表达式
- **THEN** 系统拒绝保存并返回安全校验错误

### Requirement: HTTP request step 定义
系统 SHALL 支持 `httpRequest` step，允许配置 method、url、headers、body 和 retry 策略。

#### Scenario: 定义 HTTP 转发步骤
- **WHEN** 用户在 steps 中配置合法 `httpRequest`
- **THEN** 系统保存该步骤并在执行时按配置发送 HTTP 请求

### Requirement: workflow 测试校验
系统 SHALL 允许用户用样例 payload 测试 workflow，返回 filter 结果、步骤计划和校验错误，但不写入正式事件记录。

#### Scenario: 测试 workflow 成功
- **WHEN** 用户提交 workflow 和样例 payload 进行测试
- **THEN** 系统返回将会执行的步骤列表和渲染后的 HTTP 请求预览
