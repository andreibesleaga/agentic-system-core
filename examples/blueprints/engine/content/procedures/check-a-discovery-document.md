---
type: procedure
title: Check a discovery document
description: Build a node and check the discovery document it publishes with the independent checker, which proves the Distribution context.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - distribution
verifies:
  - distribution
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/06-surfaces.md
prov:
  origin: human
  operator: human:operator
when: The Distribution context has changed
---

# Check a discovery document

## When

The Distribution context has changed.

## Steps

1. In a Bundle that is a git checkout, run `agsc build`.
2. Run `node tools/validate-wellknown www/.well-known/knowledge-linkset --level 2`.

## Checks

The checker passes: every link resolves to a built file and every digest matches.
