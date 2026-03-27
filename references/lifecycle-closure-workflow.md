# Lifecycle Closure Workflow

## Goal

Support SOP Step 24 by listing the exact stories, tasks, bugs, and releases that still block final lifecycle closure.

## Inputs

- `product`
- `execution`

## Commands

- `npm run query-closure-items -- --product 1 --execution 4`
- `npm run query-closure-readiness -- --product 1 --execution 4`

## Interpretation

- `open_tasks > 0`: development items still need completion or explicit closing
- `active_stories > 0`: stories still need closure after acceptance
- `unresolved_bugs > 0`: defects still block final closure
- `non_normal_releases > 0`: release records still need normalization before final wrap-up
