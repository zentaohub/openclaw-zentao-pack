# 消息模板

## 1. 模板设计原则

- 一屏内读完
- 先数字，后重点
- 最多 3 条重点
- 详情通过入口查看

## 2. 研发早报

```text
早报｜研发
待办 {task_count}｜超期 {task_overdue_count}｜Bug {bug_count}｜阻塞 {blocked_count}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看我的任务 / 查看我的Bug
```

示例：

```text
早报｜研发
待办 8｜超期 2｜Bug 3｜阻塞 1

1. 任务#231 接口联调，超期 2 天
2. Bug#542 登录失败，P1，未关闭
3. 任务#245 报表导出，当前 blocked

查看我的任务 / 查看我的Bug
```

## 3. 研发晚报

```text
晚报｜研发
今日完成 {done_today}｜今日解决 Bug {bug_fixed_today}｜未收口超期 {overdue_open_count}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看我的任务 / 查看我的Bug
```

## 4. 产品早报

```text
早报｜产品
需求 {story_count}｜高优 {high_story_count}｜延期 {story_overdue_count}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看我的需求
```

示例：

```text
早报｜产品
需求 12｜高优 3｜延期 1

1. 需求#1023 已延期 4 天
2. 需求#1088 今日需确认优先级
3. 版本 V3.2 仍有 2 项未收口

查看我的需求
```

## 5. 产品晚报

```text
晚报｜产品
变更 {story_changed_today}｜关闭 {story_closed_today}｜延期 {story_overdue_count}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看我的需求
```

## 6. 测试早报

```text
早报｜测试
待验证 Bug {verify_bug_count}｜待执行 {case_todo_count}｜回归 Bug {regression_bug_count}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看测试详情 / 查看Bug
```

示例：

```text
早报｜测试
待验证 Bug 4｜待执行 12｜回归 Bug 2

1. 测试准出未通过：失败用例 3
2. Bug#542 已修复，待验证
3. 回归 Bug 2 个仍未关闭

查看测试详情 / 查看Bug
```

## 7. 测试晚报

```text
晚报｜测试
今日执行 {case_run_today}｜失败 {case_fail_today}｜阻塞 {case_blocked_today}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看测试详情 / 查看Bug
```

## 8. 管理早报

```text
早报｜管理
项目 {project_count}｜延期 {project_delay_count}｜高风险 {high_risk_count}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看项目进度 / 查看风险详情
```

示例：

```text
早报｜管理
项目 6｜延期 1｜高风险 2

1. 项目「商城二期」已延期 3 天
2. 执行「结算改造」未达测试准出
3. 高优 Bug 超期 2 个

查看项目进度 / 查看风险详情
```

## 9. 管理晚报

```text
晚报｜管理
完成事项 {done_total}｜延期 {project_delay_count}｜风险未收口 {high_risk_open_count}

1. {focus_1}
2. {focus_2}
3. {focus_3}

查看项目进度 / 查看风险详情
```

## 10. 多角色合并模板

适用场景：

- 同一用户同时是研发和管理
- 同一用户同时是产品和管理

建议格式：

```text
晚报｜工作摘要
待办 {todo_total}｜超期 {overdue_total}｜高风险 {risk_total}

【我的待办】
1. {todo_focus_1}
2. {todo_focus_2}

【我的风险】
1. {risk_focus_1}
2. {risk_focus_2}

查看详情
```

限制：

- 合并消息也不要超过 2 个分区
- 总重点不超过 4 条

## 11. 重大风险即时提醒模板

### 11.1 项目延期

```text
风险提醒｜项目延期
项目「{project_name}」已延期 {delay_days} 天
当前状态：{status}

查看项目详情
```

### 11.2 高优 Bug 超期

```text
风险提醒｜高优 Bug 超期
Bug#{bug_id} {bug_title_short}
优先级 {priority}，已超期 {delay_days} 天，当前 {status}

查看Bug详情
```

### 11.3 关键任务阻塞

```text
风险提醒｜关键任务阻塞
任务#{task_id} {task_title_short}
已超期 {delay_days} 天，当前 blocked

查看任务详情
```

### 11.4 测试准出阻塞

```text
风险提醒｜测试准出未通过
失败用例 {failed_cases}｜阻塞用例 {blocked_cases}｜未关闭 Bug {open_bugs}

查看测试详情
```

## 12. 文案风格要求

统一要求：

- 用词直接，不绕
- 尽量使用数字
- 不写长解释
- 不写内部技术字段

推荐：

- `已延期 3 天`
- `未关闭`
- `待验证`
- `当前 blocked`

不推荐：

- `请您尽快关注并处理相关问题，以免影响后续整体协同推进`
