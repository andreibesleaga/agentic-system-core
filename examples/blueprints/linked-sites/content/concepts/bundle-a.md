---
type: concept
title: Bundle a
description: The source of site a, Markdown items and one configuration file kept in git, whose peers list names site b.
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

# Bundle a

Bundle a is a folder of Markdown items with one `agsc.config.json`, kept in git so that
the site can derive its ledger. Its configuration names site b's discovery document in
`peers`. When an item of a refers to something on b, it cites b's address in `sources`
and never in a Link key.
