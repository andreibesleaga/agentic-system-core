---
type: procedure
title: Prepare a change
description: Ask the tool server to prepare a change and check that it hands the text back and writes nothing to the Bundle.
tags:
  - checks
  - tools
clusters:
  - tool-server-parts
requires:
  - tool-server
verifies:
  - tool-server
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
when: A tool that prepares changes has changed
---

# Prepare a change

## When

`propose` or `remember` has changed.

## Steps

1. Call `propose` with the slug of an item.
2. Call `remember` with a lesson and the human operator who asked for it.
3. Look at the Bundle.

## Checks

Both answers are proposals, with the prepared text and its path; the Bundle is
unchanged.
