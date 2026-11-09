---
type: procedure
title: Compare the page and the server
description: Call the same tool on a built page and on the tool server, which proves the page tools give answers equal to the server's.
tags:
  - checks
  - tools
clusters:
  - tool-server-parts
requires:
  - page-tools
  - tool-server
verifies:
  - page-tools
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
when: The pages or the tool server have changed
---

# Compare the page and the server

## When

The pages or the tool server have changed.

## Steps

1. Build the Bundle with `agsc build`.
2. Call `ask` with the same question through `mcp-call.js` and through
   `page-tools.js www`.
3. Compare the two answers.

## Checks

The two answers are the same bytes.
