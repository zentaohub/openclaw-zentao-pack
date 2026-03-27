---
name: testtask-status-flow
description: Manage ZenTao testtask lifecycle for SOP testing stages.
---

# Testtask Status Flow Module

## Purpose

Implements testtask lifecycle actions used across SOP testing stages: start, block, activate, and close.

## Commands

- `scripts/update_testtask_status.ts`
- `scripts/queries/query_testtask_detail.ts`

## Usage

- `npm run update-testtask-status -- --testtask 1 --status blocked --comment "blocked in validation"`
- `npm run update-testtask-status -- --testtask 1 --status activate --comment "resume validation"`
- `npm run update-testtask-status -- --testtask 1 --status done --real-finished-date "2026-03-23 00:00:00" --comment "done in validation"`
- `npm run query-testtask-detail -- --testtask 1`

## Notes

- Start route: `testtask-start-{id}.html`
- Block route: `testtask-block-{id}.html`
- Activate route: `testtask-activate-{id}.html`
- Close route: `testtask-close-{id}.html`
