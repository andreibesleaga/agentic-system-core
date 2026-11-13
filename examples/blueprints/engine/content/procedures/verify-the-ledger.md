---
type: procedure
title: Verify the ledger
description: Build a node from a git checkout and check that the ledger it publishes is the one its history derives.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - governance
verifies:
  - governance
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/08-governance.md
prov:
  origin: human
  operator: human:operator
when: The Governance context has changed
---

# Verify the ledger

## When

The Governance context has changed.

## Steps

1. In a Bundle that is a git checkout, run `agsc build`.
2. Run `agsc verify --ledger`.

## Checks

Both commands pass; the hash chain of the ledger holds from its opening entry to its last.
