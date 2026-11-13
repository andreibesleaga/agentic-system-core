---
type: concept
title: A discovery document with digests
description: Each site publishes one linkset at a well-known address that lists its files with their digests and names its peers.
tags:
  - decisions
  - peers
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/06-surfaces.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PROTOCOLS.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# A discovery document with digests

## Context

An agent that arrives at a site needs to find its graph, its text files, its ledger and
its peers, and to know that what it fetched is what the site published.

## Considered options

1. **One linkset (RFC 9264) at `/.well-known/knowledge-linkset`, a proposed well-known
   URI, with a SHA-256 digest on every link to an artefact of the site.**
2. A sitemap alone.
3. An HTTP interface that answers queries about the site.

## Decision

Option 1. Option 2 lists pages but carries no relation names and no digests. Option 3
needs a server, and the sites are static files.

## Consequences

The checker reads the document, resolves every link and checks every digest. The peer
link carries no digest, because the other site changes on its own schedule.
