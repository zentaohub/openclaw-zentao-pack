---
name: robot-prompt-governance
description: 机器人 Prompt 治理模块，用于统一 Prompt.json、系统提示和输出包装规则。
---

# 机器人 Prompt 治理模块

## 目的

提供一层可复用的治理能力，确保面向角色的禅道机器人始终先经过 Prompt.json 校验，再输出固定格式的结果。

## 范围

- 基于角色的命令校验
- 参数校验
- 技能路由
- 回复模板渲染
- 成功 / 失败 / 无结果统一包装

## 推荐资产

- `references/robot-prompt-output-governance.md`
- 对应角色的路由文件，例如 `Prompt.json`
- 能强制统一包装输出的机器人 system prompt

## 推荐用法

1. 让 `Prompt.json` 主要负责业务模板和技能映射。
2. 把全局执行规则放进 system prompt。
3. 所有成功和失败输出统一走共享 `output_spec` 包装。
4. 不要让机器人绕过 fallback templates。

## 期望输出结构

- `【角色】`
- `【指令】`
- `【技能】`
- `【结果】`
- `【正文】`
- `【后续动作】` 或失败指引
