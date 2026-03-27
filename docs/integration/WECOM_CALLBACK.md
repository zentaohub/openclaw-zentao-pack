# WeCom Callback Entry

Use this package when the internal WeCom app callback has already been received by the
OpenClaw server and you want to resolve the current sender into a Zentao user and return
that user's task list.

## Command

```powershell
npm run wecom-tasks -- --userid wangwu
```

If your OpenClaw server already receives the raw WeCom callback JSON, use the
dispatcher entry instead:

```powershell
npm run wecom-callback -- --data-file examples/callbacks/tmp-callback-task.json
```

Or pass a normalized callback payload:

```powershell
npm run wecom-tasks -- --data-file examples/callbacks/tmp-callback-task.json
```

Supported payload fields:

- `userid`
- `userId`
- `FromUserName`
- `fromUser`
- `sender.userid`
- `content`
- `text`
- `body.content`

Current intent routing:

- `我的任务`
- `任务列表`
- `查任务`
- `my tasks`

## Config

Fill the Zentao service account in `config.json` based on `config.example.json`.

If you also fill `wecom.corp_id` and `wecom.corp_secret`, the script will:

1. Use the callback sender `userid` to query the WeCom directory user.
2. Sync or match that user into Zentao.
3. Query the matched user's task list.
4. Return `reply_text` for direct WeCom reply.

## Example Payload Files

The repository stores callback samples under:

- `examples/callbacks/tmp-callback-task.json`
- `examples/callbacks/tmp-callback-help.json`

When running commands from the repository root, use these paths directly.

## HAR Finding

The provided Web HAR confirms that the Biz 11.5 web UI exposes the "assigned to me"
task entry at:

```text
/my-work-task-assignedTo.html
```

This route is now recorded in `web_routes.my_task_assigned` for later web-mode fallback
integration if the REST API endpoint differs from the deployment.

## Output

The script prints JSON and includes:

- `matched_user`
- `sync_result`
- `status_counts`
- `tasks`
- `reply_text`
