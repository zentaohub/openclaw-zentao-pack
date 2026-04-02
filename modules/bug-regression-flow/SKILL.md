---
name: bug-regression-flow
description: 回归验证 Bug 模块，用于查询待回归验证的已解决 Bug，并据结果关闭或重新激活。
---

# Bug 回归验证模块

## 状态

- `deprecated` / 待收敛
- 当前能力仍可用，但更建议把查询与状态流转收敛到 `testing-bugflow` + `bug-status-flow` 组合中维护。
- 目标收敛模块：查询归并到 `testing-bugflow`，关闭/激活等状态流转归并到 `bug-status-flow`。
- 后续原则：不要再在 `bug-regression-flow` 新增功能；回归视角的查询与状态更新统一复用上述两个主模块。

## 目的

用于 SOP Step 19 一类的回归验证场景，筛出已解决、待测试验证的 Bug，并根据回归结果执行关闭或重新激活。

## 脚本

- `scripts/queries/query_regression_bugs.ts`
- `scripts/actions/update_bug_status.ts`
- `scripts/queries/query_bug_detail.ts`

## 常用命令

- `npm run query-regression-bugs -- --product 1 --execution 4`
- `npm run update-bug-status -- --bug-id 4 --status close --comment regression_passed`
- `npm run update-bug-status -- --bug-id 5 --status activate --comment regression_failed`

## 说明

- 查询路由：`bug-browse-{product}-resolved-0-id_desc-0-100-1.json`
- 支持可选过滤：`execution`、`assignedTo`
- 回归结果后的关闭或激活，底层仍复用现有 `bug-status-flow` 能力。
- 当前未直接暴露为企微主路由模块，因此建议后续收敛而不是继续扩展。
