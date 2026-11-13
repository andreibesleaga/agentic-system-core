# 07 — Composition, in plain language

**Pick items, get a harness.** You select items (by slug, or by re-running a saved architecture). The combiner runs five steps in a fixed order: pull in everything `requires` reaches (breadth-first), hide what is `superseded`, refuse any surviving `excludes` pair, warn on `contradicts` and missing `uses`, then wire ports — matching what one item `produces` to what another `consumes`.

**The verdict.** Valid or not, with the hidden items, the conflicts and the warnings listed. Step 5 never changes the verdict; it only adds wiring.

**The Harness.** A valid composition yields exactly seven kinds of file — a record of the selection in canonical JSON (`harness.jsonld`, not an RDF JSON-LD document), an `AGENTS.md` context file, a Structurizr model, a Mermaid diagram, an arc42 skeleton, one decision record per selected Concept and one `SKILL.md` per selected Procedure — byte-identical whether produced by the CLI or in the browser, and named after the selection. A runtime emitter, which is a plugin, may render those seven files for one runtime without changing them; renderings for named runtimes are planned for version 1.1. (AGSC-07-12, AGSC-07-18.)

**Skill packs.** Procedures export to `SKILL.md` files that can be installed into agent tool trees and imported back.

**From 1.1, every `SKILL.md` is checked against the Agent Skills format before it is written.** The name is at most 64 characters and equals its folder, the description at most 1,024 characters, and only the six fields of the format may appear. A published pack that fails is not written; a Harness skill file that is too long is still written, with a warning. The files the engine writes already pass, so no byte changes (AGSC-07-22).

**From 1.1, a brief beside the Harness.** With `--brief`, a composition also writes four files next to the Harness, never in it: why each item is there, how the items depend on each other and in what order to adopt them, what is missing, and a checklist, with the items' text for an agent marked as data. A saved architecture also gets its C4 levels, one decision record per decision and a build plan; a node that declares bounded contexts gets a context map. The seven Harness files keep their bytes.

Rules: `spec/07-composition.md`, `AGSC-07-01` … `AGSC-07-30`.
