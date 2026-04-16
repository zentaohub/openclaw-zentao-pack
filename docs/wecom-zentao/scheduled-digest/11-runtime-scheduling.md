# 定时上线说明

## 1. 目标

本文用于把定时摘要从“可手工执行”推进到“可被服务器定时器稳定执行”。

适用方式：

- `crontab`
- 其他托管器（如 `systemd timer` / `supervisor`）参考同样的命令入口

## 2. 当前统一入口

手工执行入口：

```bash
npm run run-scheduled-digest -- --timeslot morning
npm run run-scheduled-digest -- --timeslot evening
```

定时包装脚本：

```bash
bash scripts/scheduled_digest/run_scheduled_digest_cron.sh morning
bash scripts/scheduled_digest/run_scheduled_digest_cron.sh evening
```

脚本职责：

- 固定切到仓库目录
- 注入 `OPENCLAW_SCHEDULED_DIGEST_CONFIG_PATH`
- 统一把执行日志落到 `tmp/scheduled-digest-cron/`
- 保持实际发送逻辑仍由 `run_scheduled_digest.ts` 负责

## 3. 推荐 crontab

示例文件：

- `scripts/scheduled_digest/scheduled-digest.crontab.example`

推荐计划：

- 工作日 `09:00` 发送早报
- 工作日 `18:00` 发送晚报

核心配置示例：

```cron
0 9 * * 1-5 cd /srv/openclaw-zentao-pack && bash scripts/scheduled_digest/run_scheduled_digest_cron.sh morning
0 18 * * 1-5 cd /srv/openclaw-zentao-pack && bash scripts/scheduled_digest/run_scheduled_digest_cron.sh evening
```

## 4. 环境变量

建议在 crontab 或托管器里显式配置：

- `REPO_DIR`
- `OPENCLAW_ZENTAO_CONFIG_PATH`
- `OPENCLAW_SCHEDULED_DIGEST_CONFIG_PATH`
- `SCHEDULED_DIGEST_LOG_DIR`

最小必需条件：

- 仓库目录存在
- 禅道 / 企微配置文件可读取
- `scripts/scheduled_digest/scheduled-digest.json` 已配置真实接收人

## 5. 日志与审计

运行日志：

- `tmp/scheduled-digest-cron/`

发送审计：

- `tmp/scheduled-digest-audit/scheduled-digest-audit.jsonl`
- `tmp/scheduled-digest-audit/scheduled-digest-audit.latest.json`
- `tmp/scheduled-digest-audit/定时摘要推送记录.md`

建议排查顺序：

1. 先看 cron 日志里命令是否真正启动
2. 再看审计文件里是否生成了成功 / 失败记录
3. 最后看企微返回码与具体用户是否有效

## 6. 当前试点用户

当前仓库内真实试点配置：

- 研发：`lengleng`
- 测试：`zqq`
- 管理：`LengLeng`
- 产品：`lsym000002`

注意：

- `xianmin` 当前已验证不是有效企微 userid，不建议继续用于发送配置

## 7. 上线前检查

- `npm run build` 通过
- 4 类角色至少各有 1 个真实接收人
- 先做一次 `--dry-run`
- 再按角色分别做一次 `--force` 实发
- 确认企微自建应用可向对应 userid 成功投递
- 确认服务器时区与预期一致

## 8. 回滚方式

最快回滚：

1. 注释掉 crontab 两条任务
2. 或把 `scheduled-digest.json` 顶层 `enabled` 改为 `false`

这样可以保留代码和配置，但暂停实际发送
