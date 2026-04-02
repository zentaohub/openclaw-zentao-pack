---
name: user-sync
description: 用户同步模块。用于把企业微信用户信息同步到禅道，支持单用户、部门批量和全组织同步。
---

# 用户同步模块

## 目标

把企业微信用户与禅道用户对齐，作为 `openclaw-zentao-pack` 的可复用模块存在。

## 当前入口

- `scripts/sync_user.ts`

## 支持模式

- 单用户 payload 同步
- `--from-wecom` 单用户同步
- `--department` 部门批量同步
- `--all-org` 全组织同步
- `--list-departments` 部门树查看
- `--validate-only` 安全验证模式

## 复用约定

后续新增模块也应同时提供：

- 模块级 `SKILL.md`
- 模块级 agent 定义
- 模块级测试清单
