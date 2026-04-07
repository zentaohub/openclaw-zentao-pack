# 企微对话式禅道助手文档索引

本目录当前按“核心文档 / 历史归档”两层维护。

如果你是第一次查看，建议优先阅读：

1. `07-current-runtime-flow.md`
2. `04-architecture.md`
3. `05-master-solution.md`
4. `09-wecom-ui-prototype-mvp.html`
5. `10-cross-role-swimlane.html`
6. `11-notification-rules-mvp.yaml`
7. `13-receiver-resolution-spec.md`
8. `12-notification-templates-mvp.yaml`

## 当前保留的核心文档

- `07-current-runtime-flow.md`
  - 当前服务器真实生效链路
  - 适合联调、排错、给组员讲当前实现

- `04-architecture.md`
  - 架构分层、身份映射、授权、审计与异常处理
  - 适合后端、架构评审

- `05-master-solution.md`
  - 面向方案评审的总说明
  - 适合统一看业务目标与完整方案

- `09-wecom-ui-prototype-mvp.html`
  - 当前保留的主 UI 原型页
  - 适合演示和评审交互效果

- `10-cross-role-swimlane.html`
  - 跨角色协作泳道图 HTML 版
  - 适合开会展示、截图、投屏

- `10-cross-role-swimlane.md`
  - 跨角色协作泳道图 Markdown 版
  - 适合留档和评审纪要

- `11-notification-rules-mvp.yaml`
  - 需求 / Bug / 任务的通知规则配置
  - 适合后端实现规则引擎与事件通知

- `12-notification-templates-mvp.yaml`
  - 企微通知消息模板
  - 适合消息文案、占位符和模板管理

- `13-receiver-resolution-spec.md`
  - 接收人解析规则说明
  - 适合开发确认“该通知发给谁”的取值逻辑

- `../overview/通知链路记录.md`
  - 通知执行结果总览
  - 适合联调、排错、给团队看真实通知结果

## 历史归档文档

以下文档已移入 `archive/`，原因不是“错误”，而是它们更偏前期方案拆分稿、产品稿或设计草案，不再作为当前默认阅读入口：

- `archive/00-project-brief.md`
- `archive/01-product-plan.md`
- `archive/02-workflow-design.md`
- `archive/03-conversation-ui.md`
- `archive/06-next-step-task-breakdown.md`
- `archive/07-product-prd.md`
- `archive/08-ui-design-draft.md`

适用场景：

- 需要回看早期方案演进
- 需要追溯产品拆解思路
- 需要参考最初的 UI / PRD 草案

## 当前使用建议

- 看运行事实：优先 `07-current-runtime-flow.md`
- 看架构与方案：优先 `04-architecture.md`、`05-master-solution.md`
- 看通知方案：优先 `11-notification-rules-mvp.yaml`、`13-receiver-resolution-spec.md`、`12-notification-templates-mvp.yaml`
- 看通知执行结果：优先 `../overview/通知链路记录.md`
- 看展示材料：优先 `09-wecom-ui-prototype-mvp.html`、`10-cross-role-swimlane.html`
- 查历史草案：再进入 `archive/`

## 通知链路快速手册

- 查规则：`11-notification-rules-mvp.yaml`
- 查模板：`12-notification-templates-mvp.yaml`
- 查接收人：`13-receiver-resolution-spec.md`
- 查总览结果：`../overview/通知链路记录.md`
- 查命令行日志：`npm run query-notification-audit -- --latest 20`
