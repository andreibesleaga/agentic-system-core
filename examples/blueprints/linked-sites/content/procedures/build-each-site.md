---
type: procedure
title: Build each site
description: Give each Bundle a git history and build it, which proves that both Bundles are valid on their own.
tags:
  - checks
  - peers
clusters:
  - linked-sites
requires:
  - bundle-a
  - bundle-b
verifies:
  - bundle-a
  - bundle-b
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
when: A Bundle has changed
---

# Build each site

## When

Either Bundle has changed.

## Steps

1. In each Bundle, commit the change to git.
2. In each Bundle, run `agsc build`.

## Checks

Both builds pass, each without reading the other Bundle.
