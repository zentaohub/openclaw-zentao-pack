---
name: lifecycle-closure-flow
description: List ZenTao stories, tasks, bugs, and releases that still block lifecycle closure at SOP Step 24.
---

# Lifecycle Closure Flow Module

## Purpose

Implements SOP Step 24 by showing which requirement lifecycle objects are still preventing final closure.

## Commands

- `scripts/queries/query_closure_items.ts`
- `scripts/queries/query_closure_readiness.ts`
- existing close or status commands for story, bug, task, and release workflows

## Usage

- `npm run query-closure-items -- --product 1 --execution 4`
- `npm run query-closure-readiness -- --product 1 --execution 4`

## Notes

- Open tasks: statuses other than `done`, `closed`, `cancel`
- Active stories: statuses other than `closed`
- Unresolved bugs: statuses other than `resolved`, `closed`
- Release records are treated as complete when status is `normal`
