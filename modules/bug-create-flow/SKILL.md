---
name: bug-create-flow
description: Bug 创建模块，用于在测试阶段提交缺陷，并把上下文关联到产品、执行、需求、用例和测试单。
---

# Bug 创建模块

## 目的

用于 SOP Step 17 一类的提 Bug 场景，通过创建禅道 Bug 把测试发现的问题沉淀到正式缺陷流程中。

## 脚本

- `scripts/actions/create_bug.ts`
- `scripts/queries/query_product_bugs.ts`
- `scripts/queries/query_bug_detail.ts`

## 常用命令

- `npm run create-bug -- --product 1 --execution 4 --story 2 --case 1 --run 1 --testtask 1 --title "Codex bug validate" --builds 1 --assigned-to admin --severity 3 --pri 3 --steps "Step: failed
Result: fail
Expect: pass"`
- `npm run query-product-bugs -- --product 1`
- `npm run query-bug-detail -- --bug 1`

## 说明

- Web 路由：`bug-create-{product}-{branch}-{extras}.html`
- 必填字段：`product`、`title`、`openedBuild[]`
- 推荐关联字段：`execution`、`story`、`case`、`run`、`testtask`
- 当前能力仍有效，并且可由主路由直接触发 `create-bug`。
