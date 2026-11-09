---
type: concept
title: The same tools on the page
description: The pages of the built node register the same ten tools, with the same arguments and answers equal as values, for an agent in a browser.
tags:
  - decisions
  - tools
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# The same tools on the page

## Context

An agent may meet the node in a browser rather than on the author's machine. It should
not have to learn a second set of tools, or get a different answer to the same question.

## Considered options

1. **Register the same ten tools on the item pages and `/compose/`, with answers equal
   as values to the tool server's for the same input (AGSC-09-16).**
2. Offer a smaller set of page tools, for reading only.
3. Offer no tools on the page.

## Decision

Option 1. Option 2 gives the same agent two contracts to learn. Option 3 leaves an agent
in a browser to scrape the pages.

## Consequences

The page computes its answers from the node's own published files, with no server. A
test compares the page's answers with the tool server's, byte for byte.
