---
type: concept
title: Bundle b
description: The source of site b, Markdown items and one configuration file kept in git, whose peers list names site a.
tags:
  - architecture
  - peers
clusters:
  - linked-sites
uses:
  - forge
decided-by:
  - decision-cite-through-sources
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/examples/demos/mode-1-memory/README.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Bundle b

Bundle b is built the same way as Bundle a, by another person, in another repository.
Its configuration names site a's discovery document in `peers`. Nothing in b depends on
how a is built; only the peer entry and the published addresses join them.
