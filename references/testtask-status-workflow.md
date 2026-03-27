# Testtask Status Workflow

## Goal

Support testing-stage SOP execution by exposing testtask lifecycle changes and detail lookup.

## Routes

- Start: `/testtask-start-{id}.html`
- Block: `/testtask-block-{id}.html`
- Activate: `/testtask-activate-{id}.html`
- Close: `/testtask-close-{id}.html`
- Detail: `/testtask-view-{id}.json`

## OpenClaw Validation

- `npm run update-testtask-status -- --testtask 1 --status blocked --comment "blocked in validation"`
- `npm run update-testtask-status -- --testtask 1 --status activate --comment "resume validation"`
- `npm run update-testtask-status -- --testtask 1 --status done --real-finished-date "2026-03-23 00:00:00" --comment "done in validation"`
- `npm run query-testtask-detail -- --testtask 1`
