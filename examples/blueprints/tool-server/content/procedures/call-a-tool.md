---
type: procedure
title: Call a tool
description: Call search and read through the client, which proves the client and the server agree on the protocol and every answer is an untrusted envelope.
tags:
  - checks
  - tools
clusters:
  - tool-server-parts
requires:
  - tool-client
  - tool-server
verifies:
  - tool-client
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
when: A client has been written or changed
---

# Call a tool

## When

A client has been written or changed.

## Steps

1. In the Bundle, run `node mcp-call.js search '{"query":"<words>"}'`.
2. Run `node mcp-call.js read '{"slug":"<slug>"}'`.

## Checks

Each answer carries `trust: "untrusted"`, the licence and the tool that gave it.
