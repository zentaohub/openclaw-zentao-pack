# 配置字段字典

## 1. 目标

这份文档用于明确 `scheduled-digest.json` 的字段含义、取值范围、默认值和校验规则，便于：

- 产品确认配置能力边界
- 开发实现配置解析与校验
- 运维维护接收人映射

默认加载顺序：

1. `--config`
2. `OPENCLAW_SCHEDULED_DIGEST_CONFIG_PATH`
3. `scripts/scheduled_digest/scheduled-digest.json`
4. `scheduled-digest.json`

## 2. 顶层结构

建议结构：

```json
{
  "enabled": true,
  "timezone": "Asia/Shanghai",
  "schedules": {},
  "strategy": {},
  "riskRules": {},
  "users": []
}
```

## 3. 顶层字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | 否 | `true` | 总开关 |
| `timezone` | string | 否 | `Asia/Shanghai` | 调度与日期计算时区 |
| `schedules` | object | 是 | 无 | 固定时间槽配置 |
| `strategy` | object | 否 | 见下文 | 汇总与发送策略 |
| `riskRules` | object | 否 | 见下文 | 风险阈值配置 |
| `users` | array | 是 | `[]` | 接收人配置列表 |

## 4. `schedules`

建议结构：

```json
{
  "morning": "0 9 * * 1-5",
  "evening": "0 18 * * 1-5"
}
```

字段说明：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `morning` | string | 是 | 无 | 早报 cron 表达式 |
| `evening` | string | 是 | 无 | 晚报 cron 表达式 |

约束：

- 首期建议只支持工作日 cron
- 不建议首期支持用户级单独时间

## 5. `strategy`

建议结构：

```json
{
  "mergeMultiRoles": true,
  "topN": 3,
  "skipWhenEmpty": false,
  "majorRiskImmediate": true,
  "maxSections": 2,
  "maxLinks": 2,
  "titleMaxChars": 22
}
```

字段说明：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `mergeMultiRoles` | boolean | 否 | `true` | 多角色是否合并为一条消息 |
| `topN` | number | 否 | `3` | 单条消息重点条数上限 |
| `skipWhenEmpty` | boolean | 否 | `false` | 没有待办和风险时是否静默 |
| `majorRiskImmediate` | boolean | 否 | `true` | 是否允许 P0 风险额外即时提醒 |
| `maxSections` | number | 否 | `2` | 合并消息最大分区数 |
| `maxLinks` | number | 否 | `2` | 单消息最多入口数 |
| `titleMaxChars` | number | 否 | `22` | 标题截断长度 |

推荐校验：

- `topN` 取值建议 `1-5`
- `maxSections` 取值建议 `1-3`
- `maxLinks` 取值建议 `1-3`

## 6. `riskRules`

建议结构：

```json
{
  "highBug": {
    "p1Hours": 24,
    "p2Hours": 72
  },
  "bug": {
    "overdueDays": 3
  },
  "task": {
    "blockedOverdueAsP0": true
  },
  "project": {
    "delayEscalationDays": [1, 3, 7]
  },
  "immediateCooldownHours": 8
}
```

字段说明：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `highBug.p1Hours` | number | 否 | `24` | P1/S1 Bug 超期阈值 |
| `highBug.p2Hours` | number | 否 | `72` | P2/S2 Bug 超期阈值 |
| `bug.overdueDays` | number | 否 | `3` | 普通未关闭 Bug 的延期提醒阈值 |
| `task.blockedOverdueAsP0` | boolean | 否 | `true` | blocked 且超期任务是否升级为 P0 |
| `project.delayEscalationDays` | number[] | 否 | `[1, 3, 7]` | 项目延期升级提醒天数 |
| `immediateCooldownHours` | number | 否 | `8` | 同一风险即时提醒冷却时间 |

## 7. `users`

建议结构：

```json
[
  {
    "enabled": true,
    "userid": "zhangsan",
    "name": "张三",
    "zentaoAccount": "zhangsan",
    "roles": ["dev"],
    "scope": {
      "products": [1],
      "projects": [3],
      "executions": [12]
    },
    "preferences": {
      "receiveMorning": true,
      "receiveEvening": true,
      "receiveImmediate": true
    }
  }
]
```

### 7.1 用户字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | 否 | `true` | 当前用户是否参与推送 |
| `userid` | string | 是 | 无 | 企业微信 userid |
| `name` | string | 否 | 空 | 展示名，仅用于日志或管理台 |
| `zentaoAccount` | string | 是 | 无 | 禅道账号 |
| `roles` | string[] | 是 | 无 | 用户角色列表 |
| `scope` | object | 否 | 空对象 | 关注范围 |
| `preferences` | object | 否 | 见下文 | 用户接收偏好 |

### 7.2 `roles`

允许值：

- `pm`
- `dev`
- `qa`
- `manager`

校验建议：

- 至少有 1 个角色
- 不允许未知角色静默通过

### 7.3 `scope`

建议结构：

```json
{
  "products": [1, 2],
  "projects": [3],
  "executions": [12, 13]
}
```

字段说明：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `products` | number[] | 否 | `[]` | 产品范围 |
| `projects` | number[] | 否 | `[]` | 项目范围 |
| `executions` | number[] | 否 | `[]` | 执行范围 |

约束建议：

- `manager` 至少应配置 `projects` 或 `executions`
- `pm` 建议配置 `products`
- `dev` / `qa` 可不配置，允许使用个人查询兜底

### 7.4 `preferences`

建议结构：

```json
{
  "receiveMorning": true,
  "receiveEvening": true,
  "receiveImmediate": true
}
```

字段说明：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `receiveMorning` | boolean | 否 | `true` | 是否接收 09:00 早报 |
| `receiveEvening` | boolean | 否 | `true` | 是否接收 18:00 晚报 |
| `receiveImmediate` | boolean | 否 | `true` | 是否接收重大风险即时提醒 |

## 8. 推荐校验规则

启动或加载配置时建议检查：

1. cron 表达式是否合法
2. `userid` 是否重复
3. `zentaoAccount` 是否为空
4. `roles` 是否在允许列表内
5. `projects/products/executions` 是否为正整数数组
6. `topN`、`maxSections` 等是否在合理范围内

## 9. 建议错误码

| 错误码 | 说明 |
| --- | --- |
| `config.schedule.invalid` | 调度配置非法 |
| `config.user.duplicate_userid` | 存在重复 userid |
| `config.user.missing_zentao_account` | 缺少禅道账号 |
| `config.user.invalid_role` | 角色值非法 |
| `config.scope.invalid_id` | scope 中存在非法 id |
| `config.strategy.invalid_range` | 策略字段超出范围 |

## 10. 配置维护建议

- 代码仓库中保留 `scheduled-digest.example.json`
- 真实环境配置放私有目录
- 变更配置时需要有一份接收人维护说明
- 新增用户前优先验证 userid 与 zentaoAccount 映射是否正确
