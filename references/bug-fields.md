# Bug 字段说明

## 最小标准字段

CLI 封装会将用户输入映射为以下标准化 Bug 请求体：

- `product`
- `project`
- `execution`
- `title`
- `severity`
- `type`
- `assignedTo`
- `steps`

## 字段映射说明

- `product`：禅道中的产品数字 ID
- `project`：当 Bug 隶属于某个项目时，填写对应项目数字 ID
- `execution`：当工作流以执行或 Sprint 为范围时，填写对应执行数字 ID
- `title`：简短的一行标题摘要
- `severity`：API 可接受的标准化严重程度字符串或整数值
- `type`：当前部署所支持的 Bug 分类
- `assignedTo`：禅道账号名，而不是显示名称
- `steps`：复现步骤，可根据 API 要求使用纯文本或 HTML

## biz11.5 待确认项

需要确认真实环境中的 Bug 创建接口，并在本文档补充以下信息：

1. 准确的接口路径
2. 必填字段和可选字段的区分
3. `severity` 和 `type` 的可用取值
4. `openedBuild`、`deadline` 或自定义字段是否为必填

## 提示与补问建议

当用户要求创建 Bug 但缺少核心字段时，只补问缺失值即可。对于 `product`、`project` 和 `execution`，优先使用 ID 而不是名称，除非系统同时提供了名称到 ID 的查询能力。
