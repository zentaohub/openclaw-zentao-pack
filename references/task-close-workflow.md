# Task Close Workflow

## Goal

Support SOP Step 24 by driving a task through finish and close so it no longer blocks final lifecycle closure.

## Routes

- Finish task: `/task-finish-{id}.html`
- Close task: `/task-close-{id}.html`
- Task detail: `/task-view-{id}.json`

## Required Inputs

- `task-id`
- `status`

## Status Rules

- `done`: requires `consumed-hours`
- `closed`: use after task work is complete and ready for lifecycle closure

## OpenClaw Validation

- `npm run update-task-status -- --task-id 3 --status done --consumed-hours 4 --comment task_finish_for_closure`
- `npm run update-task-status -- --task-id 3 --status closed --comment task_close_for_closure`
- `npm run query-task-detail -- --task 3`
- `npm run query-closure-items -- --product 1 --execution 4`
