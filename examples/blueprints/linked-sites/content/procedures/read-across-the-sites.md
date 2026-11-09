---
type: procedure
title: Read across the sites
description: Follow the peer link from site a's discovery document to site b's llms.txt, the way an agent reads the pair.
tags:
  - checks
  - peers
clusters:
  - linked-sites
requires:
  - site-a
  - site-b
verifies:
  - site-b
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
when: An agent is about to use both sites
---

# Read across the sites

## When

An agent is about to use both sites.

## Steps

1. Read site a's discovery document and take its `rel#peer` link.
2. Read site b's `llms.txt` at the address that link leads to.

## Checks

Every link to one of site a's own files carries a digest; the peer link leads to site b,
whose `llms.txt` names site b as its Bundle.
