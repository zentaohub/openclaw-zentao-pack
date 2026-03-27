# 角色与模块权限映射表

本文档用于把技能包中的角色、模块、脚本能力和建议权限边界对应起来，作为后续真正落地 RBAC 与 action 权限控制的业务映射基础。

## 1. 使用目标

这份映射表主要回答四个问题：

1. 每种角色适合使用哪些模块
2. 每种角色不应使用哪些模块
3. 哪些模块是只读查询类，哪些是写操作类
4. 后续如何从模块进一步收敛到 action 权限点

## 2. 推荐角色清单

建议技能包内部统一使用以下角色：

- viewer：只读查看者
- pm：产品经理 / 需求负责人
- dev：研发
- qa：测试
- release_manager：发布负责人
- project_manager：项目负责人
- admin：管理员

## 3. 角色与模块映射总表

### 3.1 viewer

建议可用模块：

- business-setup
- project-iteration-setup
- task-execution
- release-go-live
- acceptance-closure
- lifecycle-closure-flow

建议限制模块：

- product-setup-flow
- story-review-flow
- task-create-flow
- task-status-flow
- testcase-create-flow
- test-execution-flow
- testtask-create-flow
- testtask-status-flow
- bug-create-flow
- bug-assign-flow
- bug-status-flow
- release-create-flow
- release-linkage-flow
- release-status-flow
- user-sync

说明：

- 该角色适合只读查看，不建议拥有任何创建、更新、状态流转和同步能力。

### 3.2 pm

建议可用模块：

- business-setup
- product-setup-flow
- project-iteration-setup
- execution-story-link-flow
- story-review-flow
- story-closure-flow
- release-create-flow
- release-linkage-flow
- release-go-live
- acceptance-closure
- lifecycle-closure-flow

建议限制模块：

- test-execution-flow
- testtask-status-flow
- bug-assign-flow
- user-sync

说明：

- 产品经理适合负责产品、模块、需求、发布规划与收口类能力。
- 一般不建议直接承担测试执行、用户同步和研发修复动作。

### 3.3 dev

建议可用模块：

- business-setup
- project-iteration-setup
- task-create-flow
- task-execution
- task-status-flow
- task-close-flow
- bug-assign-flow
- bug-status-flow
- bug-regression-flow
- lifecycle-closure-flow

建议限制模块：

- product-setup-flow
- release-create-flow
- release-status-flow
- testtask-create-flow
- user-sync

说明：

- 研发主要围绕任务、Bug、执行推进展开。
- 一般不应直接负责组织同步和发布管理。

### 3.4 qa

建议可用模块：

- business-setup
- project-iteration-setup
- testcase-create-flow
- testtask-create-flow
- testtask-status-flow
- test-execution-flow
- test-exit-readiness-flow
- testing-bugflow
- bug-create-flow
- bug-regression-flow
- release-go-live
- acceptance-closure

建议限制模块：

- product-setup-flow
- release-create-flow
- release-status-flow
- user-sync

说明：

- 测试负责测试用例、测试单、测试执行、缺陷提交与回归验证。
- 通常不应拥有发布主导和组织同步权限。

### 3.5 release_manager

建议可用模块：

- business-setup
- release-create-flow
- release-linkage-flow
- release-status-flow
- release-go-live
- acceptance-closure
- lifecycle-closure-flow

建议限制模块：

- product-setup-flow
- testcase-create-flow
- user-sync

说明：

- 发布负责人聚焦发布、上线、验收、交付视角。
- 不建议直接拥有用户同步和大部分研发动作权限。

### 3.6 project_manager

建议可用模块：

- business-setup
- project-iteration-setup
- execution-story-link-flow
- task-execution
- release-go-live
- acceptance-closure
- lifecycle-closure-flow
- story-review-flow

建议限制模块：

- user-sync
- testcase-create-flow
- testtask-create-flow

说明：

- 项目负责人更偏协调、查看、推进和收口，不一定直接执行细粒度测试动作。

### 3.7 admin

建议可用模块：

- 全部模块

说明：

- 管理员拥有全量能力，但仍建议对高风险动作加审计与确认。

## 4. 模块风险分级

为了后续做权限治理，建议把模块分级。

### 4.1 L1 只读查询模块

- business-setup
- project-iteration-setup
- task-execution
- release-go-live
- acceptance-closure
- lifecycle-closure-flow
- test-exit-readiness-flow

特点：

- 主要以查询为主
- 可优先开放给 viewer、pm、project_manager、release_manager

### 4.2 L2 常规业务操作模块

- execution-story-link-flow
- story-review-flow
- story-closure-flow
- task-create-flow
- task-status-flow
- task-close-flow
- testcase-create-flow
- testtask-create-flow
- testtask-status-flow
- test-execution-flow
- bug-create-flow
- bug-assign-flow
- bug-status-flow
- bug-regression-flow
- release-create-flow
- release-linkage-flow
- release-status-flow

特点：

- 包含创建、关联、状态流转等动作
- 应按角色最小权限原则开放

### 4.3 L3 高风险模块

- user-sync
- release-status-flow
- lifecycle-closure-flow
- acceptance-closure

特点：

- 可能影响组织账号、发布结果、生命周期收口结论
- 建议增加审计日志和高风险操作控制

## 5. 从角色到 action 的建议方向

### 5.1 pm

建议 action：

- product.read
- product.create
- product.module.create
- story.read
- story.create
- story.review
- story.close
- release.read
- release.create
- release.link

### 5.2 dev

建议 action：

- task.read
- task.create
- task.update
- task.close
- bug.read
- bug.assign
- bug.resolve

### 5.3 qa

建议 action：

- testcase.read
- testcase.create
- testtask.read
- testtask.create
- testtask.update
- testtask.run
- bug.read
- bug.create
- bug.close

### 5.4 release_manager

建议 action：

- release.read
- release.create
- release.update
- release.link
- delivery.read
- acceptance.read

### 5.5 admin

建议 action：

- 所有 action

## 6. 推荐的最小落地顺序

建议按下面顺序实施：

1. 先按本文档把角色与模块关系确定下来
2. 再把模块拆成 action 集合
3. 再把 action 映射到脚本入口
4. 最后在代码里加统一 authorize

## 7. 文档结论

角色与模块的映射，是你这套禅道技能包权限治理的业务边界层。

它的价值在于：

- 先把谁能用哪些模块讲清楚
- 再把模块进一步拆成 action
- 最后把 action 真正落实到脚本与代码鉴权

这样整个技能包的权限体系才会稳定、可维护、可扩展。
