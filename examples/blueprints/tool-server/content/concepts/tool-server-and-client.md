---
type: concept
title: Agent tool server with a client
description: The saved architecture of a local tool server that gives an agent ten tools over a knowledge node, a client that calls them, and the same tools on the published pages.
tags:
  - architecture
  - tools
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/examples/demos/agents/README.md
prov:
  origin: human
  operator: human:operator
kind: architecture
---

# Agent tool server with a client

An agent works on a knowledge node through ten tools: it searches, reads, follows links,
composes, asks, and prepares changes for a person to review. The tool server runs on the
author's machine, reads the Bundle as it is on disk and writes nothing. A client starts
it and calls the tools; the published pages offer the same tools to an agent in a
browser.

```yaml agsc-selection
- knowledge-bundle
- tool-server
- http-transport
- tool-client
- page-tools
- check-the-bundle
- list-the-tools
- call-a-tool
- prepare-a-change
- compare-page-and-server
- serve-over-http
```
