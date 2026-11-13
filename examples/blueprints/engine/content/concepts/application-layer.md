---
type: concept
title: Application layer
description: The layer that reads the configuration, wires the contexts to the adapters and runs the verbs of the agsc command line.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - knowledge
  - governance
  - composition
  - boundary
  - interchange
  - distribution
  - adapters
uses:
  - markdown-bundle
decided-by:
  - decision-dependency-rule
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Application layer

The application layer is not a context. It reads `agsc.config.json`, loads plugins
by path, constructs the adapters and calls the contexts, so the `agsc` verbs, the tool
server and `agsc-host` are its programs. It is the only layer allowed to require
everything.
