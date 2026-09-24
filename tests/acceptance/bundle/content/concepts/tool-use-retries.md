---
type: concept
title: Tool-use retries
description: Handles tool-use retries — every failed tool call is retried at most three times with backoff, then reported.
tags:
  - agents
  - reliability
clusters:
  - agent-patterns
date: "2026-01-01"
prov:
  origin: human
  operator: human:andreibesleaga
stale_after: 2025-06-01T00:00:00Z
kind: pattern
---

## Intent

Retry a failed tool call a bounded number of times, then give up loudly.

## Context & Forces

The forces are the usual ones: cost, latency and the need to audit what happened.

## Structure

The structure is described in the intent above and in the sources the node cites.

## Consequences & Trade-offs

Every choice here makes one thing easier and another harder, and says which.

## Related Patterns

See the other members of the same cluster.
