---
type: concept
title: One dependency rule, checked by a tool
description: Which part of the engine may require which is one table, checked on every run of the gates by dependency-cruiser.
tags:
  - decisions
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# One dependency rule, checked by a tool

## Context

The contexts stay replaceable only if their boundaries hold. A boundary that is only
written down drifts as soon as a change takes a shortcut.

## Considered options

1. **One table of allowed requires, checked by dependency-cruiser in `npm run arch`
   and in CI.**
2. Describe the layering in the documentation and rely on review.
3. Publish each context as its own npm package, so the package manager holds the
   boundaries.

## Decision

Option 1. Option 2 is not checked. Option 3 holds the boundaries but multiplies the
releases, versions and lockfiles for a single program.

## Consequences

A require across a boundary fails the gate. The application layer is the only part that
may require everything, and only it and `bin/` construct adapters.
