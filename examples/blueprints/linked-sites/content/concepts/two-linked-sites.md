---
type: concept
title: Two linked knowledge sites
description: The saved architecture of two knowledge sites, each built from its own Bundle, that name each other as peers and cite each other by address.
tags:
  - architecture
  - peers
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/examples/demos/mode-1-memory/README.md
prov:
  origin: human
  operator: human:operator
kind: architecture
---

# Two linked knowledge sites

Two people each keep a Bundle in git and publish it as a static site. Each site names
the other as a peer in its discovery document, so an agent that starts on one can find
the other, and the shipped checker can prove that the link holds both ways. Neither
site runs a server, and neither fetches the other.

```yaml agsc-selection
- bundle-a
- bundle-b
- site-a
- site-b
- build-each-site
- check-the-mutual-peering
- read-across-the-sites
- cite-the-other-site
```
