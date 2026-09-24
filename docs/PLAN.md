# PLAN — AgenticSystemCore v1 architecture (arc42 + C4 + ISO 42010)

**Scope.** The architecture that satisfies `docs/PRD.md` (PRD-001…065, NFR-01…13). No requirement is added, changed or dropped here.
**Authority.** The specification (`spec/`, `schema/`, `ontology/`, `tests/vectors/`) defines AgenticSystemCore, and this plan never overrides a rule. Sections 1–13 were frozen as the first architecture baseline on 2026-09-02; later changes are the dated addenda at the end, never rewritten into the sections. The maintainer's working records — review verdicts, calendars and the private decision register the sections were first traced to — are kept outside this repository.
*Note, 2026-09-24:* the process text this document used to carry — citations of the private decision register, review verdicts, gate approvals, effort estimates and the October calendar — was moved to those records on this date. The sections, the decision records (ADR-001…019) and the technical addenda are kept.
**Vocabulary.** Concept · Episode · Procedure · Lesson · Link · Cluster · Bundle · Source · Proposal · Review · Gate · Harness. `type ∈ concept|episode|procedure|lesson|cluster|gate`; fourteen Link keys (nine core + five Mode-2 — only the core nine drive composition); 16 verbs (AGSC-09-07: the thirteen plus `run`, `trace`, `conform`, the first two opt-in).

---

## 1. Introduction & goals

### 1.1 Quality goals, ranked (ties break downward)

| # | Quality goal | Meaning here | NFR ids |
|---|---|---|---|
| Q1 | **Correctness & determinism** | byte-identical rebuilds on every OS; every requirement has a test; the ledger re-verifies offline | NFR-03, 04, 05 |
| Q2 | **Simplicity** | zero deps, one config file, ≤3 commands per feature, delete before adding | NFR-01, 06 |
| Q3 | **Agent-safety** | published content is structurally data, never instruction; no agency granted to text | NFR-07 |
| Q4 | **Portability** | files + ontologies are the plane; any language reimplements from `spec/` + vectors; offline on three OSes | NFR-02, 08, 13 |
| Q5 | **Cost ≈ 0** | no servers, no LLM in any launch lane, ≤$10/month visible on `/now/` | NFR-06, 09, 11 |

Floors never traded: licence stack (NFR-10), clean room (NFR-12).

### 1.2 Stakeholders and concerns (ISO 42010)

| Id | Stakeholder | Primary concerns | Views |
|---|---|---|---|
| P1 | Human reader | find a pattern with evidence; works without JS | §3, §5 |
| P2 | Human contributor | a legible, passable review gate; no hidden rules | §6b, §9 |
| P3 | Agent reader | structured retrieval without scraping; trust labels | §3, §5, §12 |
| P4 | Agent proposer (operator-signed) | a write path that never pushes on its own | §6b, §12 |
| P5 | Architect (combiner) | closure/conflict explanations; downloadable Harness | §5, §6c |
| P6 | Integrator | three install trees; inert packs | §5, §12 |
| P7 | Project team (Mode 2) | Gates → CI checks; NOW as working memory | §6a, §7 |
| P8 | Agent-as-memory (Mode 1) | stable IRIs, exports, offline verifiability | §5, §7 |
| P9 | Owner-as-operator | green site, zero maintenance, unattended crons | §7, §11 |
| P10 | Port implementer | a normative spec + vectors that make code irrelevant | §5.3, §10 |
| P11 | Standards implementer | one well-known file, RFC-legal relations, conneg | §5, §7 |
| S12 | **Maintainer (rights holder & approver)** | all git writes are the maintainer's; licence stack; clean room; ≤$10/mo | §2, §9, §11, §12 |
| S13 | **Future port implementers (non-Node)** | no hidden behaviour in JS; byte-level vectors; no build step | §2, §5, §10 |

Viewpoints → views: arc42 §3 = C4 Context; §5 = C4 Container/Component (model kind: Mermaid + Structurizr DSL); §6 = runtime sequences; §7 = deployment; §8 = crosscutting; §9 = rationale (MADR 4); §12 = STRIDE. Known inconsistencies: §11.

---

## 2. Constraints (hard only)

| # | Constraint | Source | Consequence |
|---|---|---|---|
| C1 | Zero runtime dependencies, `node:` builtins only, Node ≥22.14 | NFR-01 | every parser/writer hand-written (§5, §11 R1–R3) |
| C2 | Deployed system = static files + CI; no servers, DBs, queues | — | CI is the only backend; every write path ends in a PR |
| C3 | Cloudflare **Pages**, deployed from `www/` | — | output dir is `www/`; `_headers`/`_redirects` generated |
| C4 | `/ns/` conneg via **w3id `.htaccess`** — zero project-owned server code | — | conneg is a config file in a foreign repo (§7, §12 T5) |
| C5 | The maintainer runs **all** git writes and credentialed publishes | — | `propose` writes patches and prints commands; CI never commits content |
| C6 | ≤$10/month LLM spend; the gating lanes stay lint-only | NFR-11 | **no model call on any *gating* v1 path** — `ci`, `review` and everything reachable from them; the build fails if one is reachable (AGSC-08-27). `Reviewer` ships a lint adapter; the OPTIONAL LLM review lane is disabled by default, never gates a merge or a deploy, and only labels and comments |
| C7 | Clean room **W1–W12** (invariants held in the confidential source, never in any repo) | NFR-12 | one `clean-room` lint enforces the public derivations: `bookRef` refused on import (W1/W11); `endorsements.json`/`book.md`/`start-here.json` excluded (W11); no whole-corpus PDF/EPUB emitter ever; no book/"companion" strings; no reading order; dogfood importer allow-lists `00–04, 06–14` |
| C8 | Capability plane **language-independent**: files + ontologies define the system | NFR-02 | no behaviour may exist that `spec/` + `tests/vectors/` do not pin (§5.3) |
| C9 | No network, wall clock or fs in the pure core; network only in `refresh`/`mcp` | — | ports (§5.2); test-enforced |
| C10 | Determinism: JCS, sorted keys, LF, NFC, UTC seconds, `SOURCE_DATE_EPOCH` | NFR-04 | `verify` = double build + byte diff, merge-blocking |

---

## 3. Context & scope (C4 Level 1)

```mermaid
graph TB
  HR["Human reader / contributor<br/>(P1, P2)"]
  AG["Agent<br/>(P3, P4, P6, P8)"]
  OW["Maintainer<br/>(S12, P9)"]
  SI["Standards implementer<br/>(P11)"]
  PI["Port implementer<br/>(P10, S13)"]

  subgraph SYS["AgenticSystemCore (system under design)"]
    ENG["agsc engine<br/>16 verbs, zero deps"]
    SITE["Static site www/<br/>pages + machine surfaces"]
  end

  GH["GitHub<br/>repos · PRs · Actions · Releases"]
  CF["Cloudflare Pages<br/>static host + edge analytics"]
  W3["w3id.org<br/>.htaccess conneg"]
  NPM["npm registry<br/>agentic-system-core, agsc-cli"]

  HR -->|"HTTPS: /concepts/, /clusters/, /now/, /compose/"| SITE
  HR -->|"fork-and-edit URL → PR"| GH
  AG -->|"stdio JSON-RPC: search read links compose propose ask remember"| ENG
  AG -->|"GET /.well-known/knowledge-linkset, /graph.{jsonld,ttl,nq}, /llms.txt, /skills/index.json, /pages/&lt;slug&gt;.md"| SITE
  AG -->|"WebMCP document.modelContext (should S8)"| SITE
  OW -->|"git push · tag · merge (all git writes)"| GH
  SI -->|"Accept: application/linkset+json"| SITE
  SI -->|"Accept: text/turtle → 303"| W3
  PI -->|"reads spec/ + tests/vectors/"| ENG
  GH -->|"agsc ci → publish www/"| CF
  CF -->|"serves"| SITE
  W3 -->|"303 → /ns/agsc.ttl, /ns/context.jsonld"| SITE
  GH -->|"tag v* → trusted publishing + attestations"| NPM
  NPM -->|"npx agsc-cli / npm i -g agentic-system-core"| ENG
  ENG -->|"reads content/ + git log, writes www/ (incl. the derived ledger.jsonl) and dist/"| SITE
```

External interfaces are files and URLs only — there is no API to call. `memory://<bundle>/<slug>` is a documented alias, never resolved — the `https://` IRI may always be used instead (AGSC-05-04a) (PRD-027).

---

## 4. Solution strategy

A functional core compiles a folder of Markdown into every surface the product has. `content/**/*.md` (+ `agsc.config.json`) is the sole system of record; the engine is a pure `strings in → records out` compiler behind ports; GitHub Actions is the only thing that ever writes; Cloudflare Pages serves `www/` byte-for-byte. Every interactive path — browser, MCP, WebMCP, CLI — ends in a local patch a human turns into a Proposal, and nothing publishes until a human merges. Five contexts keep this honest; ports keep Node replaceable; `spec/` + vectors keep it reimplementable without reading a line of JavaScript.

| Context | Responsibility | Aggregates | Verbs owned |
|---|---|---|---|
| **Knowledge** | parse → validate → link → ontology → graph; vectors | Bundle, item (6 types), Link, Source | (serves all) |
| **Provenance & Governance** | `prov`, Gates, Proposals/Reviews, all lints, the ledger | Proposal, Review, Gate, LedgerEntry | `lint` `propose` `review` `verify --ledger` |
| **Composition** | closure algebra + the seven Harness emitters | Composition, Harness | `compose` |
| **Distribution** | our own surfaces, **output-only** | SiteBuild, GraphExport, DiscoveryLinkset, NOW | `build` `verify` `ci` `init` `mcp` `refresh` |
| **Interchange** | foreign formats, **bidirectional** | ForeignBundle, SteerBundle, SkillPack | `import` `export` (incl. `--steer`) `skills` |

**Boundary rule.** *Interchange = foreign formats, both directions. Distribution = our own surfaces, output-only.* So skill packs are emitted by Interchange (`SKILL.md` is foreign and round-trips) and merely *served* from `/skills/` by Distribution; `steer` is Interchange, the NOW page it consumes is Distribution. If the rule leaks in P2, the recorded fallback is four contexts (Knowledge, Governance, Composition, Emission) — ADR-009, not opened at v1.

---

## 5. Building-block view (C4 Level 2/3)

```mermaid
graph TB
  subgraph CLI["Container: agsc CLI (Node, npm)"]
    BIN["bin/agsc.js<br/>16 verbs · exit 0/1/2 · --json"]
    K["src/knowledge/"]
    G["src/governance/"]
    C["src/composition/"]
    D["src/distribution/"]
    I["src/interchange/"]
    P["src/ports/ + src/adapters/node-*.js"]
  end
  subgraph BR["Container: browser bundle www/js/agsc-core.js"]
    CB["composition core (identical modules, no node: imports)"]
    WM["WebMCP page tools (should S8)"]
  end
  subgraph MCP["Container: agsc mcp (local stdio server)"]
    T["7 tools: search read links compose propose ask remember"]
  end
  subgraph CI["Container: GitHub Actions"]
    CIY["engine ci.yml · release.yml"]
    CTY["content ci.yml (agsc ci → Pages) · refresh.yml"]
  end
  subgraph ST["Container: static site www/ (Cloudflare Pages)"]
    HTML["pages + _headers/_redirects"]
    MACH["graph.* · pages/*.md|.jsonld · search.json · llms.txt · skills/ · .well-known/knowledge-linkset · now.md"]
  end
  BIN --> K & G & C & D & I
  K & G & C & D & I --> P
  D --> ST
  C --> CB
  D --> MACH
  MCP --> MACH
  CB --> MACH
  CIY --> CLI
  CTY --> CLI
  CTY --> ST
```

### 5.1 Components → files (module names, homed in `src/<context>/`)

| Context | `src/<context>/<module>.js` | Does | Step | Verbs |
|---|---|---|---|---|
| knowledge | `yaml.js` `frontmatter.js` `markdown.js` | YAML failsafe subset; `{fm, body}`; CommonMark subset AST | 2, 9 | lint build |
| knowledge | `schema.js` `validate.js` | JSON Schema 2020-12 mini-validator over `schema/*.json` | 3 | lint build |
| knowledge | `slug.js` `links.js` | slug grammar; fourteen Links (nine core + five Mode-2), inverses, orphans, cycles | 4 | lint build compose |
| knowledge | `skos.js` `jsonld.js` `turtle.js` `nquads.js` `rdfxml.js` `jcs.js` | nested `skos:Collection`; four RDF views; JCS | 6, 7 | build export |
| knowledge | `diagrams.js` | ported DSL→SVG compiler | 5 | build import |
| governance | `lint.js` | L1/L2 findings with file+line | 3–4 | lint ci |
| governance | `injection.js` `secrets.js` `pii.js` `cleanroom.js` | the four N9/clean-room lints (§8, §12) | — | lint ci review |
| governance | `prov.js` | `prov` required; commit/reviewer **derived** from `AGSC_GIT_LOG` + `verified[]` | 11 | build lint |
| governance | `gate.js` | Gate `checks[]` → required CI status check | — | build ci |
| governance | `proposal.js` `review.js` | patch + PR body to `dist/proposal/`; lint-only verdict | — | propose review |
| governance | `ledger.js` | hash chain; offline re-verify | 12 | build ci verify |
| composition | `closure.js` | closure, hiding, mutex, warnings, explained paths (spec/07 order) | — | compose |
| composition | `emit-jsonld.js` `emit-agents.js` `emit-structurizr.js` `emit-mermaid.js` `emit-arc42.js` `emit-madr.js` | six of the seven Harness files | — | compose |
| distribution | `html.js` `templates/*.html` | Markdown→HTML; layout/item/cluster/list/now/compose/404 | 9 | build |
| distribution | `search.js` | inverted index `search.json` | 8 | build |
| distribution | `discovery.js` | linkset with `digest`/`agsc-*` target attributes, `llms.txt`, sitemap, robots, tdmrep, `_headers`, `_redirects` | 10 | build |
| distribution | `now.js` | `/now/` + `now.md` from stored state only | 11 | build refresh |
| distribution | `site.js` | route set → `www/` | 1, 9 | build |
| distribution | `ci.js` `verify.js` | pipeline; double build + byte diff | 13 | ci verify |
| distribution | `init.js` (adopt mode) | bare `.md` → minimal frontmatter + relocation to `content/concepts/` (AGSC-02-90…93) | — | init |
| distribution | `init.js` `mcp.js` `refresh.js` | scaffold; stdio JSON-RPC 7 tools (+ask, +remember); staleness + link checks | — | init mcp refresh |
| interchange | `import.js` `okf.js` | `--from old-site` (153 cards, 110 Clusters, diagrams); OKF/Markdown in | — | import |
| interchange | `export.js` `steer.js` | Markdown/OKF/JSON-LD/JSONL out; `--steer` AGENTS.md/CLAUDE.md | — | export |
| interchange | `skills.js` | `SKILL.md` out/in (7th Harness file), 3 trees, sha256 lockfile | — | skills |
| *(none — see below)* | `tools/validate-{schemas,spec,ontology,vectors,wellknown,features,diagrams}.js`, `tools/gen-spec-html.js`, `tools/gen-ns.js` | standalone stdlib validators + generators (PRD-054, AGSC-09-90…92) | — | (CI) |

`tools/` is outside the five bounded contexts by design: it imports nothing from `src/`, which is what makes it independent (PRD-054, AGSC-09-90) — so the "one context ↔ one `src/` dir ↔ one spec section ↔ one vector area" rule of §5.3 does not apply to it, and its `--json` output is the `agsc.diagnostics.v1` envelope with `verb` = the tool name.

**The nine command contracts, as shipped** *(added 2026-09-21; the row above is the plan, this is the state. The files carry no `.js` extension and are run as `node tools/<name>`; each takes `--json`, `--quiet` and `--help`, exits 0 pass / 1 fail / 2 usage, and emits only codes the §9.4 registry holds. `src/README.md` §11.11 carries the same table with the findings each tool returns on this distribution.)*

| Tool | What it checks | Rules | Status |
|---|---|---|---|
| `tools/validate-spec` | rule-id uniqueness and resolution, the MUST/SHOULD grammar, trace brackets and their PRD/NFR ids, error-code closure against §9.4, version literals in `spec/`, `docs/` and `tests/vectors/**` | AGSC-09-90, AGSC-09-91 | ships; 20 errors + 2 warnings against the frozen rc.5 text, each recorded as a 1.0.0 item |
| `tools/validate-schemas` | 2020-12 meta-validation and strict compilation, the AGSC-02-24 keyword subset and bounds, the AGSC-01-10 slug grammar, the six item types | AGSC-09-90, AGSC-02-24 | ships; pass |
| `tools/validate-ontology` | Turtle well-formedness, the OWL 2 RL-safe set, blank-node freedom, the persistent namespace, `owl:versionIRI`, SKOS S19/S20/S32/S37 | AGSC-09-90, AGSC-05-22 | ships; pass |
| `tools/validate-vectors` | vector format, rule resolution, JCS order, encoding, empty declared areas as an informational count | AGSC-09-90, AGSC-09-04…06 | ships; pass |
| `tools/validate-wellknown` | RFC 9264 shape, profile transport, relation names, digests, the `agsc-*` attributes per Level, `--peer` | AGSC-09-93, AGSC-10-12 | ships; pass at `--level 2` |
| `tools/validate-features` | Gherkin parse, `@PRD` closure against `docs/PRD.md`, agreement with the coverage table of `features/README.md` | AGSC-09-90, PRD-054 | ships; pass |
| `tools/validate-diagrams` | the Mermaid lexical contract, a trace id per file, staleness against `spec/` and `docs/PRD.md`, the index table | AGSC-09-90, PRD-054 | ships; pass |
| `tools/gen-spec-html` | renders `spec/` into `/specs/` deterministically with an anchor on every rule; `--check` compares a published tree | AGSC-09-90, PRD-054 | ships; pass |
| `tools/gen-ns` | derives `/ns/context.jsonld`, `/ns/agsc.rdf` and the `/ns/` index from the ontology, round-trips the RDF/XML; `--check` audits a built `/ns/` | AGSC-09-90, AGSC-06-32 | ships; derivation passes, `--check` fails on the reference builds (the emitted context carries no `asc:` term definitions) |

Ports live in `src/ports/*.js` (interfaces) with `src/adapters/node-*.js`; `bin/agsc.js` is the only place adapters are wired.

### 5.2 Ports and v1 adapters

| Port | Purpose | v1 adapter | Plugin adapters (never required) |
|---|---|---|---|
| `FileSystem` | read/write files | `node-fs.js` | memory FS (tests), Deno/Bun/Workers |
| `Clock` | time | `node-clock.js`; **build reads `SOURCE_DATE_EPOCH`**, real clock only in `refresh` | fixed-clock test adapter |
| `ProcessRunner` | spawn (git-log pre-step, tar) | `node-proc.js`, allow-listed | sandboxed runner (`run`, v1.x) |
| `Network` **[CI-only]** | HTTP | `node-fetch.js`, permitted in `refresh`/`mcp` **only** — a test fails if reachable from `src/knowledge/**` | — |
| `ContentStore` | the Bundle | local git working tree | GitHub API, Obsidian, Solid (v2) |
| `Renderer` | items → HTML | built-in templates | *(internal module boundary rather than a port; "theme packs" serve no v1.0 requirement)* |
| `GraphExport` | items → RDF | JSON-LD/Turtle/N-Quads (RDF/XML = should S1) | SPARQL dump, Wikibase |
| `ToolTransport` | tools to agents | local stdio MCP, 7 tools | remote MCP Worker (v2) |
| `PageTools` | tools in the page | WebMCP `document.modelContext` (should S8), same 7 tools, degrading to plain JS | — |
| `Reviewer` | Proposal verdict | **lint-only** (no LLM on a gating lane, C6) | the OPTIONAL non-gating LLM review lane of AGSC-08-27 — v1.0, off by default, provider-capped |
| `Host` | where `www/` lands | Cloudflare Pages | GitHub/GitLab Pages, Netlify (v1.x) |
| `Forge` | PR/CI shim | GitHub (`templates/github/*.yml`, ≤20 lines) | GitLab/Forgejo (v1.x) |
| *v2 hooks, no v1 adapter* | `Identity`, `Federation`, `PersonalStore` — named hooks designed against a real interface when the v2 component exists (ADR-003) | none | v2 servers only |
| *(withdrawn 2026-09-04)* | `Analytics` — analytics are zone-side, need no build artefact and emit no beacon; `Search` — AGSC-06-16 MUSTs the prebuilt index unconditionally, and already deleted the `build.search` toggle for the same reason | — | — |

### 5.3 Correspondence rules (ISO 42010 — the traceability spine; a CI script asserts every row)

| Bounded context | `src/` dir | `spec/` section | `tests/vectors/` area | Area due | PRD ids |
|---|---|---|---|---|---|
| Knowledge | `src/knowledge/` | `01-bundle`, `02-item`, `03-links`, `05-graph` | `bundle/`, `frontmatter/`, `slug/`, `links/`, `graph/` | shipped | 002, 003, 010, 017, 018, 022, 025 |
| Knowledge (canonical form) | `src/knowledge/jcs.js` | `04-canonicalization` | `jcs/` | shipped | 004 (NFR-04) |
| Provenance & Governance | `src/governance/` | `08-governance` | `lint/` shipped, `ledger/` seeded, `prov/` | `prov/` M6, `ledger/` M6+M11 | 005, 031, 035, 039–043, 047 |
| Composition | `src/composition/` | `07-composition` | `compose/` | shipped | 036, 037, 038 |
| Distribution | `src/distribution/` | `06-surfaces` (+ `02-item` §2.9 for adoption) | `discovery/`, `build/`, `adopt/` | `build/` M4, `adopt/` M1 | 011, 013–016, 019, 020, 023, 024, 044, 049–051, **053** |
| Interchange | `src/interchange/` | `01-bundle` §1.5 import + §1.6 export (+ `06-surfaces` for `llms.txt`) | `import/`, `export/`, `skills/` | `import/`+`export/` M12, `skills/` M9 | 021, 026, 029, 032–034 |
| CLI contract & diagnostics | `bin/agsc.js` | `09-conformance` | `cli/` | shipped | 001, 006–009, 052 |
| *(outside the five contexts)* `tools/` | — (no `src/` dir by design) | `09-conformance` §9.9 | — (the tools are their own check) | M13 + one per milestone | **054** |

Rule: **one context ↔ one `src/` dir ↔ one spec section ↔ one vector area.** A module with no spec section and no vector fails the lint (golden thread, NFR-03). The CI script reads the **Area due** column: an area that has not reached its milestone is not yet expected to exist (`tests/vectors/README.md`, "populated as the milestones that need them land"); `tools/` is exempt by the sentence in §5.1.

---

## 6. Runtime view

**(a) `agsc ci` end-to-end (PRD-049, 004, 005).**
1. Load + schema-validate `agsc.config.json`. 2. Discover `content/**/*.md` + `site/*.md`, code-point sorted. 3. Parse frontmatter → validate → resolve fourteen Link keys, compute inverses, detect orphans/cycles. 4. Run L1/L2 lints incl. `injection-scan`, `no-secrets`, `no-pii`, `clean-room`; error → exit 1 with file+line. 5. Compile `*.diagram` → SVG. 6. Build SKOS collections + graph; emit `graph.{jsonld,ttl,nq}` (JCS, sorted, blank-node-free) and `pages/<slug>.{md,jsonld}`. 7. Render HTML, `search.json`, `_headers`, `_redirects`, sitemap, `llms.txt`, `/.well-known/knowledge-linkset` (RFC 9264 link set; `digest` per artefact, **`agsc-ledger-head` on `rel#ledger`**), `/now/` + `now.md` — all times from `SOURCE_DATE_EPOCH`. 8. Enforce N8 budgets; over → exit 1. 9. **Build again** into a temp dir; byte compare; diff → exit 1. 10. `export`; `attest` in CI. 11. **Derive** the whole `ledger.jsonl` from the git-log file into `www/` (AGSC-08-20a: first-parent chain, one entry per commit, one trailing `build` entry); re-verify the chain and compare its head to the published `agsc-ledger-head` on the `rel#ledger` link. 12. Exit 0; `dist/gate.json` carries the verdict.

**(b) Proposal lifecycle (PRD-039–043).**
1. Author (human, or operator-run agent) edits an item with `prov{origin, operator}`. 2. `lint --fix` normalizes; `propose` writes `dist/proposal/<n>.patch` + PR body (`<!-- agsc:proposal v1 -->`) and prints the `git`/`gh` commands — **no network write** (C5). 3. The human runs them; the PR carries the DCO-Plus `Signed-off-by … (CA-v1)` trailer. 4. `ci.yml` runs `agsc ci` with `contents: read`; fork PRs lint-only until labelled, ≤5 open bot PRs; findings post as annotations. **No LLM (C6).** 5. The maintainer reviews and adds `verified: [{by, at}]` — that entry *is* the Review. 6. Ruleset requires PR + 1 approval + Code Owner + green `ci`; the maintainer merges (agents never approve). 7. Merge → deploy → `agsc ci` → Pages publishes `www/`; the build **re-derives** the whole `ledger.jsonl` from git history (the merge commit becomes a `kind:"merge"` entry) into `www/` — CI never commits it back to the content branch (PRD-042); `prov.commit`/`reviewer` are likewise **derived at build**, never written into files.

**(c) Browser compose → Harness download (PRD-038, 037).**
1. `/compose/` loads `graph.jsonld` + `www/js/agsc-core.js` — the *same* `src/composition/` modules, no `node:` imports (test-enforced). 2. User ticks Concepts, filtered by Cluster/tag. 3. `closure.js` runs client-side in the normative order of spec/07 (AGSC-07-04…08): `requires` closure adds items with a breadth-first explanation path → `supersedes` hides every superseded member, and a survivor whose `requires` target was just hidden is `AGSC-E802` → `excludes` over the survivors reports the violating pair (`AGSC-E801`) → `contradicts`/missing `uses` warn. Hiding before mutex is normative: the reverse order reverses verdicts. 4. User names the Harness; the seven files are generated in memory. 5. Download via a STORE-only JS zip writer, per-file download as the documented fallback. 6. Bytes equal `agsc compose <slugs> --out ./harness-x/` — a vector asserts Node ≡ browser. No server, no key, no upload.

---

## 7. Deployment view

| Lane | Workflow | Trigger | Permissions | Secrets | Result |
|---|---|---|---|---|---|
| Engine CI | engine `ci.yml` | push, PR | `contents: read` | none | `npm test` (fixed clock, no network), coverage ≥99%, `lint --self`, vectors; OS matrix on tags; + every `tools/validate-*` (AGSC-09-92, merge-blocking) |
| Engine release | engine `release.yml` | tag `v*` pushed **by the maintainer** | `contents: read`, `id-token: write`, `attestations: write` | none (OIDC) | Node 24 → npm **trusted publishing** of `agentic-system-core` + `agsc-cli` with `actions/attest` provenance (SLSA v1.0 Build L2 wording) |
| Auto-channel merge | site `review.yml`, job `auto-merge` | `pull_request` labelled `channel:auto` | `contents: read` (the merge itself is performed by the channel owner's separate merge credential, the only identity on the ruleset bypass list) | `CHANNEL_MERGE_TOKEN_<name>` | merges only when every condition of AGSC-08-26 holds — PR author = `channels[].author`, `prov.operator` = `channels[].owner`, `content/**` items of `type ∈ concept\|episode\|lesson` only (never a `procedure`), N9 lints at `error` — and writes the `Channel-Auto: <name>` trailer that the derived ledger reads as `mode: auto` |
| Content CI + deploy | site `ci.yml` | push to `main`, PR | `contents: read`; deploy job elevated only as needed | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (deploy job only; never in fork context) | `npx agsc-cli ci` → publish **`www/`** to **Cloudflare Pages**; `_headers`/`_redirects` come from the build |
| Refresh + channel ingest | site `refresh.yml` | weekly cron `29 5 * * 0`; ingest schedule per channel | `contents: read`, `issues: write`; the ingest job runs with no repo write of its own | `CHANNEL_TOKEN_<name>` (ingest job only — the channel owner's fine-grained PAT, contents + pull-requests write on the content repository, never in fork context, **never a ruleset bypass actor**, and with no access to `CHANNEL_MERGE_TOKEN_<name>`) | `refresh --auto`: staleness + link HEAD checks → at most **one** issue, never a commit; keeps the 60-day auto-disable clock alive |

All actions SHA-pinned with Dependabot; **never `pull_request_target`**; no cache step (zero deps); secrets only in the jobs that need them. The secret inventory is **2 + two per registered channel**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (deploy job only), plus, per entry in `channels[]`, the ingest credential `CHANNEL_TOKEN_<name>` **and** the separate merge credential `CHANNEL_MERGE_TOKEN_<name>` (AGSC-08-26(f)). The two are never held by one job: forge fine-grained tokens are not ref-scoped, so separating them is the only thing that keeps token scope and branch protection in different hands. Releases use OIDC trusted publishing and hold no secret. Every token is fine-grained, scoped to the single job that needs it, and carries an expiry ≤90 days recorded in `docs/runbooks/secrets.md`; a channel whose token has lapsed ingests nothing rather than falling back to a broader credential. `GITHUB_TOKEN` never merges an auto PR.

**w3id conneg (C4).** `https://w3id.org/agentic-system-core/ns#Concept` → the w3id repo's `.htaccess` matches `Accept` against a fixed table → `303` to `/ns/agsc.ttl` (`text/turtle`), `/ns/context.jsonld` (`application/ld+json`), `/ns/agsc.rdf` (`application/rdf+xml`), else the `/ns/` HTML index. Targets are always same-origin static files (no open redirect); `/ns/<ver>/` copies are immutable. Until the w3id PR merges the IRI simply does not resolve — that blocks nothing at launch. No project-owned function or Worker exists at v1.

---

## 8. Crosscutting concepts

- **Determinism.** Normative in `spec/04-canonicalization`: JCS, sorted keys, LF, NFC, UTC seconds, `SOURCE_DATE_EPOCH`, code-point file ordering, no blank nodes (so RDFC-1.0 degenerates to a sort). `verify` is merge-blocking.
- **Agent-safety (N9) — the four mitigations.** (1) *Trust marking*: every MCP/WebMCP result is `{source, trust:"untrusted", license, type, body}`; skill packs, steer bundles and `llms.txt` carry a fixed provenance header and fence prose as ```` ```text agsc-content ````; own-repo Mode-2 bundles carry only the generated-from-commit line. (2) *Structural lints* (`src/governance/injection.js`): agent-directed imperatives, hidden text (HTML comments, zero-width, U+E0000–E007F, bidi), long base64/hex blobs, non-`http(s)` schemes — `warn` for humans, **`error` when `prov.agent` is set**; wordlists in `lint.injection_patterns[]`, literal alternations only, inputs capped at 1 MiB. (3) *Least agency*: tools take **ids, never paths**; no shell, URL or network tool; tool descriptions are package constants; `propose` writes locally, never pushes. (4) *Inert artefacts*: content-only skills with a sha256 lockfile and diff-on-update. Integrity hashes + attestation prove *tampering*, not injection.
- **Error handling.** Exit `0` success, `1` findings/failed gate, `2` usage error incl. a malformed `SOURCE_DATE_EPOCH` (PRD-007, AGSC-09-08). Diagnostics = JSON lines on **stderr** sorted by `(file, line, col, code)`, data on stdout; codes are `AGSC-E<nnn>` — one format only — with the hundreds digit naming the area (`0` CLI, `1` PARSE, `2` SCHEMA, `3` LINK, `4` LINT, `5` PROV, `6` DET, `7` LEDGER, `8` COMPOSE, `9` IO), enumerated in `spec/09-conformance` §9.4 and pinned by `tests/vectors/cli/`. Parsers raise `AgscParseError` and nothing else (fuzz-asserted).
- **Config.** Exactly one schema-validated `agsc.config.json`; precedence flags > env (`AGSC_*`) > project > user; `NO_COLOR`, `--plain`, `--no-input`, `--version` honoured. Unknown keys error.
- **Logging.** None at runtime — there is no runtime. Diagnostics go to stderr; the durable record is `ledger.jsonl` + git history + Episode items. No telemetry, cookies, localStorage or beacons (PRD-046).
- **i18n.** Accepted at 1.0 (PRD Amendment 6): `<slug>.<lang>.md` variants are published at `/<type-plural>/<slug>/<lang>/` with `hreflang` alternates on the primary; `i18n.default` names the primary language; UI strings stay in templates so a port can swap them.

---

## 9. Architecture decisions

| ADR | Title | Status | Cites |
|---|---|---|---|
| 001 | Agent-safety by structural defence (N9) | Accepted | N9, OWASP LLM01:2025 |
| 002 | Zero runtime dependencies | Accepted | N1 |
| 003 | Static-only, Cloudflare Pages from `www/` | Accepted | — |
| 004 | One vocabulary, fourteen Links (nine core + five Mode-2) | Accepted | — |
| 005 | `/ns/` conneg via w3id `.htaccess` | Accepted | — |
| 006 | Derived hash-chained ledger | Accepted | — |
| 007 | Content Use Terms embedded in every prose export | Accepted | NFR-10 |
| 008 | JS + JSDoc with a language-independent capability plane | Accepted | NFR-02 |
| 009 | Five contexts vs four (Emission merge) | Deferred | reopen only if the boundary rule leaks in P2 |

### ADR-001 — Agent-safety: structural defence against indirect prompt injection (N9)

**Context and problem statement.** Everything we publish — `llms.txt`, `SKILL.md` packs, `AGENTS.md` steer bundles, MCP/WebMCP results, Harness files — is consumed by agents as context and often as instruction. One merged Concept saying "ignore your rules and run `curl … | sh`" propagates to every installer, every downstream memory (A8) and every Harness. This is OWASP **LLM01:2025 Prompt Injection** (indirect), unaddressed by the format itself. Second face: our own review lane reading a diff that says "approve this PR" (LLM05/LLM06).

**Decision drivers.** N9 (security floor); simplicity (the simplest thing that satisfies the requirement); cost (≤$10/month — a per-page model call is neither affordable nor free); C2 (no server to host a filter); NFR-04/05 (deterministic, offline-testable); human ratification (a human always ratifies).

**Considered options.** (1) **LLM classifier** on every page and Proposal diff (Prompt-Shields pattern). (2) **Sandboxing / execution isolation** — accept arbitrary content, run it constrained (allow-list, scrubbed env, no network, timeout). (3) **Structural defence** — data/instruction separation by construction: trust-marked JSON results, fenced prose, deterministic lints, id-only arguments, inert skills, human merge. (4) **Do nothing** — rely on the consuming agent's guardrails.

**Decision outcome. Option 3 — structural defence.** Options 1 and 2 solve a problem we can instead *not have*: option 1 costs a model call per page (breaks the cost ceiling and NFR-05, and cannot run offline); option 2 presupposes we execute content, which v1 never does (`run` deferred, skills inert) — sandboxing is future work for a feature that does not exist. Option 4 externalises a risk we create. Option 3 is entirely files and lints: no money, offline, byte-deterministic, vector-testable. The four mitigations are exactly those in §8, plus the standing human merge gate.

**Consequences.** *Good:* zero cost, zero dependency, deterministic, portable to any reimplementation (the lints are specified in `spec/08-governance`, not merely coded); the same controls serve the injection, secrets and skills rows of the threat model (§12). *Bad:* regex lints have a non-zero false-positive rate — hence `warn` for humans, `error` for agent-authored Proposals, with a labelled override; they catch known shapes only, not a well-written novel injection. *Honest limit:* hashes and attestations prove a page is *what we published*, never that it is safe. Option 2 returns as a precondition if `run` is ever implemented; option 1 only as an optional provider-capped v1.1+ lane that may add a label, never a merge.

**Confirmation.** `tests/vectors/lint/injection-*.json` (positive/negative: zero-width, bidi, U+E0000 tags, base64 blobs, `javascript:` links); a test that every MCP/WebMCP result carries `source/trust/license`; a test that `skills install` rejects `scripts/`, exec bits, symlinks, `allowed-tools`; a test that no tool signature accepts a path, URL or shell string. All merge-blocking (NFR-07).

**More information.** Anthropic tool-result isolation, Microsoft MSRC spotlighting, OpenAI agent guidance — deterministic subsets only.

**ADR-002 Zero runtime dependencies.** `node:` builtins only, forever; devDependencies serve dev lanes and never enter the published package. Buys a trivially auditable supply chain (LLM03), a package any agent can `npx` unreviewed, and portability to Deno/Bun/Workers; costs ≈2,600 hand-written lines whose risks are answered in §11 R1–R3, R7. *N1, NFR-01.*

**ADR-003 Static-only, Pages from `www/`.** No servers, databases, queues or Workers at v1; CI is the only backend and every write path ends in a PR — which makes NFR-09, Q5 and most of §12 true by construction. Workers stay a *future optional plugin backend*, never required. *PRD-050.*

**ADR-004 One vocabulary, fourteen Links.** Six item types with a `kind` qualifier on Concept plus **fourteen** authored Link keys with computed inverses serve all five modes: the nine core keys carry composition semantics, and the five Mode-2 keys (`implements`, `verifies`, `covers`, `blocked-by`, `decided-by`), promoted to first-class keys by, are navigational — combiner semantics `none`. Four competing foreign link lists are still mapped on import. Adding a type or key costs a schema bump + spec section + vectors — deliberately expensive. *PRD-002.*

**ADR-005 `/ns/` conneg via w3id `.htaccess`.** Conneg is the one thing a static host cannot do; putting it in w3id yields zero project-owned server code, permanent IRIs independent of the domain, and no attack surface we operate. Costs a foreign-repo PR (gating `/ns/` resolution only) and a same-origin table kept in sync. Fallback if w3id refuses: a `run_worker_first` handler — not built at v1. *PRD-050.*

**ADR-006 Derived hash-chained ledger.** `build`/`ci` **recompute** the whole `ledger.jsonl` from the git history of the content branch — one entry per event, `hash = sha256(prev + canonical(entry))` — and write it into `www/` and the release assets only; the head is published as the `agsc-ledger-head` attribute of the `rel#ledger` link in the well-known file and attested per release, so any reader re-verifies the history offline via `verify --ledger`, which also compares the recomputed head to the published one. Nothing appends and nothing is hand-written, so a bot commit to the content branch is never needed (it is forbidden by PRD-042), concurrent CI runs cannot fork the chain, and a partial write cannot exist; a tampered published file fails against the recomputation. *PRD-005, NFR-11.*

**ADR-007 Content Use Terms embedded in every prose export.** The licence stack is fixed (engine Apache-2.0; schema/ontology/IDs CC0; prose ARR + `LicenseRef-AgenticSystemCore-Content-Use-1.0`) and the terms travel *with* the bytes — skill packs, steer bundles, Harnesses, `llms.txt`, MCP results — because excerpts leave our origin by design. CI fails an export that omits them. *NFR-10, PRD-019.*

**ADR-008 JS + JSDoc, language-independent capability plane.** Shipped code is ESM JavaScript with JSDoc types; TypeScript is a dev-lane checker (`tsc --noEmit`), never a build step, so what is published is what was written. The *definition* is `spec/00–09` + `schema/` + `ontology/agsc.ttl` + `tests/vectors/`: a Python or Rust port must pass on those alone, and behaviour existing only in JS is a defect. *NFR-02, NFR-03.*

**ADR-010 Part II scope under the simplicity rule (opened 2026-09-04).** The Part II additions of PRD Amendment 6 are cheaper than they look because each crosses the simplicity line differently, and each was resolved to the simplest form the requirement allows rather than a new subsystem: `run`/`trace` keep a spec home (`AGSC-09-94`) with `run` opt-in, sandboxed and disabled by default — the requirement is executable-documentation confidence (C8), and the simpler alternative beaten was leaving it an unspecified feature with no rule and no vector; `conform` is a thin verb over the vector runner and the Level→area map that already exist, not a fifth distribution module — the requirement is a machine-checkable conformance claim (PRD-055/C3), and the simpler alternative beaten was duplicating the runner; the federation check is the `--peer` flag of `tools/validate-wellknown` (AGSC-10-12, AGSC-09-90), never a tenth binary — the requirement is the "smallest protocol" claim, and the simpler alternative beaten was a standalone `validate-federation.js`; the six runtime emitters (C5) are template renderings over the seven existing Harness files, never new files inside `dist/harness/<name>/` — the requirement is reach into the agent-runtime ecosystem, and the simpler alternative beaten was one module per target; distribution breadth (C10) ships only the composite GitHub Action and the pre-commit hook, the two surfaces needing no new credential or registry account — the requirement is "installable everywhere a user already is" for the audiences that actually ask, and PyPI-functional/GHCR/Homebrew/Nix (§C10's own "zero known consumers") are deferred to a documented request line rather than built speculatively.

**ADR-011 Link set over vendor manifest (opened 2026-09-04).** The rc.2 discovery design replaces the pre-rc.2 `{integrity, linkset}` well-known document with a conformant RFC 9264 link set (`linkset` its sole member; integrity rides on the links as RFC 9530 `digest` and `agsc-*` extension target attributes). The requirement served is a machine-checkable, standards-conformant discovery document that a generic link-set client can already parse; the simpler alternative it beat was continuing to define and register a bespoke vendor media type and a two-member JSON shape understood by nothing outside this project. Net effect: one IANA registration fewer (Profile URI, RFC 7284, replaces a media-type registration), zero new URI schemes, and every artefact's integrity travels with the link that names it rather than in a side channel that could drift out of sync.

---

## 10. Quality requirements (quality tree → proving lane)

| NFR | Goal | Lane that proves it |
|---|---|---|
| NFR-01 zero deps | Q2 | engine `ci.yml`: `npm ls --prod` empty + `npm audit` |
| NFR-02 language-independent plane | Q4 | vectors lane (`tests/vectors/**`, no engine-private state) + correspondence-rule CI script + the `tools/` validators (PRD-054, AGSC-09-90…92) |
| NFR-03 ≥99% coverage | Q1 | coverage lane + golden-thread check (every PRD id → ≥1 test name) |
| NFR-04 byte-identical builds | Q1 | determinism lane: `agsc verify` (double build + sha256), merge-blocking; OS matrix on tags |
| NFR-05 deterministic tests | Q1 | `node:test`, fixed clock 2026-01-01T00:00:00Z, + a test that no `Date.now()`/`fetch` is reachable from `src/knowledge/**` |
| NFR-06 N8 budgets | Q2, Q5 | budget step in `agsc ci` (HTML ≤100 KB/page, ≤1 MB per index document — `/search.json`, or each `/search-<nn>.json` shard above 500 items; rc.5, — ≤60 s/500 items, no external page requests) |
| NFR-07 agent-safety | Q3 | N9 lint lane + tool-shape tests + skills-inertness test (ADR-001 Confirmation) |
| NFR-08 WCAG 2.2 AA | Q4 | a11y dev lane (axe-core) over the golden `www/` fixture; alt text asserted |
| NFR-09 unattended ops | Q5 | `refresh.yml` idempotence test; restore-from-zero drill once pre-launch |
| NFR-10 licence stack | floor | REUSE/SPDX lint + "terms embedded" assertion on every prose-carrying export |
| NFR-11 ≤$10/month | Q5 | launch lanes contain no model call (grep-asserted); ledger `usage` → `/now/` spend line |
| NFR-12 clean room | floor | `clean-room` lint (§2 C7) + importer refusing `bookRef` |
| NFR-13 offline & cross-platform | Q4 | portability checklist on three OSes (paths, CRLF, NFC, reserved names, exit codes, `NO_COLOR`, XDG) |

---

## 11. Risks & technical debt (top 8)

| # | Risk | Source | Mitigation | When |
|---|---|---|---|---|
| R1 | Hand-written **Markdown subset renderer** — highest risk; 153 bodies must render | — | ship the old renderer's feature level + GFM tables; golden-test all 153; unsupported syntax is a lint error, not a rendering surprise | M4 |
| R2 | **Turtle / RDF-XML / N-Quads** escaping and datatypes subtly wrong | — | validate once offline (rapper/Jena), lock with golden fixtures; RDF/XML stays in v1.0, emitted when `build.rdfxml` is true (AGSC-05-06) | M5 |
| R3 | Browser ≡ CLI composition core with **no bundler**, plus a hand-written zip writer | — | one ESM entry copied to `www/js/`; test forbids `node:` imports in `src/composition/`; per-file download fallback | M8 |
| R5 | **w3id PR latency** — `/ns/` IRIs unresolvable until merged | ADR-005 | IRI fixed in `ontology/agsc.ttl`; PR after M2; launch does not depend on it | maintainer |
| R6 | `injection-scan` **false positives** deter human contributors | — | severity split + labelled override + config-owned wordlists; measured on the 153-card corpus pre-launch | M13 |
| R7 | Zero-dep parsers ⇒ **ReDoS, prototype pollution, traversal, resource bombs** | — | index-based state machines not regexes; `Object.create(null)` + `__proto__`/`constructor` rejection; ids-only paths; 1 MiB caps; seeded fuzz lane on tags; **archives refused entirely** | M1, M12 |
| R8 | **Correspondence-rule drift** — a module with no spec section or vector | — | §5.3 machine-checked in `ci` against its **Area due** column; `tools/validate-spec` closes rule-id and error-code drift mechanically (PRD-054); deferred items named below, not hidden | M13 |

**Accepted debt (named):** ADR-009 unopened; CA-v1 bot and `signatures.jsonl` manual; LLM review v1.1; non-GitHub browser Proposal flow undefined; benchmarks = v1.0.1 gate ≤30 days post-launch (first-review default). **Closed by PRD Amendment 6:** typed Mode-2 Links are keys 10–14 (AGSC-03-01/03-18/03-20); the `memory://` resolver is AGSC-05-04b; i18n variants are AGSC-01-13/13a; WebMCP is the normative rule **AGSC-09-16** with vector `cli/cli-0003`; `--json` is REQUIRED on `lint`/`ci` and SHOULD be on every verb (AGSC-09-12); the `conform` runner and `/conformance/` are AGSC-09-03 (lifted).

---

## 12. Threat model (STRIDE, condensed)

**Assets.** A1 content repo · A2 engine repo + npm packages · A3 published site/exports · A4 CI secrets · A5 accounts · A6 domains + w3id prefix · A7 contributor personal data · A8 downstream agents' memories · A9 clean-room invariants.

| # | Threat | STRIDE | Asset | L/I | Implemented mitigation | Trace |
|---|---|---|---|---|---|---|
| T1 | **Prompt injection via merged content** reaching agents through `llms.txt`, skills, steer bundles, MCP results | T/E (LLM01) | A8, A3 | M/H | ADR-001: trust-marked JSON results, fenced prose, `injection-scan` (error for `prov.agent`), ids-only tools, inert skills, human merge | NFR-07 |
| T2 | **Malicious Proposal** — silent edits to `schema/`/`ontology`/`type`/`id`, or an ingest PR posing as a channel | T/E | A1, A9 | M/M | ruleset PR + 1 approval + Code Owner + green `ci`; the only ruleset **bypass actor** is the channel owner's `CHANNEL_MERGE_TOKEN_<name>`, which the ingest job cannot reach (the ingest credential `CHANNEL_TOKEN_<name>` is repository-wide write but holds no bypass, AGSC-01-30), and it can merge only PRs satisfying AGSC-08-26 (author = `channels[].author`, `prov.operator` = `channels[].owner` from config, `content/**` items only, N9 lints at `error`); `AGSC-E706` is an **error** at 1.0 and fails `verify`/`ci` on any content-branch commit outside the merged-pull-request path, or on an ingest identity found holding bypass rights; CODEOWNERS on `schema/**`, `ontology/**`; `prov.operator` must match PR author; forks lint-only until labelled; ≤5 open bot PRs | PRD-040/042/043 |
| T3 | **npm typosquat / lookalike alias** (`agsc` refused; users mistype) | S | A2 | M/M | trusted publishing + `actions/attest` on both packages; canonical names documented; `npm audit signatures` | PRD-048 |
| T4 | **CI token theft** via logs or a compromised action | I/E | A4, A3 | M/H | `contents: read` default + per-job elevation; SHA-pinned actions + Dependabot; **never `pull_request_target`**; secrets only in the deploy job; no cache step | PRD-050 |
| T5 | **w3id redirect tampering** — `/ns/` IRIs pointed at an attacker host | T | A6, A3 | L/H | fixed `Accept`→path table, **same-origin targets only**; w3id-maintainer-reviewed PRs; immutable `/ns/<ver>/`; ontology digests on the `rel#ontology` link | ADR-005, PRD-024 |
| T6 | **Deploy from a compromised CI run** publishes a poisoned site | T | A3 | L/H | scoped TTL-bound Cloudflare token; attested weekly snapshot = known-good redeploy; `verify` reproduces `www/` from any clone | NFR-04/09 |
| T7 | **Malicious parser input** (ReDoS, prototype pollution, zip-slip, resource bombs) | D/E | A2, A3 | M/M | §11 R7 controls; archives refused entirely; 1 MiB cap; seeded fuzz lane; `AgscParseError`-only guarantee | NFR-13 |
| T8 | **Secrets or PII merged into a page** | I | A7, A4 | M/H | `no-secrets` + `no-pii` lints (emails/phones only in `prov`/`sources[]`); GitHub push protection once public | PRD-046, NFR-07 |
| T9 | **Skill pack carrying executables** installed into an agent tree | E (LLM03) | A8 | H if allowed | content-only rule on **both** export and install: reject `scripts/`, exec bits, symlinks, `.sh/.js/.py/.ps1/.cmd`, `allowed-tools`; sha256 lockfile; diff-on-update | PRD-035 |
| T10 | **Repudiation / silent history rewrite** | R/T | A1 | L/H | `prov` required + PR body as the record; ruleset blocks force push; hash-chained `ledger.jsonl`; mirrors + attested snapshot + Zenodo per release | PRD-005/045, ADR-006 |

Residual, accepted: novel unmodelled injection phrasing (ADR-001 honest limit); the maintainer as single approver. Combiner XSS is closed by build-time escaping, `script-src 'self'` and never `innerHTML`-ing page text.

---

## 13. Structurizr DSL (textual model — context + containers)

```structurizr
workspace "AgenticSystemCore" "Distributed Ontological Agentic Memory engine — reference node of the Agentic Knowledge Web" {
  model {
    reader = person "Human reader / contributor" "P1, P2"
    agent = person "Agent (reader, proposer, integrator)" "P3, P4, P6, P8"
    owner = person "Maintainer (approver, git-write authority)" "S12, P9"
    implementer = person "Standards / port implementer" "P10, P11, S13"

    asc = softwareSystem "AgenticSystemCore" "Compiles a Markdown Bundle into a wiki, an RDF graph, agent memory, skills and Harnesses" {
      cli = container "agsc CLI" "Node >=22.14, ESM, zero runtime dependencies" "Node.js" {
        knowledge = component "Knowledge" "parse, validate, link, ontology, graph" "src/knowledge/"
        governance = component "Provenance & Governance" "prov, Gates, Proposals, lints, ledger" "src/governance/"
        composition = component "Composition" "closure algebra + Harness emitters" "src/composition/"
        distribution = component "Distribution" "site, exports, discovery, NOW, ci, init, mcp" "src/distribution/"
        interchange = component "Interchange" "import/export/steer/skills" "src/interchange/"
        ports = component "Ports & Node adapters" "FileSystem, Clock, ProcessRunner, Network[CI-only]" "src/ports/, src/adapters/"
      }
      mcpserver = container "agsc mcp" "Local stdio JSON-RPC server: search read links compose propose ask remember" "Node.js"
      browser = container "Browser bundle" "www/js/agsc-core.js — same composition core, no node: imports; WebMCP page tools" "JavaScript (ESM)"
      site = container "Static site" "www/: pages, graph.*, pages/*.md|.jsonld, search.json, llms.txt, skills/, /ns/, /.well-known/knowledge-linkset, now.md" "Static files"
      pipeline = container "GitHub Actions" "ci.yml, release.yml, refresh.yml — the only backend" "YAML workflows"
      bundle = container "Bundle" "content/**/*.md + agsc.config.json — the system of record (ledger.jsonl is derived into www/, not stored here)" "Markdown + YAML + git"
    }

    github = softwareSystem "GitHub" "Repos, Proposals (PRs), Actions, Releases" "External"
    pages = softwareSystem "Cloudflare Pages" "Static host serving www/" "External"
    w3id = softwareSystem "w3id.org" ".htaccess content negotiation for /ns/" "External"
    npmreg = softwareSystem "npm registry" "agentic-system-core, agsc-cli" "External"

    reader -> site "Reads pages and machine surfaces" "HTTPS"
    reader -> github "Opens a Proposal (fork-and-edit)" "HTTPS"
    agent -> mcpserver "Calls seven tools" "stdio JSON-RPC"
    agent -> site "Fetches linkset, graph, llms.txt, skills" "HTTPS"
    agent -> browser "Uses page tools" "WebMCP"
    owner -> github "All git writes, merges, tags" "git/HTTPS"
    implementer -> asc "Reimplements from spec/ + tests/vectors/" "files"
    cli -> bundle "Reads content, derives ledger" "FileSystem port"
    cli -> site "Emits www/" "FileSystem port"
    browser -> site "Loads graph.jsonld; downloads Harness" "HTTPS"
    mcpserver -> site "Reads published exports" "HTTPS (mcp only)"
    pipeline -> cli "Runs agsc ci" "npx"
    pipeline -> pages "Publishes www/" "wrangler / Pages"
    pipeline -> npmreg "Trusted publishing + attestations on tag" "OIDC"
    github -> pipeline "Triggers on push, PR, tag, cron"
    pages -> site "Serves"
    w3id -> site "303 to /ns/agsc.ttl, /ns/context.jsonld" "Accept-based"
  }

  views {
    systemContext asc "Context" { include * autolayout tb }
    container asc "Containers" { include * autolayout tb }
    component cli "Components" { include * autolayout tb }
    styles {
      element "Person" { shape person }
      element "External" { background #999999 }
    }
  }
}
```

---

*Drafted with AI assistance: `prov: {origin: ai-generated, agent: claude-opus-5, operator: human:andreibesleaga}`, 2026-09-02.*

**Addendum 2026-09-03 (PRD-056):** ports table gains **`Channel`** (inbound `pull/render` → Proposals; outbound `ask` responder over exports) — v1 adapter = a fixture stub under `channels/stub/`; real adapters (Telegram ingest+ask, Google Keep export, OneNote export, WhatsApp export, mail) are plugins v1.x; a Worker-hosted responder is the "future optional plugin backend" of ADR-003. Component: `src/interchange/channels.js` (port + stub) in M12.

**Addendum 2026-09-03:** `src/distribution/mcp.js` exposes seven tools (`+ ask + remember`), resources and one prompt; `ask` shares the responder module with the Channel port (`src/interchange/channels.js` → `answer(question) → {answer, citations[]}`); `remember` reuses `proposal.js`. Sequence (d) "agent remembers": MCP client → remember → item synthesized → Proposal (hitl: patch+body; auto: merged by CI after lint-only) → rebuild → resource visible.

## Addendum 2026-09-15 — performance backlog and benchmark protocol
Performance recommendations R-01…R-16 and benchmark hypotheses H-01…H-08 (with baselines, statistics rules and claims discipline) are recorded in the project's analysis of 2026-09-15 and scheduled as: v1.0 — chunk sizing by heading with zero overlap, digest `ETag`/immutable caching, `Link` discovery header, SVG-as-text diagrams, sitemap/robots, complexity notes in the spec; 1.1 — incremental build keyed by per-item digests, Bloom-filter shard manifest, memory-pack export; measure-first — precomputed closure artefact, static triple-pattern fragments. The benchmark kit (`agsc bench`) runs after general availability and reports every LLM result as "observed under configuration X"; the only pre-measurement claim is structural (deterministic bytes from source, digest-bound discovery under a registered well-known name, offline-verifiable history, declared agent surfaces). Bounded contexts are five: Knowledge, Governance & Provenance, Composition, Distribution, **Boundary** (federation, surfaces, visibility), plus Interchange as a supporting context.

## Addendum 2026-09-16 — the Boundary row of §5.3 and two corrections

*Additive; the frozen text above is unchanged.* **§5.3 gains one correspondence row:** context **Boundary** (rc.3, `spec/11-boundary.md`) ↔ `src/boundary/` ↔ vector areas `boundary`, `chunks`, `boards` (Area due: M4 for `chunks`, M5 for `boundary`, M8-core for `boards`) — so the golden-thread lint of §5.3 has a home for every rc.3 rule. **ADR-008 correction:** the definition is `spec/00`–`spec/11` + `schema/` + `ontology/agsc.ttl` + `tests/vectors/` (AGSC-00-01 as amended at rc.3). **§5.2 correction:** the `Federation` hook is no longer "v2, no v1 adapter": federation is client-side and static at 1.0 (AGSC-11-06…15), so the v1 adapter is the walk in `validate-wellknown --peer` and the site's client script; `Identity` and `PersonalStore` stay v2. **§12 gains the rc.3 threat rows**, carried in `docs/SECURITY-CONSIDERATIONS.md` (T11 peer-fetch request forgery, T12 wrongly public restricted node, T13 contribute-channel spam and sender spoofing, T14 surface spoofing, T15 tombstone successor impersonation, T16 SVG attachment as an injection carrier), each naming the closing rule.

## Addendum 2026-09-16 — five architecture decision records

*Additive. ADR numbering continues from ADR-011.*

**ADR-012 Plugins are declared surfaces.** Every agent surface is declared in the discovery document under the four-rule contract declare · pin · inherit · prove (AGSC-11-16…19). *Consequence:* the Boundary context is an anti-corruption layer; an external draft moving changes a version string, never the core. *Confirmation:* `bnd-0031`, `bnd-0013`, `bnd-0021`.
**ADR-013 Two reference plugins: local MCP and WebMCP.** Same seven tools; MCP 2026-07-28 with the SEP-2133 extension id via `server/discover`; WebMCP Draft CG Report 2026-09-15 with the three hints. A2A only as the optional card beside a responder (AGSC-06-34). *Confirmation:* `cli-0003`, `bnd-0031`.
**ADR-014 The agent federates; nodes never call nodes.** Nine static, client-side parts (spec/11 §11.3); citation, never a cross-Bundle Link. *Consequence:* the `Federation` port of §5.2 has a v1 adapter after all — the walk in `validate-wellknown --peer` and the site client — while `Identity` and `PersonalStore` stay v2. *Confirmation:* `bnd-0003…0011`, `bnd-0019`, `disc-0005`.
**ADR-015 Visibility and dynamic hooks specified now, built later.** `visibility` public/restricted with the discovery document always readable; `responder`/`solid` declaration-only. *Confirmation:* `bnd-0002`, `bnd-0016`.
**ADR-016 Ports wired verdict-neutrally in Step 5.** `produces`/`consumes` on items, matched by exact name after the four verdict steps, warnings only. *Confirmation:* `compose-0011`, `compose-0012`, `graph-0013`.

## Addendum 2026-09-18 — declared scope by version (AGSC-00-20) and two decision records (ADR-017, ADR-018)

*Additive; the text above is unchanged.* Rule **AGSC-00-20** (rc.4) names the whole scope of the specification with the version at which each part becomes normative; this addendum is the dated, informative twin of that rule.

| Version | Target | Parts (normative at that version) |
|---|---|---|
| **1.0** | first general availability | Bundle and six item types (§1, §2); fourteen Links (§3); canonical forms (§4); graph (§5); surfaces (§6); composition and the Harness (§7); governance with the **agent lane** — `agents[]`, `.env`, node-wide `budget.usd_month` default 10 USD, `max_new_items`, `max_claims`, `--dry-run` (§1.8, §8.6); conformance (§9); Levels 0–3, project mode and **Mode 5 the live board** (§10); boundary — federation in nine client-side parts, plugin contract, visibility, the declaration-only surfaces `responder`, `solid`, `a2a-card`, retirement and tombstones (§11) |
| **1.1** (MINOR) | 2027 | served `responder` (AGSC-11-21); `memory://` resolver (AGSC-05-04a); `build.rdfxml`; typed cross-node Link `peer-ref`; a registered short relation if IANA grants one; `agsc-profile-encrypted` and signatures profiles; incremental build and memory pack; i18n variants served; benchmark kit; red-team suite; public conformance page |
| **2.0** (MAJOR) | 2027 or later | servers — hosted responder, live Agent2Agent boards (AGSC-10-14), forge application for browser proposals; the Solid pod written by the node rather than only declared; IPFS snapshots and ActivityPub delivery as declared surfaces (`x-` extensions until then); CRDT live sync; SPARQL endpoint; hosted multi-tenant nodes |

**ADR-017 The agent lane proposes, never writes; the live board's fast lane never reaches its slow lane.** An agent lane is configuration (`agents[]`), runs as `refresh --agent` or a surface client, reads only published surfaces with prose fenced as data, and emits Proposals with an Episode per run; budgets bound it per lane and node-wide, `max_new_items` bounds a planner, `max_claims` bounds work in progress. A self-driving node's ratification is the channel owner's one revocable `publish: auto` choice. Everything that needs a person — gates, review, decisions, releases, procedures, gates, clusters, configuration, workflows, schemas — is the slow lane, unreachable by construction. *Consequences:* non-determinism is confined to Proposal content; `lint`/`build`/`verify`/`ci` stay model-free; the ledger's `mode: "auto"` entries and the Episodes make an autonomous history auditable. *Rejected:* an agent as approver; agent writes to the branch; a per-agent cap without a node cap.

**ADR-018 Configuration from the environment, secrets never in files.** `.env` in the Bundle root, `AGSC_*` names only, process environment first, credentials environment-only, `init` writes `.gitignore` and `.env.example`, `ci` prints override names never values, the resolved configuration is the build's input. *Rejected:* interpolation and quoting in `.env` (a second parser to specify); credentials as configuration keys.

## Addendum 2026-09-18 — ADR-019 supersedes ADR-002: maintained libraries at exact pinned versions

**ADR-019 Maintained libraries instead of hand-written parsers.** Supersedes ADR-002 and amends the C1 row of the constraints table above (2026-09-18). *Context:* the reference engine must not reinvent parsers, serialisers and protocol code; the engine is one replaceable implementation of a language-independent specification, so its supply chain is an implementation property, not a property of the standard. *Decision:* the engine takes actively maintained, permissively licensed libraries at exact pinned versions for YAML (failsafe schema), JSON Schema 2020-12, RFC 8785, JSON-LD 1.1 and RDF serialisations, Markdown, `.env`, the Model Context Protocol, XML and argument parsing; `package-lock.json` is committed, CI installs with `npm ci`, an `npm audit` gate blocks on any advisory, `overrides` pin transitive versions; hand-written code is limited to what the specification pins byte-for-byte and no library emits. Library choices and versions are researched before each pin and recorded in the engine's `src/README.md`. *Consequences:* the supply-chain mitigations of §11 R7 move from "no dependencies" to "pinned, audited, minimal dependencies with provenance at release"; the security rows on zero-dependency parsers are re-read as library-hardening rows (size caps, `strict` schema mode, no HTML pass-through in Markdown, failsafe YAML with explicit rejection of anchors, aliases, tags and flow mappings). *Rejected:* keeping ADR-002 (the cost of hand-written parsers exceeded the supply-chain benefit once the engine's scope covered eleven formats); vendoring libraries into the tree (loses the audit trail). Related: NFR-01 as amended by PRD Amendment 9; `docs/ARCHITECTURE-DDD.md` (the context map the implementation follows literally).

## Addendum 2026-09-18 — ADR-019 reading note and the CommonJS decision

*Appended, not rewritten: every paragraph above stays as its author wrote it. This note says how to read two groups of statements that pre-date the decisions of 2026-09-18.*

**ADR-019 reading note — "zero runtime dependencies" wherever it still appears in this file.** ADR-019 above supersedes ADR-002 and the C1 constraint row. Six further statements were written before it and are read through it, without changing their text: the Q2 quality-goal row of §1 ("zero deps, one config file, ≤3 commands per feature"), the `agsc engine` node label of the §2 context diagram ("16 verbs, zero deps"), the §7 CI note "no cache step (zero deps)" — the engine now installs with `npm ci` against a committed lockfile, so a dependency cache step *is* admissible and the sentence is historical — the *Consequences* line of ADR-011 ("zero cost, zero dependency, deterministic, portable"), the NFR-01 row of the §9 traceability table ("engine `ci.yml`: `npm ls --prod` empty + `npm audit`"), which is now "`npm ls --prod` lists only exact versions + `npm audit` 0", and the Structurizr container literal in §6 (`"Node >=22.14, ESM, zero runtime dependencies"`). Each is to be re-read as **"pinned, audited dependencies"**; the model regenerates at the next architecture pass.

**ADR-019 reading note — "ESM".** The reference engine is **CommonJS**: `bin/agsc.js`, `index.js`, `tools/*` and all of `src/` use `require`, and `package.json` declares no `"type": "module"`. Four statements in this file say ESM and are read as follows. ADR-008 ("shipped code is ESM JavaScript with JSDoc types") is amended to *"shipped code is JavaScript with JSDoc types — CommonJS in the Node engine, ESM in the browser bundle"*; its substance, that TypeScript is a dev-lane checker and never a build step, is unchanged. The R3 risk row ("one ESM entry copied to `www/js/`") and the browser-bundle container in §6 ("JavaScript (ESM)") remain **true as written** — the browser bundle is and stays ESM. The `agsc CLI` container literal in §6 is read as *"Node >=22.12, CommonJS, pinned audited dependencies"*. The engine's floor is Node **>=22.12.0** (`package.json` `engines.node`), not the >=22.14 of the older prose.

## Addendum 2026-09-21 — the release lane exists, and two definition-of-done lines are corrected

Additive, in the style of the addenda above; nothing in the plan's own prose is rewritten.

**The release lane of §7 is now a script and a workflow.** `tools/release` checks, in a
dry run by default, everything §7's *Engine release* row states: one version in one
place (the engine and its `agsc-cli` alias, pinned exactly, never a range), the
changelog section, the `npm pack` contents — no `GABBE/`, no private planning path, no
test-fixture bloat beyond `tests/vectors/`, which AGSC-09-90 requires a distribution to
ship — and the provenance step. `.github/workflows/release.yml` is the lane itself: a
tag `v*` the maintainer pushes, a three-OS × two-Node gate matrix,
`actions/attest-build-provenance`, and `npm publish --provenance` over npm trusted
publishing with no secret in the repository. The script cannot publish: it spawns no
process and opens no socket, and `--apply` writes only the two version strings and the
changelog heading. The maintainer's checklist is printed by the script itself, so it cannot
drift from the checks.

**`lint --self` in the §5.3 pipeline line and in the definition of done is superseded.**
`AGSC-09-09` as amended at rc.5 closes the verb-flag set and names `lint --fix` alone,
and `--self` was a registered flag that no code read; `agsc lint --self` exited 1 in the
engine root because the engine root is not a Bundle. The flag is therefore removed and
the invocation is now the `AGSC-E002` usage error the rule requires. **Read every
"`lint --self` clean" in this file as "the nine independent validators of AGSC-09-90
exit 0, `node tools/count-artifacts --json` reports `ok` with no finding, and
`AGSC_AUDIT=1 node --test tests/arch/*.test.js` is green"** — the checks that actually
hold this distribution together. To lint a *Bundle*, the command is `agsc lint` from
that Bundle's root. (The same note is appended to `docs/PRD.md`.)

**One reporting step in CI, not a failure.** `tools/validate-spec` exited 1 on 2026-09-21
against the `1.0.0-rc.5` text for reasons recorded as specification items.
Until those were applied, `release.yml` ran it as a **reporting** step while every other
validator blocked the merge, which was the nearest thing to `AGSC-09-92` that the frozen
text allowed. The items are applied in the `1.0.0-rc.6` draft (2026-09-22), and the step
becomes blocking once the tool's historical-note word list follows AGSC-09-91 as amended
there.

**`docs/IMPLEMENTERS-GUIDE.md` exists**, so `AGSC-01-26a`'s obligation to list every
memory adapter with its claimed key set is discharged; the list itself is in
`src/interchange/README.md` and the guide points at it.

---

## Appended 2026-09-22 — the compatibility section and the content version

Added to the `1.0.0-rc.6` draft after the pass recorded above, in `spec/` and `schema/` only:

- **`spec/00` §0.6 (AGSC-00-21…25)** — compatibility across versions, the closed list of eight
  plugin kinds with their contracts, and the three names reserved to 1.1 (`weights`, `routing`,
  `executable`). `AGSC-00-20`'s 1.1 list carries the same three.
- **`spec/04` §4.9 (AGSC-04-25)** — the content version `bundle_version`, derived from the git-log
  file of AGSC-08-20b and the build instant of AGSC-04-09, stamped in nine named places and
  recorded by `import` as `prov.source_version`/`prov.source_hash`.

Sixteen rules are amended in place for the two; none is retired, none renumbered, and no error code
is minted. `schema/bundle.schema.json` gains `bundle_version`; `schema/item.schema.json` gains
`prov.source_version` and `prov.source_hash`. Two vectors are withdrawn and superseded
(`disc-0010` → `disc-0013`, `disc-0011` → `disc-0014`) and six are added; all eight new ids are in
`tests/conformance/pending.json` with the reason `rc.6: awaiting engine`.

*Note, 2026-09-24:* the reference engine now satisfies all eight — it emits `agsc-bundle-version`, the
`bundle_version:` header line and the content version wherever AGSC-04-25 names — and
`tests/conformance/pending.json` is empty.

## Appended 2026-09-24 — `refresh --auto` at 1.0

The §7 *Refresh* lane and the §12 diagrams name `refresh --auto` with link `HEAD` checks. At
1.0 that flag does not exist and no lane reaches the network (the network port refuses every
call, `AGSC-E905`); staleness is reported offline on the NOW page of every build. The lane's
other properties — at most one issue, never a commit — stand. `docs/PRD.md` carries the same
note for PRD-044.

## Appended 2026-09-24 — four notes to earlier records (additive; the records above stay as written)

*Note to ADR-007 (2026-09-24):* since `1.0.0-rc.6` (AGSC-06-18 and AGSC-01-29 as amended
2026-09-24) the Content Use Terms accompany the prose only where the publisher adopts them;
otherwise the prose licence the node names stands in their place, and the exports carry that
licence. "Every prose export" reads as "every prose export, under the terms or the licence
the node names".

*Note to ADR-012, ADR-013 and ADR-016 (2026-09-24):* the confirmation vectors named there have
successors — `bnd-0031` was withdrawn and replaced by `bnd-0037`, and `graph-0013` by
`graph-0017` (rc.6). The ids above stay as the record of the day; the live vectors are the
successors.

*Note to C7 (2026-09-24), in plain words:* the clean-room lint (AGSC-08-17) refuses imported
material that presents a node as an ordered reading or as a supplement to another publication,
and no whole-corpus PDF/EPUB emitter exists. The invariant list the row refers to is held
outside every repository; a reader needs only the rule.

*Note to §7 and §11, the P9 persona (2026-09-24):* the public word for the person who holds
git-write authority is "the maintainer"; the persona label "Owner-as-operator" above reads as
"Maintainer-as-operator", which is what the feature file now says.

