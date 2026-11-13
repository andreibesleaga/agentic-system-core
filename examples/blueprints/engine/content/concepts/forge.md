---
type: concept
title: Forge
description: The git host that holds the Bundle's history, carries proposals as pull requests and runs agsc ci.
tags:
  - architecture
  - outside
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-context.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Forge

The forge is someone else's system: a git host with pull requests and CI. The engine
reads the history it holds to derive the ledger, and a reviewer merges or refuses the
proposals an agent prepares there.
