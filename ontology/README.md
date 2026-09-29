# `ontology/` — the vocabulary

**Summary.** `agsc.ttl` is the vocabulary of the knowledge graph every node publishes:
a small OWL 2 RL ontology in Turtle, aligned to SKOS, PROV-O and Dublin Core. Its
classes, object properties and datatype properties are the terms `spec/05-graph.md`
uses; `tools/gen-ns` turns it into the `/ns/` pages, `context.jsonld` and `agsc.rdf`
a node serves. `alignments.ttl` is informative: SKOS mapping statements from these
terms to neighbouring vocabularies, read by no build.

**Read after:** [spec/05-graph.md](../spec/05-graph.md). The terms, with their
definitions, are listed in [docs/GLOSSARY.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/GLOSSARY.md), which is generated
from this file.

```bash
node tools/validate-ontology --json   # Turtle, the axiom allow-list, SKOS pitfalls
node tools/count-artifacts --json     # the number of terms, derived from agsc.ttl
```

Published as part of `1.0.0-rc.6`, the first public release candidate; like `spec/`, it changes only in a specification pass, and a term is deprecated rather than deleted. Licence: CC0-1.0.
