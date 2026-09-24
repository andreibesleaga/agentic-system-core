# Specification — how the twelve chapters depend on one another

**What this shows.** Which chapters a chapter builds on. Read a chapter after the ones
that point to it. The overview (00) defines the terms every other chapter uses; 04 fixes the
bytes everything emitted must have; 09 and 10 say how all of it is checked and
claimed.

```mermaid
flowchart TD
  C00["00 Overview<br/>terms, versions, plugins"]
  C01["01 Bundle<br/>folder, configuration, import, export"]
  C02["02 Item<br/>frontmatter, types, body"]
  C03["03 Links<br/>fourteen keys"]
  C04["04 Canonical bytes"]
  C05["05 Graph<br/>ontology, RDF views"]
  C06["06 Surfaces<br/>routes, discovery, text files"]
  C07["07 Composition<br/>closure, Harness, skills"]
  C08["08 Governance<br/>provenance, lints, ledger"]
  C09["09 Conformance<br/>CLI, codes, vectors"]
  C10["10 Implementation profiles<br/>Levels, hosting, live board"]
  C11["11 Boundary<br/>federation, visibility, tool surfaces"]
  C00 --> C01 --> C02 --> C03
  C02 --> C04
  C03 --> C05
  C04 --> C05
  C04 --> C06
  C05 --> C06
  C03 --> C07
  C02 --> C08
  C06 --> C09
  C08 --> C09
  C09 --> C10
  C06 --> C11
  C10 --> C11
```

Trace: AGSC-00-01 (what the specification is), AGSC-09-04 (vector areas per chapter),
AGSC-10-15 (areas per Level).
