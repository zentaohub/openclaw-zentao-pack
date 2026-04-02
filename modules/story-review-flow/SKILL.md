---
name: story-review-flow
description: 需求创建与评审模块，用于创建需求、查看需求并执行评审。
---

# 需求创建与评审模块

## 目的

用于 SOP Step 6-7 一类的需求管理场景，包括：

- 创建需求
- 查看产品需求列表
- 查看我的需求
- 查询需求详情
- 执行需求评审

## 脚本

- `scripts/actions/create_story.ts`
- `scripts/actions/review_story.ts`
- `scripts/queries/query_product_stories.ts`
- `scripts/queries/query_my_stories.ts`
- `scripts/queries/query_story_detail.ts`

## 评审结果

- `pass`
- `clarify`
- `reject`

## 常用命令

- `npm run create-story -- --product 1 --title "新增智能助手入口" --spec "描述需求规格" --verify "描述验收标准" --reviewer admin --assigned-to admin --pri 3 --estimate 8`
- `npm run query-product-stories -- --product 1`
- `npm run query-my-stories`
- `npm run query-story-detail -- --story 2`
- `npm run review-story -- --story 2 --result pass --assigned-to admin --pri 3 --estimate 8 --comment "review passed"`

## 说明

- 当前评审与创建都走已验证的禅道 Web 流程。
- 评审前建议先确认需求处于 `reviewing` 等可评审状态。
- `reject` 场景通常还需要结合 `--closed-reason` 等字段说明原因。
