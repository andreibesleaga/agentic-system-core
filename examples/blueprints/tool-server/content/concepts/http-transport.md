---
type: concept
title: HTTP transport
description: The same tool server over Streamable HTTP, agsc mcp --http, bound to a loopback address only and read-only.
tags:
  - architecture
  - tools
clusters:
  - tool-server-parts
requires:
  - tool-server
decided-by:
  - decision-loopback-only
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# HTTP transport

`agsc mcp --http <port>` serves the same ten tools, on the same Bundle, over the
Streamable HTTP transport of the Model Context Protocol (AGSC-09-18). It binds only to a
loopback address, serves one endpoint, `/mcp`, checks the `Origin` and `Host` of every
request, and writes no file. It is for the author's own agents on the same machine.
