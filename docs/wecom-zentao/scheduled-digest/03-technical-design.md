# 技术设计

## 1. 设计目标

在不改变现有“事件通知”主链路的前提下，新增一层“定时汇总推送”能力。

实现目标：

- 复用现有企微自建应用发送能力
- 复用现有禅道查询脚本与数据视图
- 统一配置用户角色、账号映射、关注范围
- 输出简洁摘要与风险提醒

## 2. 总体架构

建议新增五个逻辑模块：

1. `schedule trigger`
2. `receiver resolver`
3. `digest collector`
4. `message renderer`
5. `delivery audit`

流程：

`cron -> 读取配置 -> 计算本次时间槽(09:00/18:00) -> 按用户汇总角色 -> 拉取数据 -> 识别风险 -> 渲染短消息 -> 企微发送 -> 写审计日志`

## 3. 调度设计

推荐调度方式：

- 工作日 `09:00`
- 工作日 `18:00`
- 时区固定 `Asia/Shanghai`

建议只保留两个统一任务：

- `scheduled_digest_morning`
- `scheduled_digest_evening`

不要给每个用户单独建立 cron。

原因：

- 便于统一治理
- 便于做批量重试
- 便于统计整体送达率

## 4. 接收人解析

## 4.1 输入信息

每个接收人至少要有：

- `wecom userid`
- `zentao account`
- `roles`
- `scope`

## 4.2 角色

首期角色固定为：

- `pm`
- `dev`
- `qa`
- `manager`

## 4.3 关注范围

关注范围建议支持：

- 产品 `products`
- 项目 `projects`
- 执行 `executions`

如果用户只有个人角色且未配置范围，可优先用“我的任务 / 我的 Bug / 我的需求”查询兜底。

## 4.4 多角色合并

同一用户拥有多个角色时：

- 先分别采集数据
- 再聚合成一个统一消息对象
- 最终只发送一条消息

建议聚合结构：

```json
{
  "userid": "zhangsan",
  "timeslot": "morning",
  "roles": ["dev", "manager"],
  "summary": {
    "todo": [],
    "risk": [],
    "links": []
  }
}
```

## 5. 数据采集设计

## 5.1 研发

优先复用：

- `query-my-tasks`
- `query-my-bugs`

## 5.2 产品

优先复用：

- `query-my-stories`
- `query-product-stories`
- `query-product-overview`

## 5.3 测试

优先复用：

- `query-my-bugs`
- `query-regression-bugs`
- `query-test-exit-readiness`
- `query-testtask-detail`

## 5.4 管理

优先复用：

- `query-delivery-overview`
- `query-acceptance-overview`
- `query-closure-readiness`
- `query-closure-items`
- `query-executions`

## 5.5 数据加工原则

原始查询结果不直接发给用户，需要二次加工：

- 统一数字口径
- 提取关键风险
- 标题截断
- 重复事项去重
- 产出 `top3` 重点

## 6. 风险判定引擎

建议在汇总层引入统一规则，而不是散落在模板里临时判断。

输出建议统一结构：

```json
{
  "level": "P0",
  "type": "bug_overdue",
  "objectType": "bug",
  "objectId": 542,
  "title": "登录失败",
  "message": "Bug #542 P1 已超期 2 天",
  "detailLink": "/bug/542"
}
```

作用：

- 便于按风险等级排序
- 便于控制是否即时提醒
- 便于后续统计“哪类风险最常发生”

## 7. 消息渲染设计

## 7.1 输出结构

每条消息建议固定结构：

1. 标题
2. 总览数字
3. 重点列表
4. 查看入口

## 7.2 长度控制

渲染器必须做以下控制：

- 最多展示 3 条重点
- 重点标题过长自动截断
- 超过 3 条时补“另有 N 项”
- 不拼接大段正文

## 7.3 空结果策略

建议首期不静默：

- 即使没有风险，也发送短消息
- 告诉用户“当前无高优风险”

原因：

- 用户能确认系统正常工作
- 避免“没收到消息到底是没事还是失败”

## 8. 发送设计

发送通道：

- 企业微信自建应用私信

首期不建议：

- 群推送
- 多通道混发

原因：

- 私信更精准
- 角色化内容天然更适合个人视图

## 9. 审计与重试

每次发送建议记录：

- 时间槽
- 用户
- 角色集合
- 命中风险数量
- 发送内容摘要
- 企微返回值
- 是否成功
- 失败原因

去重键建议为：

- `date + timeslot + userid`

重试建议：

- 单用户失败最多重试 2 到 3 次
- 重试只补发失败用户，不重跑全量

## 10. 配置设计

建议新增独立配置文件，例如：

- `scheduled-digest.json`

结构建议：

```json
{
  "enabled": true,
  "timezone": "Asia/Shanghai",
  "schedules": {
    "morning": "0 9 * * 1-5",
    "evening": "0 18 * * 1-5"
  },
  "strategy": {
    "mergeMultiRoles": true,
    "topN": 3,
    "skipWhenEmpty": false,
    "majorRiskImmediate": true
  },
  "users": [
    {
      "userid": "zhangsan",
      "zentaoAccount": "zhangsan",
      "roles": ["dev"],
      "scope": {
        "products": [1],
        "projects": [3],
        "executions": [12]
      }
    }
  ]
}
```

## 11. 异常处理

## 11.1 用户映射缺失

- 跳过发送
- 写审计日志
- 记录 `receiver_mapping_missing`

## 11.2 禅道查询失败

- 当前用户本次汇总失败
- 不影响其他用户
- 日志中记录失败脚本与参数

## 11.3 企微发送失败

- 不回滚汇总结果
- 重试当前用户
- 写失败明细

## 11.4 部分角色失败

例如同一用户的研发数据成功、管理数据失败时：

- 允许降级发部分成功内容
- 但消息中要避免暴露内部错误细节

## 12. 与现有链路关系

这套能力是“定时汇总”，不是替代现有事件通知。

建议关系如下：

- 事件通知：处理单次变更、下一步动作提醒
- 定时汇总：处理固定时点、角色化概览与风险收口

两者并行存在，但应共用：

- 企微发送客户端
- 用户映射
- 通知审计能力
- 风险判定基础能力
