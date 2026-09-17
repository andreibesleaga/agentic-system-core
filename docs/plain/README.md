# The specification in plain language

One short page per section of `spec/`, plus one on the six modes. These pages explain; they never decide. Where a page and a rule disagree, the rule (`spec/NN`, ids `AGSC-NN-nn`) wins. Written 2026-09-16 for the `1.0.0-rc.3` draft.

| Page | What it explains |
|---|---|
| [00 — Overview](00-overview.md) | what a Bundle is, what conformance means, how versions move |
| [01 — Bundle](01-bundle.md) | the directory, the one config file, import and export |
| [02 — Item](02-item.md) | one Markdown file with frontmatter; the six types; ports, attachments, tasks |
| [03 — Links](03-links.md) | the fourteen typed links and what the combiner does with them |
| [04 — Canonicalization](04-canonicalization.md) | why two builds anywhere give the same bytes |
| [05 — Graph](05-graph.md) | the RDF views and the vocabulary |
| [06 — Surfaces](06-surfaces.md) | routes, the discovery file, llms.txt, the chunk export |
| [07 — Composition](07-composition.md) | select items, get a harness |
| [08 — Governance](08-governance.md) | provenance, gates, the ledger, agent safety |
| [09 — Conformance](09-conformance.md) | classes, vectors, the CLI, error codes |
| [10 — Implementation profiles](10-implementation-profiles.md) | Levels 0–3, foreign knowledge bases, peers, project mode |
| [11 — Boundary](11-boundary.md) | where a node meets a browser, another node, a stranger |
| [Modes](modes.md) | the six ways people and agents use the same Bundle |
