---
type: concept
title: Forge
description: The git host that keeps each Bundle's history, carries proposals as pull requests and runs agsc ci.
tags:
  - architecture
  - outside
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-context.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Forge

Each Bundle lives in a git repository on a forge. The forge runs `agsc ci` on every
change, and the history it keeps is what each site's ledger is derived from.
