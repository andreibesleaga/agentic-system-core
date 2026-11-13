---
type: concept
title: Tool server
description: The local Model Context Protocol server, agsc mcp, that gives an agent ten tools over the Bundle through standard input and output.
tags:
  - architecture
  - tools
clusters:
  - tool-server-parts
requires:
  - knowledge-bundle
uses:
  - mcp-sdk
decided-by:
  - decision-official-mcp-packages
  - decision-answers-are-untrusted-data
  - decision-tools-write-nothing
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Tool server

`agsc mcp`, started in the Bundle, serves exactly ten tools over standard input and
output: `search`, `read`, `links`, `compose`, `propose`, `ask`, `remember`, `brief`,
`explain` and `check` (AGSC-09-13). Every answer is an envelope that names its source
and licence and marks itself untrusted. It writes nothing to standard output that is
not protocol, and nothing to the Bundle.
