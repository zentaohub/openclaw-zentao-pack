# OpenClaw 迁移指南

本文用于把本地 OpenClaw 环境迁移到其他地方，包括：

- 另一台电脑
- 云服务器
- 新的工作目录

本文默认你已经在源机器上正常使用过 OpenClaw，并且已经创建过一个或多个 agents。

## 1. 迁移目标

迁移通常分为两类：

- 迁移工作区：保留每只 agent 的规则、提示词、人格设定、项目文件
- 迁移运行状态：保留 OpenClaw 配置、账号凭据、历史会话

如果你只想迁移“虾”的能力设定，迁移工作区即可。

如果你想把使用状态也完整带走，包括登录态和会话，除了工作区，还需要迁移 `~/.openclaw/` 下的配置和状态数据。

## 2. OpenClaw 里什么东西需要迁移

根据 OpenClaw 官方文档，agent 的核心数据分成两部分：

### 2.1 Agent Workspace

每只 agent 都有自己的 workspace。这里通常包含：

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `IDENTITY.md`
- 你为该 agent 准备的项目文件、脚本、提示模板、知识资料

这部分最适合放入 Git 仓库管理。

### 2.2 OpenClaw 本地状态目录

OpenClaw 的本地配置和运行状态通常位于：

```text
~/.openclaw/
```

其中常见的重要内容包括：

- `~/.openclaw/openclaw.json`
- `~/.openclaw/credentials/`
- `~/.openclaw/agents/<agentId>/sessions/`

它们分别用于保存：

- OpenClaw 全局配置
- 登录凭据和认证信息
- 每只 agent 的会话记录

说明：

- 工作区和 `~/.openclaw/` 不是一回事
- 只迁移工作区，不会自动带上登录态和会话历史
- 不建议把凭据和会话直接提交到 Git

## 3. 推荐目录结构

建议把每只“虾”的 workspace 放在固定目录下，便于迁移和备份。

Windows 示例：

```text
C:\OpenClaw\workspaces\writer
C:\OpenClaw\workspaces\coder
C:\OpenClaw\workspaces\ops
C:\OpenClaw\workspaces\research
```

Linux / 云服务器示例：

```text
/opt/openclaw/workspaces/writer
/opt/openclaw/workspaces/coder
/opt/openclaw/workspaces/ops
/opt/openclaw/workspaces/research
```

每只 agent 对应一个独立 workspace，不要混在一起。

## 4. 迁移前检查清单

在源机器上先确认以下内容：

- `openclaw agents list` 能正常列出 agents
- 你知道每只 agent 的 workspace 路径
- 你确认哪些内容需要带走：仅工作区，还是工作区加配置加会话
- 你已经关闭正在运行的 OpenClaw 相关进程，避免会话文件正在写入

建议执行：

```powershell
openclaw agents list --bindings
```

如果你需要核对具体配置，再检查本地配置文件和工作区目录。

## 5. 场景一：迁移到另一台电脑

### 5.1 最小迁移方案

适用场景：

- 只想带走 agent 设定
- 不需要迁移登录态
- 不需要保留旧会话

步骤：

1. 备份所有 agent workspace
2. 在新电脑安装 OpenClaw
3. 把 workspace 复制到新电脑
4. 在新电脑上重新指向这些 workspace
5. 运行 `openclaw setup --workspace <path>` 完成初始化

这种方式最干净，也最适合团队协作。

### 5.2 完整迁移方案

适用场景：

- 想保留登录态
- 想保留历史会话
- 想尽量还原原机器的使用状态

需要迁移的内容：

1. 所有 agent workspace
2. `~/.openclaw/openclaw.json`
3. `~/.openclaw/credentials/`
4. `~/.openclaw/agents/<agentId>/sessions/`

建议流程：

1. 在旧电脑停止 OpenClaw 相关运行
2. 备份所有 workspace
3. 备份 `~/.openclaw/`
4. 在新电脑安装同版本或兼容版本的 OpenClaw
5. 恢复 workspace 到目标路径
6. 恢复 `~/.openclaw/` 里的配置、凭据、sessions
7. 检查 `openclaw.json` 中的 workspace 路径是否仍然正确
8. 执行 `openclaw agents list`
9. 执行 `openclaw setup --workspace <path>` 或按你的实际目录逐个校准

如果新电脑的路径与旧电脑不同，重点修改路径配置，不要直接假设旧路径仍有效。

## 6. 场景二：迁移到云服务器

迁移到云服务器时，推荐使用“工作区进 Git，本地状态单独迁移”的方式。

### 6.1 推荐做法

工作区：

- 把每只 agent 的 workspace 放到私有 Git 仓库
- 在云服务器上 `git clone`

本地状态：

- 只在确有需要时迁移 `~/.openclaw/credentials/` 和 `sessions/`
- 云上环境更要注意凭据安全，不要把这些目录提交到仓库

### 6.2 推荐部署步骤

1. 在云服务器安装 OpenClaw
2. 创建统一目录，例如 `/opt/openclaw/workspaces/`
3. 把各 agent workspace 拉取到服务器
4. 按需要恢复 `~/.openclaw/openclaw.json`
5. 按需要恢复 `~/.openclaw/credentials/`
6. 按需要恢复 `~/.openclaw/agents/<agentId>/sessions/`
7. 运行 `openclaw agents list`
8. 运行 `openclaw setup --workspace <path>`

### 6.3 云服务器额外注意事项

- 使用专门的系统用户运行 OpenClaw，不要混用 root 的家目录
- 确保 `~/.openclaw/` 目录权限仅对当前用户可读写
- 优先把 workspace 放在稳定的挂载点，不要放在临时目录
- 如果服务器会被多人维护，建议把 workspace 版本化，而不是直接手工修改

## 7. 建议的备份策略

推荐把可迁移内容拆成两类备份：

### 7.1 Git 备份

适合放进 Git 的内容：

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `IDENTITY.md`
- 项目文件
- 规则模板
- 知识资料

不建议放进 Git 的内容：

- `credentials/`
- `sessions/`
- 含密钥的本地配置

### 7.2 私有离线备份

适合单独打包备份的内容：

- `~/.openclaw/openclaw.json`
- `~/.openclaw/credentials/`
- `~/.openclaw/agents/`

可以定期打成压缩包保存到：

- 加密网盘
- 私有对象存储
- 受控备份盘

## 8. 常见问题

### 8.1 为什么迁过去以后 agent 还在，但不能继续原来的会话

通常是因为你只迁移了 workspace，没有迁移：

- `~/.openclaw/agents/<agentId>/sessions/`

### 8.2 为什么迁过去以后需要重新登录

通常是因为你没有迁移：

- `~/.openclaw/credentials/`

### 8.3 为什么 agent 能启动，但找不到原来的项目

通常是因为：

- workspace 没复制完整
- `openclaw.json` 里的路径还是旧机器路径
- 新机器目录结构不同，但没有做路径修正

### 8.4 是否可以把多个 agent 放在同一个状态目录里共用

不建议手工混用或合并不同 agent 的状态目录。官方文档强调每个 agent 都有独立 workspace 和独立状态数据，混用容易导致会话、认证或路由混乱。

## 9. 推荐的标准迁移模板

如果你想把 OpenClaw 长期当作“养虾系统”来管理，推荐采用以下标准：

1. 每只虾一个独立 workspace
2. workspace 进入私有 Git 仓库
3. `~/.openclaw/` 只做本地状态存储
4. 凭据和 sessions 单独加密备份
5. 新机器统一先恢复 workspace，再恢复状态

## 10. 迁移后验证

迁移完成后，至少检查以下几项：

```powershell
openclaw agents list
openclaw agents list --bindings
```

并逐项确认：

- agent 是否都能列出
- workspace 是否指向正确目录
- 绑定关系是否正常
- 是否能继续使用原有身份和配置
- 是否能访问原有会话

## 11. 一句话建议

最稳的迁移方式是：

- 把每只 agent 的 workspace 当成可版本化资产
- 把 `~/.openclaw/` 当成本地运行状态
- 工作区走 Git
- 凭据和 sessions 走私有备份

这样无论迁移到新电脑还是云服务器，都更稳、更清晰，也更不容易把“虾”养丢。

## 参考资料

- OpenClaw CLI Agents: https://docs.openclaw.ai/cli/agents
- OpenClaw Agent Workspace: https://docs.openclaw.ai/concepts/agent-workspace
- OpenClaw Multi-Agent Routing: https://docs.openclaw.ai/concepts/multi-agent
