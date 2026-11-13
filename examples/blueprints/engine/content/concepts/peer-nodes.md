---
type: concept
title: Peer nodes
description: Other knowledge nodes that this node names as peers and that name it back in their discovery documents.
tags:
  - architecture
  - outside
clusters:
  - engine-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-context.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Peer nodes

Peers are other nodes. A node names them with `rel#peer` links, and a client walks
those links; the node itself fetches nothing from them while it builds.
