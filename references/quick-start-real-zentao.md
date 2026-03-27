# 快速接入真实禅道环境指南

本文档用于指导你将当前项目从“本地原型”快速接入到真实可用的禅道环境。建议按照本文顺序执行，这样可以尽早发现认证、字段或接口路径上的差异。

## 适用场景

当你准备将本项目连接到实际的禅道企业版环境，并开始验证登录、创建 Bug、更新任务状态或查询进度时，可以直接按照这份指南操作。

## 接入前准备

开始之前，请先确认以下信息已经拿到：

- 禅道访问地址
- 可用的测试账号
- 测试账号密码
- 至少一个可用于联调的产品 ID
- 至少一个项目或执行 ID
- 至少一个可测试的任务 ID

建议不要一上来就在生产环境做验证，优先使用测试环境、预发布环境或可回滚的数据空间。

## 第一步：配置环境变量

在 PowerShell 中先设置环境变量：

```powershell
$env:ZENTAO_BASE_URL = "http://你的禅道地址"
$env:ZENTAO_ACCOUNT = "你的账号"
$env:ZENTAO_PASSWORD = "你的密码"
```

如果只是当前终端会话内临时使用，这样设置即可。如果需要长期使用，可以再考虑写入系统环境变量或单独的启动脚本。

## 第二步：验证基础连通性

接入真实环境前，先确认这几个基础问题：

- 当前机器能否访问禅道地址
- 禅道地址是否需要 VPN、代理或特定网络环境
- 是否存在 HTTPS 证书限制
- 是否存在统一登录、网关跳转或额外认证层

如果这里没有打通，后面的脚本联调通常都会失败。

## 第三步：先只验证登录

先不要急着创建 Bug 或改任务，第一步一定是只做登录验证。

执行：

```powershell
npm run login
```

你需要重点确认以下内容：

- 脚本是否能返回成功结果
- 实际登录接口路径是否正确
- 服务端是否返回 cookie、token，或两者都有
- 当前代码中的登录请求体字段是否与真实接口一致

如果登录失败，优先检查：

1. `ZENTAO_BASE_URL` 是否正确
2. 账号密码是否正确
3. 登录接口是否真的是 `/api.php/v1/tokens`
4. 用户名字段到底应为 `account` 还是其他名称
5. 是否需要额外 CSRF、session 初始化或跳转处理

如果发现认证方式与当前实现不一致，请先更新：

- [api-auth.md](E:/AI/openclaw/openclaw-zentao/references/api-auth.md)
- [zentao_client.ts](E:/AI/openclaw/openclaw-zentao/scripts/zentao_client.ts)

## 第四步：确认真实接口路径

当前项目中的部分接口还是“待确认占位实现”，因此接入真实环境时，必须逐项核对：

- Bug 创建接口路径
- 任务状态更新接口路径
- 项目进度查询接口路径
- 执行进度查询接口路径
- 任务进度查询接口路径

建议做法：

1. 通过禅道官方接口文档或实际抓包确认路径
2. 记录请求方法是 `GET`、`POST` 还是其他
3. 确认请求体是 JSON、表单还是其他结构
4. 把确认后的结果更新进代码和参考文档

## 第五步：用最小数据验证创建 Bug

登录确认后，再开始验证 Bug 创建。

建议先准备一条最简单的测试数据，只填最小必填字段，避免因为非关键字段干扰排查。

示例：

```powershell
npm run create-bug -- `
  --product 1 `
  --project 2 `
  --title "联调测试 Bug" `
  --severity 2 `
  --assigned-to admin `
  --steps "用于验证 API 接入是否成功"
```

这里要重点确认：

- `product` 是否必须
- `project` 和 `execution` 是否必须二选一
- `severity` 的真实取值范围
- `type` 的默认值 `codeerror` 是否被真实环境接受
- `assignedTo` 是否必须传账号名而不是显示名
- `steps` 是否要求 HTML 格式

如果创建失败，请把真实返回中的字段错误或校验错误补充到：

- [bug-fields.md](E:/AI/openclaw/openclaw-zentao/references/bug-fields.md)

## 第六步：验证任务状态流转

任务状态更新最容易出问题，因为很多禅道部署对状态流转限制比较严格。

建议先选择一条测试任务，并按最保守路径验证：

1. `wait -> doing`
2. `doing -> done`
3. `done -> closed`

示例：

```powershell
npm run update-task-status -- `
  --task-id 123 `
  --status doing `
  --comment "联调测试开始处理" `
  --consumed-hours 1
```

需要重点确认：

- 当前部署支持哪些状态
- 不同状态流转是否对应不同接口
- 完成任务时是否必须填写消耗工时
- 关闭、暂停、取消是否要求额外原因字段
- 是否存在不能跨状态直接跳转的限制

确认后建议同步更新：

- [task-status-workflow.md](E:/AI/openclaw/openclaw-zentao/references/task-status-workflow.md)
- [update_task_status.ts](E:/AI/openclaw/openclaw-zentao/scripts/update_task_status.ts)

## 第七步：验证进度查询

进度查询建议从执行级开始，因为它通常比项目级更直观，也更容易核对结果。

示例：

```powershell
npm run get-progress -- `
  --entity-type execution `
  --entity-id 45 `
  --include-children
```

需要重点确认：

- `progress` 或 `percent` 字段是否真实存在
- 真实返回中哪个字段代表完成度
- 是否还需要提取总任务数、已完成数、剩余数
- `include_children` 是否会影响返回结构
- 项目进度是否来自项目自身字段，还是需要对子任务/子执行自行汇总

如果发现当前摘要字段不够用，应同时更新：

- [progress-query.md](E:/AI/openclaw/openclaw-zentao/references/progress-query.md)
- [get_progress.ts](E:/AI/openclaw/openclaw-zentao/scripts/get_progress.ts)

## 推荐联调顺序

为了减少排查成本，建议固定使用下面这个顺序：

1. 验证网络和地址可访问
2. 验证登录
3. 验证 Bug 创建
4. 验证任务状态更新
5. 验证进度查询
6. 补充字段、状态和值域文档
7. 再考虑接入自动化或 agent 工作流

## 接入完成后的最小收口动作

当你完成第一轮联调后，建议至少做这几件事：

- 把真实接口路径写回代码
- 把真实字段要求写入参考文档
- 保留一组可重复使用的测试命令
- 记录常见错误返回和处理方式
- 明确哪些能力已经可用于生产，哪些仍是待验证状态

## 常见问题

### 1. 登录成功，但后续接口仍然返回未认证

这通常说明真实环境可能不是单纯 cookie 认证，或者 token 需要放到请求头中。此时应重点检查登录返回体和后续接口的鉴权要求。

### 2. Bug 创建总是提示字段错误

这通常不是脚本逻辑错误，而是当前部署的字段约束与默认假设不一致，例如：

- `severity` 枚举值不同
- `type` 枚举值不同
- 必填字段比当前封装更多
- `steps` 需要 HTML

### 3. 状态值明明存在，但任务仍不能流转

这通常说明“状态值合法”不等于“状态迁移合法”。需要进一步核对从当前状态到目标状态是否允许直接变更。

### 4. 查询结果返回成功，但没有进度字段

这通常说明真实接口并不直接返回 `progress` 或 `percent`，而是要从其他字段中换算。此时应调整摘要逻辑，而不是只改文案。

## 建议补充的后续工作

如果准备长期维护这个项目，建议在真实接入完成后继续补充：

- 接口示例响应
- 典型错误码说明
- 字段值枚举表
- 本地调试记录
- 自动化测试脚本
