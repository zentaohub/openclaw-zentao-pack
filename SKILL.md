# OpenClaw Zentao Workflow Skill

适用于 OpenClaw 主会话与企业微信机器人场景的禅道工作流技能包。

## 当前能力

- 查询：产品、模块、项目、执行、任务、测试单、测试准出、发布、上线检查、验收概览、关闭准备度
- 创建：产品、模块、需求、任务、测试用例、测试单、Bug、发布
- 流转：任务、需求、Bug、发布、测试单状态流转
- 企业微信：任务消息回调、通讯录同步、用户匹配与同步

## 推荐查询方式

- 执行查询优先使用 `project` 上下文
  - 例：`query-executions --project 3`
- 测试单查询支持三种入口
  - `query-testtasks --product 1`
  - `query-testtasks --execution 4`
  - `query-testtasks --project 3`
- 测试准出查询支持三种入口
  - `query-test-exit-readiness --testtask 1`
  - `query-test-exit-readiness --execution 4`
  - `query-test-exit-readiness --project 3`
- 上线检查支持两种入口
  - `query-go-live-checklist --product 1 --execution 4`
  - `query-go-live-checklist --testtask 1`
- 验收概览支持三种入口
  - `query-acceptance-overview --product 1 --execution 4`
  - `query-acceptance-overview --testtask 1`
  - `query-acceptance-overview --execution 4`
- 关闭准备度支持三种入口
  - `query-closure-readiness --product 1 --execution 4`
  - `query-closure-readiness --testtask 1`
  - `query-closure-readiness --execution 4`
- 关闭阻塞项支持三种入口
  - `query-closure-items --product 1 --execution 4`
  - `query-closure-items --testtask 1`
  - `query-closure-items --execution 4`

## 创建类说明

- `create-release` 当前会在创建成功后直接返回创建出的 `release` 对象。

## 说明

- 默认优先使用最贴近业务上下文的参数。
- 当使用 `execution` 或 `project` 入口时，脚本会自动补齐测试单或产品上下文。
- 当同一执行下存在多个测试单时，建议显式传 `testtask` 以避免歧义。

## 默认输出规则

- `【角色】`
- `【意图】`
- `【结果】`
- `【正文】`
- `【后续动作】`

除非用户明确要求其他格式，否则保持以上固定结构。
