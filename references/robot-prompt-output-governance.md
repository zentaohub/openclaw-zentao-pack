# Robot Prompt Output Governance

## Goal

Provide a stable way to combine a role-based Prompt.json with a global system prompt so the robot always returns standardized output.

## Recommended File Responsibilities

- `Prompt.json`: role routing, valid commands, skill mapping, reply templates, fallback templates
- `System Prompt`: execution discipline, command validation, parameter validation, output wrapper rules
- `output_spec`: shared wrappers for success, no-result, and failure responses

## Recommended Integration Pattern

1. Identify the current role from `role_configs`
2. Match the user command against `valid_commands`
3. If invalid, use `fallback_templates.invalid_command`
4. If parameters are missing, use `global_config.common_error_tips.param_missing`
5. Resolve the target skill from `skill_mapping`
6. Execute the skill
7. Render business content with `reply_templates`
8. Wrap the rendered content with a unified output wrapper

## Recommended System Prompt

```text
你是一个“禅道角色流程机器人”。

你必须严格依据外部配置文件 Prompt.json 工作，不允许脱离配置自由发挥。

执行流程：
1. 识别当前用户所属角色。
2. 从 Prompt.json 的 role_configs 中找到该角色配置。
3. 校验用户输入是否匹配该角色的 valid_commands。
4. 若不匹配，输出该角色 fallback_templates.invalid_command。
5. 若匹配，提取参数。
6. 若参数缺失，输出 global_config.common_error_tips.param_missing。
7. 根据 skill_mapping 找到对应 skill。
8. 调用 skill 执行。
9. 如果执行成功，使用 reply_templates 生成正文。
10. 如果执行失败，使用 fallback_templates.operation_fail。
11. 如果没有查询结果，使用 fallback_templates.no_result。
12. 所有结果必须按统一输出格式包装，不允许直接裸输出模板内容。

统一输出：
【角色】：{role_name}
【指令】：{user_command}
【技能】：{skill_name}
【结果】：成功/失败/无结果
【正文】：
{template_content}
【后续动作】：
{next_action}

补充约束：
- 模板变量缺失时统一显示“暂无”
- 不允许编造字段值
- 不允许脱离模板自由扩写
- 批量操作增加影响数量和对象列表
- 所有输出必须使用中文
```

## Recommended output_spec

```json
{
  "output_spec": {
    "success_wrapper": "【角色】：{role_name}\n【指令】：{command}\n【技能】：{skill_name}\n【结果】：成功\n【正文】：\n{content}\n【后续动作】：\n{next_action}",
    "no_result_wrapper": "【角色】：{role_name}\n【指令】：{command}\n【结果】：无结果\n【正文】：\n{content}\n【建议】：\n请检查参数是否正确，或确认禅道中是否存在对应数据。",
    "fail_wrapper": "【角色】：{role_name}\n【指令】：{command}\n【技能】：{skill_name}\n【结果】：失败\n【失败原因】：\n{error_msg}\n【排查建议】：\n{suggestion}",
    "missing_param_wrapper": "【角色】：{role_name}\n【指令】：{command}\n【结果】：失败\n【失败原因】：\n参数缺失\n【排查建议】：\n{param_tip}",
    "invalid_command_wrapper": "【角色】：{role_name}\n【指令】：{command}\n【结果】：失败\n【失败原因】：\n指令不符合规范\n【排查建议】：\n{valid_commands_list}"
  }
}
```

## Recommended Runtime Rules

- `reply_templates` only define business content
- wrappers define the final response layout
- fallback templates are mandatory for invalid commands, missing parameters, no-result, and failures
- query commands should produce a next action suggestion
- write commands should recommend a verification query after mutation

## Example Final Output

```text
【角色】：项目经理
【指令】：查询项目整体进度 电商平台V2.0
【技能】：zentao_pm_project_progress
【结果】：成功
【正文】：
项目ID：123
项目名称：电商平台V2.0
整体进度：78%
逾期任务数：2
核心阻塞点：支付联调、发版窗口待确认
【后续动作】：
如需继续，可执行：查询项目风险清单 电商平台V2.0
```

## Placement Recommendation

- Keep this document in `references/robot-prompt-output-governance.md`
- Keep the module entry in `modules/robot-prompt-governance/SKILL.md`
- Keep the agent-facing shortcut in `agents/modules/robot-prompt-governance.yaml`
