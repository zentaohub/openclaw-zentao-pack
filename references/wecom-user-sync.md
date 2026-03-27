# WeCom User Sync

This package now supports syncing WeCom directory users into Zentao in three modes.

## 1. Sync one user from WeCom

```powershell
npm run sync-user -- --userid wangwu --from-wecom
```

## 2. Sync selected departments

```powershell
npm run sync-user -- --department 2
npm run sync-user -- --department 2,8 --fetch-child
```

- `--department`: comma-separated WeCom department ids
- `--fetch-child`: include child departments, enabled by default
- `--include-inactive`: also sync disabled or inactive WeCom users

## 3. Sync the whole org tree

```powershell
npm run sync-user -- --all-org
```

This starts from `wecom.root_department_id` in `config.json`. The default is `1`.

## 4. Inspect departments before syncing

```powershell
npm run sync-user -- --list-departments
```

You can also scope the listing to one branch:

```powershell
npm run sync-user -- --list-departments --department 2
```

## Output

Batch sync returns:

- `summary.total`
- `summary.created`
- `summary.updated`
- `summary.noop`
- `summary.failed`
- `results`
- `failures`
