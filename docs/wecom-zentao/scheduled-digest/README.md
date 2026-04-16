# 定时汇总推送设计

本目录用于集中存放“禅道 -> 企业微信自建应用 -> 角色化定时摘要推送”方案文档。

适用范围：

- 工作日固定时段推送：09:00、18:00
- 推送角色：产品、研发、测试、管理
- 推送目标：消息短、重点清楚、风险优先、详情跳转查看

推荐阅读顺序：

1. `01-product-prd.md`
2. `02-risk-rules.md`
3. `03-technical-design.md`
4. `04-message-templates.md`
5. `05-mvp-rollout-plan.md`
6. `06-delivery-matrix.md`
7. `07-config-schema.md`
8. `08-implementation-breakdown.md`
9. `09-example-config.md`
10. `10-acceptance-checklist.md`
11. `11-runtime-scheduling.md`
12. `scheduled-digest.example.json`

各文档说明：

- `01-product-prd.md`
  - 产品目标、边界、核心原则、角色视图与消息策略

- `02-risk-rules.md`
  - 延期、阻塞、高优 Bug、测试准出、关闭准备度等风险判定规则

- `03-technical-design.md`
  - 调度、接收人解析、数据汇总、消息渲染、发送审计、配置设计

- `04-message-templates.md`
  - 各角色早报/晚报模板与重大风险即时提醒模板

- `05-mvp-rollout-plan.md`
  - MVP 范围、上线分期、验收标准、后续扩展建议

- `06-delivery-matrix.md`
  - 角色、时间槽、风险类型和即时提醒的发送决策矩阵

- `07-config-schema.md`
  - 配置字段字典、默认值、校验规则与维护建议

- `08-implementation-breakdown.md`
  - 可直接用于开发排期的任务拆解、里程碑和测试建议

- `09-example-config.md`
  - 示例配置如何填写、如何灰度、常见配置错误

- `10-acceptance-checklist.md`
  - 灰度上线前、试点期与放量前的验收清单

- `11-runtime-scheduling.md`
  - cron 落地、环境变量、日志路径与运维上线步骤

- `scheduled-digest.example.json`
  - 可直接复制修改的示例配置文件

本方案默认原则：

- 不把明细堆进企微消息
- 一条消息只说清“现状、重点、入口”
- 默认把风险收敛进早晚摘要
- 仅重大风险允许额外即时提醒
