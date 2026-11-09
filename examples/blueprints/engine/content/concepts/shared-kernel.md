---
type: concept
title: Shared kernel
description: The code every context may share, chiefly the two string orderings the format fixes, and nothing that touches the host.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-component.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Shared kernel

The shared kernel holds what every context needs and no context owns: the two string
orderings (JSON member names by UTF-16 code units, AGSC-04-05; everything else by
Unicode code point, AGSC-04-12) and a few line readers that run in linear time. It
requires nothing inside the engine, and the dependency rule lets every other part
require it.

Build it before any other part: nothing else can be ordered until these two orderings exist.
