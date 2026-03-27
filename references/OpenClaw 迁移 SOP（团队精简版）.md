# OpenClaw 迁移 SOP（团队精简版）

本文用于团队内部快速执行 OpenClaw 迁移，适用于：

- 本地电脑迁移到另一台电脑
- 本地电脑迁移到云服务器
- 旧环境迁移到新目录

## 1. 迁移范围

OpenClaw 迁移分两部分：

1. `workspace`
用于保存每只 agent 的规则、人格、项目文件。

2. `~/.openclaw/`
用于保存 OpenClaw 本地配置、凭据和历史会话。

## 2. 必迁内容

必须迁移：

- 每只 agent 的 workspace

按需迁移：

- `~/.openclaw/openclaw.json`
- `~/.openclaw/credentials/`
- `~/.openclaw/agents/<agentId>/sessions/`

说明：

- 只迁移 workspace：会保留 agent 设定，但通常不会保留登录态和历史会话
- 同时迁移 `~/.openclaw/`：可尽量恢复原有使用状态

## 3. 标准步骤

### 3.1 源机器

1. 停止 OpenClaw 相关运行
2. 备份所有 agent workspace
3. 如需保留登录态和会话，额外备份 `~/.openclaw/`

建议先执行：

```powershell
openclaw agents list --bindings
```

用于确认当前 agents 和绑定关系。

### 3.2 目标机器

1. 安装 OpenClaw
2. 恢复所有 workspace 到目标目录
3. 如需完整迁移，恢复 `~/.openclaw/openclaw.json`
4. 如需完整迁移，恢复 `~/.openclaw/credentials/`
5. 如需完整迁移，恢复 `~/.openclaw/agents/<agentId>/sessions/`
6. 检查配置中的 workspace 路径是否仍然正确
7. 执行初始化和校验命令

## 4. 校验命令

```powershell
openclaw agents list
openclaw agents list --bindings
```

确认以下事项：

- agent 能正常列出
- workspace 路径正确
- 绑定关系正常
- 需要保留的登录态仍可用
- 需要保留的历史会话仍可访问

## 5. 云服务器迁移要求

推荐做法：

- workspace 放入私有 Git 仓库管理
- `~/.openclaw/` 仅作为本地运行状态单独备份
- 不要把 `credentials/` 和 `sessions/` 提交到 Git

建议目录：

```text
/opt/openclaw/workspaces/<agentId>
```

## 6. 常见问题

问题：迁移后需要重新登录

原因：
- 未迁移 `~/.openclaw/credentials/`

问题：迁移后看不到旧会话

原因：
- 未迁移 `~/.openclaw/agents/<agentId>/sessions/`

问题：agent 可见但项目打不开

原因：
- workspace 未完整复制
- 新机器路径与旧机器不同，配置未修正

## 7. 团队统一规范

建议团队统一采用以下规范：

1. 每只 agent 一个独立 workspace
2. workspace 纳入私有 Git 管理
3. `~/.openclaw/` 不入库
4. 凭据和 sessions 单独加密备份
5. 迁移时先恢复 workspace，再恢复状态

## 8. 参考文档

- [CLI Agents](https://docs.openclaw.ai/cli/agents)
- [Agent Workspace](https://docs.openclaw.ai/concepts/agent-workspace)
- [Multi-Agent Routing](https://docs.openclaw.ai/concepts/multi-agent)
