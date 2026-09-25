---
type: procedure
title: Greet
description: A tiny runnable procedure that prints one line, so the run verb has something real.
clusters:
  - login
prov:
  origin: human
  operator: human:operator
when: the run verb needs a step
---

## When

A person wants to see the run verb do something.

## Steps

```run
echo hello
```

## Checks

```expect
hello
```
