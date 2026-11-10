# The six stages of an ontology, and what the engine does at each

**Who this is for:** a taxonomist, an ontologist or a knowledge engineer who wants to
know where this engine's parts sit in the usual sequence of building a vocabulary.
**Read after:** [plain/05-graph.md](plain/05-graph.md) and
[ONTOLOGY-QUESTIONS.md](ONTOLOGY-QUESTIONS.md).

*Informative. The stage names come from Jessica Talisman's essay "The Ontology
Pipeline®" (<https://jessicatalisman.substack.com/p/the-ontology-pipeline>, 26 May 2025)
and her book* Ontology Pipeline: A Framework for Knowledge Engineering *(Technics
Publications, 2026, ISBN 9798898161392), both checked on 11 November 2026. "The
Ontology Pipeline" is a mark of its owner. The names are used only to place the
engine's parts; this page claims no compatibility with the method and no review by its
author. Where it disagrees with a rule in [`spec/`](../spec/README.md), the rule decides.*

## The stages

| Stage | What the engine does | Rules |
|---|---|---|
| 1. Controlled vocabulary | Every item has one title, its aliases and one slug, in a closed set of six types. `lint` reports two items of one type whose title or alias overlap; a node that declares bounded contexts compares them inside each context only. | spec/02, AGSC-05-21, AGSC-08-32 |
| 2. Metadata standards | A fixed frontmatter contract with its JSON Schema; dates, sources and licences written as Dublin Core terms in the graph; the Dublin Core Tabular Application Profile `schema/dctap.csv` ([DUBLIN-CORE-PROFILE.md](DUBLIN-CORE-PROFILE.md)). | spec/02, AGSC-05-26 |
| 3. Taxonomy | Clusters and the `broader` and `narrower` Links, with the cluster tree and cycle checks. | AGSC-03-01, spec/03 §3.3 |
| 4. Thesaurus | SKOS labels and definitions on every concept, and `related`. `export --skos` writes the SKOS view with its concept scheme; `import <file.ttl> --from skos` reads a thesaurus as draft items. | AGSC-05-36, AGSC-01-39 |
| 5. Ontology | The OWL 2 RL vocabulary `ontology/agsc.ttl`; the relation table, which gives each Link key its inverse, its reading and its meaning; the SHACL shapes ([SHACL-SHAPES.md](SHACL-SHAPES.md)); `export --closure`. A node may add its own classes, relations and invariants (the domain layer, [guides/mode-1.md](guides/mode-1.md#the-domain-layer)). | AGSC-03-01, AGSC-05-24, AGSC-05-37, AGSC-05-38, AGSC-05-41 |
| 6. Knowledge graph | `graph.nq`, `graph.ttl` and `graph.jsonld`; the ten questions the graph answers; the query page `/query/`; the graph view on every page. | spec/05, AGSC-05-34, AGSC-06-38, AGSC-06-39 |

## Why the 1.0 vocabulary has no warrant field

In library science a **warrant** is the reason a term belongs to a vocabulary: its use
in the literature of the field, by the people who ask about the subject, or by the
organisation that keeps the vocabulary. ANSI/NISO Z39.19-2005 (R2010) names these three
kinds.

The 1.0 vocabulary has no field for it, because an item already says what grounds it
in three other places: its `sources` (AGSC-02-10), with the `evidence` facet of a
concept (AGSC-02-12); its provenance block `prov`; and a `derived-from` Link, which the graph writes as a PROV-O
derivation. A warrant field beside them would repeat what they say.

The one exception is the domain layer of 1.1. A term of a node's own vocabulary may
state `warrant`, an object with a `source` and one of the three kinds, and the graph
then carries `dcterms:source` and `asc:warrant` on the item (AGSC-05-40). It records why
the node keeps the term, and it is not a source, evidence or a review.
