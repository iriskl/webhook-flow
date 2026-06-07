# Webhook Flow 课堂演示说明

## 演示目标

用 5 到 8 分钟展示一个完整事件链路：创建 endpoint、保存 workflow、发送模拟事件、查看 execution log、确认 mock receiver 收到转发。

## 演示环境

- 控制台：http://localhost:5173
- API：http://localhost:4000
- Mock Receiver：http://localhost:4001

## 演示步骤

1. 打开控制台概览页，说明系统由 endpoint、workflow、execution 和 mock receiver 组成。
2. 创建 endpoint，强调 secret 只展示一次，系统不保存明文。
3. 保存默认 workflow，说明 YAML DSL 包含 trigger、filter、steps 和 retry。
4. 点击 DSL 校验，展示中文校验结果。
5. 选择 GitHub push 样例并发送。
6. 打开 execution 详情，说明 filter、step.when、HTTP 转发和重试日志。
7. 打开 Mock Receiver，展示实际收到的转发 body。
8. 如果需要展示失败路径，可临时把 workflow URL 改成不存在端口，再发送事件，查看失败和重试记录。

## 验收口径

- 能跨 macOS、Linux、Windows 使用 Node.js/pnpm 本地运行。
- 能用 Docker Compose 启动 API、Web、Mock Receiver。
- 能通过 `pnpm verify:e2e` 跑通完整链路。
- 控制台中文文案清楚，按钮、表格、编辑器和时间线不重叠。
