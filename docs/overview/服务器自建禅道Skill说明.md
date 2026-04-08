# 服务器自建禅道 Skill 说明

更新时间：2026-04-03

当前在线目录：
- `1.14.73.166` 生效目录：`/root/.openclaw/workspace/skills/openclaw-zentao-pack`

变更日志分层：
- 服务器总变更日志：`/root/.openclaw/docs/服务器变更总日志.md`
- 技能包变更日志：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/overview/服务器变更日志.md`
- 技能包通知链路记录：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/overview/通知链路记录.md`
- 说明：页面上应同时展示这三份日志；总日志看全局环境，技能包日志看禅道包内部，通知链路记录看通知执行事实

通知链路快速入口：
- 规则：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/wecom-zentao/11-notification-rules-mvp.yaml`
- 模板：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/wecom-zentao/12-notification-templates-mvp.yaml`
- 接收人解析：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/wecom-zentao/13-receiver-resolution-spec.md`
- 总览记录：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/overview/通知链路记录.md`
- 明细日志：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/tmp/notification-audit/notification-audit.jsonl`
- 查询命令：`npm run query-notification-audit -- --latest 20`

三只虾的功能：
- `zentao-skill-shrimp`：禅道包内部维护虾，负责整理技能包结构、模块说明、脚本入口、文档一致性与长期维护风险。
- `backup-cleanup-shrimp`：OpenClaw 全局备份清理虾，负责定期清理 `/root/.openclaw` 范围内命名明确的旧备份副本与临时备份文件；当前节奏为每 7 天一次。
- `server-change-journal-shrimp`：OpenClaw 全局变更记录虾，负责巡检 `/root/.openclaw` 与各 skill 仓库的真实改动，按“服务器级 / skill 级”分流写日志，并在满足保护条件时自动 git commit；当前节奏为每 12 小时一次。

统一身份规则：
- 禅道始终优先使用统一配置里的固定机器人账号登录
- 企微用户身份仅用于映射对应禅道用户，不再默认切换为企微用户本人的禅道密码
- 用户匹配优先走数据库映射链路；如果匹配不到禅道用户，必须让用户手动提供工号或禅道账号
- “我的任务”和“我的 Bug” 统一走共享客户端里的当前用户解析逻辑
- 默认创建/指派等动作优先取“当前映射到的禅道账号”作为操作者或默认处理人，而不是固定机器人账号

统一配置来源：
- 主配置：`/root/.openclaw/private/openclaw.secrets.json`
- 运行时渲染：`/root/.openclaw/private/openclaw.runtime.json`
- 禅道兼容入口：`/root/.openclaw/private/zentao.config.json`
- 约束：禅道的 `base_url/api_base_url/account/password` 只允许放在 `zentao.config.json`，不要再写回 `openclaw.secrets.json` 或 `openclaw.runtime.json` 顶层，否则网关会因为出现不可识别字段而报错
- 2026-04-03 排查发现：`/root/.openclaw/private/zentao.config.json` 曾被错误做成指向 `/root/.openclaw/private/openclaw.secrets.json` 的软链接，导致“看起来写进 zentao.config 的禅道字段”实际落到了 `openclaw.secrets.json`
- 现已修复为两个独立文件：`openclaw.secrets.json` 仅保留 OpenClaw/gateway/企微通道配置；`zentao.config.json` 单独保存禅道 `base_url/api_base_url/account/password/userid`
- 当前 `zentao.config.json` 已保留：
- `user_sync.default_password = ChangeMe123!`
- 说明：`user_aliases` 已从配置和代码链路中移除；`user_sync.default_password` 仅在“企微同步过程中需要自动新建禅道用户且输入未显式提供密码”时使用
- 风险提示：`ChangeMe123!` 目前只是安全占位值，不建议长期作为生产默认建号密码；若后续启用自动建号，请改成团队约定的初始密码策略
- 修复后已验证：`openclaw.runtime.json` 不再包含禅道顶层凭证字段；`OPENCLAW_ZENTAO_CONFIG_PATH=/root/.openclaw/private/zentao.config.json npm run query-products` 可正常返回产品列表
- 2026-04-03 补充说明：`zentao.config.json` 本身也必须真的包含上述 4 个禅道字段；如果只是保留 OpenClaw/企微配置而没有禅道字段，技能脚本会继续报 `Missing Zentao credentials`
- 2026-04-03 进一步确认：服务器上历史曾把 `zentao.config.json` 做成指向 `openclaw.secrets.json` 的软链接，导致两边内容始终联动；现已拆分为两个独立文件

当前注意点：

路由与运行时：
- `scripts/callbacks/wecom_callback.ts` 已改为优先读取 `agents/modules/intent-routing.yaml` 做高频禅道路由。
- 当前回调会先匹配 YAML 路由；未命中时返回 `should_fallback_to_general_ai: true`，供上层转普通 AI。
- 命中禅道路由后，会尽量从文本中抽取 `product/project/execution/testtask/story/task/bug/release` 等常见参数，并默认透传当前 `userid`。
- “我的任务 / 我的 Bug” 已并入统一的 `intent-routing.yaml + 通用脚本执行器` 链路，不再作为 callback 内部独立特判分支。
- 若命中路由但缺少必要参数，当前会返回结构化缺参提示；若脚本执行失败，当前会返回结构化失败结果与 `reply_text`，不再直接抛裸异常。
- `agents/openai.yaml` 已实际接入运行时：YAML 路由未命中时，会读取其中的 `default_prompt` 作为 LLM 禅道意图判定的 system prompt。
- 当前已新增一层 LLM 禅道判定：像“帮我看看 4 号迭代现在是否可以开始测试”这类自然话术，在 YAML 未命中时可由 LLM 识别为 `query-test-exit-readiness`，并抽取 `execution=4`。
- 当前普通闲聊如天气、问候等，在 YAML 未命中且 LLM 判定为非禅道请求时，会返回 `should_fallback_to_general_ai: true`。
- 当前仅认 `/root/.openclaw/workspace/skills/openclaw-zentao-pack` 为唯一生效技能目录。

模块与文档：
- `agents/modules/*.yaml` 中的人类可读字段已于 2026-04-03 统一调整为中文；其中 `intent-routing.yaml` 的 `intent/script/required_args` 等机器路由键仍保持英文，避免运行时路由失效。
- `modules/*/SKILL.md` 中此前被写坏成 `????` 的内容已重写为可读中文；服务器修复前备份目录为 `/root/.openclaw/workspace/skills/openclaw-zentao-pack/modules.bak_20260403_0200`。
- 当前模块目录可按 3 组理解：
- 运行中主链路模块：`acceptance-closure`、`bug-status-flow`、`business-setup`、`product-setup-flow`、`project-iteration-setup`、`release-create-flow`、`release-go-live`、`release-status-flow`、`robot-prompt-governance`、`story-closure-flow`、`story-review-flow`、`task-execution`、`task-status-flow`、`team-setup-flow`、`testing-bugflow`、`user-sync`
- 保留能力模块：`bug-assign-flow`、`bug-create-flow`、`execution-story-link-flow`、`release-linkage-flow`、`task-create-flow`、`test-execution-flow`、`test-exit-readiness-flow`、`testcase-create-flow`、`testtask-create-flow`
- 待收敛模块：`task-close-flow`、`bug-regression-flow`、`testtask-status-flow`、`lifecycle-closure-flow`
- 已按“先标注不删除”的方式处理待收敛模块：上述 4 个模块的 `modules/*/SKILL.md` 均已加入 `deprecated / 待收敛` 标记。
- 当前建议视为唯一主扩展入口的模块为：`task-status-flow`、`bug-status-flow`、`testing-bugflow`、`testtask-create-flow`、`test-execution-flow`、`test-exit-readiness-flow`、`acceptance-closure`。
- 已新增服务器文档 `/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/overview/模块收敛计划.md`，明确待收敛模块的目标去向与“不要重复扩功能”的规则。
- `docs/overview/当前项目状态总览.md`、`技能包总体功能说明.md`、`role-module-permissions.md`、`模块与脚本映射清单.md` 已同步加入模块分组与待收敛说明；文档备份目录为 `/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs.bak_20260403_0230`。
- `docs/overview/role-module-permissions.md` 已收敛：角色“建议可用模块”和风险分级已优先切到主扩展入口；待收敛模块仅保留在限制项或“待收敛说明”中，不再作为新授权入口推荐。

配置与验证：
- 如果数据库映射链路无法把当前企微用户匹配到禅道用户，机器人必须要求用户手动提供工号或禅道账号。
- 旧的“按 userid 反查禅道密码并切换登录人”的方式不再作为默认优先链路。
- 当前服务器实际生效的是手动启动的 gateway 进程，常用启动命令为：
- `export PATH=/root/.nvm/versions/node/v22.22.1/bin:$PATH && export OPENCLAW_CONFIG_PATH=/root/.openclaw/private/openclaw.runtime.json && /root/.openclaw/bin/render-openclaw-runtime.js && /root/.openclaw/bin/render-auth-profiles.js && /root/.local/share/pnpm/openclaw gateway --port 37811`
- 2026-04-03 已修正一次历史脏配置：`openclaw.secrets.json` / `openclaw.runtime.json` 顶层误写入了禅道字段，导致 gateway 提示 `Unrecognized keys: "api_base_url", "account", "password", "base_url"`；现已清理，固定禅道账号仅保留在 `zentao.config.json`。
- 2026-04-03 已修复技能包 `scripts/shared/zentao_client.ts` 的配置加载逻辑：不再因为主进程存在 `OPENCLAW_CONFIG_PATH` 就跳过 `zentao.config.json`，现在会合并读取 OpenClaw runtime 与独立禅道配置。
- 2026-04-03 已完成私有配置切分：
- `/root/.openclaw/private/openclaw.secrets.json` 仅保留 OpenClaw/企微私密配置
- `/root/.openclaw/private/zentao.config.json` 仅保留禅道连接字段与 `user_sync.default_password`
- `/root/.openclaw/private/openclaw.runtime.json` 渲染后顶层已不再出现禅道字段
- 2026-04-03 已移除 `user_aliases` 的配置和代码使用链路；产品负责人/评审人/同步用户若无法匹配到现有禅道账号，会直接提示用户手动提供工号或禅道账号
- 2026-04-03 服务器实测：
- `npm run query-my-bugs -- --userid LengLeng` 可返回 2 条 bug
- `npm run query-my-tasks -- --userid LengLeng` 可正常返回空任务列表

维护与遗留项：
- 禅道包内部维护角色目录：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/agents/maintainers/zentao-skill-shrimp`
- 该维护虾不是正式对外技能入口；当前已为其补充 `HEARTBEAT.md` 巡检规则，可用于周期检查技能包结构、文档映射、脚本入口与明显重复内容。
- 维护虾巡检日志路径：`/root/.openclaw/workspace/skills/openclaw-zentao-pack/docs/overview/maintenance-heartbeat-log.md`
- 约定：无问题时只返回 `HEARTBEAT_OK`；发现问题时除当次回复外，还应把最重要的一项追加记录到巡检日志。
- OpenClaw 主配置 `/root/.openclaw/openclaw.json` 已注册独立 agent：`zentao-skill-shrimp`
- 当前配置：`workspace=/root/.openclaw/workspace/skills/openclaw-zentao-pack/agents/maintainers/zentao-skill-shrimp`，`agentDir=/root/.openclaw/agents/zentao-skill-shrimp`
- 当前 heartbeat 配置：`every=24h`，`target=none`，`ackMaxChars=500`
- 说明：`backup-cleanup-shrimp` 与 `server-change-journal-shrimp` 已迁为 OpenClaw 全局维护虾，不再属于禅道包内部维护角色。
- 目前通过 OpenClaw CLI 读取 heartbeat 状态时，返回 `gateway closed (1006 abnormal closure)`；这属于控制面连接问题，后续如需继续排查，可优先检查 gateway 控制接口/本地 websocket 通路，而不是维护虾目录本身。
- 2026-04-03 已修复企微插件 `extensions/wecom/src/monitor.ts` 中的 `rawBody` 初始化顺序问题；此前群聊或私聊查询禅道时可能报 `ReferenceError: rawBody is not defined`。
- `scripts/actions/` 下存在一组与根级 `scripts/` 同名的重复动作脚本；当前 `package.json` 的实际入口统一指向 `dist/scripts/*.js`，未发现 `dist/scripts/actions/*.js` 的在线调用配置。
- `scripts/actions/` 目前更像历史残留/重构过渡副本；抽查同名文件差异仅为相对导入路径不同（如 `./shared/...` 与 `../shared/...`），未发现独立业务逻辑。
- 如需清理 `scripts/actions/`，建议先在服务器仓库单独提交一次“删除重复动作脚本”的变更，并同步修正文档 `docs/overview/*` 中对该目录的描述，避免后续误判。
