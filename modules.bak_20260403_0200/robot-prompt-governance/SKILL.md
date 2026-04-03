---
name: robot-prompt-governance
description: Standardize how Prompt.json, system prompts, and output wrappers are combined for role-based ZenTao robots.
---

# Robot Prompt Governance Module

## Purpose

Provide a reusable governance layer for role-based robots so they always validate commands through Prompt.json and emit a fixed response format.

## Scope

- role-based command validation
- parameter validation
- skill routing
- reply template rendering
- unified success/failure/no-result wrappers

## Recommended Assets

- `references/robot-prompt-output-governance.md`
- the role routing file such as `Prompt.json`
- a robot system prompt that enforces wrapper-based output

## Recommended Usage

1. Keep Prompt.json focused on business templates and skill mapping.
2. Put global execution rules in the system prompt.
3. Wrap all successful and failed outputs with shared output_spec wrappers.
4. Never let the robot bypass fallback templates.

## Expected Output Shape

- `【角色】`
- `【指令】`
- `【技能】`
- `【结果】`
- `【正文】`
- `【后续动作】` or failure guidance
