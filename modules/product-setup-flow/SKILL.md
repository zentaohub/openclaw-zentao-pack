---
name: product-setup-flow
description: 产品初始化模块，用于创建产品并初始化产品模块，同时严格校验模块约束。
---

# 产品初始化模块

## 目的

支持产品经理相关动作，包括：

- 创建产品
- 初始化产品模块
- 明确报告当前系统不支持写入的产品字段
- 在提交前严格校验产品模块约束

## 脚本

- `scripts/create_product.ts`
- `scripts/create_product_modules.ts`
- `scripts/create_product_with_modules.ts`

## 常用命令

- `npm run create-product -- --name SmartSupport --po admin --qd admin --rd admin`
- `npm run create-product-modules -- --product 3 --modules Workbench,TicketCenter,KnowledgeBase,Reports`
- `npm run create-product-with-modules -- --name SmartSupport --po admin --qd admin --rd admin --modules Workbench,TicketCenter,KnowledgeBase,Reports`

## 产品模块约束

- 同一次请求中的模块名必须唯一
- 如果目标产品下已经存在同名模块，提交前应拒绝并列出冲突模块名
- 必须先创建产品，再创建模块
- 模块负责人优先使用真实禅道账号；如无法匹配现有禅道用户，应要求用户手动提供工号或禅道账号
- 如果当前禅道创建表单不支持某个字段，例如 `code`，必须明确提示该字段未写入

## 说明

- 当前产品创建表单支持名称、类型、流程、负责人、描述和访问控制
- 当前产品创建表单不直接暴露可写的 `code` 字段
