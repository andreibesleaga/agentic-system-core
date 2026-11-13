---
type: procedure
title: Run the conformance vectors
description: Run the language-neutral conformance vectors against a Bundle, which prove that the Knowledge context reads and checks items as the rules say.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - knowledge
verifies:
  - knowledge
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/vectors/README.md
prov:
  origin: human
  operator: human:operator
when: The Knowledge context has changed, or a port of the engine is being written
---

# Run the conformance vectors

## When

The Knowledge context has changed, or someone is writing a port of the engine.

## Steps

1. In a Bundle, run `agsc conform --level 2`.

## Checks

The command prints `conform: pass` and writes `dist/conformance-report.json`.
