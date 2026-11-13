---
type: concept
title: Tool client
description: The client that starts the tool server, opens the protocol session and calls one tool, as an assistant does.
tags:
  - architecture
  - tools
clusters:
  - tool-server-parts
requires:
  - tool-server
related:
  - assistant
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/examples/demos/agents/README.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Tool client

A client starts `agsc mcp` in the Bundle, sends the opening lines every Model Context
Protocol client sends, `initialize` and `notifications/initialized`, then `tools/call`,
and reads the answer. An assistant app is such a client. The engine ships
`examples/demos/agents/mcp-call.js`, a client in plain Node that does exactly this and
nothing else.
