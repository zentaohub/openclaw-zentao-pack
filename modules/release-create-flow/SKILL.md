---
name: release-create-flow
description: 发布创建模块，用于查看已有发布并通过已验证流程创建新的发布记录。
---

# 发布创建模块

## 目的

用于 SOP Step 21 一类的发布创建场景，包括：

- 查询已有发布
- 查看单个发布详情
- 创建新的发布

## 脚本

- `scripts/actions/create_release.ts`
- `scripts/queries/query_releases.ts`
- `scripts/queries/query_release_detail.ts`

## 常用命令

- `npm run query-releases -- --product 1 --type all`
- `npm run query-release-detail -- --release 1`
- `npm run create-release -- --product 1 --name "v1.0.0" --date 2026-03-23 --desc "首个正式版本"`

## 说明

- 创建发布时走已验证的禅道 Web 表单流程。
- 发布对象通常包含 `name`、`status`、`date`、`desc` 等关键字段。
- 如果后续还要关联需求或 Bug，通常需要配合发布关联模块继续处理。
