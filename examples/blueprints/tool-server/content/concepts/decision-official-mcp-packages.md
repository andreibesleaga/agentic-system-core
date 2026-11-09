---
type: concept
title: Build on the official MCP packages
description: The tool server is built on the official Model Context Protocol server packages, pinned to exact versions, and keeps no protocol layer of its own.
tags:
  - decisions
  - tools
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/CHANGELOG.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Build on the official MCP packages

## Context

The tool server speaks the Model Context Protocol, which has revisions, and each
revision changes the handshake or the transports.

## Considered options

1. **Build on the official server packages, pinned to exact versions (AGSC-09-19).**
2. Write a JSON-RPC layer of our own and follow each revision by hand.
3. Use a third-party framework that wraps the protocol.

## Decision

Option 1. Option 2 repeats work the protocol's maintainers already do and tracks every
revision late. Option 3 puts a layer the project does not control between the server and
the protocol.

## Consequences

A new revision arrives as a package update, checked by the tests. The client in
`examples/demos/agents/mcp-call.js` stays plain Node, because it only shows the lines a
client sends.
