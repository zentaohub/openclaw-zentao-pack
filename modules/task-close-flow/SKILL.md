---
name: task-close-flow
description: 任务收口模块，用于在生命周期收尾阶段完成并关闭遗留任务。
---

# 任务收口模块

## 状态

- `deprecated` / 待收敛
- 当前能力仍可用，但语义和实现已大幅被 `task-status-flow` 覆盖，建议后续合并维护。
- 目标收敛模块：`task-status-flow`
- 后续原则：不要再在 `task-close-flow` 新增功能；任务完成、关闭、激活、暂停等状态能力统一只向 `task-status-flow` 扩展。

## 目的

用于 SOP Step 24 一类的任务收尾场景，在最终结项前把仍未完成的任务推进到完成或关闭状态。

## 脚本

- `scripts/actions/update_task_status.ts`
- `scripts/queries/query_task_detail.ts`
- `scripts/queries/query_closure_items.ts`

## 常用命令

- `npm run update-task-status -- --task-id 3 --status done --consumed-hours 4 --comment task_finish_for_closure`
- `npm run update-task-status -- --task-id 3 --status closed --comment task_close_for_closure`
- `npm run query-task-detail -- --task 3`
- `npm run query-closure-items -- --product 1 --execution 4`

## 说明

- 完成路由：`task-finish-{id}.html`
- 关闭路由：`task-close-{id}.html`
- `done` 需要 `--consumed-hours`
- `closed` 更适合在最终生命周期清理时执行
- 当前建议优先走 `task-status-flow`，此模块后续更适合并入统一任务状态能力。
