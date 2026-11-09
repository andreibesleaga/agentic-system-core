---
type: concept
title: Peers name each other
description: Two sites are linked only when each lists the other as a peer, so the link can be checked from both ends without a server.
tags:
  - decisions
  - peers
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/10-implementation-profiles.md
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/11-boundary.md
prov:
  origin: human
  operator: human:operator
kind: decision
---

# Peers name each other

## Context

A reader who finds a link from one site to another wants to know that both sides agree
to it. A link that only one side declares can be added by anyone, about anyone.

## Considered options

1. **Each site lists the other in `peers`, published as a `rel#peer` link; the checker
   verifies both ends (AGSC-10-12).**
2. Let a site list peers on its own, with no check that the other site agrees.
3. Keep a central register of sites and their links.

## Decision

Option 1. Option 2 lets a site claim a link the other never made: the checker reports it
as `AGSC-E907`. Option 3 adds a service that someone has to run and that both sites
would depend on.

## Consequences

`validate-wellknown --peer` checks both discovery documents and accepts two local files,
so the check runs with no network. Adding a third site means one entry on each side.
