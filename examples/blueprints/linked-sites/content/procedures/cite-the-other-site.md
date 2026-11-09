---
type: procedure
title: Cite the other site
description: Record an item on site a that cites a page of site b in its sources, which proves that a citation keeps its origin and fetches nothing.
tags:
  - checks
  - peers
clusters:
  - linked-sites
requires:
  - bundle-a
verifies:
  - bundle-a
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
when: An item of one site rests on something the other site published
---

# Cite the other site

## When

An item of site a rests on something site b published.

## Steps

1. In Bundle a, write the item, or ask the `remember` tool for it, with site b's page
   address in `sources`.

## Checks

The item names site b's address under `sources`, and nothing was fetched.
