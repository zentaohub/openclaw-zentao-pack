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

## 常用命令

- `npm run build`
- `npm run get-my-tasks -- --userid admin`
- `npm run wecom-tasks -- --userid admin`
- `npm run wecom-callback -- --data-file examples/callbacks/tmp-callback-task.json`
- `npm run wecom-contact-sync`
- `npm run query-products`
- `npm run query-projects`
- `npm run query-testcases -- --product 1`
- `npm run query-releases -- --product 1`
- `npm run create-release -- --product 1 --name "示例发布" --date "2026-03-24" --desc "发布说明"`

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
OPENCLAW_ZENTAO_CONFIG_PATH=/etc/openclaw/zentao.config.json npm run get-my-tasks -- --userid admin
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
