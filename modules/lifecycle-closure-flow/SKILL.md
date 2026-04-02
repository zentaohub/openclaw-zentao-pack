---
name: lifecycle-closure-flow
description: 生命周期收口模块，用于查看仍阻塞最终关闭的需求、任务、Bug 和发布对象。
---

# 生命周期收口模块

## 状态

- `deprecated` / 待收敛
- 当前能力仍可查询，但与 `acceptance-closure` 存在明显语义重叠，建议后续统一收敛为一个收口视图。
- 目标收敛模块：`acceptance-closure`
- 后续原则：不要再在 `lifecycle-closure-flow` 新增功能；验收概览、关闭准备度、阻塞项等收口视图统一放入 `acceptance-closure`。

## 目的

用于 SOP Step 24 一类的生命周期收尾场景，集中查看还有哪些对象阻塞最终关闭。

## 脚本

- `scripts/queries/query_closure_items.ts`
- `scripts/queries/query_closure_readiness.ts`
- 以及需求、Bug、任务、发布相关的已有关闭或状态更新命令

## 常用命令

- `npm run query-closure-items -- --product 1 --execution 4`
- `npm run query-closure-readiness -- --product 1 --execution 4`

## 说明

- 未完成任务：状态不是 `done`、`closed`、`cancel`
- 未关闭需求：状态不是 `closed`
- 未解决缺陷：状态不是 `resolved`、`closed`
- 发布记录通常在状态为 `normal` 时视为完成
- 当前更适合作为内部分析与治理模块，不建议继续单独扩展新入口。
