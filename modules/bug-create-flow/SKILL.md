---
name: bug-create-flow
description: SOP Step 17 submit bug from testing and support Step 18 bug fixing handoff.
---

# Bug Create Flow Module

## Purpose

Implements SOP Step 17 bug submission by creating a ZenTao bug linked to product, execution, story, case, and testtask context.

## Commands

- `scripts/create_bug.ts`
- `scripts/queries/query_product_bugs.ts`
- `scripts/queries/query_bug_detail.ts`

## Usage

- `npm run create-bug -- --product 1 --execution 4 --story 2 --case 1 --run 1 --testtask 1 --title "Codex bug validate" --builds 1 --assigned-to admin --severity 3 --pri 3 --steps "Step: failed\nResult: fail\nExpect: pass"`
- `npm run query-product-bugs -- --product 1`
- `npm run query-bug-detail -- --bug 1`

## Notes

- Web route: `bug-create-{product}-{branch}-{extras}.html`
- Required fields: `product`, `title`, `openedBuild[]`
- Recommended linkage: `execution`, `story`, `case`, `run`, `testtask`
