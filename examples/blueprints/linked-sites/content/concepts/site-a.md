---
type: concept
title: Site a
description: The static site built from Bundle a, whose discovery document carries a peer link to site b and a digest for every file it lists.
tags:
  - architecture
  - peers
clusters:
  - linked-sites
requires:
  - bundle-a
related:
  - site-b
  - assistant
uses:
  - static-host
decided-by:
  - decision-peers-name-each-other
  - decision-linkset-discovery-document
  - decision-client-walks-the-peers
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/examples/demos/mode-1-memory/README.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/06-surfaces.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Site a

`agsc build` turns Bundle a into static files: pages, the graph, `llms.txt`, the ledger
and the discovery document at `/.well-known/knowledge-linkset`. That document lists
every artefact with its SHA-256 digest and carries one `rel#peer` link, to site b's
discovery document. A static host serves the files as they are.
