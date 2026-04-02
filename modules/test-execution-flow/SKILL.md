---
name: test-execution-flow
description: 测试执行模块，用于把测试用例挂到测试单并提交执行结果。
---

# 测试执行模块

## 目的

用于 SOP Step 17 一类的测试执行场景，包括把用例关联到测试单、查看执行记录，以及提交执行结果。

## 脚本

- `scripts/actions/link_testtask_cases.ts`
- `scripts/queries/query_testtask_cases.ts`
- `scripts/actions/run_testtask_case.ts`

## 常用命令

- `npm run link-testtask-cases -- --testtask 1 --cases 1`
- `npm run query-testtask-cases -- --testtask 1`
- `npm run run-testtask-case -- --run 1 --result pass --real "case passed in validation"`

## 说明

- 关联路由：`testtask-linkCase-{taskId}-all-0-0-100-1.html`
- 执行路由：`testtask-runCase-{runId}-{caseId}-{version}.html`
- 结果路由：`testtask-results-{runId}-{caseId}-{version}-all-all-0.json`
- 当前能力仍有效，但主入口通常直接通过动作脚本和意图路由触发。
