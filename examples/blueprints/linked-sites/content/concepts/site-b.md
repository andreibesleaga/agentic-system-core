---
type: concept
title: Site b
description: The static site built from Bundle b, whose discovery document carries a peer link back to site a.
tags:
  - architecture
  - peers
clusters:
  - linked-sites
requires:
  - bundle-b
related:
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

# Site b

Site b is built from Bundle b the same way. Its discovery document carries the
`rel#peer` link back to site a, which is what makes the pair mutual. The `related` link
from site a to site b records the pair once; the peer links in the two discovery
documents are what a client and the checker read.
