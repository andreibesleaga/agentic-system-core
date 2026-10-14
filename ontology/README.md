# `ontology/` — the vocabulary

**Summary.** `agsc.ttl` is the vocabulary of the knowledge graph every node publishes:
a small OWL 2 RL ontology in Turtle, aligned to SKOS, PROV-O and Dublin Core. Its
classes, object properties and datatype properties are the terms `spec/05-graph.md`
uses; `tools/gen-ns` turns it into the `/ns/` pages, `context.jsonld` and `agsc.rdf`
a node serves. Besides its terms, the file declares the annotation properties and the
classes of other vocabularies it uses, one type triple each, so that an OWL 2 profile
checker finds the whole file inside OWL 2 RL; those declarations are not terms of this
vocabulary and are not counted. `alignments.ttl` is informative: SKOS mapping statements from these
terms to neighbouring vocabularies, read by no build.

**Read after:** [spec/05-graph.md](../spec/05-graph.md). The terms, with their
definitions, are listed in [docs/GLOSSARY.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/GLOSSARY.md), which is generated
from this file.

```bash
node tools/validate-ontology --json   # Turtle, the axiom allow-list, RL datatypes, declarations, SKOS pitfalls
node tools/count-artifacts --json     # the number of terms, derived from agsc.ttl
```

Its version is `1.0.0` (`owl:versionIRI` `https://w3id.org/agentic-system-core/ns/1.0.0`), served unchanged under `/ns/1.0.0/` from specification `1.0.0` on. The copy published with `1.0.0-rc.6` and `1.0.0-rc.7`, version `1.0.0-draft.1`, stays served under `/ns/1.0.0-draft.1/` and never changes (AGSC-05-25). A changed label or comment is a changed file and takes a new vocabulary version; like `spec/`, the file changes only in a specification pass, and a term is deprecated rather than deleted. Licence: CC0-1.0.
