---
name: bug-regression-flow
description: Query resolved ZenTao bugs waiting for regression verification, then close or reactivate them.
---

# Bug Regression Flow Module

## Purpose

Implements SOP Step 19 by surfacing resolved bugs that are ready for tester regression verification.

## Commands

- `scripts/queries/query_regression_bugs.ts`
- `scripts/update_bug_status.ts`
- `scripts/queries/query_bug_detail.ts`

## Usage

- `npm run query-regression-bugs -- --product 1 --execution 4`
- `npm run update-bug-status -- --bug-id 4 --status close --comment regression_passed`
- `npm run update-bug-status -- --bug-id 5 --status activate --comment regression_failed`

## Notes

- Query route: `bug-browse-{product}-resolved-0-id_desc-0-100-1.json`
- Supports optional filters: `execution`, `assignedTo`
- Regression result branches still reuse the existing bug status flow
