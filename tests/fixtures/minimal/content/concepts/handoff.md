---
type: concept
title: Handoff
description: The transfer of control and context from one agent to another, recorded so that it can be audited.
tags:
  - agents
  - patterns
clusters:
  - agent-patterns
date: "2026-01-01"
prov:
  origin: human
  operator: human:andreibesleaga
kind: pattern
---

## Intent

Pass control and the context that goes with it from one agent to another.

## Context & Forces

Control has to move without losing the reason it moved, or the trail breaks.

## Structure

The sending agent writes what it knows, names the receiver, and stops acting.

## Consequences & Trade-offs

The record makes the transfer auditable; it also makes every transfer slower.

## Related Patterns

See [Supervisor](supervisor) for the agent that usually initiates a handoff.
