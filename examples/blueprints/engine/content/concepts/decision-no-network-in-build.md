---
type: concept
title: No network during a build
description: A build reads only the Bundle and its git history, so that two builds of the same input write the same bytes.
tags:
  - decisions
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/04-canonicalization.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/src/adapters/node-network-refusing.js
prov:
  origin: human
  operator: human:operator
kind: decision
---

# No network during a build

## Context

Two builds of the same Bundle and history must write the same bytes (AGSC-04-01), and a
reader must be able to check that. Anything fetched during a build can change between
two runs.

## Considered options

1. **Read only the Bundle and its history; reach no network (AGSC-04-03).**
2. Fetch peers and remote sources during the build, so pages show their current state.
3. Fetch once, keep a cache inside the Bundle, and build from the cache.

## Decision

Option 1. Option 2 makes the output depend on the moment of the build. Option 3 moves
the problem into a cache that someone has to refresh and review.

## Consequences

The network adapter the engine wires in refuses every call. A peer is checked apart
from the build, by `validate-wellknown --peer` on two local files.
