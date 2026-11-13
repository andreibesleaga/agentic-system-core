---
type: concept
title: Answers are untrusted data
description: Every tool answer is an envelope that names its source and licence and is marked untrusted, so an agent never takes node text as an instruction.
tags:
  - decisions
  - tools
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/08-governance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Answers are untrusted data

## Context

An agent reads what the tools return into its context. Item text is written by people and
by other agents, and a sentence in it can look like an instruction.

## Considered options

1. **Every answer is JSON with `source`, `trust`, `license`, `type` and `body`, and
   `trust` is always `untrusted` (AGSC-08-18).**
2. Return plain text and leave the agent to judge it.
3. Mark answers from the node's own Bundle as trusted.

## Decision

Option 1. Option 2 gives the agent nothing to tell data from instructions. Option 3
trusts whatever was last merged into the Bundle, including what other agents wrote.

## Consequences

The agent's host can show the source and licence of every answer. Tools take item ids,
or plain text that is never executed or resolved as a path.
