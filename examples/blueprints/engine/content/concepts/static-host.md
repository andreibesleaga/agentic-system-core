---
type: concept
title: Static host
description: Any host that serves the built files as they are, from a web host to a local machine.
tags:
  - architecture
  - outside
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-context.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Static host

The built node is a folder of static files. A web host, a local machine or a gateway
serves it; no server-side code of the engine runs there.
