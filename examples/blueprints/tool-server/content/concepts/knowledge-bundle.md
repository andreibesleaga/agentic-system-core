---
type: concept
title: Knowledge Bundle
description: The Bundle the agent works on, Markdown items with one configuration file, read by the tool server as it is on disk.
tags:
  - architecture
  - tools
clusters:
  - tool-server-parts
uses:
  - forge
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md
prov:
  origin: human
  operator: human:operator
kind: spec
---

# Knowledge Bundle

The Bundle is the folder of Markdown items and the one `agsc.config.json` that the
author keeps in git. The tool server reads it as it is on disk, drafts included, and
never writes to it; a change an agent prepares reaches it only when a person applies it.
