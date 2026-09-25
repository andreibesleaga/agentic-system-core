---
type: concept
title: Supervisor
description: A coordinating agent that routes work to specialised workers and collects their results.
tags:
  - agents
  - patterns
clusters:
  - agent-patterns
date: "2026-01-01"
prov:
  origin: human
  operator: human:operator
uses:
  - handoff
kind: pattern
---

## Intent

Route work to specialised workers and collect what they return.

## Context & Forces

One agent cannot hold every skill. Work has to be split, and the split has to be
legible afterwards.

## Structure

A supervisor receives a task, chooses a worker, hands the task over and merges the
results.

## Consequences & Trade-offs

Routing adds a hop and a place for the reasoning to be recorded; it also adds a
single point of failure.

## Related Patterns

See [Handoff](handoff) for the hand-over itself.
