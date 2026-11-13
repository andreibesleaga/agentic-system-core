---
type: concept
title: Knowledge
description: The context that parses items, checks their Links, builds the graph and writes the chunk export.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - shared-kernel
uses:
  - markdown-bundle
decided-by:
  - decision-no-network-in-build
  - decision-no-reasoner-at-build
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Knowledge

Knowledge owns the Bundle, the six item types, the fourteen Link keys, clusters, chunks
and attachments: parsing, validation, linking, the ontology output, the index and the
chunk export. It never touches git, the network or review. Lint here is closed-world:
an unresolved link is an error, decided over the Bundle the engine can see.
