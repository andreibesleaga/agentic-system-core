---
type: concept
title: Static host
description: Any host that serves the built files of a site as they are, from a web host to a local machine.
tags:
  - architecture
  - outside
clusters:
  - linked-sites
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/diagrams/arch-c4-context.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Static host

Each site is a folder of static files. Any host that serves files serves it; the two
sites may sit on two different hosts, and no code of the engine runs on either.
