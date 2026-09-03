# Capabilities by version — v1.0 / v1.1 / v2 (draft for owner re-choice, 2026-09-03)

Purpose (owner request): show every capability, where it currently sits, what it depends on, its cost, and whether v1.0's architecture already carries the hook for it — so the owner can pull the best features into v1.0 and leave only the genuinely complex or unprofitable ones for later. **Principle already satisfied: every later capability has its port/profile/config hook defined in v1.0** (PLAN §5.2 ports, spec/10 Levels, `agsc.config.json` `plugins[]`/`channels[]`, Channel port, Reviewer port, Host/Forge ports), so nothing later requires re-architecture. Effort = person-days at 6 h; v1.0 budget today = 28.5 + 0.7 (D51) ≈ **29.2 pd into 28 working days + Oct 6–10 buffer**; each pull-in shifts launch by its effort (≈1 day per pd).

## A. v1.0 — MUST (already in TASKS scope)
| # | Capability | Depends on | pd |
|---|---|---|---|
| A1 | Item model, nine Links, lint/build/verify (determinism), derived ledger | — | 6 |
| A2 | Drop-in adoption (P0: 3 commands → live wiki) | A1 | 0.4 |
| A3 | Old-site import: 153 Concepts, 110 Clusters, diagrams (10-card owner gate) | A1 | 2 |
| A4 | Static site: all routes (R36+), search, NOW, lessons, legal/terms, headers, sitemap, 404 | A1 | 5 |
| A5 | Graph: JSON-LD, Turtle, N-Quads, **RDF/XML (D49)**, SKOS, well-known linkset + integrity | A1 | 3 |
| A6 | Export/import: Markdown, OKF, JSON-LD, JSONL; `--steer` AGENTS.md/CLAUDE.md | A1 | 1.5 |
| A7 | Skills: packs per Cluster + `skills install` (`.claude`/`.agents`/`.github`) + import | A1 | 1 |
| A8 | MCP local server: 7 tools (`search read links compose propose ask remember`), resources, prompt | A1, A5 | 1.8 |
| A9 | Combiner (closure algebra) + 7-file Harness + browser `/compose/` (per-file download) | A5 | 3 |
| A10 | Governance: `propose`/`review` (lint-only), DCO-Plus, Gate→CI check, `auto` channel merge (D51-c) | A1 | 1.5 |
| A11 | Channel port + stub adapter (ingest → Proposal; ask responder module) | A8, A10 | 0.4 |
| A12 | Weekly `refresh` cron (staleness, links, NOW, ledger verify) | A4 | 0.5 |
| A13 | Spec/00–10 + schemas + ontology + vectors + `tools/` validators + Implementer's Guide + Level-0 dogfood | — | 3 |
| A14 | CI/Pages deploy, w3id conneg, release (npm trusted publishing), 3-OS matrix on tags | A4 | 2 |
| A15 | E2E persona features (11) wired as tests; ≥99% coverage; docs/quickstarts | all | 3 |

## B. v1.0 — SHOULD (ship if on schedule; owner may promote to MUST)
| # | Capability | Depends on | pd | Note |
|---|---|---|---|---|
| B1 | WebMCP page tools (same 7) — week-4 lever (D49) | A8 | 1 | showcase D34 |
| B2 | `/specs/` rendered from `spec/` + RFC -00 text page | A4, A13 | 1 | |
| B3 | Private Mode-2 dogfood instance (this project's own specs as a Bundle) | A6 | 1 | proves Mode 2 |
| B4 | arc42/MADR Harness emitters (files 5–6 richer) | A9 | 0.7 | |
| B5 | `/changelog/` from merged Proposals | A4 | 0.3 | |

## C. v1.1 — currently deferred (each has its v1.0 hook)
| # | Capability | Hook in v1.0 | Depends on | pd | Why deferred | Pull into v1.0? |
|---|---|---|---|---|---|---|
| C1 | LLM review lane (OpenRouter, $10 cap, counter, labels) | Reviewer port, `usage` fields | A10 | 1.5 | key + cap plumbing | cheap — recommend YES if budget +1.5 d |
| C2 | Benchmark kit `agsc bench` + Zenodo data (v1.0.1 gate ≤30 d) | vectors, E1 corpus | A5 | 3 | needs live content first | keep post-launch |
| C3 | `conform` runner + public `/conformance/` page | vectors, Levels | A13 | 2 | nice-to-have for ports | maybe (RFC credibility) |
| C4 | Skill trees: Cursor, Copilot, Gemini, Codex, GABBE | skills module | A7 | 1 | templates only | cheap — recommend YES |
| C5 | Harness emitters: GABBE bundle, kaiban-distributed, CrewAI JSONC, LangGraph, ADK/MS-AF | emit-* modules | A9 | 3 | many targets | pick 1–2 (GABBE + kaiban) = 1.2 |
| C6 | Memory adapters: Basic Memory, Claude auto-memory, GABBE memory, Obsidian specials, Mem0/Letta JSONL | Interchange port | A6 | 2 | ≤1 file each | recommend YES for Basic Memory + Claude memory + GABBE (1 d) |
| C7 | `steer` for Kiro/Windsurf/Cline/Aider/Copilot | steer templates | A6 | 1 | templates | cheap — maybe |
| C8 | `run` (fenced `{run}`/`{expect}` blocks) + `trace` (agent run → Episode) | ProcessRunner port, Episode schema | A1 | 2 | OTel churn | keep v1.1 |
| C9 | Channel adapters: Telegram (ingest+ask), Google Keep, OneNote, WhatsApp export, mail | Channel port + stub | A11 | 0.5–1 each (Telegram 1) | live bot runtimes | Telegram = 1 d, recommend YES; others v1.1 |
| C10 | Distribution: PyPI functional wrapper, GHCR image, Homebrew, Nix, composite Action, pre-commit | release lane | A14 | 1.5 total | zero known consumers | Action + pre-commit (0.5) maybe |
| C11 | GitLab/Forgejo/Woodpecker shims | Forge port | A14 | 0.5 | on demand | maybe |
| C12 | i18n suffix files `<slug>.<lang>.md` | schema `lang` | A1 | 1 | no non-EN content | keep v1.1 |
| C13 | `--json` on every verb (v1 = lint/ci/validators) | CLI envelope | A1 | 0.5 | polish | cheap — recommend YES |
| C14 | Gate compilation to hooks/CODEOWNERS/rulesets (beyond CI check) | Gate schema | A10 | 1 | tool-specific | v1.1 |

## D. v2 — genuinely complex or unprofitable now (hooks exist; no re-architecture needed)
| # | Capability | Hook | Why v2 |
|---|---|---|---|
| D1 | Hosted responder / remote MCP Worker (Cloudflare) | ToolTransport plugin, D47 | needs a server, keys, abuse handling |
| D2 | GitHub App for browser proposals | Forge plugin | server-side; PAT path suffices |
| D3 | Federation beyond the linkset (mutual-conformance test, directory) | well-known integrity, spec/10 | needs ≥2 real nodes |
| D4 | Solid pods / IPFS snapshots / ActivityPub | PersonalStore/Federation ports | niche |
| D5 | `memory://` resolver | alias documented | https:// always works (AGSC-05-04a) |
| D6 | Typed Mode-2 links (implements/verifies/…) | schema minor bump | needs Mode-2 usage data |
| D7 | CRDT/Yjs live sync | ContentStore plugin | git suffices |
| D8 | Single binaries (Bun), WASM component | pure core | no consumer yet |
| D9 | Hosted multi-tenant instances | — | business decision |
| D10 | SPARQL endpoint | graph exports | server |

## E. Dependencies (critical chains)
A1 → {A2, A3, A6, A7, A10} → A4/A5 → {A8, A9, A11, A12} → A14 → A15. Every C/D item hangs off an A item's port; none blocks another A item. Pull-ins that are pure templates (C4, C7, C13, part of C6/C5) can run in parallel with A15 by R2 agents.

## F. Round 10 — owner re-choice (answer per item; defaults in bold)
1. Promote B1–B5 to MUST? (**B2, B3, B5 yes; B1 WebMCP lever; B4 yes**) → +3 pd.
2. Pull C1 LLM review into v1.0? (**yes**, +1.5 pd)
3. Pull C4 skill trees (**yes**, +1), C6 memory adapters subset (**yes**, +1), C13 `--json` everywhere (**yes**, +0.5)?
4. Pull C5 harness emitters GABBE + kaiban (**yes**, +1.2)?
5. Pull C9 Telegram ingest+ask (**yes**, +1) — others v1.1?
6. C3 conform runner + page (**v1.1**), C7 other steer targets (**v1.1**), C8 run/trace (**v1.1**), C10/C11 distribution & shims (**Action+pre-commit v1.0 +0.5; rest v1.1**), C12 i18n (**v1.1**), C14 (**v1.1**)?
7. Resulting "v1.0-max" = 29.2 + 3 + 1.5 + 2.5 + 1.2 + 1 + 0.5 ≈ **38.9 pd** → launch ≈ **Oct 24** (vs Oct 10) with parallel R2 agents possibly recovering ~4 days → **Oct 17–20**. Accept the date shift, or keep Oct 10 with the current MUST set and ship pull-ins as v1.0.x within 30 days (**recommended: Oct 10 core + v1.0.x weekly increments**)?
8. Anything in D you want re-considered for v1.x?


**Numbers note (2026-09-03, from TASKS-JUDGE.md):** the pd figures above are *supervised* person-days (owner + Claude, incl. gates, reviews, CI wall-clock); pure agent-minutes for the 320 must tasks total 11.19 pd — so pull-ins cost roughly 40 % of the listed pd in agent time, but the calendar impact stays as listed because reviews and gates scale with them.
