---
name: release-linkage-flow
description: 发布关联模块，用于把需求和 Bug 关联到指定发布。
---

# 发布关联模块

## 目的

用于 SOP Step 21 中的发布关联场景，包括：

- 给发布挂接需求
- 给发布挂接 Bug
- 查询发布详情确认关联结果

## 脚本

- `scripts/actions/link_release_items.ts`
- `scripts/queries/query_release_detail.ts`

## 常用命令

- `npm run link-release-items -- --release 3 --story-ids 3`
- `npm run link-release-items -- --release 3 --bug-ids 1`
- `npm run link-release-items -- --release 3 --story-ids 2,3 --bug-ids 1`
- `npm run query-release-detail -- --release 3`

## 说明

- 关联需求时走 `release-linkStory-{id}.html` 并提交 `stories[]`。
- 关联 Bug 时走 `release-linkBug-{id}.html` 并提交 `bugs[]`。
- 支持一次传多个 ID 批量关联。
- 可通过 `release-view-{id}.json` 或详情查询结果确认最终关联状态。
