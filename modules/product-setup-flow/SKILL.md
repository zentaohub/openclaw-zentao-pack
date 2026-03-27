---
name: product-setup-flow
description: Product manager flow for creating a product and initializing product modules with strict module constraints.
---

# Product Setup Flow Module

## Purpose

Support product-manager actions for:

- creating a product
- initializing product modules
- reporting unsupported product fields clearly
- enforcing product-module constraints before submit

## Scripts

- `scripts/create_product.ts`
- `scripts/create_product_modules.ts`
- `scripts/create_product_with_modules.ts`

## Commands

- `npm run create-product -- --name SmartSupport --po admin --qd admin --rd admin`
- `npm run create-product-modules -- --product 3 --modules Workbench,TicketCenter,KnowledgeBase,Reports`
- `npm run create-product-with-modules -- --name SmartSupport --po admin --qd admin --rd admin --modules Workbench,TicketCenter,KnowledgeBase,Reports`

## Product Module Constraints

- module names in the same request must be unique
- if the target product already contains the same module name, reject before submit and list the conflicting names
- create the product first, then create modules
- module owners can be resolved in this order: real ZenTao account, real ZenTao display name, configured `user_aliases`
- if the current ZenTao create form does not support a field such as `code`, report that it was not written

## Notes

- current product create form supports name, type, workflow, owners, description, and ACL
- current product create form does not directly expose a writable `code` field
- optional config:
  `user_aliases`: `{ "产品经理A": "admin", "测试负责人A": "admin" }`
