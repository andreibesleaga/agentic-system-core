# AGSC-07 — Composition: the closure algebra and the Harness

## 7.1 Inputs

- **AGSC-07-01** A composition takes an ordered selection of item slugs and the resolved graph, and produces a verdict plus a Harness file map. It MUST NOT require a network, a key or a server. [PRD-038 ← R12, D11]
- **AGSC-07-02** The algorithm MUST be identical in every host. A composition computed in a browser MUST produce bytes identical to the same composition computed by the CLI. [PRD-038, PLAN §6(c)]
- **AGSC-07-03** A slug not present in the graph is `AGSC-E802`. A selection MUST be de-duplicated preserving first-occurrence order. [PRD-036]

## 7.2 The algebra, in this order

- **AGSC-07-04** **Step 1 — closure.** Compute the transitive closure of `requires` over the selection. Each added item MUST record an explanation path — the chain of `(source, key, target)` steps that pulled it in. The traversal MUST be **breadth-first** from the de-duplicated selection, expanding each frontier in code-point slug order and each item's `requires` targets in code-point order; the path recorded for an item is the first one discovered by that traversal (a shortest path, ties broken by the lexicographically least slug sequence). Depth-first traversal is non-conforming: it records different `path[]` chains for the same input, and `path[]` is byte-compared (PRD-038). [PRD-036 ← R6, D48(2)]
- **AGSC-07-05** **Step 2 — hiding.** Remove from the result any item that a member of the result `supersedes`, whether that item was selected directly or added by Step 1 (AGSC-03-17). A superseded item MUST NOT be re-added by a later step, appears in `hidden[]`, and MUST NOT appear in `added[]` even when Step 1 had added it. [PRD-036, AGSC-03-17, D48(2)]
- **AGSC-07-05a** **Step 2, hard-dependency guard.** When an item removed by Step 2 is the `requires` target of an item that survives Step 2, the composition is **invalid** with `AGSC-E802` — message form "required item superseded — select `<superseding>`" — naming the requiring item, the hidden target and the superseding item. Closure MUST NOT be re-run and the superseding item MUST NOT be substituted: the selection is the author's, and a hard dependency is never silently dropped. [PRD-036 ← D48(2)]
- **AGSC-07-06** **Step 3 — mutex.** Evaluate `excludes` over the surviving set. One or more surviving `excludes` pairs make the composition **invalid**; the verdict MUST name every violating pair and the explanation path of each side (`AGSC-E801`). [PRD-036]
- **AGSC-07-07** **Step 4 — warnings.** Emit a warning for every `contradicts` pair inside the result, and for every `uses` target that is not in the result. Warnings MUST NOT invalidate a composition. [PRD-036]
- **AGSC-07-08** (amended at rc.3) Steps MUST run exactly once each, in the order 1→5 — closure, then `supersedes` hiding (with the AGSC-07-05a guard), then `excludes` mutex, then warnings, then port wiring (AGSC-07-23). Step 5 is verdict-neutral: it reads the surviving set and writes only `wiring[]` and warnings, so the verdict members of AGSC-07-09 are byte-identical whether or not any item carries a port. Closure MUST NOT be re-run after hiding, and mutex MUST NOT be evaluated before hiding: evaluating `excludes` over a set that still contains superseded items reverses verdicts (an item hidden at Step 2 can be one half of an `excludes` pair). [PRD-036, D48(2)]
- **AGSC-07-09** The verdict object MUST be JCS-canonical with members `added[]`, `conflicts[]`, `warnings[]`, `hidden[]`, `selection[]` and `valid` (boolean). `selection[]` is the **surviving post-Step-2 set** — the closed selection minus the hidden items — in code-point slug order; `hidden[]` is code-point ordered; `added[]` is ordered by `slug`; `conflicts[]` sort element-wise over the internally sorted `pair`, then by `code`; `warnings[]` sort element-wise over `(source, target)`, then by `code` and `key`; every comparison is code-point. Each `added` entry carries `slug` and `path[]`; each `conflicts[]` entry carries `code`, `key` and `pair` (plus `superseding` for `AGSC-E802`); each `warnings[]` entry carries `code`, `key`, `source` and `target`. Input order therefore never reaches the verdict, which is what makes AGSC-07-11 hold. [AGSC-04-04, D48(2)]
- **AGSC-07-10** `related`, `broader`, `narrower`, `derived-from` and `mentions` MUST NOT affect any step. [AGSC-03-18, D43(4)]
- **AGSC-07-11** The algebra MUST be deterministic and order-independent in outcome: two selections with the same members MUST yield the same verdict, and iteration MUST follow code-point slug order inside each step. [AGSC-04-12]

## 7.3 The Harness

- **AGSC-07-12** A valid composition MUST emit exactly these seven files, and no others, under `dist/harness/<name>/` or as an equivalent in-memory map for download:

| File | Content |
|---|---|
| `harness.jsonld` | selection, closure with explanation paths, links, verdict — JCS-canonical |
| `AGENTS.md` | item summaries and constraints, as context only |
| `workspace.dsl` | Structurizr: one container per selected Concept, relationships from Links |
| `diagram.mmd` | Mermaid flowchart of the same relationships, emitted as text |
| `arc42.md` | arc42 skeleton seeded from the selection |
| `decisions/0001-<slug>.md` | one MADR record per selected Concept, numbered in selection order |
| `skills/<slug>/SKILL.md` | one skill file per selected Procedure |

[PRD-037 ← D35, audit/D §3(e), G11]

`decisions/NNNN-<slug>.md` is numbered in the de-duplicated first-occurrence input order of AGSC-07-03 restricted to the survivors — the one place where input order is still meaningful; the verdict itself is order-free (AGSC-07-09). `harness.jsonld` is a JSON document in JCS form, **not** an RDF export: AGSC-05-08 and `AGSC-E605` do not apply to its nested `selection`/`closure`/`links`/`verdict` objects, which carry no `@id`. [D48(6)]

- **AGSC-07-13** Harness output MUST be byte-identical to the equivalent CLI invocation and MUST be reproducible from the graph plus the selection plus `SOURCE_DATE_EPOCH`. [PRD-037, PRD-038]
- **AGSC-07-14** `AGENTS.md` and every `SKILL.md` MUST carry the fixed provenance header and MUST fence quoted item prose as ```` ```text agsc-content ````; they MUST embed the Content Use Terms identifier. [NFR-07, PRD-019 ← ADR-001, ADR-007]
- **AGSC-07-15** A Harness MUST NOT contain scripts, executables, symlinks, an `allowed-tools` key, or any file outside the seven above. [PRD-035 ← N9, Art. XIV]
- **AGSC-07-16** Harness structure is CC0 to the user; the prose it quotes travels under the Content Use Terms. Both facts MUST be stated in the emitted files. [D39, NFR-10]
- **AGSC-07-17** An invalid composition MUST NOT emit a Harness. The verdict alone is returned, with exit code 1 from the CLI. [PRD-036, AGSC-09-06]
- **AGSC-07-18** Runtime emitters (GABBE, kaiban-distributed, CrewAI, LangGraph, ADK/MS-AF, n8n) are **target renderings of the seven files of AGSC-07-12**, selected by `compose --emit <target>` and written outside `dist/harness/<name>/`; adding one MUST NOT change the seven files, MUST NOT add a file inside the Harness directory, and MUST be a single template plus a registry row. [D35, D53, audit/D §3(e), V4-A A-78]

## 7.4 Skill packs

The packs of this section are the **published** packs of the route set (AGSC-06-01), one per Cluster. They are a **different artefact** from the per-Procedure `skills/<slug>/SKILL.md` files inside a Harness (AGSC-07-12), which are never published and never installed; both are correct, both are needed, and no rule of §7.3 and §7.4 refers to the other's artefact (V5-3 S3-19).

- **AGSC-07-19** One skill pack MUST be emitted per Cluster, plus `/skills/index.json`. Each pack's directory name MUST equal its `name` field and MUST satisfy the slug grammar including the no-`--` rule; `description` MUST be ≤1024 characters. [PRD-032 ← D33, audit/G §1 Agent Skills row]
- **AGSC-07-20** Each pack MUST declare its licence and MUST be accompanied by a SHA-256 lockfile over its files; an install MUST verify the lockfile and MUST show a diff on update. [PRD-035 ← N9]
- **AGSC-07-21** Install targets are `.claude/skills`, `.agents/skills` and `.github/skills`; installation MUST be idempotent. [PRD-033 ← G12]
- **AGSC-07-22** `skills import` MUST map a `SKILL.md` to a `procedure` item, round-tripping without loss of the declared fields. [PRD-034]


## 7.5 Step 5 — ports and wiring; saved architectures (added at rc.3, 2026-09-16 — D67 Q56, D71 Q71)

- **AGSC-07-23** **Step 5 — wiring.** After Step 4, over the surviving set only: for every survivor and every name in its `consumes[]`, the producers are the survivors whose `produces[]` contains that name, in code-point slug order. Emit `wiring[]` into `harness.jsonld` as objects `{consumer, port, producers}` sorted by `(consumer, port)`; emit one Structurizr relationship per producer–consumer pair, labelled `produces <name>`, into `workspace.dsl`, and the equivalent edge into `diagram.mmd`, both ordered by `(producer, consumer, port)` with every comparison by code point. A name with no producer among the survivors is a warning appended to `warnings[]` with code `AGSC-E804`; it MUST NOT invalidate the composition. Verdict-neutrality and ordering are stated once, in AGSC-07-08. [D67 Q56, PRD-057, D72 §1]
- **AGSC-07-24** `compose --from <slug>` MUST take the selection from the `yaml agsc-selection` block of a `kind: architecture` item (AGSC-02-97) and run Steps 1–5 exactly as for an explicit selection; the item page MUST expose the same composition through `/compose/?from=<slug>` and the page tools. When the item carries `verdict_digest` and the recomputed JCS verdict's SHA-256 differs, lint reports `AGSC-E805` (warning) and the page shows the stored and current verdicts. The seven-file rule (AGSC-07-12/15) is unchanged: wiring lives inside `harness.jsonld`, `workspace.dsl` and `diagram.mmd`. [D71 Q71]
