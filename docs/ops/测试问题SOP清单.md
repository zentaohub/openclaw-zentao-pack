# 测试问题 SOP 清单

这个文件用于在本地记录测试、联调、回归过程中发现的问题，便于后续追踪、复盘和回填禅道。

## 使用规则

- 用户已经明确描述现场问题时，先记录问题，不默认要求代理重新执行或复现。
- 命令执行失败时，可以使用自动记录命令，让失败信息直接追加到本文件。
- 命令执行成功但结果不符合预期，或问题发生在真实使用场景中时，使用手工记录命令补记。
- 每条问题至少补齐：现象、期望、实际、初步判断、下一步动作。
- 新问题默认追加在“问题记录”顶部，方便先看最新问题。

## 推荐命令

- 现场问题直接记录：`npm run log-test-issue -- --title "企微消息未生成卡片记录" --expected "发送企微消息后自动生成卡片记录" --actual "消息已发送，但系统没有生成卡片记录" --analysis "可能是企微回调未命中卡片落盘链路" --next-action "检查企微回调日志、卡片生成逻辑和落盘条件" --tags "企微,卡片,现场问题"`
- 自动记录：`npm run test-with-sop-log -- --title "联调企微回调失败" --cmd "npm run wecom-callback -- --data-file examples/callbacks/tmp-callback-task.json"`
- 手工记录：`npm run log-test-issue -- --title "测试单状态未更新" --actual "接口返回成功但页面仍显示进行中" --command "npm run update-testtask-status -- --testtask 1 --status done"`

## 给 AI 的提示词

```text
你现在是这个仓库的测试协作助手。每次执行测试、联调、回归时，必须遵循以下规则：
1. 如果用户已经明确描述了现场问题，先把问题追加到 docs/ops/测试问题SOP清单.md，不要默认自行执行命令复现；只有用户明确要求联调、复现、排查时才执行命令。
2. 只要出现命令失败、接口报错、页面行为不符、数据未落库、返回值异常，或者用户反馈“真实操作中出了问题”，都要记录到 docs/ops/测试问题SOP清单.md。
3. 用户口述或人工观察到的问题，优先执行：
   npm run log-test-issue -- --title "<一句话标题>" --expected "<期望结果>" --actual "<实际结果>" --analysis "<初步判断>" --next-action "<下一步动作>"
4. 如果命令退出码非 0，优先执行：
   npm run test-with-sop-log -- --title "<一句话标题>" --cmd "<实际执行的测试命令>" --expected "<期望结果>" --next-action "<下一步动作>"
5. 如果命令执行成功但结果仍有问题，执行：
   npm run log-test-issue -- --title "<一句话标题>" --command "<实际执行的命令>" --expected "<期望结果>" --actual "<实际结果>" --analysis "<初步判断>" --next-action "<下一步动作>"
6. 回复用户时，先说明问题结论，再明确告诉用户该问题已经写入 docs/ops/测试问题SOP清单.md。
7. 除非用户明确要求跳过，否则不要省略问题记录步骤。
```

## 常用归档提示词

### 1. 已经分析完，先记录，不继续修复

```text
基于你刚才已经给出的原因分析，现在先不要继续修复，也不要继续执行复现、联调或排查命令。

请把“本次问题”先整理并记录到 `docs/ops/测试问题SOP清单.md`，方便我后续逐项处理。

要求：
1. 直接基于你刚才已经输出的结论整理，不要重复排查。
2. 记录内容至少包括：
   - title：一句话问题标题
   - expected：期望结果
   - actual：实际结果
   - analysis：你刚才判断的原因总结
   - next-action：后续修复或排查建议
3. 不要编造新的日志、截图、执行结果。
4. 不要继续修复，只做记录。
5. 直接执行：
   npm run log-observed-issue -- --title "<title>" --expected "<expected>" --actual "<actual>" --analysis "<analysis>" --next-action "<next-action>" --tags "待修复,问题归档,现场问题"
6. 完成后只回复我：
   - 本次问题摘要
   - 已写入 docs/ops/测试问题SOP清单.md
   - 建议后续修复优先级
```

### 2. 已知现场现象，先记录，不先复现

```text
你现在先不要执行任何复现命令，也不要主动联调。

请基于我刚才描述的问题，先整理出一条“问题记录”，并立即写入 `docs/ops/测试问题SOP清单.md`。

要求：
1. 先把这次问题整理成这几个字段：
   - title：一句话问题标题
   - expected：期望结果
   - actual：实际结果
   - analysis：你判断的可能原因
   - next-action：建议下一步排查动作
2. 如果我提供的信息不完整，你可以做最小必要假设，但要写得保守，不要编造执行结果。
3. 不要先复现，不要先跑命令。
4. 直接执行记录命令，把问题写入 SOP：
   npm run log-observed-issue -- --title "<title>" --expected "<expected>" --actual "<actual>" --analysis "<analysis>" --next-action "<next-action>" --tags "现场问题,待排查"
5. 回复我时只需要告诉我：
   - 你整理后的问题摘要
   - 你已经写入 docs/ops/测试问题SOP清单.md
   - 建议我下一步是否需要你继续排查
```

### 3. 超短口语版

```text
把你刚才已经分析出的结论先归档，不要继续修复，不要继续跑命令。请直接整理为问题记录，并写入 docs/ops/测试问题SOP清单.md。使用 npm run log-observed-issue 完成记录，回复我摘要、记录位置和建议优先级即可。
```

## 问题记录

### 2026-04-16 15:24 CST | "有哪些模块"被短句 bypass 误分流到 general_ai，未进入禅道路由卡片链路
- 状态：待处理
- 记录来源：手工记录
- 分类：测试异常
- 期望结果：用户在已有产品上下文下发送"有哪些模块"时，应命中 query-product-modules 禅道路由，并返回对应的 Agent 卡片结果。
- 实际结果：用户发送"有哪些模块"后，消息被分流到 general_ai，返回普通文本问答结果，未进入 query-product-modules 路由，也未走卡片链路。
- 初步判断：本次问题不是卡片模板缺失，也不是卡片发送失败，而是请求在进入禅道路由前被 shouldBypassZentaoLlm 提前判定为短句开放问答并分流到 general_ai。当前短句 bypass 规则会把含"哪"的短问句视为开放问答，但业务关键词白名单中没有"模块"，同时 intent-routing.yaml 也未配置"有哪些模块"这个显式 trigger。虽然 query-product-modules 的 Agent 卡片模板和基于上下文的语义路由能力都已存在，但由于 bypass 先发生，后续的语义路由、参数补全和卡片渲染都没有机会执行。
- 下一步动作：后续建议优先做最小修复：第一，调整 shouldBypassZentaoLlm 的短句放行策略，避免把"有哪些模块"这类明显业务查询提前分流到 general_ai；第二，把"模块"补入业务关键词识别范围；第三，按需为 intent-routing.yaml 增补"有哪些模块"等高频表达作为显式 trigger；第四，修复后补一条回归用例，覆盖已有产品上下文下的"有哪些模块"是否能稳定进入 query-product-modules 并返回卡片。
- 跟进人：待分配
- 发生目录：`/Users/xikng/Documents/code/Zendao/openclaw-zentao-pack`
- 标签：`待修复`、`问题归档`、`现场问题`

