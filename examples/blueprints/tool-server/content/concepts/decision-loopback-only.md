---
type: concept
title: HTTP on loopback only
description: The HTTP transport binds only to a loopback address and checks the origin of every request, so only the author's own agents can reach it.
tags:
  - decisions
  - tools
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
  - resource: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
prov:
  origin: human
  operator: human:operator
kind: decision
---

# HTTP on loopback only

## Context

Some clients reach a tool server over HTTP rather than by starting it. An HTTP server is
reachable by any page the author's browser opens, and by other machines if it listens on
their network.

## Considered options

1. **Bind to `127.0.0.1` or another loopback address only, serve one path, and refuse a
   request whose `Origin` or `Host` is not loopback (AGSC-09-18).**
2. Listen on any address and require a token.
3. Offer standard input and output only.

## Decision

Option 1. Option 2 makes the author run and secure a network service, which this version
leaves out. Option 3 shuts out the clients that speak only HTTP.

## Consequences

A page on another site cannot call the tools through the author's browser (DNS
rebinding is refused). Serving the tools to other machines is outside this design.
