# AGSC-05 — Graph: IRIs, RDF views, SKOS, PROV

## 5.1 Identifiers

- **AGSC-05-01** An item IRI MUST be `<site.base>/<type-plural>/<slug>/` — an HTTPS site URL with a trailing slash. [D41, audit/D §1.1 (amends research/12 §P rule 12)]
- **AGSC-05-02** Vocabulary IRIs MUST use the persistent hash namespace `https://w3id.org/agentic-system-core/ns#`. The site domain MUST NOT appear in a vocabulary IRI. [D02, D41]
- **AGSC-05-03** The Bundle IRI is `<site.base>/`. Cluster IRIs follow AGSC-05-01 with `<type-plural>` = `clusters`. [audit/D §1.1]
- **AGSC-05-04a** The HTTPS item IRI (AGSC-05-01) is the canonical identifier and MAY ALWAYS be used instead of `memory://` — every place that accepts `memory://<bundle>/<slug>` (frontmatter, exports, tool arguments, foreign-node mappings) MUST equally accept the `https://` form, and the two forms MUST be treated as the same identifier. `memory://` is optional sugar, never a requirement. [PRD-027, D33, owner 2026-09-02]
- **AGSC-05-04** `memory://<bundle>/<slug>` is a documented alias of the item IRI. An implementation MUST NOT resolve it and MUST NOT emit it as an RDF subject. [PRD-027 ← D33, G22]
- **AGSC-05-05** If an item carries `iri`, it MUST equal the computed IRI; a mismatch is `AGSC-E204`. [research/12 §P rule 12]

## 5.2 The four RDF views

- **AGSC-05-06** A writer MUST emit `graph.jsonld`, `graph.nq`, `graph.ttl` and per-item `pages/<slug>.{jsonld,md}`; `graph.rdf` is SHOULD-level. All views express the same triples. [PRD-022 ← D30, D41]
- **AGSC-05-07** `pages/<slug>.md` MUST be a byte-identical copy of the lint-normalized source file. [research/12 §P rule 22]
- **AGSC-05-08** The RDF dataset MUST be **blank-node-free**: every node has an IRI. Blank nodes in an export are error `AGSC-E605`. [research/12 §P rule 20, D41]
- **AGSC-05-09** `graph.jsonld` MUST reference the versioned context URL, declare `"@version": 1.1`, mark every term `@protected`, and sort nodes by `@id` and properties per AGSC-04-05. Released context files are immutable; new terms require a new file. [research/12 §P rules 20, 41]
- **AGSC-05-10** `graph.ttl` MUST follow the stable-Turtle profile: fixed prefix list in fixed order; subjects, then predicates, then objects sorted by IRI code points; one triple per line grouped with `;`; explicit datatypes except `xsd:string` and language-tagged literals; `a` for `rdf:type`. `graph.rdf` sorts elements the same way. Both MUST be isomorphic to `graph.nq`. [research/12 §3, §P rule 21]
- **AGSC-05-11** Emission is one-way. An implementation MUST NOT claim to be a JSON-LD processor, an RDF parser or a SHACL engine on the strength of these outputs. [audit/G §1 JSON-LD row]

## 5.3 Class and property mapping

- **AGSC-05-12** Items MUST be typed per `ontology/agsc.ttl`: `concept` → `asc:Concept` (⊑ `skos:Concept`), `lesson` → `asc:Lesson` (⊑ `asc:Concept`), `episode` → `asc:Episode` (⊑ `prov:Activity`), `procedure` → `asc:Procedure` (⊑ `prov:Plan`), `cluster` → `asc:Cluster` (⊑ `skos:Collection`), `gate` → `asc:Gate` (⊑ `prov:Plan`). The Bundle is `asc:Bundle` (⊑ `skos:ConceptScheme`). [research/16 §3.3]
- **AGSC-05-13** There is no common superclass for items; an `asc:Item` class MUST NOT be emitted. An Activity is not an Entity, and the union would fail OntoClean while answering no competency question. [research/16 §3.2, §3.3]
- **AGSC-05-14** Each `sources[]` entry MUST be instantiated as an `asc:Source` (⊑ `prov:Entity`) with an IRI derived from its `resource`, carrying `dcterms:bibliographicCitation`, `asc:verifiedOn` and `asc:grade` where present. `asc:verifiedOn` is `xsd:dateTime` (the OWL 2 datatype map has no `xsd:date`, AGSC-05-22): a `verified` date `YYYY-MM-DD` MUST be rendered as the midnight instant `YYYY-MM-DDT00:00:00Z`. [research/16 §3.3, audit/D §1.1, D48(6)]
- **AGSC-05-15** `verified[]` MUST be instantiated as an `asc:Review` (⊑ `prov:Activity`) whose IRI is `<item-IRI>#review-<n>`, `<n>` being the 1-based index of the entry in authored `verified[]` order — Reviews therefore have IRIs and never become blank nodes (AGSC-05-08). The actor and instant MUST be emitted as the datatype properties `asc:verifiedBy` (the `by` string) and `asc:verifiedAt` (the `at` instant); `prov:wasAssociatedWith` MUST NOT be used, because `by` is an actor string and not an IRI, and `prov:wasAssociatedWith` is an object property whose range is `prov:Agent`. Proposals come only from the derived git log, and a Proposal's IRI is the forge pull-request URL. [research/16 §3.3, G35, D48(6)]
- **AGSC-05-16** The nine Link keys MUST map exactly as tabulated in §03; inline links map to `asc:mentions`. [research/16 §3.3]

## 5.4 SKOS integrity

- **AGSC-05-17** Every Concept MUST carry `skos:inScheme` the Bundle, exactly one `skos:prefLabel` per language tag, and `skos:altLabel` for each alias. [research/12 §P rule 40, SKOS S14]
- **AGSC-05-18** Cluster membership MUST be emitted as `<cluster> skos:member <item>` from the item's `clusters[]`. [research/16 §3.3]
- **AGSC-05-19** **Cluster nesting rule.** `broader` on a `type: cluster` file is a nesting statement and MUST be exported as `<parent> skos:member <child>` — a nested `skos:Collection`. `skos:broader` on a Collection is forbidden: its domain and range are `skos:Concept` (S19/S20), which is disjoint with `skos:Collection` (S37), so the triple would entail a contradiction and fail every SKOS validator. [research/16 §3.3, audit/D addendum 2026-09-01, D43(5)]
- **AGSC-05-20** `broader`/`narrower` between Concepts MUST be exported as `skos:broader`/`skos:narrower`. A Collection MUST NOT appear in any semantic relation (`skos:broader`, `skos:narrower`, `skos:related`). [research/16 §3.5]
- **AGSC-05-21** The machine-checkable qSKOS subset MUST be linted: cyclic hierarchies, overlapping labels, orphan concepts, missing in-links, missing definitions, undefined resources. [audit/G §1 SKOS row]

## 5.5 Profile and reasoning

- **AGSC-05-22** `ontology/agsc.ttl` MUST stay inside OWL 2 RL. Constructs outside RL MUST be rejected by lint. [research/16 §3.1, D41]
- **AGSC-05-23** No reasoner runs at build. Relied-upon entailments — inverses and cluster nesting — MUST be materialized explicitly; integrity comes from JSON Schema and generated SHACL shapes. [research/16 §3.1, D43(5)]
- **AGSC-05-24** SHACL shapes MUST be generated from `schema/item.schema.json`, never hand-edited, and run in a development lane; without that lane the "validated by SHACL" claim MUST be dropped. [research/12 §P rule 28, audit/G §1 SHACL row]
- **AGSC-05-25** The ontology MUST declare `owl:versionIRI` per release and MUST mark retired terms `owl:deprecated true` with `dcterms:isReplacedBy` instead of deleting them. [research/16 §3.2, research/12 §P rule 42]

## 5.6 Frontmatter → property mapping

- **AGSC-05-26** Every `asc:` datatype property MUST be emitted from exactly the frontmatter key named here, on exactly the subject named here, with exactly this datatype — so that `graph.ttl`, `graph.nq` and the per-item JSON-LD are reproducible from `spec/` plus the Bundle alone (AGSC-00-01, NFR-02). A key absent from an item emits no triple; no property is ever inferred, defaulted or invented.

| Frontmatter key | Subject | Property | Datatype / form |
|---|---|---|---|
| `status` (default `stable`, AGSC-02-23) | the item | `asc:status` | `xsd:string` |
| `kind` (concept only) | the item | `asc:kind` | `xsd:string` |
| `stale_after` | the item | `asc:staleAfter` | `xsd:dateTime` |
| `prov.origin` | the item | `asc:origin` | `xsd:string` |
| `prov.operator` | the item | `asc:operator` | `xsd:string` (`human:<id>`, AGSC-02-07) |
| `prov.model` | the item | `asc:model` | `xsd:string` |
| `level` (gate only) | the item | `asc:level` | `xsd:string` |
| `severity` (lesson only) | the item | `asc:severity` | `xsd:string` |
| `outcome` (episode only) | the item | `asc:outcome` | `xsd:string` |
| `generated.by` | the item | `asc:generatedBy` | `xsd:string` |
| `generated.at` | the item | `asc:generatedAt` | `xsd:dateTime` |
| `spec_version` of `agsc.config.json` | the Bundle (AGSC-05-03) | `asc:specVersion` | `xsd:string` |
| `sources[].grade` | the Source (AGSC-05-14) | `asc:grade` | `xsd:string` |
| `sources[].verified` | the Source | `asc:verifiedOn` | `xsd:dateTime` (midnight of that date) |
| `verified[].by` | the Review (AGSC-05-15) | `asc:verifiedBy` | `xsd:string` |
| `verified[].at` | the Review | `asc:verifiedAt` | `xsd:dateTime` |

- **AGSC-05-27** `title`, `description` and `aliases` map to `skos:prefLabel`, `skos:definition` and `skos:altLabel` (AGSC-05-17); `date`/`modified` to `dcterms:created`/`dcterms:modified`; `clusters[]` to `skos:member` (AGSC-05-18); the nine Link keys and inline links per AGSC-05-16. Object properties come only from these keys: `asc:uses`, `asc:usedBy`, `asc:excludes`, `asc:contradicts` and `asc:mentions` have no other source. [research/16 §3.3, V2-10]
- **AGSC-05-28** A vocabulary term that no rule of §5.3 or §5.6 emits MUST NOT ship in `ontology/agsc.ttl`: before 1.0.0 it is deleted, and after 1.0.0 it is marked `owl:deprecated true` per AGSC-05-25. `asc:verdict` was deleted under this rule at 1.0.0-draft.1 — a Review's verdict lives in the forge, not in a file (AGSC-08-03) — leaving 11 classes and 21 properties. [D47, NFR-02 ← V2-10]
