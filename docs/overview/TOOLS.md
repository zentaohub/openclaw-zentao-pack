# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## 企业微信 API

- **Corp ID:** wwdc6f197471cdf631
- **Secret:** -p8djXgPghzWsYhU9nZPCNB46_Gj0CyDyT24h2eX10A

## 禅道 API

- **API 地址：** http://1.14.73.166/
- **用户名：** admin
- **密码：** Luck@1111
- **当前任务查询 Skill：** `/root/.openclaw/workspace/skills/openclaw-zentao-ts`
- **登录方式：** `GET /user-login.html` + `GET /user-refreshRandom.html` + `POST /user-login.html`（web-ajax）

## 禅道用户映射（企业微信 → 禅道）

| 企业微信 UserID | 禅道账号 | 说明 |
|:---|:---|:---|
| admin | admin | 已验证可直接查询“我的任务” |
| LengLeng | minmin | 管理员 |
| (待添加) | (待添加) | 按实际添加 |

> 💡 添加新用户：在企业微信查看用户 UserID，在禅道找到对应账号，添加到此表
>
> ⚠️ 当前服务器调用企业微信 `user.get` 返回 `60020 not allow to access from your ip`。在企业微信接口 IP 白名单放行 `1.14.73.166` 前，优先依赖这里的显式映射或“企微 UserID = 禅道账号”同名规则。
