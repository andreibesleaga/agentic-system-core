---
type: concept
title: Ports
description: The interfaces through which the engine reaches files, processes, the clock and the network, so the contexts stay pure.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
decided-by:
  - decision-no-network-in-build
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-component.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Ports

Four ports, FileSystem, Clock, ProcessRunner and Network, are the only way out of the
engine. A bounded context receives a port and never constructs the thing behind it, so
the same context runs against real files in the command line and against memory in the
tests. The ports require nothing.
