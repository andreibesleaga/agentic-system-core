---
type: concept
title: Login specification
description: What the login form must do, stated as a specification item that the tasks implement and the tests verify.
clusters:
  - login
prov:
  origin: human
  operator: human:operator
implements:
  - decide-the-login
kind: spec
---

## Specification

The form takes a name and a password and refuses more than five attempts per address.
