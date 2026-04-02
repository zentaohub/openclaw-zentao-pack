---
name: testing-bugflow
description: 测试阶段缺陷跟踪模块，用于查看测试用例、产品 Bug 和我的 Bug。
---

# 测试阶段缺陷跟踪模块

## 目的

用于 SOP 测试阶段的只读检查，帮助统一查看当前测试资产和缺陷情况，包括产品用例、产品 Bug 以及个人待处理 Bug。

## 脚本

- `scripts/queries/query_testcases.ts`
- `scripts/queries/query_product_bugs.ts`
- `scripts/queries/query_my_bugs.ts`

## 关注点

- 产品测试用例列表
- 产品 Bug 列表
- 我的待处理 Bug 列表

## 常用命令

- `npm run query-testcases -- --product 2`
- `npm run query-product-bugs -- --product 2 --browse all`
- `npm run query-my-bugs`

## 说明

- 适合在测试执行期间统一核对用例覆盖和 Bug 积压情况。
- Bug 详情查询、状态更新通常需要配合其他缺陷模块继续处理。
