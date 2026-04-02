---
name: test-exit-readiness-flow
description: 测试准出评估模块，用于汇总测试单状态、用例执行结果和相关 Bug，形成准出判断。
---

# 测试准出评估模块

## 目的

用于 SOP Step 20 一类的测试准出判断场景，综合测试单生命周期、用例执行结果和缺陷状态，给出 go/no-go 准出结论。

## 脚本

- `scripts/queries/query_test_exit_readiness.ts`

## 常用命令

- `npm run query-test-exit-readiness -- --testtask 1`
- `npm run query-test-exit-readiness -- --testtask 2`

## 说明

- 会联合使用 `testtask-view`、`testtask-cases` 以及产品 `bug-browse` 数据
- 当前阻塞准出的常见条件包括：测试单未完成、存在未执行/失败/阻塞用例、仍有未关闭的相关 Bug
- 当前能力有效，且已经可以通过主路由直接触发
