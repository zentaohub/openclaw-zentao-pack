# Maintainers

这个目录放“维护技能包的 agent”，不放技能包本体。

## 约定

- `agents/openai.yaml`
  只描述正式对外使用的 skill agent。
- `agents/maintainers/*`
  放内部维护角色，例如负责持续整理、审查、重构技能包的 agent。
- 维护者可以提出或推动修改：
  - `SKILL.md`
  - `agents/openai.yaml`
  - `scripts/`
  - `references/`
  - `assets/`
- 维护者自己的状态文件、人格设定、工作记忆，不应再放进技能包主目录。

## 当前维护者

- `zentao-skill-shrimp/`
  禅道技能包维护虾，负责控制 skill agent 持续完善这个技能包。
