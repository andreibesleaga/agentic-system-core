---
type: concept
title: Assistant
description: An assistant app that hosts a Model Context Protocol client and starts the tool server in the author's Bundle.
tags:
  - architecture
  - outside
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USING-WITH-ASSISTANTS.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Assistant

An assistant app on the author's machine is configured with one command, `agsc mcp`,
and the Bundle as its working directory. It then calls the ten tools on the agent's
behalf.
