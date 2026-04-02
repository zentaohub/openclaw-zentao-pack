---
name: project-iteration-setup
description: 项目与迭代准备模块，用于在 SOP 中查看项目、执行和执行关联需求等基础信息。
---

# 项目与迭代准备模块

## 目的

用于 SOP 中项目与迭代准备阶段的只读检查，帮助确认项目、执行/迭代以及关联需求是否已经准备就绪。

## 脚本

- `scripts/queries/query_projects.ts`
- `scripts/queries/query_executions.ts`
- `scripts/queries/query_execution_stories.ts`

## 关注点

- 项目列表
- 执行/迭代列表
- 执行下已关联的需求

## 常用命令

- `npm run query-projects -- --program all --status all`
- `npm run query-executions`
- `npm run query-execution-stories -- --execution 4`

## 说明

- 适合在创建任务、测试单、发布计划前先核对项目结构。
- 当前模块只做查询与校验，不直接创建项目或调整排期。
