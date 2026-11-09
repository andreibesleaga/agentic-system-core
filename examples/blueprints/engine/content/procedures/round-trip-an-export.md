---
type: procedure
title: Round-trip an export
description: Export a Bundle to another tool's format and import it into a fresh Bundle twice, which proves the Interchange context keeps every item.
tags:
  - checks
  - engine
clusters:
  - engine-parts
requires:
  - interchange
verifies:
  - interchange
sources:
  - resource: https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md
prov:
  origin: human
  operator: human:operator
when: The Interchange context has changed
---

# Round-trip an export

## When

The Interchange context has changed.

## Steps

1. In a Bundle that carries `LICENSE-CONTENT`, run `agsc export --okf`.
2. In a new folder, run `agsc init`, then `agsc import <bundle>/dist/export/okf --from okf` twice.

## Checks

One import writes every exported item; a second one writes nothing and reports
every item unchanged.
