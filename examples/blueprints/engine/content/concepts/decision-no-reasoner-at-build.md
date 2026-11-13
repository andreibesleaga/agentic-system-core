---
type: concept
title: No reasoner at build time
description: The graph states every entailment the format relies on explicitly, and no reasoner runs while a node is built.
tags:
  - decisions
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/05-graph.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# No reasoner at build time

## Context

Lint decides over the Bundle it can see; the RDF a node publishes is read in an open
world. If a reasoner added facts at build time, the published graph could say what lint
never checked.

## Considered options

1. **Materialise the entailments the format relies on, inverses and cluster nesting,
   in plain code, and run no reasoner (AGSC-05-23).**
2. Run an OWL reasoner during the build and publish what it infers.
3. Publish only the asserted triples and leave every inference to the consumer.

## Decision

Option 1. Option 2 makes the output depend on a reasoner's version and settings.
Option 3 leaves readers to guess which inferences the format relies on.

## Consequences

The relied-upon entailments are in the graph files. The wider consequences of the graph
are a separate command, `export --closure` (AGSC-05-37), never part of a build.
