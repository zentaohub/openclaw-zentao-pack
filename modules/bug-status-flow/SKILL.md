---
name: bug-status-flow
description: SOP 中用于解决、关闭和激活 Bug 的状态流转模块，走已验证的禅道 Web 表单流程。
---

# Bug 状态流转模块

## 目的

用于 SOP Step 18-19 一类的 Bug 状态流转场景，包括：

- 解决 Bug 并填写解决方案
- 关闭已验证完成的 Bug
- 激活回归失败或重新出现的问题 Bug

## 脚本

- `scripts/actions/update_bug_status.ts`

## 支持状态

- `resolve`：解决 Bug，需要时补充 `--resolution`
- `close`：关闭 Bug
- `activate`：重新激活 Bug

## 常用命令

- `npm run update-bug-status -- --bug-id 1 --status resolve --resolution fixed --resolved-build trunk --assigned-to admin --comment "resolve bug"`
- `npm run update-bug-status -- --bug-id 1 --status close --comment "qa verified"`
- `npm run update-bug-status -- --bug-id 1 --status activate --opened-build trunk --assigned-to admin --comment "reopen after regression"`

## 说明

- 当前实现通过禅道 Web 表单完成状态更新，不依赖 REST 简化接口。
- `resolve` 通常需要显式填写 `resolution`。
- `activate` 通常需要带上 `openedBuild[]` 等重新激活所需字段。
