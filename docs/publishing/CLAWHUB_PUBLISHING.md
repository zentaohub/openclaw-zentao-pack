# ClawHub 发布清单

本文档用于在上传当前 skill 到 ClawHub 前做最后检查，避免把本地可运行仓库直接当成可发布产物上传。

## 发布前必查

1. `SKILL.md` 存在且包含 frontmatter：
   - `name`
   - `description`
2. `agents/openai.yaml` 已与当前实现一致：
   - 展示名称准确
   - 简介准确
   - `default_prompt` 不再引用已删除的 Python 脚本
3. 仓库中不包含敏感信息：
   - 不上传真实 `config.json`
   - 不上传真实账号、密码、Token
   - 不上传本地会话缓存
4. 文档中的命令与实际脚本一致：
   - 使用 TypeScript / Node.js 命令
   - 不再引用 `.py` 脚本
5. 本地最小验证已通过：
   - `npm install`
   - `npm run build`
   - `npm run validate`

## 推荐上传内容

- `SKILL.md`
- `agents/openai.yaml`
- `scripts/`
- `references/`
- `assets/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `README.md`

## 不应上传的内容

- `config.json`
- `node_modules/`
- `dist/`
- 临时缓存和会话文件
- 任何真实环境账号和密码

## 建议上传前自检命令

```powershell
npm install
npm run build
npm run validate
rg -n "debug_api\\.py|login\\.py|create_bug\\.py|update_task_status\\.py|get_progress\\.py" .
```

如果最后一条命令没有结果，说明仓库中已经没有旧 Python 入口引用。

## 当前 skill 的发布说明

这个仓库的 skill 入口是 [SKILL.md](/D:/xianmin/code/AI/openclaw-zentao/SKILL.md)，运行依赖是 Node.js。实际联调时推荐使用环境变量或本地私有 `config.json` 提供凭据，而不是把真实配置纳入发布包。
