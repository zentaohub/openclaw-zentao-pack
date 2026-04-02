---
name: release-status-flow
description: 发布状态流转模块，用于更新发布状态并保留禅道系统要求的内部状态值。
---

# 发布状态流转模块

## 目的

用于 SOP Step 21-22 一类的发布状态维护场景，包括：

- 更新发布状态
- 在状态切换时保留系统内部要求的 `system` 值

## 脚本

- `scripts/actions/update_release_status.ts`

## 支持状态

- `wait`
- `normal`
- `fail`
- `terminate`

## 常用命令

- `npm run update-release-status -- --release 2 --status terminate`
- `npm run update-release-status -- --release 2 --status normal --system 2 --desc "release recovered"`

## 说明

- 当前通过 `release-edit` 表单流程提交，`system` 字段必须处理正确。
- 如果没有显式传 `--system`，通常需要先读取当前发布的现有 `system` 值。
- 某些状态回切场景，例如 `terminate -> normal`，更要注意系统字段保持一致。
