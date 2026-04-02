---
name: testcase-create-flow
description: 测试用例创建模块，用于编写测试用例并校验产品下的用例列表。
---

# 测试用例创建模块

## 目的

用于 SOP Step 15 一类的测试用例创建场景，包括：

- 创建测试用例
- 查询产品下的测试用例列表
- 校验新增用例是否已成功落库

## 脚本

- `scripts/actions/create_testcase.ts`
- `scripts/queries/query_testcases.ts`

## 常用命令

- `npm run create-testcase -- --product 1 --story 2 --title "登录校验用例" --steps "打开登录页||输入账号密码||点击登录" --expects "展示首页||登录成功||无报错"`
- `npm run query-testcases -- --product 1`

## 说明

- 当前使用 `testcase-create-{product}-{branch}-{module}-{from}-{param}-{story}.html` 表单创建。
- 核心字段通常包括 `product`、`type`、`title`、`steps[]`。
- 命令中的多步骤内容使用 `||` 作为分隔符。
- `expects[]` 需要与步骤数量保持对应关系。
