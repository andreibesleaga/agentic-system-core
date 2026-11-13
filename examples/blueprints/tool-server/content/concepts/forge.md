---
type: concept
title: Forge
description: The git host that keeps the Bundle's history and carries the changes an agent prepares, as pull requests a person reviews.
tags:
  - architecture
  - outside
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-context.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Forge

The Bundle lives in a git repository on a forge. A change an agent prepares with
`propose` or `remember` becomes a commit only when a person applies it and the forge
runs `agsc ci` on it.
