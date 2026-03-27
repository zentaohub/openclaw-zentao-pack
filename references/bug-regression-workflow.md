# Bug Regression Workflow

## Goal

Support SOP Step 19 by listing resolved bugs that require tester regression verification before they are closed or reactivated.

## Routes

- Regression list: `/bug-browse-{product}-resolved-0-id_desc-0-100-1.json`
- Close bug: `/bug-close-{id}.html`
- Reactivate bug: `/bug-activate-{id}.html`

## Required Inputs

- `product`

## Useful Optional Inputs

- `execution`
- `assignedTo`

## OpenClaw Validation

- `npm run query-regression-bugs -- --product 1 --execution 4`
- `npm run update-bug-status -- --bug-id 4 --status close --comment regression_passed`
- `npm run update-bug-status -- --bug-id 5 --status activate --comment regression_failed`
