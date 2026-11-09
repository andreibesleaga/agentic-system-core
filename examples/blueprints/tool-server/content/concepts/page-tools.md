---
type: concept
title: Page tools
description: The same ten tools, registered by the pages of the built node for an agent in a browser, giving answers equal to the tool server's.
tags:
  - architecture
  - tools
clusters:
  - tool-server-parts
requires:
  - knowledge-bundle
related:
  - browser
decided-by:
  - decision-same-tools-on-the-page
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Page tools

`agsc build` publishes the Bundle as a static node whose item pages and `/compose/` page
register the same ten tools through `document.modelContext`, where a browser offers it
(AGSC-09-16). For the same Bundle and the same arguments, the answers equal the tool
server's. The engine ships `examples/demos/agents/page-tools.js`, which loads a page's
scripts and calls a tool the way the page does.
