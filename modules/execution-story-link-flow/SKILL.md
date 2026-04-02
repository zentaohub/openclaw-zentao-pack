---
name: execution-story-link-flow
description: SOP 中用于给执行或迭代关联需求的模块。
---

# 执行关联需求模块

## 目的

用于 SOP Step 11 一类的执行关联需求场景，包括：

- 给执行批量关联需求
- 查询执行当前已关联的需求
- 校验关联结果是否生效

## 脚本

- `scripts/actions/link_execution_stories.ts`
- `scripts/queries/query_execution_stories.ts`

## 常用命令

- `npm run link-execution-stories -- --execution 4 --story-ids 2`
- `npm run link-execution-stories -- --execution 4 --story-ids 2,3`
- `npm run query-execution-stories -- --execution 4`

## 说明

- 通过 `execution-linkStory-{id}.html` 提交 `stories[]` 完成关联。
- 支持一次传多个需求 ID 进行批量关联。
- 可通过 `execution-story-{id}.json` 再次确认执行下的需求列表。
- 适合在迭代排期完成后补挂需求，或校验需求是否已正确进入执行。
