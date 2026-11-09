---
type: concept
title: Ledger derived from the git history
description: The change ledger is recomputed from the git history at every build and is never stored or appended by hand.
tags:
  - decisions
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/08-governance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Ledger derived from the git history

## Context

A node publishes who changed what and why. The record has to be the same for everyone
who builds the same history, and nobody should be able to edit it apart from the
changes it describes.

## Considered options

1. **Derive `ledger.jsonl` from the git history at every build, hash-chained, written
   only into the build output (AGSC-08-20).**
2. Keep a ledger file in the repository and let CI append a line after each merge.
3. Send each change to an external transparency log service.

## Decision

Option 1. Option 2 has an append race and a file a person can edit. Option 3 adds a
service the node depends on at build time, which the no-network decision rules out.

## Consequences

Two builds of the same history write the same ledger. A Level 2 node must be built from
a git checkout: a copy of the files without the history cannot produce the ledger.
