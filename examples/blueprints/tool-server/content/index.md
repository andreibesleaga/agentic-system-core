---
spec_version: 1.0.0
okf_version: "0.2"
title: Tool server blueprint
description: A blueprint of an agent tool server over a knowledge node, with a client, written as a Bundle, from which compose writes the C4 diagrams, the decision records and the build plan.
base: https://tool-server-blueprint.example/
lang: en
license: LicenseRef-AgenticSystemCore-Content-Use-1.0
prov:
  origin: human
  operator: human:operator
---

# Tool server blueprint

The saved architecture `tool-server-and-client` selects the Bundle an agent works on,
the tool server that reads it, its HTTP transport, a client, the same tools on the
published pages, and the checks that prove each one.
`agsc compose --from tool-server-and-client --brief` turns it into a blueprint.
