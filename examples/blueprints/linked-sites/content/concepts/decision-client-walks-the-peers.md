---
type: concept
title: The client walks the peers
description: A site never fetches its peer for a reader; the agent follows the peer link itself, within the bounds the format sets.
tags:
  - decisions
  - peers
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/11-boundary.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# The client walks the peers

## Context

An agent reading site a may want what site b says too. Someone has to fetch site b, and
whoever does it carries the cost and the risk of the fetch.

## Considered options

1. **The agent follows the `rel#peer` link itself, bounded in depth, breadth and
   requests (AGSC-11-10); the sites only publish.**
2. Site a fetches site b when a reader asks, and passes the answer on.
3. Site a copies site b's content into its own build.

## Decision

Option 1. Option 2 needs a server at site a and makes it fetch addresses for strangers.
Option 3 makes the build depend on the network and copies prose the other site owns.

## Consequences

Both sites stay static and reach no network. Every result an agent derives from site b
carries `trust: "untrusted"` and site b as its origin.
