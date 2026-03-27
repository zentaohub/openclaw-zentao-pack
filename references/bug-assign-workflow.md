# Bug Assign Workflow

## Goal

Support SOP Step 18 by changing the assignee of a ZenTao bug before development repair starts.

## Routes

- Assign form submit: `/bug-assignTo-{id}.html`
- Detail view: `/bug-view-{id}.json`

## Required Inputs

- `bug`
- `assignedTo`

## Useful Optional Inputs

- `comment`
- `mailto`

## OpenClaw Validation

- `npm run assign-bug -- --bug 4 --assigned-to LengLeng --comment "repair owner set in validation"`
- `npm run query-bug-detail -- --bug 4`
