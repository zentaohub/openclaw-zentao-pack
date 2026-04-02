---
name: team-setup-flow
description: 团队配置模块，用于查询项目或执行团队，并通过成员管理流程补充成员。
---

# 团队配置模块

## 目的

用于 SOP Step 9 一类的团队准备场景，包括：

- 查询项目团队
- 查询执行团队
- 给项目或执行补充成员

## 脚本

- `scripts/queries/query_project_team.ts`
- `scripts/queries/query_execution_team.ts`
- `scripts/actions/add_team_member.ts`

## 常用命令

- `npm run query-project-team -- --project 3`
- `npm run query-execution-team -- --execution 4`
- `npm run add-team-member -- --scope project --root 3 --account LengLeng --days 15 --hours 7`
- `npm run add-team-member -- --scope execution --root 4 --account LengLeng --days 10 --hours 7`

## 说明

- 添加成员时会保留原有成员，并在当前名单基础上补充新的成员配置。
- `scope=project` 走 `project-manageMembers-{id}.html`。
- `scope=execution` 走 `execution-manageMembers-{id}.html`。
