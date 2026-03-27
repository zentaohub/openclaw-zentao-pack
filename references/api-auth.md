# API 认证

## 适用范围

本文档记录了 `openclaw-zentao` 技能当前 TypeScript 实现阶段的认证假设，目标环境为禅道企业版 `biz11.5`，地址为 `http://zentao.lsym.cn/`。

## 默认假设

- 基础地址：`http://zentao.lsym.cn/`
- 凭证通过环境变量提供：
  - `ZENTAO_BASE_URL`
  - `ZENTAO_ACCOUNT`
  - `ZENTAO_PASSWORD`
- 客户端使用 TypeScript 封装的持久化会话缓存。
- 会话数据缓存到 `%TEMP%\openclaw-zentao-session.json`。

## 接入真实环境前需要确认

由于禅道 API 会因版本和部署配置不同而变化，在将该技能接入真实 `biz11.5` 环境之前，需要确认以下内容：

1. 登录接口的准确路径
2. 认证是使用 cookie、token 交换，还是两者结合
3. API 要求使用 account 还是 email 作为用户名字段
4. 是否存在 CSRF 或会话初始化要求
5. 登出与会话失效的处理方式

## 建议的验证方式

先执行一个最小登录测试，并记录以下信息：

- 请求 URL
- 请求体字段
- 响应状态码
- 响应体字段
- 服务端下发的 session cookie

若确认真实环境与当前假设存在差异，应在此文档中补充记录，以便封装脚本持续兼容当前版本。

## 错误处理预期

- 遇到 `401` 或版本相关的认证失败时，应触发一次重新登录重试。
- 网络错误应附带目标 URL 和异常信息一并返回。
- 凭证为空时应在发送请求前快速失败。
