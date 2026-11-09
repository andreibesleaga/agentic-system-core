---
type: concept
title: Adapters
description: The Node implementations of the four ports, constructed only by the application layer and handed to the contexts.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - ports
  - shared-kernel
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-component.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Adapters

Each adapter implements one port with Node: files on disk, child processes, the clock
read from `SOURCE_DATE_EPOCH`, and a network that refuses every call, because a build
reaches no network (AGSC-04-03). One more adapter owns the socket of `agsc-host serve`
and of the tool server's HTTP transport. Only the application layer and `bin/`
construct an adapter; a context that needs one receives the port.
