---
type: concept
title: Tool server on the official MCP packages
description: The tool server is built on the official Model Context Protocol server packages and keeps no protocol layer of its own.
tags:
  - decisions
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/CHANGELOG.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Tool server on the official MCP packages

## Context

The tool server speaks the Model Context Protocol to assistants, over standard input
and output and, from 1.1, over Streamable HTTP on a loopback address. The protocol has
revisions, and each revision changes the handshake.

## Considered options

1. **Build on the official server packages, pinned to exact versions (AGSC-09-19).**
2. Keep a JSON-RPC layer of the engine's own and follow each revision by hand.
3. Use a third-party framework that wraps the protocol.

## Decision

Option 1. Option 2 repeats work the protocol's own maintainers already do and tracks
every revision late. Option 3 adds a layer between the engine and the protocol it does
not control.

## Consequences

A new protocol revision arrives as a package update. A protocol module that does not
require an official package fails `tests/arch/typescript-parts.test.js`.
