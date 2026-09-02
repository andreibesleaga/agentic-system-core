# PRD — AgenticSystemCore v1 (S01 requirements artifact, EARS)

**Product.** AgenticSystemCore — *a Distributed Ontological Agentic Memory engine, reference node of the Agentic Knowledge Web* (tagline D37). A Bundle is a folder of Markdown + YAML frontmatter (OKF v0.2 superset), typed by `type` and linked by nine typed Links — at once wiki, RDF graph and agent memory.

**Goal.** v1 live on `agenticsystemcore.com` by ~2026-10-10 with the 153 authored pattern Concepts imported from the retired site, re-summarized and clearer, with correct DSL→SVG diagrams.

**Authority.** `discovery-product/CONTINUE-FROM-HERE.md` → `04-DECISIONS.md` (D01–D47 + note) → `14-FINAL-HANDOFF.md` → `audit/D` (§1 model, §6 MVP). Constitution I–XV is law; on conflict escalate.

---

## 1. Personas & jobs

| # | Persona | Job to be done |
|---|---|---|
| P1 | Human reader (architect/engineer) | Find the right pattern, with evidence |
| P2 | Human contributor | Fix a page, pass a hard review gate |
| P3 | Agent reader | Query structured knowledge without scraping |
| P4 | Agent proposer (operator-signed) | Contribute a change humans ratify |
| P5 | Architect (combiner) | Turn Concepts into a starting architecture |
| P6 | Integrator | Install this knowledge into my agent |
| P7 | Project team (Mode 2) | Keep our agent-built specs governed |
| P8 | Agent-as-memory (Mode 1) | Use a node as external auditable memory |
| P9 | Owner-as-operator | Keep the site green with zero maintenance |
| P10 | Port implementer | Prove my port conforms byte-for-byte |
| P11 | Standards implementer | Adopt the discovery format on my site |

---

## 2. Functional requirements (EARS)

Scope: **v1** = audit/D §6 must (M1–M15); **should** = S1–S8; **v1.x** = later.

### 2.1 Cross-cutting: engine & CLI

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-001 | WHEN a verb is invoked, THE SYSTEM SHALL support exactly `init lint build verify ci export import compose propose review refresh skills mcp`, rejecting others. | 13 names; unknown verb exits 2. | D41, R54 | v1 |
| PRD-002 | THE SYSTEM SHALL implement the audit/D §1 item model (six types, Concept `kind`, nine Links with computed inverses) unextended. | Schema and lint match §1. | D41, D36-final | v1 |
| PRD-003 | WHEN `lint` runs, THE SYSTEM SHALL report schema, link, orphan, cycle, provenance, section and staleness findings with file and line. | Fixture matches; exit 0/1. | R3, R49 | v1 |
| PRD-004 | WHEN `verify` runs, THE SYSTEM SHALL build twice and prove byte-identical output (JCS, sorted keys, LF, NFC, UTC, `SOURCE_DATE_EPOCH`). | Empty diff, three OSes. | R32, Art. XII | v1 |
| PRD-005 | WHEN `build`/`ci` completes, THE SYSTEM SHALL append one hash-chained `ledger.jsonl` entry, re-verifiable offline via `verify --ledger`. | Tampered line fails; head published. | D44(h) | v1 |
| PRD-006 | WHERE configuration is needed, THE SYSTEM SHALL read exactly one schema-validated `agsc.config.json`. | Invalid key errors; no second config. | R44, D32(4) | v1 |
| PRD-007 | WHILE any verb runs, THE SYSTEM SHALL honour `--json --quiet --plain --no-input --version`, `NO_COLOR`, `AGSC_*`, exit 0/1/2, precedence flags > env > project > user. | UX matrix passes. | R54, R30 | v1 (`--json` everywhere: v1.x) |
| PRD-008 | WHEN a tag is cut, THE SYSTEM SHALL carry a SemVer version, `spec_version` and a generated Keep-a-Changelog file. | All three agree. | R45 | v1 |
| PRD-009 | WHEN `init` runs, THE SYSTEM SHALL scaffold a Bundle with three example Concepts, config, type folders and one forge workflow. | `ci` passes unedited. | R56, R35 | v1 |
| PRD-010 | THE SYSTEM SHALL ship normative `spec/00–09` and ≥10 `tests/vectors/` so any language can reimplement the format from files alone. | Each spec section has ≥1 vector. | R32, D38-final, D47 | v1 (`conform`, `/conformance/`: v1.x) |

### 2.2 Mode 0: auto-wiki (default, no LLM)

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-011 | WHEN `build` runs, THE SYSTEM SHALL emit the fixed R36 route set (`/`, `/concepts/`, `/clusters/`, `/search/`, `/now/`, `/lessons/`, `/compose/`, `/skills/`, `/specs/`, `/ns/`, `/about/`, `/legal/`, `/graph.*`, `/llms.txt`, `/.well-known/*`, 404) into `www/`. | Route snapshot. | R36, D47-note(d) | v1 |
| PRD-012 | WHILE no LLM key is configured, THE SYSTEM SHALL stay fully functional for authoring, lint, build, publish, review. | Pipeline green keyless, offline. | R24, D41 | v1 |
| PRD-013 | WHEN a Concept declares a `diagram`, THE SYSTEM SHALL compile its DSL source to SVG deterministically, inlined with alt text from DSL labels. | 153 compile; stable bytes; alt present. | R8, D20, N10 | v1 |
| PRD-014 | WHEN `build` runs, THE SYSTEM SHALL emit a prebuilt client-side `search.json`. | Dependency-free search within N8. | D19 | v1 |
| PRD-015 | WHEN `build` runs, THE SYSTEM SHALL generate `/now/` and `/now.md` (counts, last build, stale items, open Lessons, spend) purely from stored state. | Hand edits overwritten. | R29, D44(a) | v1 |
| PRD-016 | THE SYSTEM SHALL surface failure knowledge as Lesson items plus one generated `/lessons/` page, no error-book file. | All Lessons listed; no `AUDIT.md`. | R58, R3 | v1 |
| PRD-017 | WHEN an item's absolute `stale_after` passes, THE SYSTEM SHALL flag it stale — no decay maths, no access logs. | Past-dated fixture flagged. | R49, D43(3) | v1 |
| PRD-018 | WHERE an item is renamed, superseded or deprecated, THE SYSTEM SHALL keep slugs unique-forever, honour `status`/`supersedes`, generate `_redirects`. | Slug reuse errors; redirect emitted. | R40 | v1 |
| PRD-019 | THE SYSTEM SHALL generate `/legal/` (Content Use Terms, code licence, privacy notice, operator, retention) and embed the terms in every prose-carrying export. | CI fails without terms. | R37, R39, D39 | v1 |
| PRD-020 | WHEN `build` runs, THE SYSTEM SHALL emit `_headers`, `sitemap.xml`, canonical links, Schema.org JSON-LD and `/404.html`. | Header snapshot; sitemap complete. | R41, R42, D40 | v1 |
| PRD-021 | WHEN `import --from old-site` runs, THE SYSTEM SHALL convert 153 cards, 110 Clusters, diagrams and resources deterministically and idempotently, keeping `status`/`release`, refusing `bookRef`. | Re-run no-op; 66 render, 87 dark; owner approves a 10-card sample first. | R8, D47, audit/D §1.5 | v1 |

### 2.3 Mode 1: distributed agentic memory

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-022 | WHEN `build` runs, THE SYSTEM SHALL emit the graph as JSON-LD, Turtle and N-Quads plus per-item `.md`/`.jsonld`. | Blank-node-free; sorted N-Quads = RDFC-1.0. | R2, D30, D41 | v1 (RDF/XML: should S1) |
| PRD-023 | WHEN `agsc mcp` starts, THE SYSTEM SHALL serve a local stdio JSON-RPC server exposing exactly `search read links compose propose` over the static exports. | Five tools; results carry `source/trust/license`. | D41, N9 | v1 (remote MCP: not at v1) |
| PRD-024 | THE SYSTEM SHALL publish one `/.well-known/agentic-knowledge` with the RFC 9264 linkset and integrity block (hashes, ledger head) under the vendor media type. | Linkset resolves; hashes match. | D21-final, D47-note(c) | v1 |
| PRD-025 | THE SYSTEM SHALL publish `llms.txt`, `llms-full.txt` and per-item Markdown for non-MCP agents. | Every item reachable from `llms.txt`. | R2, R33 | v1 |
| PRD-026 | WHEN `export`/`import` runs, THE SYSTEM SHALL round-trip Markdown/OKF, JSON-LD and JSONL, and emit export-only llms.txt, MCP resources, steering files, scaffolds. | No key lost; Bundle opens as an Obsidian vault. | D39, D15, R20, R33 | v1 (Mem0/Letta/Zep/CSV: v1.x) |
| PRD-027 | WHERE `memory://<bundle>/<slug>` appears, THE SYSTEM SHALL document it as an alias of the HTTPS IRI, not resolve it. | Alias-only; no resolver. | D33, audit/D G22 | v1 (resolver: v2) |

### 2.4 Mode 2: live specs / SDLC memory

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-028 | WHERE a Bundle records a project's own work, THE SYSTEM SHALL accept Concept `kind ∈ principle\|decision\|spec\|task\|term` plus Gate and Episode items, adding no type. | Kinds accepted; no new type. | R26, D41, G06 | v1 (typed Mode-2 links: v2) |
| PRD-029 | WHEN `export --steer` runs, THE SYSTEM SHALL render AGENTS.md/CLAUDE.md bundles from NOW/Concept/Procedure/Gate/Lesson items, as context only. | Byte-stable; enforcement in CI. | R34, D41 | v1 (other trees, `run`/`trace`: v1.x) |
| PRD-030 | THE SYSTEM SHALL publish its own specifications as an instance of itself, excluding confidential sources. | `/specs/` from `spec/`; `05-*` excluded. | R55, G32 | should (S2/S4) |
| PRD-031 | WHEN a Gate item declares `checks[]`, THE SYSTEM SHALL compile it into a required CI status check. | Gate page ↔ named required check. | D44(b), D41 | v1 (hooks/CODEOWNERS: v1.x) |

### 2.5 Mode 3: evolutive skills wiki

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-032 | WHEN `build` runs, THE SYSTEM SHALL emit one Skill pack per Cluster plus `/skills/index.json`, each declaring its licence. | 20 packs + index; `description` ≤1024. | D33, R27 | v1 |
| PRD-033 | WHEN `skills install <site>` runs, THE SYSTEM SHALL write packs into `.claude/skills`, `.agents/skills` or `.github/skills`. | Three trees install idempotently. | R27, G12 | v1 (Cursor/Copilot/Gemini/Codex/GABBE: v1.x) |
| PRD-034 | WHEN `skills import <dir>` runs, THE SYSTEM SHALL map `SKILL.md` files to Procedure items. | Round-trip stable. | R27, R20 | v1 |
| PRD-035 | THE SYSTEM SHALL emit skills as content only — no scripts, executables, symlinks, `allowed-tools` — with a sha256 lockfile. | Lint rejects executables; lockfile verifies. | N9, Art. XIV | v1 |

### 2.6 Mode 4: runnable knowledge

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-036 | WHEN Concepts are composed, THE SYSTEM SHALL apply `requires` closure, `excludes` mutex, `uses`/`contradicts` warnings, `supersedes` hiding, explaining each addition and conflict. | Fixtures give documented verdicts. | R6, D41, audit/D §1.3 | v1 |
| PRD-037 | WHEN a composition is emitted, THE SYSTEM SHALL write the seven-file Harness (`harness.jsonld`, `AGENTS.md`, `workspace.dsl`, `diagram.mmd`, `arc42.md`, `decisions/*.md`, `skills/*/SKILL.md`). | Seven deterministic files. | R6, D35, audit/D §3(e) | v1 (GABBE/kaiban/CrewAI: v1.x) |
| PRD-038 | WHILE a user is on `/compose/`, THE SYSTEM SHALL run the CLI's composition core in the browser with downloadable outputs, no server. | Node = browser (test); no Node imports in core. | R12, D11, R28 | v1 |

### 2.7 Governance & provenance

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-039 | WHEN `propose` runs, THE SYSTEM SHALL write a patch plus PR body locally and print the commands, never pushing. | No network write. | D13, D27 | v1 |
| PRD-040 | WHERE a contribution is accepted, THE SYSTEM SHALL require a DCO-Plus `Signed-off-by` referencing CA v1, plus operator sign-off for agent-authored changes. | Missing trailer fails; texts shipped. | D07, D37 | v1 |
| PRD-041 | WHEN a Proposal opens, THE SYSTEM SHALL run a lint-only review producing a verdict, requiring human ratification before publication. | No launch-lane LLM; merge needs approval. | D14, D41, D09 | v1 (LLM review: v1.1) |
| PRD-042 | THE SYSTEM SHALL require `prov{origin, operator}` on every item and derive commit/reviewer at build from git log and `verified[]`, never writing content from CI. | Missing `prov` errors; no bot commits. | D07, G35, Art. XIII | v1 |
| PRD-043 | WHILE Proposals arrive from forks, THE SYSTEM SHALL run lint-only until labelled, capping open bot PRs at five. | No secrets to forks; sixth refused. | R50, D40 | v1 |
| PRD-044 | WHEN the weekly `refresh --auto` cron runs, THE SYSTEM SHALL re-check staleness and external links and open at most one issue, never committing. | One issue; idempotent. | R49, N11, D43(2) | should (S3) |
| PRD-045 | THE SYSTEM SHALL support restore-from-zero via git mirror, weekly attested snapshot, per-release Zenodo deposit. | Clone + `ci` reproduces the site. | R51, N11 | v1 |
| PRD-046 | THE SYSTEM SHALL collect no telemetry, cookies, localStorage, third-party embeds or analytics beacons. | CSP `default-src 'none'`; no external requests. | R52, N4 | v1 |
| PRD-047 | THE SYSTEM SHALL ship the R47 hygiene set (`SECURITY.md`, `security.txt`, CoC, `CITATION.cff`, CONTRIBUTING, GOVERNANCE) and a REUSE layout. | Presence test. | R47, D40 | v1 |

### 2.8 Distribution & delivery

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-048 | WHEN the owner pushes a tag, THE SYSTEM SHALL publish `agentic-system-core` (bin `agsc`) and the `agsc-cli` alias with attestations from one hand-versioned source. | Tag-triggered; CI writes the alias version. | R31, D38-final, D28-note | v1 (PyPI/GHCR/Homebrew/Nix: v1.x; binaries: v2) |
| PRD-049 | WHEN `ci` runs locally or in CI, THE SYSTEM SHALL execute the identical lint → build → verify → export → attest pipeline behind one command, with a ≤20-line forge shim. | Same exit code, same artifacts. | R35, D41 | v1 (other forges: v1.x) |
| PRD-050 | WHEN `main` updates, THE SYSTEM SHALL deploy static `www/` to Cloudflare Pages, `/ns/` conneg by w3id `.htaccess`, no server code. | Serves from `www/`; conneg returns TTL/JSON-LD. | D47, D47-note(a), D09 | v1 |
| PRD-051 | WHERE a browser exposes `document.modelContext`, THE SYSTEM SHALL register the same five tools as page tools, degrading to plain JavaScript. | Tools appear in the origin trial; site usable without. | R57, D34, D41 | should (S8) |
| PRD-052 | THE SYSTEM SHALL ship a newcomer README section per module and a five-minute quickstart per persona. | One quickstart per persona surface. | D32(6), N7 | v1 |

---

## 3. Non-functional requirements

| ID | Requirement | Acceptance | Trace |
|---|---|---|---|
| NFR-01 | THE SYSTEM SHALL have zero runtime dependencies (`node:` builtins, Node ≥22.14). | `npm ls --prod` empty. | N1, D17, Art. XI |
| NFR-02 | THE SYSTEM SHALL define its capability plane by files and ontologies only; the Node engine is one conforming implementation. | A port passes on `spec/` + vectors. | D47, Art. XI |
| NFR-03 | THE SYSTEM SHALL keep ≥99% line coverage on `src/`; no requirement without a test. | Coverage ≥99%; golden thread complete. | D47, Art. I |
| NFR-04 | THE SYSTEM SHALL produce byte-identical output for a commit on every OS. | `verify` green, three OSes. | R32, Art. XII |
| NFR-05 | THE SYSTEM SHALL keep tests deterministic: fixed clock 2026-01-01T00:00:00Z, no wall clock, no network. | Clock/network in `core/` fails a test. | N3, Art. XII |
| NFR-06 | WHEN `ci` runs, THE SYSTEM SHALL enforce HTML ≤100 KB/page, `search.json` ≤500 KB at 500 items, build ≤60 s for 500 items, no external page requests. | Budget check fails the build. | N8 |
| NFR-07 | THE SYSTEM SHALL treat content as untrusted data structurally: JSON results with `source/trust/license`, prose fenced as data, id-only arguments, no shell/URL tools, lint against imperatives, hidden text, secrets and PII. | N9 lint green; ADR-001. | N9, D40, Art. XIV |
| NFR-08 | THE SYSTEM SHALL generate HTML meeting WCAG 2.2 AA (semantics, contrast, keyboard, alt text). | a11y lint clean. | N10 |
| NFR-09 | THE SYSTEM SHALL run unattended: idempotent crons, 60-day Actions auto-disable runbook, tested restore-from-zero. | Runbook run pre-launch. | N11 |
| NFR-10 | THE SYSTEM SHALL keep the licence stack fixed and embedded: engine Apache-2.0, schema/ontology/IDs CC0, prose ARR + Content Use Terms v1. | REUSE + terms green. | D05, D39, Art. XIII |
| NFR-11 | THE SYSTEM SHALL keep LLM spend ≤$10/month, visible on the NOW page. | Spend line present; launch lane LLM-free. | D14, D44(h), Art. XV |
| NFR-12 | THE SYSTEM SHALL contain no Web4/crypto framing, book or "companion" strings, no whole-corpus PDF/EPUB emitter. | Clean-room lint (W1–W12) green. | R13, D08, Art. XIII |
| NFR-13 | THE SYSTEM SHALL run offline and cross-platform (paths, CRLF, NFC, reserved names, exit codes, `NO_COLOR`, XDG). | Portability checklist, three OSes. | R30 |

---

## 4. Non-goals (v1)

No servers, databases, queues or Workers — static Pages + CI only (D47, D09). No LLM in any launch lane (D41). No remote MCP, API keys or server-side narrate (D41, superseding R4/R7/N2). No `agent-card.json`; no `run`, `trace`, `conform`, `bench` verbs (D41). No functional PyPI wrapper (v1.x; D38-final). No federation beyond the linkset (D41). No book, PDF/EPUB or whole-corpus compilation, ever (D08, W1–W12). No telemetry, cookies, forms or accounts (R52, N4). No vector store, embeddings, decay maths, spreading activation, transclusion or build-time reasoner (D43). Dropped venues: EuroPLoP, ISWC, WWW, SWJ, TWEB without waiver (D45). `memory://` = documented alias only (D33).

---

## 5. Metrics & definition of done

**Metrics (measurable only, 12 months):** visitors/month; npm downloads; `/skills/` fetches (zone analytics); Proposals merged; provenance coverage 100%; median Proposal→decision <7 days; zero broken references; spend ≤$10/month; JOSS and RFC milestones. MCP hits are local — not a KPI.

**Definition of done (14-FH §5, compressed):** (1) persona walkthroughs (a)–(j) of audit/D §3 exist as end-to-end tests (fixed clock, no network, recorded fixtures) green on three OSes at the tag; (2) `verify` proves byte-identical rebuilds, each spec section has ≥1 vector, `lint --self` clean, N8/N10 green, coverage ≥99%; (3) site live with `/ns/` conneg, well-known linkset, llms.txt, graph exports, skills, `/compose/`, `/now/`, `/legal/`, `_headers`, smoke tests as Episodes; (4) benchmark kit run on real data, results and datasheet on Zenodo, linked from `/about/`; (5) docs complete — module READMEs, quickstarts, PRD/PLAN/SPEC + `spec/`, CHANGELOG, CITATION.cff, adversarial findings answered, UNVERIFIED items dropped; (6) publications started — Zenodo DOI, IEEE Intelligent Systems, I-D -00 before 2026-11-02.

---

## For the owner (3 items, with recommended defaults)

1. **Benchmarks in the launch gate.** DoD (4) requires published benchmarks, but `bench` is a v1.x verb (D41), no M1–M15 milestone covers it, and P-BENCH is post-launch. *Default:* launch DoD = (1)–(3), (5), (6); benchmarks = a v1.0.1 gate within 30 days.
2. **RDF/XML level.** D30 makes RDF/XML a v1 export; audit/D §6 trims it to should-level S1 for the 22-day budget. *Default:* should — ship if M5 finishes early, else v1.1.
3. **DoD wording "docs/00–14 current".** Cancelled by D47-note (e). *Default:* read as "PRD/PLAN/SPEC + `spec/00–09` current" — applied above.

---

**Adversarial review (R4, 2026-09-02): PASSED** — traces verified against D01–D47/R1–R58/N1–N11; scope matches audit/D §6; one trace corrected (PRD-001 R19→R54); R46 (plugin-API definition) and R48 (support policy) deliberately deferred to PLAN.md/README per their own v1 wording.

**S01 GATE: awaiting owner approval (approve/edit inline; the 3 "For the owner" items above default as stated if unanswered)**

*Generated by: `prov: {origin: ai-generated, agent: claude-opus-5 (draft) + claude-fable-5 (adversarial review), operator: human:andreibesleaga}` · P-S01, 2026-09-02*
