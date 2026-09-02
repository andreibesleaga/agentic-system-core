# AGSC-10 — Implementation profiles (conformance Levels 0–3)

Purpose: let any language, framework or existing software implement a compatible Agentic Knowledge Web node from these files alone. [PRD-055 ← D50, D47]

## 10.1 Levels
- **AGSC-10-01** A conformance claim MUST name exactly one Level and MUST be backed by a green run of the shipped validators (`tools/`, AGSC-09-90) and the Level's vector set (AGSC-09-04 areas listed below). [PRD-055, PRD-054]
- **AGSC-10-02 Level 0 — Publisher.** Static files only, producible by any CMS/wiki export: `content/<type-plural>/<slug>.md` items with the required frontmatter (AGSC-02), `content/index.md` (AGSC-01-04), `/.well-known/agentic-knowledge` (AGSC-06-08..12), `/graph.jsonld` (AGSC-05, JSON-LD view only), `/llms.txt` (AGSC-06-17). Vector areas: `frontmatter`, `slug`, `bundle`, `discovery`. No engine, no build tool required. [PRD-055]
- **AGSC-10-03 Level 1 — Reader.** Level 0 + parsing/validation of any conforming Bundle: frontmatter contract, slug grammar, nine Links with computed inverses, orphan/cycle detection, error codes. Vector areas: + `links`, `lint`, `jcs`. [PRD-055, PRD-002, PRD-003]
- **AGSC-10-04 Level 2 — Writer/Exporter.** Level 1 + deterministic emission of all surfaces (AGSC-04 canonicalization, AGSC-05 four RDF views, AGSC-06 route set incl. search/NOW/ledger) and export/import (AGSC-01-22..29: Markdown/OKF/JSON-LD/JSONL/steer/skills). Vector areas: + `graph`, `build`, `adopt`, `ledger`. [PRD-055, PRD-022..026]
- **AGSC-10-05 Level 3 — Full engine.** Level 2 + composition (AGSC-07), governance (AGSC-08), CLI contract and MCP tools (AGSC-09-13). Vector areas: all. The reference implementation (`agentic-system-core`) claims Level 3. [PRD-055, PRD-001]
- **AGSC-10-06** A higher Level MUST include every rule of the lower Levels; a claim MUST NOT cherry-pick rules within a Level. [PRD-055]

## 10.2 Foreign knowledge bases
- **AGSC-10-07** A platform exposing its own knowledge base as a node MAY keep its native storage; it MUST present the Level-0 files at the documented URLs (generated at publish time is sufficient) and MUST map its native identifiers to slugs (AGSC-01-10) and its native links to the nine keys (AGSC-03-19 import synonyms) — unmapped native relations become `related`. [PRD-055, D39]
- **AGSC-10-08** `memory://<bundle-id>/<slug>` is the platform-neutral alias of an item's HTTPS IRI (AGSC-05-01); a foreign node MUST publish its `bundle-id` in `content/index.md` and MAY resolve the alias internally to its native record. **The `https://` IRI can always be used instead of the `memory://` form** (AGSC-05-04a); a node that never emits or accepts `memory://` still conforms. [PRD-027, D33]
- **AGSC-10-09** Exporting from a foreign node to a package (Markdown/OKF bundle, Skill packs, JSON-LD) MUST follow AGSC-01-26..29 so that the reference engine (or any Level-1 reader) imports it losslessly; the Content Use Terms embedding rule (R39) applies only to prose licensed under those terms — foreign nodes declare their own `license` per item. [PRD-055, D39]

## 10.3 Guide and mapping
- **AGSC-10-10** The distribution MUST include `docs/IMPLEMENTERS-GUIDE.md`: a ≤10-step path to a Level-0 node in any stack, the per-Level rule/vector checklist, and a platform mapping table (at minimum: MediaWiki, WordPress, Docusaurus/MkDocs/Hugo, Notion/Confluence export, Obsidian/Logseq, generic Django/Laravel/Rails app) mapping their constructs to items, frontmatter keys, Links and Clusters. [PRD-055, D32(6)]
- **AGSC-10-11** The guide MUST be verifiable: every step names the validator that proves it, and the M14 dogfood MUST include one Level-0 node produced without the reference engine. [PRD-055, PRD-054]

Trace: PRD-055 ← D50; conformance classes of `docs/SPEC.md` §3 map as reader = Level 1, writer = Level 2, full engine = Level 3 (Level 0 added).
