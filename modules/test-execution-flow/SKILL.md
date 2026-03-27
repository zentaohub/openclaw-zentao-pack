---
name: test-execution-flow
description: SOP Step 17 link testcases to a testtask and run them.
---

# Test Execution Flow Module

## Purpose

Implements SOP Step 17 by linking cases into a ZenTao test task, querying run rows, and submitting a run result.

## Commands

- `scripts/link_testtask_cases.ts`
- `scripts/queries/query_testtask_cases.ts`
- `scripts/run_testtask_case.ts`

## Usage

- `npm run link-testtask-cases -- --testtask 1 --cases 1`
- `npm run query-testtask-cases -- --testtask 1`
- `npm run run-testtask-case -- --run 1 --result pass --real "case passed in validation"`

## Notes

- Link route: `testtask-linkCase-{taskId}-all-0-0-100-1.html`
- Run route: `testtask-runCase-{runId}-{caseId}-{version}.html`
- Results route: `testtask-results-{runId}-{caseId}-{version}-all-all-0.json`
