---
name: testtask-status-flow
description: 测试单状态流转模块，用于管理测试单的开始、阻塞、激活和完成等生命周期动作。
---

# 测试单状态流转模块

## 状态

- `deprecated` / 待收敛
- 当前能力仍可用，但尚未明确接入当前企微主路由，建议后续收敛为统一测试单能力的一部分。
- 目标收敛模块：测试单状态能力后续统一并入 `testtask-create-flow`、`test-execution-flow`、`test-exit-readiness-flow` 所在的测试单主链路。
- 后续原则：不要再在 `testtask-status-flow` 新增功能；测试单生命周期扩展优先放到统一测试单主链路设计中。

## 目的

用于测试阶段的测试单生命周期管理，包括开始、阻塞、激活、完成等动作。

## 脚本

- `scripts/actions/update_testtask_status.ts`
- `scripts/queries/query_testtask_detail.ts`

## 常用命令

- `npm run update-testtask-status -- --testtask 1 --status blocked --comment "blocked in validation"`
- `npm run update-testtask-status -- --testtask 1 --status activate --comment "resume validation"`
- `npm run update-testtask-status -- --testtask 1 --status done --real-finished-date "2026-03-23 00:00:00" --comment "done in validation"`
- `npm run query-testtask-detail -- --testtask 1`

## 说明

- 开始路由：`testtask-start-{id}.html`
- 阻塞路由：`testtask-block-{id}.html`
- 激活路由：`testtask-activate-{id}.html`
- 关闭路由：`testtask-close-{id}.html`
- 当前建议保留能力，但后续应与测试执行、测试准出相关模块统一治理。
