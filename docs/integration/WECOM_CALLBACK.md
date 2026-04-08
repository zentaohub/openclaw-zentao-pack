# 企业微信回调与回复链路说明
更新时间：2026-04-08

本文说明当前 OpenClaw 中企业微信消息的进入方式、来源识别、禅道回调脚本处理逻辑，以及 Bot / 自建应用两条回复链路的差异。

## 1. 当前入口分为两类

### 1.1 企微机器人 Bot 入口

- 入口代码：`openclaw-server-config/extensions/wecom/src/monitor.ts`
- 上游载荷形态：JSON
- 典型字段：
  - `msgtype`
  - `userid` / `userId`
  - `response_url`
  - `from.userid`
  - `chatid`
- 会话上下文特征：
  - `To = wecom:${chatId}`
  - `Surface = wecom`
  - `OriginatingTo = wecom:${chatId}`

Bot 模式关键点：

- 群聊与单聊都可能从这里进入
- 回复优先走 Bot 原会话交付
- 依赖 `response_url` 做流式刷新、占位回复和最终收口
- 当群内无法直接交付某些内容时，可能切到 Agent 私信兜底

### 1.2 企微自建应用 Agent 入口

- 入口代码：`openclaw-server-config/extensions/wecom/src/agent/handler.ts`
- 上游载荷形态：XML 解密后扁平化对象
- 典型字段：
  - `MsgType`
  - `FromUserName`
  - `ToUserName`
  - `AgentID`
  - `ChatId`
- 会话上下文特征：
  - `To = wecom-agent:${fromUser}`
  - `Surface = webchat`
  - `OriginatingTo = wecom-agent:${fromUser}`

Agent 模式关键点：

- 回复目标默认锁定为触发者私信
- 会显式带 `wecom-agent:` 前缀，避免误走 Bot WebSocket 出站链路
- `/new`、`/reset` 等命令回执允许在 Agent 会话中继续返回

## 2. OpenClaw 内部如何区分消息来源

来源识别代码：

- `openclaw-zentao-pack/scripts/shared/wecom_payload.ts`
- 方法：`detectWecomMessageSource(payload)`

当前规则：

- 命中 Bot 特征时，来源判定为 `bot`
  - `msgtype`
  - `userid` / `userId`
  - `response_url`
  - `sender.userid`
- 命中 Agent 特征时，来源判定为 `agent`
  - `MsgType`
  - `FromUserName`
  - `ToUserName`
  - `AgentID`
- 否则判定为 `unknown`

这一步是后续“同一意图按不同来源走不同模板”的基础。

## 3. 禅道回调脚本当前处理顺序

统一入口：

- `openclaw-zentao-pack/scripts/callbacks/wecom_callback.ts`

处理顺序如下：

1. 读取 payload
2. 识别 `userid`
3. 提取文本内容
4. 识别消息来源 `message_source`
5. 优先处理通讯录同步类回调
6. 判断是否是“附件导入任务”特殊请求
7. 读取 `agents/modules/intent-routing.yaml` 做高优先级意图匹配
8. YAML 未命中时，调用 `llm_intent_router.ts` 做禅道意图兜底判定
9. 命中后执行对应 `query-*` / `action-*` 脚本
10. 根据脚本结果和模板规则生成 `reply_text`
11. 返回结构化 JSON 给上游回复链路

## 4. 模板分流现在怎么落地

### 4.1 分流发生点

分流发生在：

- `openclaw-zentao-pack/scripts/callbacks/wecom_reply_formatter.ts`
- 关键方法：`buildScriptResultReply`

### 4.2 当前目录边界

- 机器人原模板目录：`scripts/replies/templates/`
- 自建应用模板目录：`scripts/replies/agent_templates/`
- 机器人注册表：`scripts/replies/template_registry.ts`
- 自建应用注册表：`scripts/replies/agent_template_registry.ts`

这套边界是本次链路调整的核心约束：

- 不改机器人现有模板行为
- 自建应用单独扩展，不污染机器人模板
- 同一意图可以在 Bot 和 Agent 下表现不同

### 4.3 选择顺序

如果路由里声明：

```yaml
reply_template: query-my-tasks
```

当前系统按下面顺序选模板：

1. 根据 `message_source` 判断先走哪个注册表
2. 若为 `agent`，优先在 `agent_template_registry.ts` 中找 `query-my-tasks`
3. 若为 `bot`，继续在原 `template_registry.ts` 中找 `query-my-tasks`
4. 若未命中，则回退通用模板 `generic-fallback`

## 5. 当前已落地的分流样板

当前已经拆分的意图：

- `query-my-tasks`

相关文件：

- Bot 模板：`scripts/replies/templates/query-my-tasks.ts`
- Agent 模板：`scripts/replies/agent_templates/query-my-tasks.ts`

当前效果：

- 从企微机器人进入的“我的任务”，继续走原文本模板
- 从企微自建应用进入的“我的任务”，走自建应用专用模板

## 6. 自建应用卡片回复链路

当前自建应用卡片链路已经接通，完整过程如下：

1. Agent 消息从 `openclaw-server-config/extensions/wecom/src/agent/handler.ts` 进入
2. OpenClaw 调用技能包，落到 `wecom_callback.ts`
3. 技能脚本返回 `reply_text`
4. 如果 `reply_text` 是 JSON，且顶层包含 `"template_card"`，Agent handler 会优先按卡片处理
5. 发送端调用 `openclaw-server-config/extensions/wecom/src/agent/api-client.ts` 中新增的 `sendTemplateCard(...)`
6. 最终通过企业微信 `cgi-bin/message/send` 以 `msgtype=template_card` 发给触发用户

也就是说：

- 模板层只负责产出合法 JSON
- “把 JSON 识别成卡片”发生在 Agent 回复出口
- 真正给企微发卡片的是 Agent API，而不是禅道脚本本身

## 7. 当前卡片模板样式

当前示例模板：

- `scripts/replies/agent_templates/query-my-tasks.ts`

该模板当前返回：

```json
{
  "template_card": {
    "card_type": "text_notice"
  }
}
```

因此当前的规则可以总结为：

- Agent 模板返回普通字符串：按文本发送
- Agent 模板返回带 `template_card` 的 JSON：按卡片发送

## 8. 测试脚本与当前实测结果

已补充测试脚本：

- `scripts/tests/send_wecom_agent_card_test.mjs`

执行方式：

```bash
npm run test-wecom-agent-card -- ./config.json xianmin lengleng
```

2026-04-08 实测结论：

- Access Token 获取成功
- `template_card` 请求已成功发到企微官方接口
- 但当前出口 IP 被企微拒绝，返回 `errcode=60020`

这说明要分成两层理解：

- 代码链路：已经打通
- 网络环境：当前机器还不具备成功投递企微卡片的条件

## 9. 当前卡片投递失败的根因

实测返回：

- `errcode = 60020`
- `errmsg = not allow to access from your ip`

这表示当前环境的出口 IP 不在企业微信自建应用可信 IP 白名单中。

排查优先级建议：

1. 先确认自建应用后台已放通当前出口 IP
2. 如部署机为动态 IP，优先配置固定出口代理
3. 必要时配置 `channels.wecom.network.egressProxyUrl`
4. IP 放通后，再用测试脚本验证 `xianmin` / `lengleng` 是否能实际收到卡片

## 10. 后续维护建议

- 新增禅道能力时，优先改 `intent-routing.yaml` 和脚本，不要继续在 `wecom_callback.ts` 里堆业务特判
- 新增来源差异文案时，优先新增 `agent_templates`，不要直接改旧机器人模板
- 只有当 Bot 和 Agent 在同一意图下输出结构真的不同，才拆分来源模板
- 如果未来需要更细粒度来源，可继续扩展 `message_source`
  - 例如 `bot_group`
  - `bot_dm`
  - `agent_dm`
