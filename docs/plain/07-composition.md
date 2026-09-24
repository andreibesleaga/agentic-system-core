# 07 — Composition, in plain language

**Pick items, get a harness.** You select items (by slug, or by re-running a saved architecture). The combiner runs five steps in a fixed order: pull in everything `requires` reaches (breadth-first), hide what is `superseded`, refuse any surviving `excludes` pair, warn on `contradicts` and missing `uses`, then wire ports — matching what one item `produces` to what another `consumes`.

**The verdict.** Valid or not, with the hidden items, the conflicts and the warnings listed. Step 5 never changes the verdict; it only adds wiring.

**The Harness.** A valid composition yields exactly seven kinds of file — a JSON-LD record of the selection, an `AGENTS.md` context file, a Structurizr model, a Mermaid diagram, an arc42 skeleton, one decision record per selected Concept and one `SKILL.md` per selected Procedure — byte-identical whether produced by the CLI or in the browser, and named after the selection. A runtime emitter, which is a plugin, may render those seven files for one runtime without changing them; renderings for named runtimes are planned for version 1.1. *(Corrected 2026-09-24 against AGSC-07-12 and AGSC-07-18.)*

**Skill packs.** Procedures export to `SKILL.md` files that can be installed into agent tool trees and imported back.

Rules: `spec/07-composition.md`, `AGSC-07-01` … `AGSC-07-24`.
