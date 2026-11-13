---
type: concept
title: AgenticSystemCore engine
description: The saved architecture of the reference engine, its bounded contexts and layers in dependency order, with the check that proves each one.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-component.md
prov:
  origin: human
  operator: human:operator
kind: architecture
---

# AgenticSystemCore engine

The engine turns a Bundle of Markdown items into a static knowledge node. It is one
program, so its parts are the five bounded contexts, the supporting Interchange
context, the shared kernel, the ports and adapters, and the application layer that
wires them. The selection below lists those parts and the check that proves each one.

```yaml agsc-selection
- shared-kernel
- ports
- knowledge
- governance
- composition
- boundary
- interchange
- distribution
- adapters
- application-layer
- run-the-port-tests
- run-the-conformance-vectors
- verify-the-ledger
- compose-a-harness
- check-the-peering
- round-trip-an-export
- check-a-discovery-document
- check-the-dependency-rule
```
