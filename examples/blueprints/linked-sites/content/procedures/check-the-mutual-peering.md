---
type: procedure
title: Check the mutual peering
description: Check the two discovery documents against each other, which proves that each site names the other.
tags:
  - checks
  - peers
clusters:
  - linked-sites
requires:
  - site-a
  - site-b
verifies:
  - site-a
  - site-b
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
when: A site has been built, or a peers list has changed
---

# Check the mutual peering

## When

Either site has been built, or either peers list has changed.

## Steps

1. Run `node tools/validate-wellknown a/www/.well-known/knowledge-linkset --level 2 --peer b/www/.well-known/knowledge-linkset`.

## Checks

The checker passes. Against a site that does not name the other back, it fails with
`AGSC-E907`.
