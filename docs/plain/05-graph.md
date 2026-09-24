# 05 — Graph, in plain language

**Every item is a node with a web address** (`<site>/concepts/<slug>/`), and every link is an edge. The Bundle is exported as JSON-LD, Turtle, N-Quads and RDF/XML — one graph, four syntaxes — plus one file per item. *(Corrected 2026-09-24: this read "three syntaxes"; the RDF/XML view is the fourth.)*

**The vocabulary.** A small OWL 2 RL ontology (`ontology/agsc.ttl`, CC0) with 12 classes and 40 properties, aligned to SKOS (concepts and clusters), PROV-O (episodes, procedures, gates, reviews, sources) and Dublin Core. There is deliberately no common `Item` class.

**No inference at build.** Everything a consumer might expect from reasoning — inverses, cluster nesting — is written out explicitly, so what you read is what was emitted.

**Byte pins.** Literals take exactly one of three forms (language-tagged, typed, plain), N-Quads escaping is fixed, and because the graph has no blank nodes its canonical form is just a sort.

**Since rc.3.** Attachments are nodes with a SHA-256; ports and task states are datatype properties; a citation of another node becomes `rdfs:seeAlso` plus `asc:peerOrigin`.

Rules: `spec/05-graph.md`, `AGSC-05-01` … `AGSC-05-32`.
