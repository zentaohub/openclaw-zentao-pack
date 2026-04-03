---
name: test-exit-readiness-flow
description: Evaluate ZenTao test exit readiness for SOP Step 20.
---

# Test Exit Readiness Flow Module

## Purpose

Implements SOP Step 20 by summarizing a testtask's lifecycle status, testcase execution results, and related bug status into a go/no-go readiness result.

## Commands

- `scripts/queries/query_test_exit_readiness.ts`

## Usage

- `npm run query-test-exit-readiness -- --testtask 1`
- `npm run query-test-exit-readiness -- --testtask 2`

## Notes

- Uses `testtask-view`, `testtask-cases`, and product `bug-browse` data together
- Current readiness blockers include unfinished testtask, unrun/failed/blocked cases, and non-closed related bugs
