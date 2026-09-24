---
type: lesson
title: Record why a handoff happened
description: Two agents lost the reason a handoff happened, so the audit trail broke; record the reason with the handoff.
date: "2026-01-01"
severity: warn
clusters:
  - agent-patterns
prov:
  origin: human
  operator: human:andreibesleaga
---

## What happened

A handoff carried the task and not the reason, and the audit could not be closed.

## Lesson

Record the reason with every handoff, so the audit can close.

## Evidence

The audit trail of the handoff named the receiver and not the reason.

## Check before

Before a handoff, check that the reason is written down with it.
