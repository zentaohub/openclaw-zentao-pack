# Minimal Features

## 当前精简版保留功能

1. 我的任务查询
2. 企业微信任务消息回调
3. 企业微信通讯录回调识别

## 对应脚本

- `scripts/get_my_tasks.ts`
- `scripts/replies/wecom_task_reply.ts`
- `scripts/callbacks/wecom_callback.ts`
- `scripts/callbacks/wecom_contact_sync.ts`
- `scripts/shared/zentao_client.ts`
- `scripts/shared/wecom_client.ts`

## 测试清单

- `npm run build`
- `node dist/scripts/get_my_tasks.js`
- `node dist/scripts/callbacks/wecom_callback.js --userid admin --data-file tmp-callback-task.json`
- `printf '%s' '{"InfoType":"change_contact","ChangeType":"delete_user","UserID":"demo-user"}' | node dist/scripts/callbacks/wecom_contact_sync.js`

## 下一步新增原则

- 先新增一个模块
- 单独补测试
- 测试通过后再进入下一模块
