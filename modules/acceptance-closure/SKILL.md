---
name: acceptance-closure
description: 验收收口检查模块，用于在 SOP 收尾阶段汇总验收概览、上线检查和关闭准备度。
---

# 验收收口模块

## 目的

用于 SOP 收尾阶段的只读检查，帮助在验收或结项前统一查看关键收口信息，避免遗漏未完成事项或遗留 Bug 风险。

## 脚本

- `scripts/queries/query_acceptance_overview.ts`
- `scripts/queries/query_go_live_checklist.ts`
- `scripts/queries/query_closure_readiness.ts`

## 关注点

- 验收概览
- 上线检查清单
- 关闭准备度状态

## 常用命令

- `npm run query-acceptance-overview -- --product 2 --execution 4`
- `npm run query-go-live-checklist -- --product 2 --execution 4`
- `npm run query-closure-readiness -- --product 2 --execution 4`

## 说明

- 适合在上线验收、项目收口、发布复盘前统一查看是否仍有未处理事项或未关闭 Bug。
- 这是只读检查模块，不直接执行关闭动作。
