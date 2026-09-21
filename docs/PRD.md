# PRD — AgenticSystemCore v1 (S01 requirements artifact, EARS)

**Product.** AgenticSystemCore — *a Distributed Ontological Agentic Memory engine, reference node of the Agentic Knowledge Web* (tagline D37). A Bundle is a folder of Markdown + YAML frontmatter (OKF v0.2 superset), typed by `type` and linked by **fourteen** typed Links (nine core + five Mode-2) — at once wiki, RDF graph and agent memory.

**Goal.** v1 live on `agenticsystemcore.com` by **2026-11-06** (GA; the project calendar in the private planning register — the earlier ~2026-10-10 date now marks *Part I core complete*) with the 153 authored pattern Concepts imported from the retired site, re-summarized and clearer, with correct DSL→SVG diagrams.

**Authority.** The project's private decision register (**D01–D61** and their notes), its final handoff record, and audit D (§1 model, §6 MVP). Constitution I–XV is law; on conflict escalate.

---

## 1. Personas & jobs

| # | Persona | Job to be done |
|---|---|---|
| P0 | Drop-in user | Drop my .md files, get a live linked wiki/memory, zero config |
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
| P12 | Self-driving team (Mode 5, rc.4) | Let agents and people plan, claim and finish a project's tasks on one live board until it is done |

---

## 2. Functional requirements (EARS)

Scope: **v1** = audit/D §6 must (M1–M15); **should** = S1–S8; **v1.x** = later.

### 2.1 Cross-cutting: engine & CLI

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-001 | WHEN a verb is invoked, THE SYSTEM SHALL support exactly `init lint build verify ci export import compose propose review refresh skills mcp`, rejecting others. | 13 names; unknown verb exits 2. | D41, R54 | v1 |
| PRD-002 | THE SYSTEM SHALL implement the audit/D §1 item model (six types, Concept `kind`, **fourteen** Links — nine core + five Mode-2 — with computed inverses) unextended. | Schema and lint match §1. | D41, D36-final | v1 |
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
| PRD-024 | THE SYSTEM SHALL publish one `/.well-known/knowledge-linkset` as a conformant RFC 9264 link set (`linkset` the sole member) served as `application/linkset+json` with the profile URI `https://w3id.org/agentic-system-core/profile/agentic-knowledge`, carrying RFC 9530 `digest` and `agsc-*` extension target attributes (bundle facts on the anchor's `describedby` link, ledger head on `rel#ledger`). | Link set resolves and validates as `application/linkset+json`; every `digest` recomputes; the profile is conveyed by the media-type parameter or by `Link: …; rel="profile"`. | D21-final, D47-note(c), D55, **D60** | v1 |
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
| PRD-041 | WHEN a Proposal opens, THE SYSTEM SHALL run a lint-only review producing a verdict, requiring human ratification before publication. | No launch-lane LLM; merge needs approval. (AGSC-08-27) | D14, D41, D09, D61(4) | v1 (LLM review: v1.0, opt-in and non-gating per AGSC-08-27) |
| PRD-042 | THE SYSTEM SHALL require `prov{origin, operator}` on every item and derive commit/reviewer at build from git log and `verified[]`, never writing content from CI. | Missing `prov` errors; no bot commits. | D07, G35, Art. XIII | v1 |
| PRD-043 | WHILE Proposals arrive from forks, THE SYSTEM SHALL run lint-only until labelled, capping open bot PRs at five (the enforceable bound is AGSC-01-30: a channel MUST NOT have more than five open Proposals). | No secrets to forks; sixth refused. | R50, D40 | v1 |
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
| PRD-051 | WHERE a browser exposes `document.modelContext`, THE SYSTEM SHALL register the same **seven** tools (`search read links compose propose ask remember`) as page tools, degrading to plain JavaScript; `propose` and `remember` are local-only on that transport (AGSC-09-16). | Tools appear in the origin trial; site usable without; `cli/cli-0003` proves manifest and result parity. | R57, D34, D41, D51-b, D53 | **v1** |
| PRD-052 | THE SYSTEM SHALL ship a newcomer README section per module and a quickstart per persona. | One generated ≤10-line quickstart per persona P0–P11 on `/about/` (AGSC-06-24); no hand-maintained copy. | D32(6), N7 | v1 |

---

### 2.9a S01 Amendment 2 (owner-directed, 2026-09-02) — independent validators & document generators

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-054 | THE SYSTEM SHALL ship **independent validator scripts** under `tools/` — each a standalone, engine-independent check runnable by anyone (ports, reviewers, IANA/ISE experts) analogous to the I-D toolchain (idnits/xml2rfc): `tools/validate-schemas` (meta-validate `schema/*.json` against 2020-12), `tools/validate-spec` ("specnits": rule-id uniqueness AGSC-xx-nn, MUST/SHOULD grammar, trace-tag presence, error-code closure vs spec/09, cross-reference resolution), `tools/validate-ontology` (Turtle well-formedness + OWL 2 RL-safe axiom allowlist + SKOS pitfalls S19/S32/S37), `tools/validate-vectors` (vector-format schema + every `rule` resolves + JCS order), `tools/validate-wellknown <url\|file> [--level N] [--peer <url\|file>]` (RFC 9264 link-set shape, profile transport, every `digest`, the REQUIRED `agsc-*` target attributes, and the AGSC-10-12 mutual federation check — there is no separate federation validator), `tools/validate-features` (Gherkin parse + @PRD tag ↔ PRD-id closure), `tools/validate-diagrams` (Mermaid parse + trace-id presence + staleness vs source docs) — all Node stdlib, zero deps, exit 0/1, `--json`; plus **generators**: `tools/gen-spec-html` (spec/ → `/specs/` pages), `tools/gen-ns` (deterministic `context.jsonld` + `agsc.rdf` + `/ns/` index from `ontology/agsc.ttl`, sorted per AGSC-05-10 and round-tripped against the Turtle) and, at P-RFC, kramdown-rfc → xml2rfc → idnits for the I-D. CI runs every validator on every PR. | Each tool runs standalone on a fresh clone; breaking any invariant fails the matching tool; all green in CI. | R32, R55, D38-final, D47, N7 | **v1** (M13 + one per milestone that creates its target) |

*Craftsmanship bar (owner, 2026-09-02): the system is judged as a work of art — simplest possible usage (P0: three commands) AND simplest implementation, all five modes on one core, every artifact standardizable, and RFC/spec publication-readiness treated as a first-class design criterion (validators above are the proof).*

### 2.9 S01 Amendment 1 (owner-directed, 2026-09-02) — the drop-in zero-config case

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-053 | WHEN `init` runs in a directory containing plain Markdown files without frontmatter, THE SYSTEM SHALL **adopt** them: insert minimal valid frontmatter in place (`type: concept`, `kind: explainer`, `title` from the first `#` heading else the filename, `prov: {origin: human, operator}` from config or git identity), preserving every body byte verbatim and never overwriting existing frontmatter — so that a user who just drops `.md` files reaches a fully working online wiki / ontologic memory (site + graph + llms.txt + well-known + MCP-readable exports) in ≤3 commands: `npx agentic-system-core init` → `npx agentic-system-core ci` → publish (`git push` with the generated workflow, or upload `www/`). | Fixture dir of 3 bare `.md` → adopt → `ci` green offline → all Mode-0/1 surfaces emitted; re-run is a no-op; a file WITH frontmatter is untouched. | R24, R56, D32(4), N7 | **v1** (M1/M3) |

*This is the front-door scenario of the product (persona P0 "drop-in user": "I have notes; I want a living, linked, agent-readable wiki with zero configuration"). It precedes every other flow in quickstarts and on the site home.*

### 2.9b S01 Amendment 3 (V1 verification, 2026-09-02) — restatements, not rewrites

The frozen rows above stand verbatim. Two of them are **restated** here, as **D48** directs after the V1 mathematical and algorithmic verification; where a restatement and the frozen row differ in mechanism, the restatement governs the specification and the engine, and the frozen row remains the record of what S01 approved.

| ID | Restatement (D48) | Acceptance | Trace |
|---|---|---|---|
| PRD-005 (restated) | WHEN `build`/`ci` completes, THE SYSTEM SHALL **derive** the whole hash-chained `ledger.jsonl` from the git history of the content branch and write it into the build output and the release assets — never appending to a stored file, never committing it from CI — and SHALL publish its head as the `agsc-ledger-head` target attribute of the `…/rel#ledger` link in the well-known file (D55), re-verifiable offline via `verify --ledger`, which recomputes the chain **and** compares the head. | Tampered or truncated file fails; head published and attested; two builds of one history are byte-identical; no CI commit to the content branch. | D44(h), **D48(1)**, PRD-042, V1-05/06/07 |
| PRD-036 (restated) | WHEN Concepts are composed, THE SYSTEM SHALL apply the four steps in the order `requires` closure → `supersedes` hiding → `excludes` mutex → `uses`/`contradicts` warnings, and WHERE an item that survives hiding `requires` an item the hiding removed, THE SYSTEM SHALL invalidate the composition with **`AGSC-E802`** ("required item superseded — select `<superseding>`") rather than dropping the hard dependency silently or substituting the superseding item. | `compose-0001` (order) and `compose-0002` (E802) pass; verdict is a function of the selection set, `selection[]` sorted, `path[]` breadth-first. | R6, D41, audit/D §1.3, **D48(2)**, V1-01/02/03 |

*The remaining 32 V1 findings are rule-level amendments inside `spec/`, `schema/`, `ontology/`, `tests/vectors/` and the diagrams; they change no requirement row and are indexed by SPEC.md §6 decisions 11–17.*

**PRD-053 — acceptance and scope notes (V2 sweep, same amendment).** The frozen row stands; these two notes make it executable, per `audit/V2-system-sweep.md` V2-01/02/19/24.

- **Acceptance (added).** "In place" means *in the user's repository*, not *in the user's folder layout*: `init` MUST relocate each adopted file to `content/concepts/<slug>.md` (AGSC-02-93), recording its original repository-relative path in `aliases[]`, flattening nested directories and suffixing collisions per AGSC-01-23 — without which `build` discovers nothing under `content/**`. An adopted item MUST validate against `schema/item.schema.json` (`description` is schema-optional; a missing one on a concept or cluster is the warning `AGSC-E408`), so `ci` on a folder of bare notes is green offline with warnings only. `README.md`, `index.md` and `_index.md` are never adopted. Vectors: `adopt/adopt-0001…0003`.
- **Scope (corrected).** The Scope cell reads "v1 (M1/M3)", but `init` is built in M7. The adoption half — pure frontmatter synthesis plus relocation over the M1 parser, ≈0.3 d — lands in **M1** as `init --adopt`; the scaffold half (`init --host cloudflare`) stays in **M7**. No requirement changes; only where the work sits.

### 2.9b S01 Amendment 4 (owner-directed, 2026-09-02) — implementable anywhere

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-055 | THE SYSTEM SHALL be implementable in any language, framework or existing software (CMS, wiki, KB, note tool) from its specs alone: `spec/10-implementation-profiles.md` defines conformance Levels 0–3 (Publisher / Reader / Writer-Exporter / Full engine) with the exact rule subset and vector set per level, and `docs/IMPLEMENTERS-GUIDE.md` gives a ≤10-step path plus a platform mapping table, so that a third party can publish their linked knowledge as a node, export packages/skills/graphs, expose `memory://` aliases over their own KB, and import ours — validated by the shipped `tools/` validators without our engine. | A Level-0 node built from a plain CMS export passes `validate-wellknown` + `validate-vectors` (Level-0 subset) with zero engine code; guide followed end-to-end by a reviewer on a non-Node stack in the M14 dogfood. | D50, D47, R32, R33, PRD-010, PRD-054 | **v1** (spec/10 at S03 close; guide at M14) |

### 2.9c S01 Amendment 5 (owner-directed, 2026-09-03) — channel adapters: ingest & ask

| ID | Requirement | Acceptance | Trace | Scope |
|---|---|---|---|---|
| PRD-056 | THE SYSTEM SHALL define a `Channel` port with plugin adapters so that (a) notes/messages from external systems (Google Keep, Microsoft OneNote/Sticky Notes, Telegram, WhatsApp, e-mail, other exports/bot inboxes) are **ingested** as Markdown items through CI (`refresh --ingest <adapter>`) as Proposals, per channel either `auto` (lint green → optional AI-correct within the LLM cap → merge with `prov.origin: ai-assisted`) or `hitl` (author review before publish — default); and (b) the same channels can **ask** the memory: a plugin responder answers from the wiki's exports only (Level-1 reader / local MCP), every answer citing item IRIs, LLM optional. Port + spec + reference stub in v1; first adapters v1.x. | Port interfaces + AGSC-01-30..33/09-14a in spec; stub adapter round-trips a fixture message → Proposal (hitl) and → merged item (auto, lint-only); ask stub returns cited answers over the fixture Bundle; no server code in v1. | D51, R25, D14, N9, D39 | **v1** (port+spec+stub, M12) · adapters v1.x |

**Note to PRD-041 / PRD-042 / PRD-044 (V3 re-verification, D52(4); the frozen rows stand).** Human ratification stays the rule and bot commits stay forbidden, with **one** configured exception: a pull request that satisfies every condition of `AGSC-08-26` — opened by the channel's registered forge identity `channels[].author`, changing only `content/**` items of `type ∈ concept|episode|lesson` (never a `procedure`, which becomes a `SKILL.md` pack and `--steer` content — D51-c) whose `prov.operator` equals `channels[].owner` from `agsc.config.json`, carrying `prov.agent` so the N9 lints run at `error` severity, lint-green, merged by the channel owner's **separate** `CHANNEL_MERGE_TOKEN_<name>` in `review.yml`'s `auto-merge` job, the only identity on the ruleset bypass list and one the ingest job cannot reach (D61(2), AGSC-08-26(f), AGSC-01-30). That merge is the owner's **standing** ratification recorded in configuration (`publish: auto`), not an agent approving and not CI committing; it is revocable by editing one config key, it never touches config, workflows, schemas or Gates, and it writes a `Channel-Auto:` trailer so the derived ledger records `mode: auto`. `refresh` still opens issues, never commits; `propose` still performs no network write — the ingest job does, with the owner's token.

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
| NFR-10 | THE SYSTEM SHALL keep the licence stack fixed and embedded: engine Apache-2.0, schema/ontology/IDs CC0, prose ARR + Content Use Terms v1. | REUSE + terms green. The W3C-format personal draft (`w3c/index.html`, D59) is published under **CC-BY 4.0**, set explicitly in `respecConfig` rather than taken by ReSpec's default: it restates CC0 vocabulary material and carries no ARR prose (V5-3 S3-31). | D05, D39, D59, Art. XIII |
| NFR-11 | THE SYSTEM SHALL keep LLM spend ≤$10/month, visible on the NOW page. | Spend line present; the **gating** lanes (`ci`, `review`, and everything reachable from them) contain no model call — grep-asserted, and the build fails if one is reachable (AGSC-08-27). The opt-in, non-gating LLM review lane is permitted and its spend reaches the rollup as an `episode` carrying `usage`. | D14, D44(h), D61(4), Art. XV |
| NFR-12 | THE SYSTEM SHALL contain no Web4/crypto framing, book or "companion" strings, no whole-corpus PDF/EPUB emitter. | Clean-room lint (W1–W12) green. | R13, D08, Art. XIII |
| NFR-13 | THE SYSTEM SHALL run offline and cross-platform (paths, CRLF, NFC, reserved names, exit codes, `NO_COLOR`, XDG). | Portability checklist, three OSes. | R30 |

---

### 3.1 S01 Amendment 9 (owner-directed, 2026-09-18; D94, R76) — NFR-01 superseded: maintained libraries at pinned versions

NFR-01 above is superseded as of 2026-09-18. THE SYSTEM SHALL use maintained, permissively licensed libraries (MIT, BSD, Apache-2.0, ISC) at exact pinned versions for every standard format and protocol it reads or writes (YAML, JSON Schema, JCS, JSON-LD and RDF serialisations, Markdown, `.env`, the Model Context Protocol, XML, command-line arguments), SHALL commit its lockfile and install with `npm ci`, SHALL fail its CI gate on any open `npm audit` advisory, and SHALL hand-write only what the specification pins byte-for-byte and no library produces (canonical orders, the `llms.txt` layout of AGSC-06-13a, the search tokenizer of AGSC-06-23, the conformance vector runner). No library may perform network or clock access at runtime; NFR-02 (a port from the vectors alone) and every determinism requirement are unchanged. Acceptance: `npm ls --prod` lists only exact versions; `npm audit --audit-level=low` exits 0; the reproducibility check of AGSC-09-14 passes. Trace: D94, R76, PLAN ADR-019.

*Amendment 9, note added 2026-09-18 (D97, R81 — V8-66, V8-67, Q54).* Three statements elsewhere in this document pre-date Amendment 9 and D94 and are read through them, the prose above staying as the owner wrote it:

1. **PRD-054's "all Node stdlib, zero deps"** (§2, the independent validator scripts) is superseded on the same terms as NFR-01: the `tools/` validators stay engine-independent — no import from `src/` — but may use the same pinned, audited libraries as the engine (`spec/09-conformance.md` AGSC-09-90 is to be reworded at the next release candidate, recorded as a 1.0.0 item).
2. **NFR-01's own row in §3** ("zero runtime dependencies (`node:` builtins, Node ≥22.14)") is the superseded text; the engine's floor is **Node ≥22.12.0** (D97 Q39 — the version at which `require()` of `commander@15` works; Node 22 is Maintenance LTS to 2027-04-30) and its dependency set is the eleven runtime and two development libraries pinned in `package.json` and recorded in the engine's `src/README.md`.
3. **The §5 success-metric line on provenance coverage** is read as *"every published item carries `prov`"*, which is what AGSC-08-01 requires and what the `prov` lint enforces. It was first written as a percentage figure; that figure was a metric target, not a claim about the system. *Correction, 2026-09-21:* the requirements page of the site embeds this document whole, so the figure did reach a public page; the §5 line and this note now carry the reading itself instead of the figure.

### 3.2 S01 Amendment 10 (2026-09-21; ENG1-01, rc.5) — NFR-06's index figure superseded

NFR-06's `search.json` figure above is superseded as of 2026-09-21; its other three clauses (HTML ≤100 KB/page, build ≤60 s for 500 items, no external page requests) stand as written. WHEN `ci` runs, THE SYSTEM SHALL enforce **≤1 MB per index document** — `/search.json` at or below 500 items, each `/search-<nn>.json` shard above it — in place of "`search.json` ≤500 KB at 500 items". Reason: AGSC-06-23 puts every item's body into the index, so the index costs what the prose costs; the rc.4 pair of figures (≤1 KB per published item **and** ≤500 KB absolute) was measured at 1,226 B/item on a real 120-item Bundle of ordinary prose and was therefore unsatisfiable, with the second clause unreachable below 408 items. Acceptance is unchanged: the budget check fails the build, now explicitly with `AGSC-E904`. Trace: `spec/06-surfaces.md` AGSC-06-21 as amended at rc.5, N8.

## 4. Non-goals (v1)

No servers, databases, queues or Workers — static Pages + CI only (D47, D09). No LLM in any launch lane (D41). No remote MCP, API keys or server-side narrate (D41, superseding R4/R7/N2). No `agent-card.json`; `bench` is the **v1.0.1** gate (≤30 days post-GA, D-note A-59) and is the only verb off the GA path — `run` and `trace` ship opt-in and disabled by default (AGSC-09-94) and `conform` ships unconditionally, all three pulled into v1.0 by D53/D58 (this clause supersedes D41's four-verb exclusion). No functional PyPI wrapper (v1.x; D38-final). No federation beyond the linkset (D41). No book, PDF/EPUB or whole-corpus compilation, ever (D08, W1–W12). No telemetry, cookies, forms or accounts (R52, N4). No vector store, embeddings, decay maths, spreading activation, transclusion or build-time reasoner (D43). Dropped venues: EuroPLoP, ISWC, WWW, SWJ, TWEB without waiver (D45). `memory://` = documented alias only (D33).

---

## 5. Metrics & definition of done

**Metrics (measurable only, 12 months):** visitors/month; npm downloads; `/skills/` fetches (zone analytics); Proposals merged; provenance coverage — every published item carries `prov`; median Proposal→decision <7 days; zero broken references; spend ≤$10/month; JOSS and RFC milestones. MCP hits are local — not a KPI.

**Definition of done (14-FH §5, compressed):** (1) persona walkthroughs (a)–(j) of audit/D §3 exist as end-to-end tests (fixed clock, no network, recorded fixtures) green on three OSes at the tag; (2) `verify` proves byte-identical rebuilds, each spec section has ≥1 vector, `lint --self` clean, N8/N10 green, coverage ≥99%; (3) site live with `/ns/` conneg, well-known linkset, llms.txt, graph exports, skills, `/compose/`, `/now/`, `/legal/`, `_headers`, smoke tests as Episodes; (4) benchmark kit run on real data, results and datasheet on Zenodo, linked from `/about/`; (5) docs complete — module READMEs, quickstarts, PRD/PLAN/SPEC + `spec/`, CHANGELOG, CITATION.cff, adversarial findings answered, UNVERIFIED items dropped; (6) publications started — Zenodo DOI, IEEE Intelligent Systems, I-D -00 before 2026-11-02.

---

## For the owner (3 items, with recommended defaults)

1. **Benchmarks in the launch gate.** DoD (4) requires published benchmarks, but `bench` is a v1.x verb (D41), no M1–M15 milestone covers it, and P-BENCH is post-launch. *Default:* launch DoD = (1)–(3), (5), (6); benchmarks = a v1.0.1 gate within 30 days.
2. **RDF/XML level.** D30 makes RDF/XML a v1 export; audit/D §6 trims it to should-level S1 for the 22-day budget. *Default:* should — ship if M5 finishes early, else v1.1.
3. **DoD wording "docs/00–14 current".** Cancelled by D47-note (e). *Default:* read as "PRD/PLAN/SPEC + `spec/00–09` current" — applied above.

---

**Adversarial review (R4, 2026-09-02): PASSED** — traces verified against D01–D47/R1–R58/N1–N11; scope matches audit/D §6; one trace corrected (PRD-001 R19→R54); R46 (plugin-API definition) and R48 (support policy) deliberately deferred to PLAN.md/README per their own v1 wording.

**S01 GATE: APPROVED by owner 2026-09-02 ("yes for all those, apply defaults") — the 3 items resolve to their defaults: (1) launch DoD = items (1)–(3),(5),(6), benchmarks = v1.0.1 gate ≤30 days post-launch; (2) RDF/XML = should S1; (3) DoD wording as applied. PRD is FROZEN as the S01 baseline; changes now require a Proposal.**

*Generated by: `prov: {origin: ai-generated, agent: claude-opus-5 (draft) + claude-fable-5 (adversarial review), operator: human:andreibesleaga}` · P-S01, 2026-09-02*

**Note to PRD-027 (owner, 2026-09-02):** the `https://` item IRI may always be used instead of `memory://`; both forms denote the same item and every surface accepting one accepts the other (AGSC-05-04a). `memory://` is optional convenience, never required.

**Note to PRD-023/PRD-056 (owner, 2026-09-03, D51-b):** the MCP tool set is **seven** — `search read links compose propose ask remember` — plus resources (items, graph, llms.txt) and one prompt; `remember` writes agent memories as Episode/Lesson/Concept Proposals (auto|hitl per client channel config), `ask` answers with mandatory item-IRI citations. WebMCP mirrors the same seven. Acceptance adds: an MCP client stores an Episode via `remember` (hitl → Proposal file; auto → merged after lint-only) and gets a cited answer via `ask` over the fixture Bundle, offline.

**Note to PRD-051 (2026-09-03, D51-b):** "the same five tools" reads as "the same seven tools" (`search read links compose propose ask remember`).

### 2.9d S01 Amendment 6 (owner Round 10, 2026-09-03, D53) — v1.0 scope = everything except servers
All requirements previously marked `should`, `v1.x`, `v1.1` or "schema-affecting v2" in this PRD are **v1.0** (WebMCP PRD-051 included). Only server/backend components remain v2 (hosted responder/remote MCP Worker, GitHub App, hosted instances, SPARQL endpoint, CRDT sync, Solid/IPFS/ActivityPub adapters, binaries/WASM) — their ports/hooks exist in v1.0. The schema, ontology, protocol and specs are **complete and frozen in v1.0** (forward-compatible; `spec_version 1.0.0`); the ISE draft is written against them. Scope cells reading `v1.x`/`should` above READ AS `v1.0` (this note supersedes them). Calendar re-baselined by the execution plan (D54).

**Note (D58, 2026-09-04; V5-2 S2-06):** PRD-001's thirteen verbs READ AS the **sixteen** of AGSC-09-07 — `init lint build verify ci export import compose propose review refresh skills mcp run trace conform` — `run` and `trace` being opt-in and disabled by default (AGSC-09-94). The "13 names" acceptance cell reads "16 names".

**Note (D53, 2026-09-03; extended V4-A A-27, 2026-09-04):** "nine Links" in frozen rows **and in the product statement** READS AS "fourteen Links (nine core, which drive composition, + five Mode-2: implements, verifies, covers, blocked-by, decided-by)" per AGSC-03-01 as amended.

### 2.9e S01 Amendment 7 (owner-directed, 2026-09-14/15; D67, D70, D70a, D72) — federation, contribution, diagrams, determinism scope
| ID | Requirement (EARS) | Acceptance | Trace | Version |
|---|---|---|---|---|
| PRD-057 | THE SYSTEM SHALL specify federation as a protocol section of the discovery layer: peer declaration, mutual conformance, cross-origin readability of public artefacts, safe peer fetching (HTTPS except loopback; private/loopback/link-local ranges blocked in both address families; redirect hops validated; scheme allow-list; hop limit 3; per-hop fan-out cap 50; per-walk request cap 500; unreachable peer = defined code), untrusted marking of peer-derived prose naming its origin, cross-node citation via `references[].url` emitted as `rdfs:seeAlso` (never a Link), client-side federated query, federated contribution and federated boards; Links MUST NOT cross Bundles at 1.0. | vectors under `tests/vectors/boundary/`; `validate-wellknown --peer` both ways; a 3-hop walk stops at the caps. | D67 A1, D70, D71 | v1 |
| PRD-058 | THE SYSTEM SHALL publish a `contribute` extension relation in the discovery document naming where proposals go, with `agsc-contribute-mode` ∈ `pr\|channel\|form`; every `propose` implementation SHALL read it; anonymous proposals via a mail channel SHALL run in review-before-publish mode under the ingest guards of AGSC-01-30. | vector; a proposal from a second node reaches the target. | D70, SO-45 | v1 |
| PRD-059 | WHERE a `kind: pattern` item carries an image attachment, THE SYSTEM SHALL require `image/svg+xml`; a raster is an error. Imported diagrams SHALL keep their DSL source beside the SVG; SVGs SHALL be un-minified with stable ids and no embedded rasters. | lint error on raster; 153/153 diagrams imported with source + SVG. | D70a (R59; numbered R36 in D70a, renumbered 2026-09-16 — R36 is the site-IA requirement of PRD-011) | v1 |
| PRD-060 | THE SYSTEM SHALL claim cross-implementation byte determinism for the machine artefacts (graph serialisations, index, chunk export, ledger, discovery document, agent-facing text, harness files) proved by expected-byte vectors; HTML pages are deterministic within one implementation and are not part of the cross-implementation vector set. | expected-byte vectors pass in two implementations. | D67 B3, D72 CS-5 | v1 |
| PRD-061 | THE SYSTEM SHALL emit an agent-retrieval chunk export (`chunks.jsonl`): one JCS line per chunk with a stable identifier derived from item and section, a byte-pinned heading boundary with a size bound applied after normalisation, text, provenance, the item's links, licence and content terms, and a digest; embeddings are out of scope. | vector; ids identical across two implementations. | D67 Q67 (V-23) | v1 |
| PRD-062 | THE SYSTEM SHALL serve public artefacts with `ETag` equal to the artefact digest, `Cache-Control: immutable` for digest-named assets, and a `Link` header with `rel="agentic-knowledge"` on the root route. | live header checks in the pre-publication audit. | D72 CS-10 | v1 (site) |
**Note (determinism scope, D72):** PRD-010/NFR-04's "byte-identical" reads as PRD-060 above — the claim is scoped to the machine artefacts across implementations and to every artefact within one implementation. **Note (non-goals, D72):** "No federation beyond the linkset" (§4) reads as "federation lives in the discovery document and in the client (PRD-057); nodes never call nodes; no cross-Bundle Links at 1.0". "No `agent-card.json`" reads as "not emitted by default; MAY be declared as a surface under the plugin contract".

**Correction (D72a, A-11; superseded by D82 Q3 on 2026-09-17):** PRD-062's `Link` header carries the registered relation `describedby` with `type="application/linkset+json"` — no relation is requested from IANA (AGSC-06-25); the earlier extension-URI reading is withdrawn; PRD-057's cross-node citation requires a pinned IRI normalisation for `references[].url` objects (A-18); PRD-060's cross-implementation set includes a `search.json` vector with an astral-plane token sorted by UTF-16 code units (A-06).


**Correction (pre-DS-4 audit, D75, 2026-09-16):** (a) §4's "No remote MCP" reads, like the two D72 re-readings above, as *not served at 1.0; MAY be declared as a `responder` surface* (AGSC-11-21) — the declaration is a hook, its bytes are pinned by the external specification, and a static reader never depends on it. (b) PRD-057's `references[].url` denotes `sources[].resource` — the item model has one citation array (AGSC-02-10), and AGSC-11-12 now says so; the peer base is derived from the declared well-known URL, never fetched. (c) PRD-059's "un-minified with stable ids" is an obligation of the M3 importer and the DSL→SVG compiler, not a conformance rule of the format; AGSC-02-98 pins the safety allow-list, and `lint-0024` proves it. (d) PRD-060's astral-plane evidence (D72a A-06) is `jcs-0003` at the JCS level; the full `search.json` case is `build-0003`, authored 2026-09-17. (e) PRD-062's `ETag` is the quoted digest (RFC 9110), and `Cache-Control: immutable` is reserved until a digest-named route exists (AGSC-11-05).

### 2.9f S01 Amendment 8 (owner-directed, 2026-09-17; D87, R66, R67; extended 2026-09-18 by D88, R69–R71) — the agent lane and Mode 5, the live board
| ID | Requirement (EARS) | Acceptance | Trace | Version |
|---|---|---|---|---|
| PRD-063 | WHERE an `agents[]` entry is enabled, THE SYSTEM SHALL let a model-driven or programmatic agent create, edit, update, review, summarize, translate, refresh, plan, claim and work on items **non-deterministically**, always as Proposals through the entry's channel, never as a write; with `publish: auto` on that channel the node is self-driving under every guard of AGSC-08-26, the budget and the type set (never a procedure, gate, cluster, configuration, workflow or schema); every run is an Episode with `usage`; `lint`, `build`, `verify` and `ci` stay model-free. | `bundle-0003/0004`, `prov-0001`; a run with the budget reached is `AGSC-E510`; a Proposal outside the declared set is `AGSC-E509`; the grep-asserted model-free lanes of NFR-11 still pass. | R66, D87, AGSC-01-36, AGSC-08-28…30 | v1.0 (rc.4) |
| PRD-064 | WHERE a Bundle holds boards, declares `contribute[]` and a participation surface, and MAY run agent lanes with `plan`/`claim`/`work`, THE SYSTEM SHALL work as a **live board** (named *Blackboard* until D88, *Kanban* until D91) — the shared working memory and pull-based task board of people and agents, local or remote — in which a task is claimed and progressed by Proposals that change `task_state`, an agent lane holds at most `max_claims` tasks at once (`AGSC-E511`), the board export carries derived `claimed_by` and `done`, the fast lane (agent lanes, auto merges, refresh, ledger, exports, peer check) never reaches the slow lane (gates, human review, decisions, releases, procedures, configuration), and remote participants propose through contribute targets, channels or a declared responder — nodes never call nodes. | `boards/` vector with `done` and `claimed_by`; a self-driving fixture runs to `done: true` offline with a stub agent; a slow-lane path in an agent Proposal is `AGSC-E509`. | R67, D87, AGSC-10-16…18, ADR-014 | v1.0 (rc.4) |
| PRD-065 | THE SYSTEM SHALL be configurable from the environment and from a `.env` file in the Bundle root — every scalar configuration key under an `AGSC_*` name, named `agents[]`/`channels[]` entries as `AGSC_AGENT_<NAME>_<KEY>`/`AGSC_CHANNEL_<NAME>_<KEY>`, model credentials environment-only — with precedence flags > process environment > `.env` > project configuration > user configuration; AND SHALL cap model spend of every kind at a node-wide `budget.usd_month`, default 10 USD, the enabled agents' budgets summing to no more than it, every model-calling path stopping for the month at the cap; AND SHALL bound an agent lane by `max_new_items` per Proposal (default 20) and `max_claims` tasks in progress (default 1); AND SHALL offer `refresh --agent <name> --dry-run`. | `cli-0006` (precedence, names printed, values never); `bundle-0005` (`AGSC-E212`); `prov-0002`/`prov-0003` (`AGSC-E511`); a tracked `.env` is `AGSC-E403`; `init` writes `.env` to `.gitignore` and `.env.example`. | R69, R70, R71, D88, AGSC-01-37, AGSC-01-38, AGSC-08-25, AGSC-08-28, AGSC-10-17, NFR-11 | v1.0 (rc.4) |
*Note (D87):* Mode 5 adds no type, key or ontology term; it composes Modes 1–4 with the agent lane and the boards of AGSC-10-13 and is the "System 1 / System 2" reading of a node — a fast lane of automatic work and a slow lane of human decisions — documented in `docs/plain/modes.md`. PRD-063/064 are v1.0 requirements of the rc.4 draft; the engine implements them in DS-8/DS-9 (M6 boards, M10 tool server, M12 channels, M14 refresh).

*Note (D88, 2026-09-18):* the owner's three directives of session 26 — everything configurable from `.env` with a 10 USD cap over every model use (R69, R70), the whole declared scope in the first standard even where a feature ships at 1.1 or 2.0 (AGSC-00-20, R71), and the rename of Mode 5 from *Blackboard* to *Kanban* (D88) and then to **live board** (D91 and D96, the owner's choice; the blackboard pattern stays the cited lineage and Kanban the cited operating discipline *(wording corrected 2026-09-18 under D96: the note as first written named the mode where it meant the discipline; `docs/RELATED-WORK.md` cites Kanban as the discipline)*) — are PRD-065, AGSC-00-20 and the renamed PRD-064. The rc.4 final items of PUB-3 (Q13 budget sum, Q17 planner cap, Q22 dry run) are in PRD-065 as well.
