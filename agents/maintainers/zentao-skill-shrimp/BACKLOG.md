# 禅道技能包维护 Backlog

这个文件是小龙虾的任务池。

目标：

- 不靠临时想到什么做什么
- 每轮只选一件当前最值得推进的小事
- 让“为什么做、做到什么算完成、现在做到哪”都能被回读

## 使用规则

1. 默认先从 `todo` 中选择事项。
2. 每条任务都必须有唯一编号，格式为 `B-001`、`B-002` 这种三位递增编号。
3. 选题优先级：
   - 高频痛点
   - 低风险高收益
   - 结构问题
   - 文档缺口
   - 锦上添花项
4. 预览、执行、回写、完成都必须明确引用同一个任务编号，不要只写标题。
5. 每轮优先只推进 1 项，不同时把很多事项改成 `doing`。
6. 做之前先给预览：
   - 为什么选它
   - 选中的是哪个任务编号
   - 最小动作
   - 风险
   - 验收标准
7. 做完后更新同一编号任务的状态、进展和备注，不新开重复条目。

## 状态说明

- `todo`：待处理
- `doing`：当前正在推进
- `blocked`：有阻塞
- `done`：已完成
- `parked`：先放一放

## 模板

复制下面一段新增任务：

```md
## [todo][B-000] 标题

- 类型：bug / refactor / docs / routing / risk / validation
- 价值：为什么值得做
- 风险：低 / 中 / 高
- 触发信号：是通过什么现象发现的
- 最小动作：这一轮准备做的最小改动
- 验收标准：
  - 
  - 
- 相关位置：
  - 
  - 
- 备注：
  - 
```

---

## [doing][B-001] 后台变更通知覆盖矩阵与脚本语义补齐

- 类型：risk
- 价值：把“后台人工操作”和“企微会话脚本操作”的即时通知语义统一，减少遗漏场景
- 风险：中
- 触发信号：task 后台转派/完成并转派曾出现通知漏发；用户已明确要求“后台操作的都应该去通知”；技能包部分脚本只发状态通知，没有同步负责人通知
- 最小动作：先建立后台覆盖清单，再把已识别的脚本侧缺口补齐，最后列出后台仍待核查的动作
- 验收标准：
  - 有一份可回读的覆盖矩阵文档
  - 后台人工操作中“业务上应该通知”的场景，被明确纳入补齐范围，而不是只保证脚本入口
  - `update-bug-status`、`update-story-status`、`review-story`、`assign-bug` 的通知语义按前后值统一
  - backlog 中明确剩余后台遗漏场景
- 相关位置：
  - `docs/overview/后台变更通知覆盖清单.md`
  - `scripts/shared/change_notifications.ts`
  - `scripts/actions/`
- 备注：
  - 下一轮优先继续核查 task 后台动作：`pause / activate / restart / close / cancel`
  - 默认原则：后台人工操作只要业务上应通知，就必须纳入待办，不接受“脚本能通知就算完成”

## [todo][B-002] callback / 大入口文件职责继续收敛

- 类型：refactor
- 价值：降低入口文件膨胀，给后续新增场景留清晰落点
- 风险：中
- 触发信号：入口文件同时承担路由、参数解析、候选构造、实体映射和业务分支
- 最小动作：继续把可复用的解析 / 选择逻辑抽到独立 helper，入口只保留 orchestration
- 验收标准：
  - 入口文件职责更单一
  - 新增同类逻辑时有明确落点
- 相关位置：
  - `scripts/callbacks/`
  - `references/`
- 备注：
  - 这是长期结构收敛项，适合分多轮推进

## [todo][B-003] 高价值脚本补最小验证命令与故障排查

- 类型：validation
- 价值：减少“脚本有了但不会安全使用”的维护成本
- 风险：低
- 触发信号：部分脚本存在能力，但缺少最小用法和失败排查
- 最小动作：为高频脚本补最小验证命令、输入示例和常见报错提示
- 验收标准：
  - 高频脚本有最小验证命令
  - 常见失败路径有文档提示
- 相关位置：
  - `SKILL.md`
  - `references/`
  - `scripts/actions/`
  - `scripts/queries/`
- 备注：
  - 优先覆盖创建任务、查任务、改状态、查 Bug 等高频动作

## [todo][B-004] 路由与回复模板的一致性巡检

- 类型：risk
- 价值：降低 `intent-routing.yaml`、脚本结果和回复模板之间漂移
- 风险：低
- 触发信号：路由、脚本和模板分散在不同目录，长期容易出现不一致
- 最小动作：抽查高频路由是否同时具备脚本入口、模板映射和字段一致性
- 验收标准：
  - 至少一批高频路由完成一致性检查
  - 漂移项被记录到 backlog 或修复
- 相关位置：
  - `agents/modules/intent-routing.yaml`
  - `scripts/replies/templates/`
  - `scripts/actions/`
  - `scripts/queries/`
- 备注：
  - 如果发现问题较多，优先拆成更小的 backlog 项

## [parked][B-005] 旧模块的去重与收敛计划继续细化

- 类型：docs
- 价值：减少重复模块和未来扩展时的困惑
- 风险：中
- 触发信号：存在 `deprecated / 待收敛` 模块和保留模块并存的情况
- 最小动作：按模块组继续细化“先收敛路由还是先收敛文档”的执行顺序
- 验收标准：
  - 文档里清楚写出每组模块的下一步
  - 不直接删除仍可能被引用的模块
- 相关位置：
  - `docs/overview/模块收敛计划.md`
  - `modules/`
- 备注：
  - 这是中期项，不抢占高频主链路问题

## [todo][B-006] 定时推送消息卡片模板设计与预览收敛

- 类型：docs
- 价值：让企微定时摘要从“能发”提升到“好读、易点、可快速决策”，减少长文本提醒的阅读成本
- 风险：中
- 触发信号：当前定时摘要已支持四类角色和早晚报，但消息形式仍偏 markdown 摘要，用户明确希望下一步优先完善消息卡片模板的样式和交互
- 最小动作：定义统一卡片骨架，并为产品、研发、测试、管理四类角色设计摘要指标区、风险提醒区和主次按钮跳转，补齐早报/晚报预览样式
- 验收标准：
  - 四类角色都有统一骨架、可区分内容的卡片模板
  - 卡片仍保持简洁，不展开长明细
  - 主按钮和次按钮的跳转语义清楚
  - 能输出一版可评审、可实发映射的模板设计结果
- 相关位置：
  - `scripts/scheduled_digest/renderer.ts`
  - `scripts/scheduled_digest/types.ts`
  - `docs/wecom-zentao/scheduled-digest/04-message-templates.md`
  - `docs/wecom-zentao/scheduled-digest/03-technical-design.md`
- 备注：
  - 设计方向继续保持“简洁提醒、点击看详情”，不把企微卡片做成长报表

## [done][B-007] task 后台状态通知热修回写到仓库与部署链路

- 类型：risk
- 价值：避免服务器 `task/model.php` 热修长期游离在仓库外，降低后续升级、迁移、重建环境时的丢失风险
- 风险：中
- 触发信号：本轮已在服务器补齐 `task` 状态类 bridge 兜底，但当前仍主要存在于服务器文件，不是仓库正式资产
- 最小动作：把服务器 `task/model.php` 的有效热修逻辑整理成仓库可追踪内容，并补充最小部署/回写说明
- 验收标准：
  - 仓库里有可回读的热修逻辑来源或部署说明
  - 明确哪些状态动作已补齐：`activate / start|restart / pause / cancel / close / finish / assign`
  - 后续重建环境时不需要重新人工比对服务器文件
- 相关位置：
  - `references/server-hotfixes/task-model-2026-04-16.php`
  - `docs/overview/task后台通知热修回写说明.md`
  - `docs/overview/后台变更通知覆盖清单.md`
  - `docs/overview/通知链路记录.md`
  - `tmp/server-hotfixes/task-model.php`
- 备注：
  - 2026-04-16 已把服务器热修副本纳管到 `references/server-hotfixes/task-model-2026-04-16.php`
  - 已补 `docs/overview/task后台通知热修回写说明.md`，明确“重启不会自动丢、升级/覆盖会丢”和最小重放步骤

## [todo][B-008] task doing / activate / restart 等状态规则补齐

- 类型：risk
- 价值：让 `task` 状态事件不只是进入审计，还能有明确的通知策略，减少“链路通了但用户仍感知不到”的灰区
- 风险：中
- 触发信号：本轮回归里 `task` 的 `doing` 类状态已进入 `notification-audit`，但当前显示 `no matched notification rule`
- 最小动作：梳理 `task` 状态语义，决定 `doing / activate / started / restarted` 是通知、跳过还是仅审计，并补齐规则/模板
- 验收标准：
  - `task` 高时效状态不再只有审计记录却没有明确规则归属
  - 每类状态都有“通知谁 / 为什么通知 / 为什么不通知”的说明
  - 补齐后再次回归可看到规则命中结果符合预期
- 相关位置：
  - `docs/wecom-zentao/11-notification-rules-mvp.yaml`
  - `docs/wecom-zentao/12-notification-template-cards-mvp.yaml`
  - `scripts/shared/wecom_notify.ts`
  - `docs/overview/通知链路记录.md`
- 备注：
  - 不要求所有状态都一定发消息，但必须有清晰规则

## [todo][B-009] 后台插件触发通知自动回归脚本

- 类型：validation
- 价值：避免以后每次都靠手工 SSH、手工查审计、手工恢复测试数据，降低回归成本
- 风险：中
- 触发信号：本轮验证需要手工串联“改状态 -> 查 journal -> 查 notification-audit -> 恢复任务状态”，过程长且容易遗漏
- 最小动作：沉淀一条最小自动验收脚本或步骤脚本，覆盖 `task` 状态回归、bridge 日志核查、审计核查、测试对象恢复
- 验收标准：
  - 能一键或半自动完成一次 `task` 后台通知回归
  - 输出里明确区分“事件未投递 / 已投递未命中规则 / 已命中规则未发送 / 已成功发送”
  - 测试对象结束后会恢复到预设状态
- 相关位置：
  - `scripts/maintenance/`
  - `scripts/queries/query_notification_audit.ts`
  - `scripts/queries/query_task_detail.ts`
  - `docs/overview/通知链路记录.md`
- 备注：
  - 优先先覆盖 `task#16` 这类低风险测试对象

## [todo][B-010] task assignto 页面低层执行入口梳理

- 类型：validation
- 价值：形成稳定的 `task` 转派验证入口，后续就不需要再手写表单或临时拼请求
- 风险：低
- 触发信号：本轮真实页面级 `task assignto` 提交流程不够稳定，验证转派时不得不退回到 bridge 直打包确认运行时
- 最小动作：梳理 `task assignto` 页面所需字段、提交方式和最低可复用调用路径，补一个低层可复用入口
- 验收标准：
  - 能稳定执行一次 `task` 转派并得到确定结果
  - 失败时能知道是表单字段问题、权限问题还是后端逻辑问题
  - 后续不再需要临时手写 `sendFormRequest` 测试转派
- 相关位置：
  - `scripts/shared/zentao_client.ts`
  - `/opt/zbox/app/zentao/module/task/control.php`
  - `/opt/zbox/app/zentao/module/task/view/assignto.html.php`
- 备注：
  - 这项主要是为了让后续“转派通知”验证更稳，不是为了重做页面逻辑

## [todo][B-011] 企微路由动作裁决层与分流可观测性

- 类型：routing
- 价值：把“创建需求被误分流成需求列表”这类问题从单点补丁升级成统一机制，减少后续在 `story / task / bug / testtask` 上重复踩坑
- 风险：中
- 触发信号：本轮企微自然语言创建需求场景中，前置语义路由先命中 `query-product-stories`，导致 LLM 没有介入机会；现有修复已用口语归一化和创建动作让路止血，但后续仍需要统一优化
- 最小动作：先抽出一层轻量动作裁决，至少区分“创建 / 查询列表 / 详情 / 状态更新”四类，再补最基础的分流日志，并用真实企微口语样本回归 `story / task / bug / testtask`
- 验收标准：
  - 新增一层可回读的动作分类或裁决逻辑，而不是继续把判断散落在单个 `query-*` / `create-*` 分支里
  - 至少 `story / task / bug / testtask` 四类对象接入同一套基础动作裁决
  - 分流日志能看出原始文本、命中规则、是否走语义路由、是否调用 LLM、最终 intent 与简要原因
  - 至少补 10 条真实口语回归样本，覆盖创建、查询、详情、状态更新、歧义句
  - 明显创建指令不再被列表查询抢占
- 相关位置：
  - `scripts/callbacks/wecom_callback.ts`
  - `scripts/callbacks/wecom_context_semantic_resolver.ts`
  - `scripts/callbacks/wecom_route_resolver.ts`
  - `agents/modules/intent-routing.yaml`
  - `scripts/tests/`
- 备注：
  - 第一轮目标不是重写整套路由，而是先做轻量动作裁决、基础打分思路和可观测性
  - 可优先复用交接包 `2026-04-16-企微创建需求误分流修复.md` 中的 backlog 候选与下一步设计

## [todo][B-012] 企微自建应用混合 payload 的 agent/bot 识别回归固化

- 类型：validation
- 价值：避免企业微信自建应用 callback 因兼容字段混合再次被误判成 `bot`，导致回复卡片链路和来源文案退化
- 风险：低
- 触发信号：本轮“有哪些模块”排查中，自建应用 payload 同时带有 `MsgType/AgentID` 和 `msgtype`，旧逻辑先按 bot 字段判定，导致消息源被误识别为 `bot`
- 最小动作：补一组标准化消息源回归样本，覆盖 `agent payload / bot payload / 混合 payload` 三类输入，并明确要求消息源识别先判 `agent` 再判 `bot`
- 验收标准：
  - 存在可直接运行的消息源回归脚本
  - 混合 payload 稳定识别为 `agent`
  - 纯 bot payload 仍稳定识别为 `bot`
  - 后续修改 `wecom_payload` 或 callback 兼容层时，能第一时间发现消息源回归
- 相关位置：
  - `scripts/shared/wecom_payload.ts`
  - `scripts/tests/wecom_message_source_regression.ts`
  - `scripts/callbacks/wecom_callback.ts`
- 备注：
  - 这项优先级高于统一文案，因为根因是消息源误识别，不是卡片文案本身

## [todo][B-013] 高频业务短句的关键词白名单与自然表达补齐

- 类型：routing
- 价值：降低“模块 / 版本 / 迭代 / 测试单”等真实业务短句被开放问答或 short bypass 误伤的概率
- 风险：低
- 触发信号：本轮“有哪些模块”因业务关键词缺少“模块”且 bypass 执行过早，被错误分流到 `general_ai`
- 最小动作：盘点高频对象短句，补齐 `ZENTAO_BUSINESS_KEYWORDS` 与 `intent-routing.yaml` 中的自然表达触发词，并为每类至少加一条回归
- 验收标准：
  - 高频对象词至少覆盖：模块、版本、迭代、测试单、执行、团队
  - 每类对象至少有一条“上下文短句查询”回归样本
  - 相关短句不再被 short bypass 抢走
- 相关位置：
  - `scripts/callbacks/wecom_callback.ts`
  - `agents/modules/intent-routing.yaml`
  - `scripts/tests/`
- 备注：
  - 先做高频短句补齐，不急着扩大到所有低频表达

## [todo][B-014] callback 决策链结构化日志补齐

- 类型：risk
- 价值：以后再遇到“为什么走了 bot / general_ai / 某个 intent”时，可以直接看决策链，而不是完全靠人工复盘源码
- 风险：中
- 触发信号：本轮排查需要手工串联消息源识别、semantic/yaml 命中、short bypass、fallback 与 template_card 包装，定位成本偏高
- 最小动作：在 callback 主链路增加最小结构化日志字段，至少记录消息源、route_source、semantic_reason、是否 bypass、fallback_reason、最终 intent
- 验收标准：
  - 能从日志快速判断“为什么走了这个链路”
  - 至少能区分：agent/bot/unknown、semantic/yaml/llm/general_ai、short_input_bypass/open_question_non_zentao
  - 不需要重新读完整源码，也能完成一次常见分流故障定位
- 相关位置：
  - `scripts/callbacks/wecom_callback.ts`
  - `scripts/callbacks/wecom_interactive_dispatcher.ts`
  - `docs/integration/WECOM_CALLBACK.md`
- 备注：
  - 第一轮优先做结构化关键字段，不要求先接完整 observability 平台

## [todo][B-015] bot 兜底卡片包装场景盘点与边界收敛

- 类型：risk
- 价值：明确哪些回复允许走 bot 侧兜底包装，哪些回复必须保持 agent template 原样输出，减少“看起来像卡片但其实链路错了”的隐性问题
- 风险：中
- 触发信号：本轮问题中，bot 侧兜底包装把 `source.desc` 固定成“禅道助手”，放大了消息源误识别的用户感知
- 最小动作：盘点当前所有 `maybeWrapReplyAsTemplateCard` 一类 bot 包装场景，标出保留、收敛、禁止覆盖的边界，并写清用途
- 验收标准：
  - 有一份可回读的 bot/agent 卡片包装边界说明
  - 能回答“哪些场景允许 bot 包装，哪些场景必须走 agent template”
  - 避免后续再把链路问题误看成单纯文案问题
- 相关位置：
  - `scripts/callbacks/wecom_callback.ts`
  - `scripts/callbacks/wecom_reply_formatter.ts`
  - `scripts/replies/agent_templates/`
  - `docs/overview/`
- 备注：
  - 这项不是要求统一文案，而是先明确边界和默认策略
