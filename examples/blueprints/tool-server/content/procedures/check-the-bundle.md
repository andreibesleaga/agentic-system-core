---
type: procedure
title: Check the Bundle
description: Run the checks a node must pass on the Bundle the agent works on, which proves the tool server reads valid items.
tags:
  - checks
  - tools
clusters:
  - tool-server-parts
requires:
  - knowledge-bundle
verifies:
  - knowledge-bundle
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
prov:
  origin: human
  operator: human:operator
when: An item of the Bundle has changed
---

# Check the Bundle

## When

An item of the Bundle has changed, by hand or through a proposal a person applied.

## Steps

1. In the Bundle, run `agsc lint`.
2. Run `agsc ci`.

## Checks

Both pass with no error, so every item the tool server reads is valid.
