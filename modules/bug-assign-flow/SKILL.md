---
name: bug-assign-flow
description: Bug 指派模块，用于在研发修复阶段把待处理 Bug 明确指派给负责人。
---

# Bug 指派模块

## 目的

用于 SOP 修复阶段的 Bug 指派场景，帮助把活跃 Bug 明确分配给具体研发负责人继续处理。

## 脚本

- `scripts/actions/assign_bug.ts`
- `scripts/queries/query_bug_detail.ts`

## 常用命令

- `npm run assign-bug -- --bug 4 --assigned-to LengLeng --comment "repair owner set in validation"`
- `npm run query-bug-detail -- --bug 4`

## 说明

- 指派路由：`bug-assignTo-{id}.html`
- 核心字段：`assignedTo`
- 可选字段：`comment`、`mailto`
- 当前能力仍有效，但主入口更偏向通过意图路由直接调用 `assign-bug` 动作，而不是单独依赖模块名触发。
