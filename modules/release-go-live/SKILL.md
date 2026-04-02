---
name: release-go-live
description: 上线前检查模块，用于在 SOP 上线阶段查看发布、产品概览和交付范围。
---

# 上线前检查模块

## 目的

用于 SOP 上线前阶段的只读检查，帮助在真正上线前统一核对发布信息、产品概览和交付范围是否一致。

## 脚本

- `scripts/queries/query_releases.ts`
- `scripts/queries/query_product_overview.ts`
- `scripts/queries/query_delivery_overview.ts`

## 关注点

- 产品发布列表
- 产品概览
- 交付范围概览

## 常用命令

- `npm run query-releases -- --product 2 --type all`
- `npm run query-product-overview -- --product 2`
- `npm run query-delivery-overview`

## 说明

- 适合在正式上线前做一次总览检查。
- 当前模块用于发现缺口和风险，不直接触发上线动作。
