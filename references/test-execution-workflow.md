# Test Execution Workflow

## Goal

Cover SOP Step 17 by taking a testcase into a testtask and recording its execution result.

## Routes

- Link cases: `/testtask-linkCase-{taskId}-all-0-0-100-1.html`
- Query linked runs: `/testtask-cases-{taskId}-all-0-id_desc-0-100-1.json`
- Run case: `/testtask-runCase-{runId}-{caseId}-{version}.html`
- Query results: `/testtask-results-{runId}-{caseId}-{version}-all-all-0.json`

## OpenClaw Validation

- `npm run link-testtask-cases -- --testtask 1 --cases 1`
- `npm run query-testtask-cases -- --testtask 1`
- `npm run run-testtask-case -- --run 1 --result pass --real "case passed in validation"`
