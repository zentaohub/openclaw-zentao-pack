---
name: task-close-flow
description: Finish and close ZenTao tasks during SOP Step 24 lifecycle closure.
---

# Task Close Flow Module

## Purpose

Implements SOP Step 24 by finishing and closing outstanding tasks before final lifecycle closure.

## Commands

- `scripts/actions/update_task_status.ts`
- `scripts/queries/query_task_detail.ts`
- `scripts/queries/query_closure_items.ts`

## Usage

- `npm run update-task-status -- --task-id 3 --status done --consumed-hours 4 --comment task_finish_for_closure`
- `npm run update-task-status -- --task-id 3 --status closed --comment task_close_for_closure`
- `npm run query-task-detail -- --task 3`
- `npm run query-closure-items -- --product 1 --execution 4`

## Notes

- Finish route: `task-finish-{id}.html`
- Close route: `task-close-{id}.html`
- `done` requires `--consumed-hours`
- `closed` is suitable for final lifecycle cleanup after finish
