---
type: concept
title: Interchange
description: The supporting context that reads and writes other tools' formats, such as OKF, JSON-LD, JSONL, steering files, skills and memory exports.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - knowledge
  - governance
  - ports
uses:
  - other-tools-formats
decided-by:
  - decision-files-only-adapters
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Interchange

Interchange carries foreign formats both ways: OKF, JSON-LD, JSONL, steering files, the
skills import and the direct memory adapters. It reads the provenance Governance
publishes, so an import keeps where an item came from. It never renders and never
composes, and it meets Distribution only in the application layer.
