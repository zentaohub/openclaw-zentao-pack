---
name: story-closure-flow
description: 需求关闭模块，用于关闭或重新激活需求。
---

# 需求关闭模块

## 目的

用于 SOP Step 24 一类的需求收口场景，包括：

- 关闭需求
- 重新激活需求

## 脚本

- `scripts/actions/update_story_status.ts`

## 支持状态

- `close`
- `activate`

## 常用命令

- `npm run update-story-status -- --story 3 --status close --closed-reason done --comment "accepted and closed"`
- `npm run update-story-status -- --story 3 --status activate --assigned-to admin --comment "reopen story"`

## 说明

- `close` 时通常必须提供 `--closed-reason`。
- 常见关闭原因包括 `done`、`duplicate`、`postponed`、`willnotdo`、`cancel`、`bydesign`。
- `activate` 时通常需要重新指定处理人或恢复后续流转字段。
