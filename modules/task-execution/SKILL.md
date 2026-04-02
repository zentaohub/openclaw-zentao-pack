---
name: task-execution
description: 任务执行查询模块，用于在 SOP 执行阶段查看执行任务、我的任务和任务详情。
---

# 任务执行查询模块

## 目的

用于 SOP 执行阶段的只读查询，帮助确认当前任务分布、个人待办以及单个任务的详细状态，便于后续推进或更新任务。

## 脚本

- `scripts/queries/query_execution_tasks.ts`
- `scripts/queries/get_my_tasks.ts`
- `scripts/queries/query_task_detail.ts`

## 关注点

- 执行下的任务列表
- 我的任务列表
- 单个任务详情

## 常用命令

- `npm run query-execution-tasks -- --execution 4`
- `npm run query-my-tasks -- --status all --limit 5`
- `npm run query-task-detail -- --task 1`

## 说明

- 适合在更新任务状态前先做一次信息核对。
- 当前模块只负责查询和汇总，不直接修改任务状态。
