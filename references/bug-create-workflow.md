# Bug Create Workflow

## Goal

Cover SOP Step 17 by submitting a bug during test execution and preserving linkage to the related story, testcase, run, and testtask.

## Routes

- Create form submit: `/bug-create-{product}-{branch}-{extras}.html`
- Product bug list: `/bug-browse-{product}-all-0-id_desc-0-100-1.json`
- Detail view: `/bug-view-{bugId}.json`

## Required Inputs

- `product`
- `title`
- `openedBuild[]`

## Useful Optional Inputs

- `execution`
- `story`
- `case`
- `run`
- `testtask`
- `assignedTo`
- `severity`
- `pri`
- `steps`

## OpenClaw Validation

- `npm run create-bug -- --product 1 --execution 4 --story 2 --case 1 --run 1 --testtask 1 --title "Codex bug validate" --builds 1 --assigned-to admin --severity 3 --pri 3 --steps "Step: failed\nResult: fail\nExpect: pass"`
- `npm run query-product-bugs -- --product 1`
- `npm run query-bug-detail -- --bug 1`
