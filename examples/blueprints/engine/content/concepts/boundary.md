---
type: concept
title: Boundary
description: The context where a node meets a browser, a peer, a stranger's address or a reader who may not see everything.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - knowledge
  - ports
uses:
  - peer-nodes
decided-by:
  - decision-no-network-in-build
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Boundary

Boundary owns cross-origin access, the safety of fetching a peer, the client rules of the
federation walk, trust marking, visibility, the contribute relation and the plugin
contract. It classifies addresses and host names and opens no connection itself. It is
the layer that keeps an external protocol moving from moving the core.
