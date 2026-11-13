---
type: concept
title: Browser
description: A browser that exposes in-page tools to an agent, through which the pages of the built node offer the same ten tools.
tags:
  - architecture
  - outside
clusters:
  - tool-server-parts
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md
prov:
  origin: human
  operator: human:operator
kind: explainer
---

# Browser

A browser that exposes `document.modelContext`, the WebMCP proposal, lets a page register
tools for an agent. A browser without it shows the pages as they are, and the tools stay
silent.
