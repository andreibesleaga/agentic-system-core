---
type: concept
title: Distribution
description: The context that writes the published node, its pages, routes, discovery document, text files, tool answers and boards.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - knowledge
  - governance
  - composition
  - boundary
  - ports
uses:
  - static-host
  - mcp-sdk
decided-by:
  - decision-no-network-in-build
  - decision-official-mcp-sdk
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Distribution

Distribution renders what Knowledge validated and adds nothing to it: pages, routes,
headers, the discovery document, `llms.txt`, the answers of the ten tools on both
transports, and the boards. It writes only through the FileSystem port it is handed.
The tool server is built on the official Model Context Protocol packages.
