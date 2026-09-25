---
type: gate
title: Merge gate
prov:
  origin: human
  operator: human:operator
level: L2
checks:
  - schema
  - links
  - review
enforce:
  - status-check
  - ruleset
---

# Merge gate

Every change passes these checks before it merges.
