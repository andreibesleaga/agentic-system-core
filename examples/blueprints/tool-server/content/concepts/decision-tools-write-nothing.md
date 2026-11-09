---
type: concept
title: Tools write nothing
description: The tools that prepare a change hand back its text for a person to apply; the tool server never writes to the Bundle.
tags:
  - decisions
  - tools
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/08-governance.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Tools write nothing

## Context

An agent can learn something worth keeping, or find an item that needs a fix. The change
has to reach the Bundle with a person's review and a record of who made it.

## Considered options

1. **`propose` and `remember` return a proposal, the prepared text and its path, and
   write nothing (AGSC-09-14b).**
2. Let the tools write the item into the Bundle directly.
3. Let the tools open a pull request on the forge.

## Decision

Option 1. Option 2 skips review and leaves no record of who approved the change.
Option 3 gives the tool server credentials for the forge and makes it reach the network.

## Consequences

The tool server needs no write access and no credentials. A person applies the proposal
and commits it; the forge runs `agsc ci` on it like on any other change.
