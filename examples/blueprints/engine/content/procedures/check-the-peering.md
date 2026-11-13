---
type: procedure
title: Check the peering
description: Check two built nodes against each other, which proves the Boundary rules for peers without a network.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - boundary
verifies:
  - boundary
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/11-boundary.md
prov:
  origin: human
  operator: human:operator
when: The Boundary context has changed
---

# Check the peering

## When

The Boundary context has changed.

## Steps

1. Build two nodes that name each other in `peers`.
2. Run `node tools/validate-wellknown a/www/.well-known/knowledge-linkset --level 2 --peer b/www/.well-known/knowledge-linkset`.

## Checks

The checker passes on two local files, and fails when only one node names the other.
