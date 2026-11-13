---
spec_version: 1.0.0
okf_version: "0.2"
title: Linked sites blueprint
description: A blueprint of two knowledge sites that name each other as peers, written as a Bundle, from which compose writes the C4 diagrams, the decision records and the build plan.
base: https://linked-sites-blueprint.example/
lang: en
license: LicenseRef-AgenticSystemCore-Content-Use-1.0
prov:
  origin: human
  operator: human:operator
---

# Linked sites blueprint

The saved architecture `two-linked-sites` selects the two Bundles, the two sites built
from them, and the checks that prove the sites are linked both ways.
`agsc compose --from two-linked-sites --brief` turns it into a blueprint.
