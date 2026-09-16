# 07 — Composition, in plain language

**Pick items, get a harness.** You select items (by slug, or by re-running a saved architecture). The combiner runs five steps in a fixed order: pull in everything `requires` reaches (breadth-first), hide what is `superseded`, refuse any surviving `excludes` pair, warn on `contradicts` and missing `uses`, then wire ports — matching what one item `produces` to what another `consumes`.

**The verdict.** Valid or not, with the hidden items, the conflicts and the warnings listed. Step 5 never changes the verdict; it only adds wiring.

**The Harness.** A valid composition yields exactly seven files — a JSON-LD record, a Structurizr model, a Mermaid diagram, an arc42 skeleton, decision records, a gate checklist and a skills manifest — byte-identical whether produced by the CLI or in the browser, and keyed by the ordered selection. Runtime emitters (GABBE, kaiban-distributed, CrewAI, LangGraph, ADK, n8n) are renderings of those seven files.

**Skill packs.** Procedures export to `SKILL.md` files that can be installed into agent tool trees and imported back.

Rules: `spec/07-composition.md`, `AGSC-07-01` … `AGSC-07-24`.
