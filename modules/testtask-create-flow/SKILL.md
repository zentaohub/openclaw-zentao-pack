---
name: testtask-create-flow
description: SOP Step 16 create a ZenTao test task for handoff to QA.
---

# Testtask Create Flow Module

## Purpose

Implements SOP Step 16 `????` by creating a ZenTao test task and verifying it through the test task list.

## Commands

- `scripts/create_testtask.ts`
- `scripts/queries/query_testtasks.ts`

## Usage

- `npm run create-testtask -- --product 1 --execution 4 --build 1 --name "Codex testtask validate" --begin 2026-03-23 --end 2026-03-23 --owner admin`
- `npm run query-testtasks -- --product 1 --execution 4`

## Notes

- Real route: `testtask-create-{product}-{execution}-{build}-{project}.html`
- Required fields: `product`, `build`, `name`, `begin`, `end`
- Recommended fields: `execution`, `owner`, `pri`, `desc`
- Command accepts multiple build ids via `--builds 1,2` and multiple type/member values via `||`
