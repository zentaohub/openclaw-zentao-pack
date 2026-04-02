---
name: task-status-flow
description: 任务状态流转模块，通过禅道 Web 表单更新任务状态并填写必要工时字段。
---

# 任务状态流转模块

## 目的

用于 SOP 中任务推进与收口相关的状态更新，当前通过 ZenTao Web 表单而不是简化 REST 路由完成。

## 脚本

- `scripts/actions/update_task_status.ts`

## 支持状态

- `doing`：开始处理
- `done`：完成任务
- `activate`：重新激活已完成或已暂停任务
- `pause`：暂停任务
- `closed`：关闭任务

## 常用命令

- `npm run update-task-status -- --task-id 1 --status doing --consumed-hours 1 --left-hours 7 --comment "start task"`
- `npm run update-task-status -- --task-id 1 --status done --consumed-hours 1 --comment "finish task"`
- `npm run update-task-status -- --task-id 1 --status activate --left-hours 1 --comment "reactivate task"`

## 说明

- `done` 场景通常要求填写 `--consumed-hours`。
- 当前实现优先走 Web 表单流程，而不是 REST `/api.php/v1/tasks/*`。
- `pause` 和 `closed` 等状态通常也要根据页面要求补齐相应字段。
