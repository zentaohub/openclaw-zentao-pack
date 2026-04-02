---
name: testtask-create-flow
description: SOP Step 16 创建禅道测试单，用于把研发交付内容移交给 QA。
---

# 测试单创建模块

## 目的

用于 SOP Step 16 的“提测”场景，通过创建禅道测试单并在测试单列表中校验结果，完成向 QA 的移交。

## 命令

- `scripts/actions/create_testtask.ts`
- `scripts/queries/query_testtasks.ts`

## 常用命令

- `npm run create-testtask -- --product 1 --execution 4 --build 1 --name "Codex testtask validate" --begin 2026-03-23 --end 2026-03-23 --owner admin`
- `npm run query-testtasks -- --product 1 --execution 4`

## 说明

- 实际路由为 `testtask-create-{product}-{execution}-{build}-{project}.html`。
- 必填字段包括 `product`、`build`、`name`、`begin`、`end`。
- 常用补充字段包括 `execution`、`owner`、`pri`、`desc`。
- 命令支持通过 `--builds 1,2` 传多个构建，也支持部分多值字段用 `||` 分隔。
