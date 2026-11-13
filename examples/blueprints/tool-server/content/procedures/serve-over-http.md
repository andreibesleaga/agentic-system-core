---
type: procedure
title: Serve over HTTP
description: Start the tool server over HTTP and check that it refuses any address that is not loopback before anything starts.
tags:
  - checks
  - tools
clusters:
  - tool-server-parts
requires:
  - http-transport
verifies:
  - http-transport
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
prov:
  origin: human
  operator: human:operator
when: The HTTP transport has changed
---

# Serve over HTTP

## When

The HTTP transport has changed.

## Steps

1. Run `agsc mcp --http 0 --bind 10.0.0.1`.
2. Run `agsc mcp --http 0`, read the port it reports on standard error, and connect a
   client to `http://127.0.0.1:<port>/mcp`.

## Checks

Step 1 is refused with `AGSC-E003` and exit 2, and nothing is started. In step 2 the
client lists the same ten tools as over standard input and output.
