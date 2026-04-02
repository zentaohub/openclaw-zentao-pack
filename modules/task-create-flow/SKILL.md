---
name: task-create-flow
description: 任务创建模块，用于在执行或迭代下新建任务并核对任务详情。
---

# 任务创建模块

## 目的

用于 SOP Step 12 一类的任务创建场景，包括：

- 在执行下创建任务
- 查询执行任务列表确认是否创建成功
- 查看任务详情

## 脚本

- `scripts/actions/create_task.ts`
- `scripts/queries/query_execution_tasks.ts`
- `scripts/queries/query_task_detail.ts`

## 常用命令

- `npm run create-task -- --execution 4 --story 2 --name "智能助手-开发任务2" --assigned-to admin --pri 3 --estimate 4`
- `npm run query-execution-tasks -- --execution 4`
- `npm run query-task-detail -- --task 2`

## 说明

- 创建任务使用 `task-create-{execution}-{story}-{module}-{parent}-{todo}-{bug}.html` 表单。
- 关键字段通常包括 `execution`、`type`、`name`。
- 常见补充字段包括 `story`、`assignedTo`、`pri`、`estimate`。
- 创建后建议再通过 `task-view-{id}.html` 或详情查询确认任务 ID 和状态。
