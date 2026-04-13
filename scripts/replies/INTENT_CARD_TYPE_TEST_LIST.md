# Intent Card Type Test List

Source: [intent-routing.yaml](/D:/StudioWorkSpace/openclaw/openclaw-zentao-pack/agents/modules/intent-routing.yaml)

## Summary

| card_type | count |
| --- | ---: |
| `text_notice` | 29 |
| `button_interaction` | 4 |
| `multiple_interaction` | 2 |
| `vote_interaction` | 1 |

## Rules

- Explicitly configured `cardType` uses the template-defined value.
- `query-my-tasks` uses a dedicated template and is `button_interaction`.
- All other agent templates without explicit `cardType` default to `text_notice`.

## List

| No. | intent | card_type | test keyword | interaction copy |
| --- | --- | --- | --- | --- |
| 1 | `query-my-tasks` | `button_interaction` | `我的任务` | `查看首条任务 / 查看我的Bug / 刷新任务` |
| 2 | `query-my-bugs` | `button_interaction` | `我的bug` | `查看首条Bug / 刷新Bug` |
| 3 | `query-products` | `text_notice` | `产品列表` | `-` |
| 4 | `query-product-modules` | `text_notice` | `产品模块 1` | `-` |
| 5 | `query-projects` | `text_notice` | `项目列表` | `-` |
| 6 | `query-executions` | `text_notice` | `执行列表 1` | `-` |
| 7 | `query-execution-stories` | `text_notice` | `执行需求 1` | `-` |
| 8 | `query-execution-tasks` | `text_notice` | `执行任务 1` | `-` |
| 9 | `query-project-team` | `text_notice` | `项目团队 1` | `-` |
| 10 | `query-execution-team` | `text_notice` | `执行团队 1` | `-` |
| 11 | `query-product-stories` | `text_notice` | `产品需求 1` | `-` |
| 12 | `query-story-detail` | `text_notice` | `需求详情 1` | `-` |
| 13 | `query-task-detail` | `button_interaction` | `任务详情 1` | `开始任务 / 完成任务 / 阻塞任务` |
| 14 | `query-bug-detail` | `button_interaction` | `bug详情 1` | `激活Bug / 解决Bug / 关闭Bug` |
| 15 | `query-testcases` | `text_notice` | `测试用例 1` | `-` |
| 16 | `query-testtasks` | `text_notice` | `测试单 1` | `-` |
| 17 | `query-testtask-detail` | `text_notice` | `测试单详情 1` | `-` |
| 18 | `query-testtask-cases` | `text_notice` | `测试单用例 1` | `-` |
| 19 | `query-test-exit-readiness` | `text_notice` | `测试准出 1` | `-` |
| 20 | `query-go-live-checklist` | `text_notice` | `上线检查 1` | `-` |
| 21 | `query-acceptance-overview` | `text_notice` | `验收概览 1` | `-` |
| 22 | `query-closure-readiness` | `text_notice` | `关闭准备 1` | `-` |
| 23 | `query-closure-items` | `text_notice` | `关闭阻塞项 1` | `-` |
| 24 | `query-releases` | `text_notice` | `发布列表 1` | `-` |
| 25 | `query-release-detail` | `text_notice` | `发布详情 1` | `-` |
| 26 | `create-product` | `text_notice` | `创建产品` | `-` |
| 27 | `create-product-with-modules` | `text_notice` | `创建产品并建模块` | `-` |
| 28 | `create-product-modules` | `text_notice` | `创建模块` | `-` |
| 29 | `create-story` | `text_notice` | `创建需求` | `-` |
| 30 | `review-story` | `vote_interaction` | `评审需求 1 pass` | `通过 / 驳回 / 需补充；提交评审` |
| 31 | `create-task` | `text_notice` | `创建任务` | `-` |
| 32 | `update-task-status` | `multiple_interaction` | `更新任务状态 1 doing` | `选择任务状态；待处理 / 进行中 / 已完成 / 已阻塞；备注策略；使用默认备注 / 不写备注；提交更新` |
| 33 | `create-testcase` | `text_notice` | `创建测试用例` | `-` |
| 34 | `create-testtask` | `text_notice` | `创建测试单` | `-` |
| 35 | `link-testtask-cases` | `text_notice` | `关联测试单用例 1` | `-` |
| 36 | `run-testtask-case` | `text_notice` | `执行测试用例 1 pass` | `-` |
| 37 | `create-bug` | `text_notice` | `创建bug` | `-` |
| 38 | `assign-bug` | `text_notice` | `指派bug 1 zhangsan` | `-` |
| 39 | `update-bug-status` | `multiple_interaction` | `更新bug状态 1 resolve` | `选择Bug状态；激活 / 已解决 / 已关闭；备注策略；使用默认备注 / 不写备注；提交更新` |
| 40 | `create-release` | `text_notice` | `创建发布` | `-` |
| 41 | `link-release-items` | `text_notice` | `关联发布项 1` | `-` |
| 42 | `update-release-status` | `text_notice` | `更新发布状态 1 closed` | `-` |
| 43 | `update-story-status` | `text_notice` | `更新需求状态 1 closed` | `-` |

## References

- [query-my-tasks.ts](/D:/StudioWorkSpace/openclaw/openclaw-zentao-pack/scripts/replies/agent_templates/query-my-tasks.ts)
- [route_templates.ts](/D:/StudioWorkSpace/openclaw/openclaw-zentao-pack/scripts/replies/agent_templates/route_templates.ts)
- [_helpers.ts](/D:/StudioWorkSpace/openclaw/openclaw-zentao-pack/scripts/replies/agent_templates/_helpers.ts)
