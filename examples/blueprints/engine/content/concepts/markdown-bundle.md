---
type: concept
title: Markdown Bundle
description: The folder of Markdown items and the one configuration file that the engine reads, written by the person who owns the node.
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

# Markdown Bundle

A Bundle is a directory of Markdown items with frontmatter and one `agsc.config.json`.
The person who owns the node writes it and keeps it in git; the engine reads it and
never writes inside `content/`.
