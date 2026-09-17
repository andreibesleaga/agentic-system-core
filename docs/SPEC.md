# SPEC — AgenticSystemCore (S03 index)

**`spec_version: "1.0.0-rc.3"`** (draft of 2026-09-16, frozen at the rc.3 tag by DS-5). This file indexes the normative material; it is not itself normative. The specification is `spec/00`–`spec/11` (**323** numbered MUST/SHOULD rules, 11 of them retired-and-reserved after the rc.3 minimality pass with stable ids `AGSC-<section>-<nn>` as of the rc.3 draft of 2026-09-16 — every count in this sentence is derived by `node tools/count-artifacts`, never typed by hand), `schema/{item,bundle,config}.schema.json`, `ontology/agsc.ttl` (**52** terms: 12 classes + 19 object properties + 21 datatype properties — every property emitted by AGSC-05-26…28) and `tests/vectors/**` (**120** vectors: 116 required, 1 optional, 3 withdrawn; **82** error codes registered and 82 used). *(Historical: the rc.2 freeze of 2026-09-04 recorded 270 rules, 44 terms and 56 vectors; the sentence above tracks the working tree.)* Together they *are* the system: the Node engine is one conforming implementation, and behaviour observable only in it is a defect (NFR-02 ← D47, Art. XI).

## 1. Sections

| Section | Covers | Vector areas |
|---|---|---|
| `00-overview` | scope, BCP 14 usage, the twelve terms, conformance classes, SemVer policy | `bundle/` |
| `01-bundle` | folders, `content/index.md`, slugs, encoding, `agsc.config.json`, import tolerance, **export (`--markdown/--okf/--jsonld/--jsonl/--steer`)** | `slug/`, `bundle/`, `import/` *(populated at M12)*, `export/` *(populated at M12)*, `adapters/` *(populated at M20)*, `channels/` *(populated at M22)* |
| `02-item` | YAML failsafe subset, common keys, per-type keys, body sections, **adoption of bare Markdown** | `frontmatter/`, `adopt/` |
| `03-links` | the fourteen keys (nine core + five Mode-2), computed inverses, cycles, wikilinks, combiner semantics | `links/` |
| `04-canonicalization` | JCS, NFC/LF/UTC seconds, `SOURCE_DATE_EPOCH`, ordering, hashes | `jcs/`, `graph/` |
| `05-graph` | item IRIs, four RDF views, class mapping, SKOS integrity, OWL 2 RL | `graph/` |
| `06-surfaces` | route set R36 (site IA), the one well-known file, `llms.txt`, the normative tokenizer, headers, budgets | `discovery/`, `build/` |
| `07-composition` | closure → hide → mutex → warn, the seven Harness files, skill packs | `compose/`, `skills/` *(populated at M13)*, `harness/` *(populated at M21)* |
| `08-governance` | `prov`, DCO-Plus trailers, Gates, the four N9 lints, the hash-chained ledger | `lint/`, `prov/` *(populated at M13)*, `ledger/` |
| `09-conformance` | classes, vector format, error-code registry, CLI contract, MCP/WebMCP seven tools, **independent validators** | `cli/`, `run/` *(populated at M23)*, `conform/` *(populated at M24)*. `webmcp/` is **not** an area: AGSC-09-16 is proved by `cli/cli-0003` and the tool error envelope by `cli/cli-0004`, so no permanently empty area is declared (V5-3 S3-36) |
| `11-boundary` | cross-origin access, federation F1–F9, the plugin contract, visibility and dynamic hooks, retirement and tombstones (rc.3) | `boundary/`, `chunks/`, `boards/` |
| `10-implementation-profiles` | conformance **Levels 0–3**, foreign knowledge bases, federation, the Implementer's Guide | all, per Level; `discovery/` for AGSC-10-12 |

## 2. Versioning

SemVer 2.0.0. **MAJOR**: a file valid under the previous MAJOR may fail. **MINOR**: new optional keys, enum values or vectors. **PATCH**: clarifications and vectors conforming implementations already pass. Readers accept any Bundle of the same MAJOR, tolerate unknown keys and unknown link keys, and never reject a file for them. Released spec sections, context files and vectors are immutable; ontology terms are deprecated, never deleted (AGSC-00-14…17).

## 3. Conformance classes

> **Amendment 2026-09-02 (D50/PRD-055):** conformance is claimed by **Level** per `spec/10-implementation-profiles.md` — Level 0 Publisher (static files from any CMS/wiki), 1 Reader, 2 Writer/Exporter, 3 Full engine; the three classes below map to Levels 1–3.

**Reader** = Level 1, **Writer** = Level 2, **Full engine** = Level 3; the authoritative per-Level rule and vector-area sets are AGSC-10-02…05 and are not restated here. A claim names the class, the `spec_version` MAJOR.MINOR and the vector set passed (AGSC-00-09…13).

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
| PROV-O | Rec 2013 | Episode/Procedure/Gate/Proposal/Review/Source | conform | shape check: Activity/Entity/Plan subclassing + datatype ranges; **no `prov:Agent` is emitted** — actors are strings, carried by `asc:verifiedBy`/`asc:operator`/`asc:generatedBy` per AGSC-05-15 | Y |
| OWL 2 RL | Rec 2012 | `ontology/agsc.ttl` profile | conform | profile check at release; RL-only lint | Y |
| SHACL | Rec 2017 | shapes generated from the schema | conform (dev lane) | pySHACL/dev validator over `graph.ttl` | Y |
| RFC 8615 well-known | Standards Track | `/.well-known/knowledge-linkset` (D60; ladder `knowledge-linkset` → `agenticsystemcore-knowledge` → `agenticsystemcore.com-knowledge-linkset`) | **define** | registration template in the I-D; **Specification Required** (designated experts) | Y |
| RFC 8288 relations | Standards Track | discovery link = registered `describedby` (D82 Q3); in the link set: `…/rel#graph`, `#ontology`, `#context`, `#now`, `#skills`, `#ledger`, `#peer`, `#surface`, `#contribute`, `#access` (extension URIs) plus registered relations for related-system links (AGSC-06-35) | **define** | `discovery/disc-0003`, `bnd-0029` (no unregistered short names) | Y |
| RFC 7284 Profile URIs | Informational; IANA "Profile URIs" registry | `https://w3id.org/agentic-system-core/profile/agentic-knowledge`, the RFC 9264 §5 profile of our link set | **define** | registration template in the I-D; w3id 303 resolves to `/specs/agentic-knowledge/` | Y |
| RFC 9264 linkset | Standards Track | the document *is* `application/linkset+json` with the §5 `profile` parameter; `linkset` is the sole top-level member; extension target attributes | conform + profile **define** | `discovery/disc-0003`, `disc-0004` | Y |
| RFC 9530 digest fields | Standards Track | `digest` target attribute, `sha-256=:<base64>:`, on every artefact link | conform | `discovery/disc-0003`; `tools/validate-wellknown` recomputes every digest | Y |
| RFC 9651 Structured Field Values *(obsoletes RFC 8941)* | Standards Track | the `sha-256=:<base64>:` **Dictionary-member and Byte-Sequence** syntax carried inside the `digest` target attribute — RFC 9530 names the field, RFC 9651 §3.3.5/§4.1 defines the `:…:` serialisation (AGSC-06-08) | conform | `discovery/disc-0003` | Y |
| RFC 6906 profile link relation | Informational | `Link: <profile URI>; rel="profile"` fallback where the media-type parameter cannot be set | conform | live header probe recorded in the I-D Implementation Status | Y |
| RFC 7763 `text/markdown` | Standards Track | `Content-Type: text/markdown; charset=utf-8; variant=GFM` on `/pages/*.md` (AGSC-06-17) | conform | `_headers` snapshot test; live header probe | Y |
| TDMRep | W3C CG Final Report | `/.well-known/tdmrep.json` carrying the same AI-usage policy as `robots.txt` (AGSC-06-18) | conform | grammar + policy-parity lint | Y |
| llms.txt | community spec v2 (2026-08-10) | `/llms.txt`, `/llms-full.txt` | profile of (H1 first; AGSC-06-13a is stricter) | structural lint: H1, blockquote, resolving links | Y |
| Agent Skills | agentskills.io | `SKILL.md` packs per Cluster | conform | name grammar (no `--`), `description` ≤1024 | Y |
| MCP | 2026-07-28, stdio | `agsc mcp`, seven tools (D51-b) | conform | Inspector `tools/list`; no stray stdout bytes | Y |
| WebMCP | W3C Draft CG Report 2026-09-15 | the same seven tools as page tools, `propose`/`remember` local-only | conform | `cli/cli-0003`; origin-trial browser run; feature-detect fallback | Y |
| AGENTS.md | agents.md convention | `export --steer`, Harness `AGENTS.md` | conform | byte-stable emit; context-only assertion | Y |
| robots.txt | RFC 9309 | AI-usage signals with `/.well-known/tdmrep.json` | conform | grammar + size lint | Y |
| security.txt | RFC 9116 | `Contact` + `Expires` | conform | presence + expiry check | Y |
| Sitemaps | sitemaps.org 0.9 | one `sitemap.xml` | conform | well-formedness, count, URL resolution | Y |
| Schema.org | v30.0 | `TechArticle`, `DefinedTerm`, `Dataset` in HTML | conform | validator.schema.org on the release checklist | Y |

Also conformed to, and proved in the lanes of PLAN §10 rather than here: SemVer 2.0.0, Keep a Changelog 1.1.0, `SOURCE_DATE_EPOCH`, BCP 47, RFC 9110 conneg/303, WCAG 2.2 AA, REUSE 3.3, SLSA v1.0 Build L2, CITATION.cff 1.2.0. VoID (`/.well-known/void`, registered 2011) is prior art for dataset discovery and MUST be cited as complementary wherever our discovery layer is described. Dropped at v1: A2A `agent-card.json` (no endpoint exists), DCAT, DID/VC, SBOM — at rc.3 it MAY be declared as the `a2a-card` surface and emitted only beside a declared `responder` (AGSC-06-34).

## 5. Standardization surface

Three artefacts are ours to standardize, and no more. The **Internet-Draft** covers only the *discovery layer*: the `knowledge-linkset` well-known URI (RFC 8615, D60), the registered `describedby` discovery link (RFC 6892; no relation is requested — D82 Q3) and our extension relations inside the link set (RFC 8288 §2.1.2 URIs under w3id, so no IRI ever depends on the site domain; AGSC-06-10, AGSC-06-25), and an RFC 9264 link-set representation identified by a Profile URI (RFC 7284), presented as complementary to VoID and RFC 9727. **`spec/00`–`11` plus `tests/vectors/`** are the *format standard* — and, per D47, the definition of the system itself: any language must be able to reimplement AgenticSystemCore from them alone. **`ontology/agsc.ttl` plus the JSON-LD context**, published at `https://w3id.org/agentic-system-core/ns#`, are the *vocabulary standard*. Everything else in §4 is conformance to work other people own. The `tools/` validators (PRD-054, AGSC-09-90…92) are the executable proof of §4's own rule that anything without an executable test is a claim, not conformance — which is why they import nothing from `src/`.

## 6. Spec decisions made here

1. Error codes: the single format is `AGSC-E<nnn>`, hundreds digit = area block; the registry is `spec/09-conformance.md` §9.4 and no other format (`AGSC-<AREA>-<nnn>`, `AGSC-DET-nnn`) exists anywhere — PLAN §8 and the diagrams were corrected to match (D48(7)).
2. No `asc:Item` superclass — "Item" is a term of the spec only (OntoClean, research/16 §3.3); the ontology keeps its classes (12 at rc.3). Its two item-reachability edges (`asc:source`, `asc:review`, V5-1 S7-01) therefore carry no `rdfs:domain`, exactly like `asc:uses`/`asc:excludes`/`asc:contradicts` (AGSC-05-26a).
3. The well-known file is a conformant RFC 9264 link set — `linkset` is its sole member; integrity rides on the links as RFC 9530 `digest` and `agsc-*` extension target attributes, and no vendor media type exists (D55 amends D47-note c).
4. Extension relations use the hash form `…/rel#<name>`, matching the `ns#` namespace (audit/D §3j over audit/G's slash form).
5. JSON Schemas are published at site URLs (`/ns/schema/*.json`); w3id stays vocabulary-only, so no owner action gates them (G13).
6. Vectors are pretty-printed with JCS *member order* rather than JCS bytes, so a reviewer can read them (AGSC-09-06).
7. The `--json` envelope is named `agsc.diagnostics.v1`; findings also appear as stderr JSON lines (PLAN §8 left the shape open).
8. **Language variants are accepted at 1.0** (D53 lifts G27): `<slug>.<lang>.md` shares the primary's slug and IRI, is served at `/<type-plural>/<slug>/<lang>/` and is emitted as language-tagged literals; a variant without a primary is `AGSC-E208` (AGSC-01-13, 01-13a).
9. `lint --fix` normalizations are enumerated and idempotent, and never reorder authored arrays (D43(1)).
10. Configuration is closed (`additionalProperties: false`); item frontmatter stays open (OKF tolerance). This is the only asymmetry.

*Decisions 11–17 were added 2026-09-02 by D48, resolving the 34 findings of `audit/V1-math-algorithmic-verification.md`.*

11. **The ledger is derived, not appended.** `build`/`ci` recompute `ledger.jsonl` from git history into `www/` and the release assets; nothing is committed by CI, so the no-bot-commit rule (PRD-042) and a persisted ledger no longer contradict, and neither an append race nor a partial write can occur. `verify --ledger` also compares the recomputed head to the `agsc-ledger-head` target attribute of the `…/rel#ledger` link in the well-known file (D55), which is what catches a truncated tail (AGSC-08-20, 08-23; D48(1)).
12. **One combiner order, everywhere:** closure → `supersedes` hiding → `excludes` mutex → warnings. Hiding is "any item a result member supersedes" (AGSC-07-05 wins over the old reachability wording of the retired AGSC-03-17), a surviving item whose `requires` target was hidden is `AGSC-E802` (AGSC-07-05a, never a silent drop), closure is breadth-first with the first-discovered path recorded, and `selection[]` is the surviving set in code-point order — so the verdict is a function of the selection *set* (D48(2)).
13. **One ordering per artefact.** JSON member names, `search.json` tokens included, sort by UTF-16 code units (AGSC-04-05); files and N-Quads sort by code point with `/` as the path separator on every platform; `findings[]` sorts by `(file, line, col, code)`. The old "search tokens by code point" wording was the system's only two-order artefact (D48(3)).
14. **The tokenizer is normative** — NFC → ASCII-lower-case → split outside `[a-z0-9]` and Unicode letters/digits → drop tokens shorter than 2 → no stemming (AGSC-06-23) — because `search.json` must be byte-reproducible across ports (D48(4)).
15. **`prov.operator` is `human:<id>` only** (D07 accountability), which makes the DCO-Plus `Assisted-by:` trailer always satisfiable and completes its ABNF; adoption takes the operator from `bundle.operator`, else a normalized git `user.email` local part, else `human:unknown` with a warning, and normalizes filenames, titles and slug collisions so that `init` on bare Markdown is a total function (AGSC-01-25, 02-07, 02-90…92, 08-06; D48(5)).
16. **Reviews and Proposals have IRIs.** A Review is `<item-IRI>#review-<n>` with `asc:verifiedBy`/`asc:verifiedAt` datatype properties instead of `prov:wasAssociatedWith` (an actor string is not an IRI); a Proposal is its forge PR URL; `asc:verifiedOn` is `xsd:dateTime`, since `xsd:date` is outside the OWL 2 datatype map; `harness.jsonld` is declared a JSON document, not an RDF export, so its `@id`-less nodes are not blank nodes (D48(6)).
17. **The stated invariants are now enforceable.** Cluster depth > 3 is `AGSC-E307` and a second `broader` is `AGSC-E308` (with `maxItems: 1` in the schema); anchors trim hyphens, empty becomes `section-<n>`, duplicates take the next free `-2`, `-3`, …; vectors are pretty-printed under AGSC-09-06 only (AGSC-04-04 no longer lists them) and a superseded vector is republished `withdrawn`; `AGSC-E203` takes precedence over `AGSC-E201`; `AGSC-E603` exits 2; `SOURCE_DATE_EPOCH` defaults to 0 with `AGSC-E606` when there is no git history; `deprecated → stable` is legal with a warning (D48(7)).

*Decisions 18–21 were added 2026-09-02 from the V2 system-of-systems sweep (`audit/V2-system-sweep.md`).*

18. **`AGSC-06-01` is the normative route set** and supersedes PRD-011's R36 list, which is illustrative; the route-snapshot fixture of PRD-011 is generated from AGSC-06-01 (V2-21). Its 1.x additions over R36 — `/tags/<tag>/`, `/changelog/`, `/feed.xml`, `/robots.txt`, `/tdmrep.json`, `/pages/*`, `/episodes/`, `/gates/`, `/procedures/`, `/ledger.jsonl`, `/.well-known/security.txt` — are recorded here rather than left to inference.
19. **Export is specified** (`spec/01` §1.6, AGSC-01-26…29): Markdown/OKF export is lossless and vault-openable, `--jsonld` is byte-identical to `graph.jsonld`, `--steer` derives only from NOW and Concept/Procedure/Gate/Lesson items, and every prose-carrying export embeds the Content Use Terms — the steer bundles are governed exactly like `llms.txt` (V2-26).
20. **`graph.ttl` is reproducible from `spec/` alone** (AGSC-05-26…28): every `asc:` property has one named frontmatter source, and a term with no emitting rule does not ship — `asc:verdict` was deleted, since a verdict lives in the forge (V2-10).
21. **The drop-in path passes its own gate** (V2-01/02): `description` is schema-optional everywhere and lint-required on concept/cluster as `AGSC-E408`; AGSC-02-93 relocates adopted files to `content/concepts/<slug>.md` with the original path in `aliases[]`; `adopt/` vectors prove it.

*Decisions 22–25 were added 2026-09-03 from the V3 re-verification (`audit/V3-postfix-reverification.md`) and D52.*

22. **Adoption reaches a green `ci`** (D52(1)): `config.schema.json` and `bundle.schema.json` accept a trailing slash and the development placeholder `http://localhost[:port]/`; `AGSC-02-94` synthesizes only schema-valid values (`build.out: "www/"`, an index title through the AGSC-02-90 title rule, a ≥40-character description); `adopt-0004` proves `init` → `ci` exits 0 on a bare folder, warnings only.
23. **The derived ledger is byte-reproducible** (D52(2), `AGSC-08-20a`): the first-parent chain oldest-first from the git-log file, `kind` = `release`/`merge`/`commit` by tag, parent count or `Proposal:` trailer, `actor` from `Signed-off-by`, `ref` the full sha, `ts` the committer time — then exactly **one** trailing `build` entry from `SOURCE_DATE_EPOCH` and the `content/` tree hash, so owner and CI builds of one history agree. Genesis `prev` is 64 zeros; an empty history yields the build entry alone; a shallow clone is `AGSC-E703`, exit 2. Vectors `ledger-0002`/`ledger-0003`.
24. **Level 0 is attainable** (D52(3) as amended by D55, `AGSC-06-08a`): a Level-0 link set is the same document with every `digest`/`agsc-*` attribute omitted; Levels ≥2 require them. Vector `disc-0004`.
25. **The `auto` channel merge is a configured, revocable, single exception** (D52(4)): the duplicate `AGSC-08-25` is renumbered **`AGSC-08-26`**; `AGSC-08-02` and `AGSC-08-08` name the exception; the guard is checked against configuration and forge identity — never self-declared frontmatter — with N9 lints at `error` severity, the owner's `CHANNEL_TOKEN_<name>` in `review.yml`'s `auto-merge` job, and a `Channel-Auto:` trailer feeding the ledger's `mode`.

## 7. Trace map

| Rules | Requirements | Decisions |
|---|---|---|
| `AGSC-00-*` | PRD-010, NFR-02 | D36-final, D41, D47 |
| `AGSC-01-*` | PRD-006, 018, 021 | D32(4), D41, D47, G02 |
| `AGSC-02-*` | PRD-002, 013, 017, 042, 053 | D36-final, D41, D43(3), D48(5), G06, G35 |
| `AGSC-03-*` | PRD-002, 036 | D41, D43(4), G04 |
| `AGSC-04-*` | PRD-004, NFR-04, NFR-05 | D41, Art. XII |
| `AGSC-05-*` | PRD-022, 027 | D02, D30, D41, D43(5), G13, G22 |
| `AGSC-06-*` | PRD-011, 014, 019, 020, 024, 025, 046 | D06, D19, D21-final, D39, D40, D47-note(c,d) |
| `AGSC-07-*` | PRD-032–038 | D33, D35, D39, G11, G12 |
| `AGSC-08-*` | PRD-005, 031, 039–043, NFR-07 | D07, D08, D13, D14, D40, D44(b,h) |
| `AGSC-09-*` | PRD-001, 003, 007, 010, 023, 054, 056 | D38-final, D41, G26, D51-b |
| `AGSC-10-*` | PRD-055 | D50, D47, D52(3) |

---

**Adversarial review (R4, 2026-09-02): PASSED — spot-verified spec/03 (nine Links, inverses, closure algebra), spec/05 (SKOS nesting rule, RDF typing), spec/08 (ledger, DCO-Plus grammar, N9 lints incl. the honest-limit rule), ontology (33 terms, RL-safe) *(as of 2026-09-02, when the vocabulary had nine Links and 33 terms; D53 later added the five Mode-2 keys and their ten properties, and V5-1 S7-01 added the two item-reachability properties `asc:source`/`asc:review` — fourteen Links, 11 classes + 33 properties today)*, vector self-checks; cross-consistent with the frozen PLAN and the docs/diagrams + features/ pack (P-DIAG, reviewed same day; SDLC phase names completed from the Loki canonical table). The 10 spec decisions in §6 are D32-consistent and stand.

S03 GATE (lighter/async per Loki): reviewed and PASSED by R4 — presented to the owner; owner may edit inline, else it stands and S04 follows on "continue".**

*Generated by: `prov: {origin: ai-generated, agent: claude-opus-5, operator: human:andreibesleaga}` · P-S03, 2026-09-02*

## 8. Frozen v1.0 — forward compatibility (D53, 2026-09-03)
The schema (`schema/*.json`), ontology (`ontology/agsc.ttl`, `owl:versionIRI …/ns/1.0.0-draft.1` until the spec reaches `1.0.0`, D57 Q5), protocol (`/.well-known/knowledge-linkset` = an RFC 9264 link set with RFC 9530 `digest` target attributes under `application/linkset+json` + the RFC 7284 Profile URI; relations incl. `peer`) and `spec/00–11` are **complete for v1.0 and frozen at the rc.3 tag** at `spec_version 1.0.0` (this file: `1.0.0-rc.3` until the first tagged release). Forward-compatibility mechanisms, fixed now: (1) **registered Link keys** — the fourteen keys (nine core + five Mode-2) are closed at 1.x; new keys arrive only via a minor `spec_version` bump with a registry entry and vectors; (2) **`x-` frontmatter namespace** — any `x-<vendor>-<key>` is preserved verbatim by every conforming tool and never interpreted (AGSC-02 tolerance); as of V5-1 S7-07, confirmed by D61(3), the same `x-<vendor>-<key>` namespace is also open in `agsc.config.json` — `config.schema.json` admits `^x-[a-z0-9]+(-[a-z0-9]+)+$` through `patternProperties` at the top level and on each `channels[]` entry while `additionalProperties` stays `false` (AGSC-01-18, the frontmatter twin being AGSC-02-05a) — so a v2 hosted adapter registers itself under `x-<vendor>-*` or `channels[].x-<vendor>-*` and no new configuration key is needed. The only keys added at rc.2 were `channels[].allow[]` and `channels[].rate{per_hour}`; rc.3 adds `federation{}`, `chunks{}`, `contribute[]`, `visibility` and `attachments{}` (AGSC-01-18, AGSC-11-01, AGSC-01-34) (D61(3)); (3) **SemVer** — patch = editorial, minor = additive rules/keys/routes, major = breaking (none planned); readers MUST accept any 1.x Bundle; (4) **Levels** (spec/10) let implementations conform incrementally; (5) **error-code registry** is append-only. The Internet-Draft is written against this frozen spec; a v2 change is admissible only for a discovered gap (D53-8) and is itself a registered minor bump.

**rc.2 re-freeze, 2026-09-04.** This re-freeze applies D55, D56 and D57 to the engine and records the `spec_version` bump from the previous release candidate to `1.0.0-rc.2`. rc.2 (2026-09-04) amended AGSC-08-12, 09-03, 09-04 and 09-07 before any implementation, under the D53-8 gap clause; from rc.2 on, §8 immutability applies without exception.

**rc.3 (in progress, 2026-09-16).** Under the D53-8 gap clause and D67/D71: `spec/11-boundary.md` added (23 rules, 9 codes, area `boundary`); config gains `federation{}`, `chunks{}`, `contribute[]`, `visibility`; `status` gains `retired`; `concept.kind` gains `architecture`; ontology gains eight terms — `asc:Attachment`, `asc:hasAttachment`, `asc:sha256`, `asc:produces`, `asc:consumes`, `asc:taskState`, `asc:peerOrigin`, `asc:retiredAt` — and `agsc.config.json` gains `attachments{max_bytes}` (AGSC-01-34). All MINOR-compatible under AGSC-00-14; §8 immutability re-applies from the rc.3 tag. Counts in this file are regenerated by script at the freeze.

**rc.3 DS-3 repairs (2026-09-16).** Determinism: `-0` rejected, NFC-then-canonicalize fixed as the order, member names NFC before sorting, Unicode **16.0.0** pinned for the vectors, a 256-mark combining-sequence bound (`AGSC-E607`), and the cross-implementation obligation scoped to the machine artefacts (HTML is deterministic within one implementation only). Portability: every regular-expression **lookahead removed** from all three schemas (the `bundle` schema's two quantifier bounds and `item` `sources[].id` were converted at the pre-DS-4 audit of 2026-09-16, P-32/P-33) — the slug and anchor grammars are now lookahead-free and the path-safety rule moved to normative text (`AGSC-01-35`, `AGSC-E902`) — and every length bound now counts **code points** through `minLength`/`maxLength` rather than a regex quantifier (`AGSC-02-24` amended), while `AGSC-04-05`'s UTF-16 rule keeps governing JSON member-name **ordering** only. Byte pins: the agent-facing text layout (`AGSC-06-13a`), literal datatypes (`AGSC-05-31`) and N-Quads escaping (`AGSC-05-32`). Conformance: the validator-program conjunct dropped from `AGSC-10-01` (a claim asserts vectors, not a program — publication blocker B5) and `AGSC-10-15` added to make the Level the single source of the vector set. Traceability: `AGSC-00-18` cites the seven artefact-level requirements. Composition order reads 1→5. Route set, budgets and vector areas extended for the DS-2 artefacts. `AGSC-E704`/`E705` documented as reserved. Counts are now derived by `tools/count-artifacts`, never typed. Amended rules: AGSC-02-24, AGSC-04-05, AGSC-07-08, AGSC-10-01.

**D82 (2026-09-17).** Two registrations, not three: the discovery link is `describedby` (AGSC-06-25/11-05); related-system links AGSC-06-35 + `related[]`; `export`-fenced extraction reserved (AGSC-02-22, E415); `graph.rdf`/`build.rdfxml` reserved; Level-0 `prov` inheritance (E508); IDNA repertoire rule; `memory://` (AGSC-05-04/04a/04b, 10-08, E309, `graph-0005`) moves to a non-normative appendix at **1.0.1** (Q13); the SVG deny-list becomes an allow-list at 1.0.1 (Q7); Unicode generation version stays 16.0.0 with the 15.0–18.0 stability statement (Q10). Content Use Terms text: `LICENSE-CONTENT` (draft for owner approval).
