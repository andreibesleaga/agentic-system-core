---
type: procedure
title: Check the dependency rule
description: Run the dependency rule over the engine's sources, which proves that each part requires only what its row of the rule allows.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - application-layer
  - shared-kernel
verifies:
  - application-layer
  - shared-kernel
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
when: Any source file of the engine has changed
---

# Check the dependency rule

## When

Any source file of the engine has changed.

## Steps

1. In the engine's repository, run `npm run arch`.

## Checks

dependency-cruiser reports no violation: no part requires another part its row does not
allow, and nothing outside the application layer constructs an adapter.
