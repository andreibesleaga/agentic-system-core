---
type: procedure
title: Run the port tests
description: Run the unit tests of the four ports and their Node adapters, which hold the engine's only ways to reach the host.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - ports
  - adapters
verifies:
  - ports
  - adapters
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/README.md
prov:
  origin: human
  operator: human:operator
when: A port or an adapter has changed
---

# Run the port tests

## When

A port or one of its adapters has changed.

## Steps

1. In the engine's repository, run `node --test "tests/ports/*.test.js" "tests/adapters/*.test.js"`.

## Checks

Every test passes, and the network adapter refuses every call it is given.
