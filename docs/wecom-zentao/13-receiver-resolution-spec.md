# 接收人解析规则说明（MVP 第一版）

## 1. 目标

这份文档用于说明：

- 通知规则命中后，系统如何从禅道对象和变更上下文中计算接收人
- 各角色从哪里取值
- 取不到值时如何兜底
- 如何去重、过滤操作人

适用范围：

- 需求（Story / Requirement）
- Bug
- 任务（Task）

## 当前执行原则（MVP）

第一版不追求“所有相关人都知道”，而是优先保证：

1. **谁会因为这次事件产生下一步动作，就发给谁**
2. **默认只发主接收人（primary_receivers）**
3. `cc_receivers` 先作为策略保留，不作为当前 MVP 实际发送对象

示例：

- 需求变更：优先通知受影响研发、测试
- Bug 已修复：优先通知验证人
- Bug 重开/激活：优先通知当前处理人
- Bug 转派：优先通知新负责人

## 当前代码中的“影响人”判定（已落地）

### 需求 Story

- 研发影响人：
  - `story.assignedTo`
  - 兜底 `story.openedBy`
- 测试影响人：
  - `story.reviewedBy`
  - `story.reviewer`
  - 兜底 `story.closedBy`

### Bug

- 研发影响人：
  - `newAssignee`（如果本次有转派）
  - `bug.assignedTo`
  - 如果关联需求，再补 `story.assignedTo`
- 测试影响人：
  - `bug.resolvedBy`
  - `bug.closedBy`
  - 如果关联需求，再补 `story.reviewedBy` / `story.reviewer`
  - 最后兜底 `bug.openedBy`

### Task

- 研发影响人：
  - `task.assignedTo`
  - 如果关联需求，再补 `story.assignedTo`
  - 最后兜底 `story.openedBy`
- 测试影响人：
  - `task.finishedBy`
  - `task.closedBy`
  - 如果关联需求，再补 `story.reviewedBy` / `story.reviewer`

### 关联需求补充规则

如果 Bug / Task 带有 `story` 字段，当前实现会额外查询对应 `story-view-{id}.json`，用于补齐：

- 对应研发负责人
- 对应测试/评审人

这样可以更接近“需求变更通知对应研发测试、Bug 流转通知下一步处理人”的真实目标。

## 状态 -> 下一步处理人映射（当前实现）

### Story

- `planned / projected / active`
  - 下一步研发：`story.assignedTo`
  - 下一步测试：`story.reviewedBy / story.reviewer`
- `done / verified / close / closed`
  - 下一步测试：`story.reviewedBy / story.reviewer / story.closedBy`
- `rejected / suspended`
  - 下一步研发：`story.assignedTo`
  - 下一步测试：`story.reviewedBy / story.reviewer`

### Bug

- `resolve / resolved / close / closed`
  - 下一步测试：
    - `bug.resolvedBy / bug.closedBy`
    - 若有关联需求，再补 `story.reviewedBy / story.reviewer`
    - 最后兜底 `bug.openedBy`
- `activate / activated / reopened`
  - 下一步研发：
    - `newAssignee`
    - `bug.assignedTo`
    - 若有关联需求，再补 `story.assignedTo`
- `assignee_changed`
  - 下一步研发：`newAssignee`

### Task

- `doing / blocked / paused / delayed / closed / canceled`
  - 下一步研发：
    - `task.assignedTo`
    - 若有关联需求，再补 `story.assignedTo`
    - 最后兜底 `story.openedBy`
- `done`
  - 下一步测试：
    - `task.finishedBy / task.closedBy`
    - 若有关联需求，再补 `story.reviewedBy / story.reviewer`

这套规则的核心不是“谁和这个对象有关”，而是：

**这个状态变化后，下一步应该轮到谁处理，就优先通知谁。**

---

## 2. 接收人分层

所有接收人统一分为两层：

### 2.1 主接收人（direct）
表示这次通知需要该角色尽快处理或确认。

### 2.2 抄送对象（cc）
表示该角色需要知道，但不一定需要立即动作。

同一用户同时命中 direct 和 cc 时，以 direct 为准。

---

## 3. 输入数据建议

通知引擎在解析接收人前，建议准备统一上下文：

```yaml
context:
  object_type: story | bug | task
  event_type: created | status_changed | assignee_changed | field_changed | priority_changed | relation_changed
  operator:
    userid: zhangsan
    name: 张三
  change:
    old_status: doing
    new_status: done
    old_assignee: lisi
    new_assignee: wangwu
    changed_fields: [priority, deadline]
  entity:
    ... 当前对象详情
  related:
    story: ...
    project: ...
    execution: ...
```

---

## 4. 角色解析规则

## 4.1 pm

### 含义
当前对象对应的产品经理。

### 推荐来源顺序
1. 对象自身明确字段：`pm` / `productManager` / `ownerPM`
2. 关联需求上的 PM
3. 模块负责人映射表
4. 产品线默认 PM 映射表

### 兜底策略
- 如果仍为空，则不发送给 pm
- 记录日志：`receiver.pm.not_found`

---

## 4.2 product_owner

### 含义
产品线 owner 或产品负责人。

### 推荐来源顺序
1. 产品配置中的 owner
2. 模块 owner
3. 默认产品负责人映射表

---

## 4.3 requester

### 含义
需求提出人 / Bug 提出人。

### 推荐来源顺序
1. 需求字段：`requester` / `openedByBusiness`
2. Bug 字段：`openedBy`
3. 若业务上“提出人=创建人”，则回退到 `creator`

---

## 4.4 creator

### 含义
对象创建人。

### 推荐来源顺序
1. `openedBy`
2. `createdBy`
3. `createdUser`

---

## 4.5 current_assignee

### 含义
当前负责人 / 当前处理人。

### 推荐来源顺序
1. `assignedTo`
2. `assigned_to`
3. `owner`
4. `currentOwner`

### 注意
- 如果值为 `closed`、`null`、空字符串，视为无效
- 无效时不加入接收人

---

## 4.6 new_assignee / old_assignee

### 含义
变更前后的负责人。

### 来源
- 优先从变更上下文 `change.old_assignee` / `change.new_assignee`
- 如果没有变更快照，则：
  - `new_assignee` 从当前对象取
  - `old_assignee` 需要依赖事件前快照，不建议猜测

---

## 4.7 tester

### 含义
当前测试/验证人。

### 推荐来源顺序
1. 对象字段：`tester` / `verifiedBy` / `assignedToTest`
2. 执行/测试单负责人
3. 项目默认测试负责人

### 适用对象
- Story：验收/验证时
- Bug：修复后验证、关闭、重开
- Task：完成待验收时

---

## 4.8 project_owner

### 含义
项目负责人、执行负责人、版本负责人。

### 推荐来源顺序
1. 项目字段：`projectManager` / `projectOwner`
2. 执行字段：`executionOwner`
3. 发布负责人
4. 项目默认 owner 映射表

---

## 4.9 dev_owner

### 含义
开发负责人。

### 推荐来源顺序
1. 模块开发 owner
2. 项目开发负责人
3. 默认开发 owner 映射表

---

## 4.10 collaborators

### 含义
协作人、参与人、会签人。

### 推荐来源顺序
1. 对象字段：`collaborators`
2. 自定义字段：`mailto` / `ccUsers`
3. 扩展配置的协作人集合

### 规则
- 默认只进抄送
- 不作为主接收人，除非规则明确要求

---

## 4.11 watchers

### 含义
关注人 / 订阅人。

### 推荐来源顺序
1. 对象字段：`watchers`
2. 系统通知订阅配置

### 规则
- 默认只进抄送
- MVP 第一版可不启用

---

## 4.12 related_story_owner

### 含义
Bug 或任务关联需求的负责人。

### 推荐来源顺序
1. 读取关联 Story 详情中的 `assignedTo`
2. 若无负责人，则取关联 Story 的 `pm`

---

## 5. 用户 ID 统一规则

## 5.1 推荐规则
通知系统内部统一使用 **企微 userid** 作为最终发送标识。

## 5.2 与禅道账号映射建议
当前项目里建议默认采用：

```text
禅道 account = 企业微信 userid
```

如果后续出现不一致场景，再单独增加映射表。

## 5.3 取值清洗
所有用户标识都要执行以下处理：

1. `trim()`
2. 过滤空字符串
3. 过滤无效值：`closed`、`null`、`undefined`、`0`
4. 转成统一小写（如果你们企微 userid 规则允许）

---

## 6. 去重规则

## 6.1 基本规则
同一个用户命中多个角色时，只保留一次。

## 6.2 优先级规则

```text
direct > cc > none
```

示例：
- 张三既是 `creator`，又是 `current_assignee`
- `creator` 在 cc，`current_assignee` 在 direct
- 最终保留为 direct

---

## 7. 操作人过滤规则

## 7.1 默认规则
MVP 第一版默认：

```text
exclude_operator = true
```

即：如果某个接收人正好是操作人本人，则默认不再通知给自己。

## 7.2 例外情况
以下情况可以保留给自己：

1. 用户明确要求“给我自己也发一份”
2. 需要在企微里形成操作留痕
3. 群通知场景而非个人通知场景

---

## 8. 空接收人兜底策略

## 8.1 主接收人为空
如果规则命中后，primary_receivers 为空：

### 建议处理
1. 先尝试回退到 `project_owner`
2. 若仍为空，则回退到 `creator`
3. 若还为空，则本次通知不发送，并记录错误日志

### 日志建议
```text
receiver.primary.empty
```

## 8.2 抄送人为空
允许为空，不影响发送。

---

## 9. 推荐解析顺序

建议开发按这个顺序实现：

### 第一步：收集基础上下文
- 当前对象详情
- 变更前后字段
- 关联对象详情（需求、项目、执行、测试单）

### 第二步：按角色逐个解析用户
- 解析 primary_receivers 中声明的角色
- 解析 cc_receivers 中声明的角色

### 第三步：清洗用户集合
- 过滤空值
- 过滤无效值
- 展开数组字段

### 第四步：去重和升级
- 同一用户若同时出现在 direct 和 cc，则升级为 direct

### 第五步：过滤操作人
- 如果开启 `exclude_operator=true`，从结果中剔除操作人

### 第六步：兜底
- 若主接收人为空，尝试按规则回退

---

## 10. 角色解析示例

## 10.1 Bug 已修复

规则：
- primary: `tester`, `current_assignee`
- cc: `pm`, `project_owner`

解析后可能得到：

```yaml
primary_receivers:
  - qa_zhangsan
  - dev_lisi
cc_receivers:
  - pm_wangwu
  - leader_zhaoliu
```

---

## 10.2 任务阻塞影响需求

规则：
- primary: `current_assignee`, `project_owner`, `pm`
- cc: `creator`, `collaborators`

解析后可能得到：

```yaml
primary_receivers:
  - dev_wangwu
  - project_lisi
  - pm_zhangsan
cc_receivers:
  - task_creator_a
  - helper_b
  - helper_c
```

---

## 11. 第一版强制建议

为了避免一开始就过于复杂，建议第一版严格遵守：

1. 只解析文档中定义的固定角色
2. 不做多级组织架构递归查找
3. 不做复杂审批链推断
4. 无法解析就按兜底策略处理，不阻塞主流程
5. 解析失败必须记日志，方便后续补齐映射

---

## 12. 建议后续扩展

后续如果第一版稳定，可以再加：

1. 用户偏好配置（仅接收 direct / 接收 cc）
2. 工作时间策略
3. 免打扰策略
4. 按产品线/项目线覆盖默认接收规则
5. 多接收通道（企微个人 + 群通知）
