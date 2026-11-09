---
spec_version: 1.0.0
okf_version: "0.2"
title: Engine blueprint
description: A blueprint of the AgenticSystemCore engine, written as a Bundle, from which compose writes the C4 diagrams, the decision records and the build plan.
base: https://engine-blueprint.example/
lang: en
license: LicenseRef-AgenticSystemCore-Content-Use-1.0
prov:
  origin: human
  operator: human:operator
---

# Engine blueprint

The saved architecture `agenticsystemcore-engine` selects the
parts the engine is built from, in the order the dependency rule allows, and the check
that proves each part. `agsc compose --from agenticsystemcore-engine --brief` turns it
into a blueprint.
