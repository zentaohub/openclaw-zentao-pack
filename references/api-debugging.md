# API 调试说明

使用 `scripts/tests/debug_api.ts` 进行统一调试。

## 目标

- 从 `config.json` 读取凭据和测试列表
- 自动逐条执行 API 检查
- 汇总每一条测试的耗时、结果和错误信息
- 在不访问真实接口时使用 `--validate-only` 验证配置结构
- 发布到 ClawHub 前可使用 `npm run validate` 作为最小自检

## 支持动作

- `login`
- `create_bug`
- `update_task_status`
- `get_progress`

## 建议顺序

1. 先跑 `login`
2. 再跑只读类接口，如 `get_progress`
3. 最后再跑会写数据的接口，如 `create_bug`、`update_task_status`

## 输出

脚本会输出 JSON，总结：

- `passed`
- `failed`
- `overall_ok`
- `results`

失败项会附带错误类型，以及在 HTTP 错误场景下返回状态码和响应文本片段。
