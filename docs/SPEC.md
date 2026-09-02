# SPEC — AgenticSystemCore (S03 index)

**`spec_version: "1.0.0-draft.1"`.** This file indexes the normative material; it is not itself normative. The specification is `spec/00`–`spec/09` (213 numbered MUST/SHOULD rules with stable ids `AGSC-<section>-<nn>`), `schema/{item,bundle,config}.schema.json`, `ontology/agsc.ttl` (33 terms) and `tests/vectors/**` (27 vectors). Together they *are* the system: the Node engine is one conforming implementation, and behaviour observable only in it is a defect (NFR-02 ← D47, Art. XI).

## 1. Sections

| Section | Covers | Vector areas |
|---|---|---|
| `00-overview` | scope, BCP 14 usage, the twelve terms, conformance classes, SemVer policy | `bundle/` |
| `01-bundle` | folders, `content/index.md`, slugs, encoding, `agsc.config.json`, import tolerance | `slug/`, `bundle/` |
| `02-item` | YAML failsafe subset, common keys, per-type keys, body sections | `frontmatter/` |
| `03-links` | the nine keys, computed inverses, cycles, wikilinks, combiner semantics | `links/` |
| `04-canonicalization` | JCS, NFC/LF/UTC seconds, `SOURCE_DATE_EPOCH`, ordering, hashes | `jcs/`, `graph/` |
| `05-graph` | item IRIs, four RDF views, class mapping, SKOS integrity, OWL 2 RL | `graph/` |
| `06-surfaces` | route set R36, the one well-known file, `llms.txt`, headers, budgets | `discovery/` |
| `07-composition` | closure → hide → mutex → warn, the seven Harness files, skill packs | `compose/` |
| `08-governance` | `prov`, DCO-Plus trailers, Gates, the four N9 lints, the hash-chained ledger | `lint/`, `prov/`, `ledger/` |
| `09-conformance` | classes, vector format, error-code registry, CLI contract | `cli/` |

## 2. Versioning

SemVer 2.0.0. **MAJOR**: a file valid under the previous MAJOR may fail. **MINOR**: new optional keys, enum values or vectors. **PATCH**: clarifications and vectors conforming implementations already pass. Readers accept any Bundle of the same MAJOR, tolerate unknown keys and unknown link keys, and never reject a file for them. Released spec sections, context files and vectors are immutable; ontology terms are deprecated, never deleted (AGSC-00-14…17).

## 3. Conformance classes

**Reader** — §01–§03 and §05 read-side; passes `frontmatter/`, `slug/`, `links/`. **Writer** — a reader plus §04–§06; passes `jcs/`, `graph/`, `discovery/`. **Full engine** — a writer plus §07–§09; passes every required vector. A claim names the class, the `spec_version` MAJOR.MINOR and the vector set passed (AGSC-00-09…13).

## 4. Standards Register

*Define* = we author the artefact and register it; *conform* = we implement someone else's. Anything without an executable test is a claim, not conformance (audit/G §1).

| Standard | Version / status | Our use | Stance | Conformance test | v1? |
|---|---|---|---|---|---|
| OKF | v0.2 | frontmatter superset; `index.md`/`log.md` reserved | conform | import Google sample bundles; export round-trip | Y |
| CommonMark + GFM tables | 0.31.2 / GFM 0.29 | body profile; no footnotes, no raw HTML | conform | `frontmatter/`, renderer golden fixtures | Y |
| YAML | 1.2.2, **failsafe** subset | frontmatter reader; types come from JSON Schema | conform (subset) | `frontmatter/fm-0002/0005/0006` | Y |
| JSON Schema | 2020-12, keyword subset | `schema/*.json`; SHACL generated from it | conform | vectors validate against the schemas | Y |
| JCS | RFC 8785 (Informational) | every emitted JSON; UTF-16 key sort | conform | `jcs/jcs-0001`, `jcs-0002` + RFC App. B | Y |
| RDFC-1.0 | W3C Rec 2024-05-21 | `graph.nq`, `bundle.hash` — **blank-node-free scope only** | conform (scoped) | `graph/graph-0001`, `graph-0003` | Y (scoped) |
| JSON-LD | 1.1 Rec | `graph.jsonld`, per-item JSON-LD, CC0 context | conform (document only) | dev-lane expand + toRdf vs `graph.nq` | Y |
| Turtle | RDF 1.1 Rec | `graph.ttl` stable profile | conform | third-party parse → isomorphic to `graph.nq` | Y |
| SKOS | Rec 2009 | Concepts, Bundle scheme, nested Collections | conform | `graph/graph-0002`; qSKOS subset in lint | Y |
| PROV-O | Rec 2013 | Episode/Procedure/Gate/Proposal/Review/Source | conform | shape check: Activity + Agent + ranges | Y |
| OWL 2 RL | Rec 2012 | `ontology/agsc.ttl` profile | conform | profile check at release; RL-only lint | Y |
| SHACL | Rec 2017 | shapes generated from the schema | conform (dev lane) | pySHACL/dev validator over `graph.ttl` | Y |
| RFC 8615 well-known | Standards Track | `/.well-known/agentic-knowledge` | **define** | registration template in the I-D; Expert Review | Y |
| RFC 8288 relations | Standards Track | `…/rel#graph`, `#ontology`, `#context`, `#shapes`, `#now`, `#skills`, `#ledger` | **define** | `discovery/disc-0001` (no unregistered short names) | Y |
| RFC 6838 media types | Standards Track | `application/vnd.agenticsystemcore.agentic-knowledge+json` | **define** | IANA vendor-tree registration; JSON Schema | Y |
| RFC 9264 linkset | Standards Track | the `linkset` member + our profile URI | conform + profile **define** | `discovery/disc-0001` | Y |
| llms.txt | convention, spec v2 | `/llms.txt`, `/llms-full.txt` | conform | structural lint: H1, blockquote, resolving links | Y |
| Agent Skills | agentskills.io | `SKILL.md` packs per Cluster | conform | name grammar (no `--`), `description` ≤1024 | Y |
| MCP | 2026-07-28, stdio | `agsc mcp`, five tools | conform | Inspector `tools/list`; no stray stdout bytes | Y |
| WebMCP | W3C CG draft 2026-08-26 | same five tools as page tools | conform | origin-trial browser run; feature-detect fallback | should (S8) |
| AGENTS.md | agents.md convention | `export --steer`, Harness `AGENTS.md` | conform | byte-stable emit; context-only assertion | Y |
| robots.txt | RFC 9309 | AI-usage signals with `tdmrep.json` | conform | grammar + size lint | Y |
| security.txt | RFC 9116 | `Contact` + `Expires` | conform | presence + expiry check | Y |
| Sitemaps | sitemaps.org 0.9 | one `sitemap.xml` | conform | well-formedness, count, URL resolution | Y |
| Schema.org | v30.0 | `TechArticle`, `DefinedTerm`, `Dataset` in HTML | conform | validator.schema.org on the release checklist | Y |

Also conformed to, and proved in the lanes of PLAN §10 rather than here: SemVer 2.0.0, Keep a Changelog 1.1.0, `SOURCE_DATE_EPOCH`, BCP 47, RFC 9110 conneg/303, WCAG 2.2 AA, REUSE 3.3, SLSA v1.0 Build L2, CITATION.cff 1.2.0. VoID (`/.well-known/void`, registered 2011) is prior art for dataset discovery and MUST be cited as complementary wherever our discovery layer is described. Dropped at v1: A2A `agent-card.json` (no endpoint exists), DCAT, DID/VC, SBOM.

## 5. Standardization surface

Three artefacts are ours to standardize, and no more. The **Internet-Draft** covers only the *discovery layer*: the `agentic-knowledge` well-known URI (RFC 8615), the vendor media type (RFC 6838), the link relation and our extension relations (RFC 8288), and a linkset profile (RFC 9264) presented as complementary to VoID and RFC 9727. **`spec/00`–`09` plus `tests/vectors/`** are the *format standard* — and, per D47, the definition of the system itself: any language must be able to reimplement AgenticSystemCore from them alone. **`ontology/agsc.ttl` plus the JSON-LD context**, published at `https://w3id.org/agentic-system-core/ns#`, are the *vocabulary standard*. Everything else in §4 is conformance to work other people own.

## 6. Spec decisions made here

1. Error codes: PLAN §8's `AGSC-<AREA>-<nnn>` is realised as the compact `AGSC-E<nnn>`, hundreds digit = area block (§9.4).
2. No `asc:Item` superclass — "Item" is a term of the spec only (OntoClean, research/16 §3.3); the ontology keeps its 11 classes.
3. The well-known file is one JSON object with exactly two members, `integrity` and `linkset` (D47-note c folds the manifest into it).
4. Extension relations use the hash form `…/rel#<name>`, matching the `ns#` namespace (audit/D §3j over audit/G's slash form).
5. JSON Schemas are published at site URLs (`/ns/schema/*.json`); w3id stays vocabulary-only, so no owner action gates them (G13).
6. Vectors are pretty-printed with JCS *member order* rather than JCS bytes, so a reviewer can read them (AGSC-09-06).
7. The `--json` envelope is named `agsc.diagnostics.v1`; findings also appear as stderr JSON lines (PLAN §8 left the shape open).
8. Language-variant files are rejected at 1.x rather than silently ignored, because i18n is deferred (G27).
9. `lint --fix` normalizations are enumerated and idempotent, and never reorder authored arrays (D43(1)).
10. Configuration is closed (`additionalProperties: false`); item frontmatter stays open (OKF tolerance). This is the only asymmetry.

## 7. Trace map

| Rules | Requirements | Decisions |
|---|---|---|
| `AGSC-00-*` | PRD-010, NFR-02 | D36-final, D41, D47 |
| `AGSC-01-*` | PRD-006, 018, 021 | D32(4), D41, D47, G02 |
| `AGSC-02-*` | PRD-002, 013, 017, 042 | D36-final, D41, D43(3), G06, G35 |
| `AGSC-03-*` | PRD-002, 036 | D41, D43(4), G04 |
| `AGSC-04-*` | PRD-004, NFR-04, NFR-05 | D41, Art. XII |
| `AGSC-05-*` | PRD-022, 027 | D02, D30, D41, D43(5), G13, G22 |
| `AGSC-06-*` | PRD-011, 014, 019, 020, 024, 025, 046 | D06, D19, D21-final, D39, D40, D47-note(c,d) |
| `AGSC-07-*` | PRD-032–038 | D33, D35, D39, G11, G12 |
| `AGSC-08-*` | PRD-005, 031, 039–043, NFR-07 | D07, D08, D13, D14, D40, D44(b,h) |
| `AGSC-09-*` | PRD-001, 003, 007, 010, 023 | D38-final, D41, G26 |

---

**Adversarial review (R4, 2026-09-02): PASSED — spot-verified spec/03 (nine Links, inverses, closure algebra), spec/05 (SKOS nesting rule, RDF typing), spec/08 (ledger, DCO-Plus grammar, N9 lints incl. the honest-limit rule), ontology (33 terms, RL-safe), vector self-checks; cross-consistent with the frozen PLAN and the docs/diagrams + features/ pack (P-DIAG, reviewed same day; SDLC phase names completed from the Loki canonical table). The 10 spec decisions in §6 are D32-consistent and stand.

S03 GATE (lighter/async per Loki): reviewed and PASSED by R4 — presented to the owner; owner may edit inline, else it stands and S04 follows on "continue".**

*Generated by: `prov: {origin: ai-generated, agent: claude-opus-5, operator: human:andreibesleaga}` · P-S03, 2026-09-02*
