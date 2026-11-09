---
type: procedure
title: Compose a Harness
description: Compose a selection of items into a Harness and a brief, which proves the Composition context end to end.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - composition
verifies:
  - composition
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/07-composition.md
prov:
  origin: human
  operator: human:operator
when: The Composition context has changed
---

# Compose a Harness

## When

The Composition context has changed.

## Steps

1. In a Bundle, run `agsc compose <slug> <slug> --brief`.

## Checks

The command passes and writes the seven Harness files, and beside them the four files
of the brief.
