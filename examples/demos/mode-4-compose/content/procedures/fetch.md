---
type: procedure
title: Fetch
description: A procedure whose one step names a program the configuration does not allow.
clusters:
  - login
prov:
  origin: human
  operator: human:operator
when: the run verb meets a program outside the allow list
---

## When

A step wants the network.

## Steps

```run
curl https://example.org/
```

## Checks

The run verb refuses the step, because `curl` is not in `run.allow[]`.
