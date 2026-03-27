# Testtask Create Workflow

## Goal

Cover SOP Step 16 by creating a ZenTao test task that marks a development package as ready for QA.

## Routes

- Create form submit: `/testtask-create-{product}-{execution}-{build}-{project}.html`
- Browse list: `/testtask-browse-{product}-0-all-id_desc-0-100-1.json`
- Detail view: `/testtask-view-{testtaskId}.json`

## Required Inputs

- `product`
- `build`
- `name`
- `begin`
- `end`

## Useful Optional Inputs

- `execution`
- `owner`
- `pri`
- `desc`
- `members`
- `mailto`

## OpenClaw Validation

- `npm run create-testtask -- --product 1 --execution 4 --build 1 --name "Codex testtask validate" --begin 2026-03-23 --end 2026-03-23 --owner admin`
- `npm run query-testtasks -- --product 1 --execution 4`
