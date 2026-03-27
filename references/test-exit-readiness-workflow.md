# Test Exit Readiness Workflow

## Goal

Support SOP Step 20 by giving a direct readiness conclusion for a ZenTao testtask.

## Data Sources

- `/testtask-view-{id}.json`
- `/testtask-cases-{id}-all-0-id_desc-0-100-1.json`
- `/bug-browse-{product}-all-0-id_desc-0-100-1.json`

## Current Decision Rules

- Testtask status must be `done`
- No linked testcase may remain unrun, failed, or blocked
- No related bug may remain active or otherwise unclosed

## OpenClaw Validation

- `npm run query-test-exit-readiness -- --testtask 1`
- `npm run query-test-exit-readiness -- --testtask 2`
