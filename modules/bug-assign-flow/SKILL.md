---
name: bug-assign-flow
description: Assign ZenTao bugs during the development repair stage.
---

# Bug Assign Flow Module

## Purpose

Implements a key SOP Step 18 action by assigning an active bug to a developer for repair.

## Commands

- `scripts/assign_bug.ts`
- `scripts/queries/query_bug_detail.ts`

## Usage

- `npm run assign-bug -- --bug 4 --assigned-to LengLeng --comment "repair owner set in validation"`
- `npm run query-bug-detail -- --bug 4`

## Notes

- Assign route: `bug-assignTo-{id}.html`
- Core field: `assignedTo`
- Optional fields: `comment`, `mailto`
