---
type: concept
title: Composition
description: The context that turns a selection of items into a verdict, a Harness of seven files, skill packs, a brief and a blueprint.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - knowledge
  - ports
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Composition

Composition owns the five-step pipeline from a selection to a verdict, the seven Harness
files, the emitters, the skill packs, the brief and, for a saved architecture, the
blueprint outputs written beside the Harness. It consumes the resolved graph of
Knowledge; Knowledge does not know that compositions exist.
