---
name: business-setup
description: 业务基础信息准备模块，用于在 SOP 前置阶段检查项目集、产品和产品模块等基础数据。
---

# 业务基础信息准备模块

## 目的

用于 SOP 前置阶段的只读检查，帮助确认后续产品、项目、测试等流程依赖的业务基础信息是否已经准备完整。

## 脚本

- `scripts/queries/query_programs.ts`
- `scripts/queries/query_products.ts`
- `scripts/queries/query_product_modules.ts`

## 关注点

- 项目集列表
- 产品列表
- 产品模块结构

## 常用命令

- `npm run query-programs`
- `npm run query-products`
- `npm run query-product-modules -- --product 2`

## 说明

- 适合在创建项目、创建需求、测试准备前先核对业务基础数据。
- 当前通过 Web JSON 路由读取数据，不直接修改业务对象。
