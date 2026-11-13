---
type: concept
title: Memory adapters read and write files only
description: The memory adapters for other tools convert files in those tools' shapes and never call the tools over the network.
tags:
  - decisions
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/00-overview.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Memory adapters read and write files only

## Context

Mem0, Letta and Zep keep memory behind their own services, each with an official client
package. The plugin contract says a memory adapter may never reach the network
(AGSC-00-24).

## Considered options

1. **Write and read files in the exact shapes of each tool's official client types;
   the person moves them with that tool's own client.**
2. Call each tool's client package from `export` and `import`.
3. Leave these tools to plugins outside the engine.

## Decision

Option 1. Option 2 breaks the network rule of the plugin contract and adds three
service clients to the engine's dependencies. Option 3 leaves the most asked-for
formats without a tested path.

## Consequences

No client package is a dependency of the engine. A sync that calls the services would be
a separate tool, outside `export` and `import`.
