# OpenClaw Zentao Pack

这是当前用于 OpenClaw 主会话与企业微信机器人的禅道工作流技能包。

它已经不仅是最小功能集合，当前仓库已包含查询、创建、流转、测试、发布、验收与企微回调相关脚本，并通过统一 Prompt / Agent 规则约束输出格式。

## 当前能力概览

- 查询我的任务
- 处理企业微信任务消息回调
- 识别企业微信通讯录同步回调
- 查询产品、模块、项目、执行、需求、任务、测试、Bug、发布、验收相关数据
- 创建产品、模块、需求、任务、测试用例、测试单、Bug、发布
- 推进任务、需求、Bug、发布、测试单等常见状态流转
- 处理发布关联、执行关联、测试单关联等操作
- 复用共享禅道 / 企微客户端能力
- 企业微信自建应用接收 `.docx` 需求文档并生成测试用例 Excel/XMind

## 企微主动通知规划

当前仓库已补充一套面向“禅道变更 -> 企微自建应用主动通知”的 MVP 文档，适用于以下场景：

- 需求新增、关闭、优先级变化、计划变化
- 高优 Bug 新建、重开、修复、关闭、优先级升级
- 关键任务阻塞、延期、转派、完成

推荐阅读顺序：

- `docs/wecom-zentao/11-notification-rules-mvp.yaml`
  - 规则配置总表
- `docs/wecom-zentao/13-receiver-resolution-spec.md`
  - 接收人如何计算
- `docs/wecom-zentao/12-notification-templates-mvp.yaml`
  - 消息模板定义

推荐实现路径：

1. 业务脚本执行成功后产出标准事件
2. 事件命中通知规则
3. 按接收人解析规则计算 direct / cc
4. 用企微自建应用发送 markdown 消息

通知日志查看入口：

- 总览文档：`docs/overview/通知链路记录.md`
- 明细日志：`tmp/notification-audit/notification-audit.jsonl`
- 查询脚本：`npm run query-notification-audit -- --latest 20`

### 通知链路总览使用手册

#### 1. 规则与模板在哪里看

- 规则：`docs/wecom-zentao/11-notification-rules-mvp.yaml`
- 模板：`docs/wecom-zentao/12-notification-templates-mvp.yaml`
- 接收人解析：`docs/wecom-zentao/13-receiver-resolution-spec.md`

#### 2. 通知执行结果在哪里看

- 面向人看的总览：`docs/overview/通知链路记录.md`
- 面向程序的明细：`tmp/notification-audit/notification-audit.jsonl`
- 最近快照：`tmp/notification-audit/notification-audit.latest.json`

#### 3. 命令行怎么查

```bash
npm run query-notification-audit
npm run query-notification-audit -- --latest 10
npm run query-notification-audit -- --object bug --result failed
npm run query-notification-audit -- --entity 13
```

#### 4. 服务器联调怎么测

推荐优先测 Bug 链路：

```bash
npm run update-bug-status -- --bug 13 --status activate --assigned-to admin --userid admin --comment "服务器联调 activate"
npm run update-bug-status -- --bug 13 --status resolve --resolution fixed --userid admin --comment "服务器联调 resolve"
npm run query-notification-audit -- --latest 5
```

#### 5. 联调重点看什么

- `notification.ok`
- `notification.rule_code`
- `notification.sent_to`
- `notification.skipped_reason`
- `docs/overview/通知链路记录.md`

#### 6. 目前最常见阻塞点

- 企微自建应用可信 IP 未放行
- 目标成员不在应用可见范围
- 禅道对象字段缺失，导致下一步处理人无法正确解析
- 状态值与规则不一致（当前已补齐 `activate/resolve/close` 常见写法）

## 常用命令

- `npm run build`
- `npm run query-my-tasks -- --userid admin`
- `npm run query-my-tasks -- --userid admin`
- `npm run wecom-callback -- --data-file examples/callbacks/tmp-callback-task.json`
- `npm run wecom-contact-sync`
- `npm run query-products`
- `npm run query-projects`
- `npm run query-testcases -- --product 1`
- `npm run query-releases -- --product 1`
- `npm run create-release -- --product 1 --name "示例发布" --date "2026-03-24" --desc "发布说明"`
- `npm run import-tasks-from-excel -- --source-url "https://example.com/tasks.xlsx" --execution 12 --userid admin`
- `npm run import-tasks-from-excel -- --source-file examples/task-import-template.csv --execution 12 --userid admin --dry-run`
- `npm run import-tasks-from-excel -- --source-file examples/task-import-template.xlsx --execution 4 --userid admin`

## 推荐查询入口

- 查询执行：`npm run query-executions -- --project 3`
- 查询测试单：
  - `npm run query-testtasks -- --product 1`
  - `npm run query-testtasks -- --execution 4`
  - `npm run query-testtasks -- --project 3`
- 查询测试准出：
  - `npm run query-test-exit-readiness -- --testtask 1`
  - `npm run query-test-exit-readiness -- --execution 4`
  - `npm run query-test-exit-readiness -- --project 3`
- 查询上线检查：
  - `npm run query-go-live-checklist -- --product 1 --execution 4`
  - `npm run query-go-live-checklist -- --testtask 1`
- 查询验收概览：
  - `npm run query-acceptance-overview -- --product 1 --execution 4`
  - `npm run query-acceptance-overview -- --testtask 1`
  - `npm run query-acceptance-overview -- --execution 4`
- 查询关闭准备度：
  - `npm run query-closure-readiness -- --product 1 --execution 4`
  - `npm run query-closure-readiness -- --testtask 1`
  - `npm run query-closure-readiness -- --execution 4`
- 查询关闭阻塞项：
  - `npm run query-closure-items -- --product 1 --execution 4`
  - `npm run query-closure-items -- --testtask 1`
  - `npm run query-closure-items -- --execution 4`

说明：

- 旧参数写法仍然兼容。
- 现在推荐优先使用 `execution` / `project` / `testtask` 这类更贴近 SOP 的入口。
- `query-test-exit-readiness -- --execution 4` 本质上会先解析该执行对应的测试单，再输出准出结论。
- `query-go-live-checklist`、`query-acceptance-overview`、`query-closure-*` 现在也支持按 `testtask` 或 `execution` 补齐上下文。

## 创建类改进

- `create-release` 现在创建成功后会直接返回创建出的 `release` 对象。
- 不再只返回成功消息而拿不到新建发布详情。
- `import-tasks-from-excel` 支持通过本地文件或 URL 读取 `.xlsx` / `.csv`，按表格行批量创建执行任务。
- 企微回调现支持 URL 或附件两种入口：
- 文本 URL：`导入任务 https://example.com/tasks.xlsx 执行 12`
- 企微附件：上传 Excel 文件，并在消息中补 `执行 12` 之类的上下文
- 示例模板见 `examples/task-import-template.csv`，建议至少包含 `任务名称` 列。
- 默认会按“同一执行下任务名称完全相同”做重复导入保护，命中后跳过；如需强制重复导入，可传 `--allow-duplicates`。
- 企微自建应用现支持 `.docx` 需求文档转测试用例：上传 `.docx` 后发送“生成测试用例并导出excel”或“生成测试用例并导出xmind”。
- 该能力核心代码统一放在 `scripts/requirement_to_testcase/`，规则 prompt 放在 `requirement-to-testcase/prompt.md`。
- 暂时只支持 `.docx` 和直接文本，不支持企微在线文档。

## 需求转测试用例

- 命令行入口：`npm run requirement-to-testcase -- --input-file examples/xxx.docx --format both`
- 纯文本入口：`npm run requirement-to-testcase -- --input-text "这是需求说明" --format excel`
- 企业微信自建应用入口：上传 `.docx` 后发送“生成测试用例”
- 导出目录默认写入：`requirement-to-testcase/output`
- 生成规则严格遵循：`requirement-to-testcase/prompt.md`

## 当前配置优先级

- 优先读取 `OPENCLAW_ZENTAO_CONFIG_PATH`
- 其次读取 `OPENCLAW_CONFIG_PATH`
- 再回退到 `~/.openclaw/private/zentao.config.json`
- 最后回退到 `~/.openclaw/openclaw.json`

说明：

- 这样可以优先使用独立的禅道 / 企微配置，避免误回退到 OpenClaw 主机器人配置。
- 当前服务器已确认存在独立配置文件 `/root/.openclaw/private/zentao.config.json`。

## 配置安全建议

- `config.example.json` 用来保存字段结构和脱敏示例，可以提交到仓库。
- `config.json` 只用于本地临时调试，不要提交到仓库。
- 服务器真实凭据建议统一放在 `/root/.openclaw/private/zentao.config.json`，并通过 `OPENCLAW_ZENTAO_CONFIG_PATH` 显式指向。
- 如果 `config.json`、企业微信 `secret`、禅道账号密码曾经进过 Git 历史，建议立即轮换相关凭据。

## 其他服务器如何配置

- 推荐把仓库代码和真实配置分开管理：代码放项目目录，真实凭据放私有目录。
- 不要把真实 `config.json` 跟着 Git 走，也不要把生产密钥写回 `config.example.json`。
- 最稳方式是所有环境都显式设置 `OPENCLAW_ZENTAO_CONFIG_PATH`，避免依赖当前 Linux 用户的 `homedir()` 回退结果。

推荐目录结构示例：

```text
/srv/openclaw-zentao-pack                # Git 拉取的项目目录
/srv/openclaw-zentao-pack/config.example.json
/etc/openclaw/zentao.config.json         # 或 /root/.openclaw/private/zentao.config.json
```

推荐部署步骤：

```bash
git clone <your-repo-url> /srv/openclaw-zentao-pack
cd /srv/openclaw-zentao-pack
npm install
cp config.example.json /etc/openclaw/zentao.config.json
```

把 `/etc/openclaw/zentao.config.json` 改成真实配置后，执行：

```bash
export OPENCLAW_ZENTAO_CONFIG_PATH=/etc/openclaw/zentao.config.json
npm run build
```

运行脚本时也保持同一个环境变量：

```bash
OPENCLAW_ZENTAO_CONFIG_PATH=/etc/openclaw/zentao.config.json npm run query-products
OPENCLAW_ZENTAO_CONFIG_PATH=/etc/openclaw/zentao.config.json npm run query-my-tasks -- --userid admin
```

如果你使用 systemd、supervisor 或其他托管方式启动服务，也要把环境变量写进服务配置，例如：

```ini
Environment=OPENCLAW_ZENTAO_CONFIG_PATH=/etc/openclaw/zentao.config.json
```

更新代码时建议固定流程：

```bash
cd /srv/openclaw-zentao-pack
git pull
npm install
OPENCLAW_ZENTAO_CONFIG_PATH=/etc/openclaw/zentao.config.json npm run build
```

也可以直接使用仓库内的部署脚本模板：

```bash
chmod +x deploy.example.sh
./deploy.example.sh
```

如果目录或配置路径不同，可以在执行时覆盖默认值：

```bash
REPO_DIR=/home/ubuntu/openclaw-zentao-pack \
OPENCLAW_ZENTAO_CONFIG_PATH=/root/.openclaw/private/zentao.config.json \
./deploy.example.sh
```

如果服务器只保留 OpenClaw 实际运行目录，不单独保留一份源码目录，可以直接在运行目录使用手动更新脚本：

### 服务器更新操作

```bash
chmod +x deploy.server.sh
./deploy.server.sh
```

推荐首次在服务器执行一次权限补充：

```bash
cd /root/.openclaw/workspace/skills/openclaw-zentao-pack
chmod +x deploy.example.sh deploy.server.sh
```

之后每次你本地提交了新代码并 push 到远端仓库后，到服务器执行：

```bash
cd /root/.openclaw/workspace/skills/openclaw-zentao-pack
./deploy.server.sh
```

如果忘了补执行权限，也可以直接用 bash 执行：

```bash
cd /root/.openclaw/workspace/skills/openclaw-zentao-pack
bash deploy.server.sh
```

默认会更新这个目录：

```text
/root/.openclaw/workspace/skills/openclaw-zentao-pack
```

默认会读取这个私有配置：

```text
/root/.openclaw/private/zentao.config.json
```

如果分支或配置路径不同，可以这样执行：

```bash
BRANCH=main \
OPENCLAW_ZENTAO_CONFIG_PATH=/root/.openclaw/private/zentao.config.json \
./deploy.server.sh
```

这个脚本会顺序执行：

```bash
git fetch origin <branch>
git checkout <branch>
git pull --ff-only origin <branch>
npm install
npm run build
```

说明：

- 这样做时通常不需要提交 `dist/`，因为每次更新后都会在目标服务器重新构建。
- 如果你有单独的运行目录和源码目录，真实配置仍然只保留一份，运行前通过环境变量指向它。
- 如果目标服务器不是 `root` 用户执行，请确保该用户对私有配置文件有读取权限。

## 当前已知限制

- 组织用户查询目前能稳定拿到 `userid`、姓名、部门、职务、启用状态。
- 当前服务器所用企微接口返回中，`gender`、`mobile`、`email` 仍为空。
- 这不是展示层漏字段，而是当前 API 原始响应就未返回这些字段。
- 个别查询在没有明确上下文时会自动解析最新测试单，这会提升易用性，但多测试单并存时建议显式传 `--testtask`。

## 说明

- `README.md` 仅做快速入口说明。
- 能力范围、输出规则与推荐模块以 `SKILL.md` 和 `agents/openai.yaml` 为准。
- 集成方式与回调样例见 `docs/integration/WECOM_CALLBACK.md`。
- 企微主动通知方案文档见 `docs/wecom-zentao/README.md` 与 `docs/wecom-zentao/11-13` 系列文档。
