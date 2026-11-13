---
type: concept
title: Cite the other site through sources
description: An item of one site refers to the other site by address in its sources, never through a Link key, and never copies the other site's prose.
tags:
  - decisions
  - peers
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/03-links.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/11-boundary.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Cite the other site through sources

## Context

An item on site a sometimes rests on something published by site b. Link keys resolve by
slug inside one Bundle (AGSC-03-02), and site b's items are not in Bundle a.

## Considered options

1. **Cite site b's page by its address in `sources`; whatever is read from b stays
   marked as untrusted and keeps b as its origin (AGSC-11-11).**
2. Let Link keys name items of another site.
3. Copy site b's items into Bundle a and link to the copies.

## Decision

Option 1. Option 2 would make lint depend on a site it cannot see, which needs the
network. Option 3 copies prose a node may take in only through a proposal that marks it
as imported (AGSC-11-11), and the copies drift from the original.

## Consequences

Each Bundle still lints and builds on its own. The citation keeps its origin, and an
agent decides for itself whether to follow it.
