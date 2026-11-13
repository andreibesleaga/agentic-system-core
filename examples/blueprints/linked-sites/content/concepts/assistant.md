---
type: concept
title: Assistant
description: An agent that reads the sites, starting from one discovery document and following the peer link to the other.
tags:
  - architecture
  - outside
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Assistant

An assistant, a crawler or an agent framework reads a site from its discovery document,
follows the peer link to the other site and reads its `llms.txt`. It does the walking
itself: neither site fetches anything on its behalf.
