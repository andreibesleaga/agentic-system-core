---
type: concept
title: Governance
description: The context that records who changed what and why, through provenance, trailers, gates, the derived ledger and the boards.
tags:
  - architecture
  - engine
clusters:
  - engine-parts
requires:
  - knowledge
  - ports
uses:
  - forge
decided-by:
  - decision-ledger-from-git
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/.dependency-cruiser.js
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Governance

Governance owns the `prov` fields, the commit trailers, gates that become CI checks,
the ledger derived from the git history, agent lanes and boards. It never renders a
page and never composes. Its trailers and ledger entries are the published language that
Distribution and Interchange read.
