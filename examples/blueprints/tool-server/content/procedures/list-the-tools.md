---
type: procedure
title: List the tools
description: Open a protocol session with the tool server and list its tools, which proves the server starts in the Bundle and offers exactly ten.
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
when: The tool server or the engine version has changed
---

# List the tools

## When

The tool server, or the engine that runs it, has changed.

## Steps

1. In the Bundle, send `agsc mcp` the three lines `initialize`,
   `notifications/initialized` and `tools/list`.

## Checks

The server names itself and the protocol revision, and lists exactly the ten tools.
