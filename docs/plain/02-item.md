# 02 — Item, in plain language

**One file.** An item is a Markdown file that starts with a YAML block between `---` lines. The YAML is a small, safe subset: no anchors, no aliases, no custom tags.

**Common keys.** `type`, `title`, `description`, `tags`, `clusters`, `status`, `date`, `modified`, `sources`, `verified`, `prov` (who or what made it), and the typed link keys. Lengths are counted in Unicode code points.

**Six types.** *Concept* (with a `kind`: pattern, taxonomy, explainer, principle, decision, spec, task, term, or a saved *architecture*), *Episode* (something that happened), *Procedure* (steps a reader can run; exports as a skill), *Lesson* (distilled from episodes, with a severity), *Cluster* (a navigational grouping), *Gate* (checks a change must pass).

**Status.** draft, stable, deprecated and *retired* — retired items keep their page, their address and their place in the graph, but leave the search index, the agent text files, the chunks, the skill packs and every composition.

**Body.** CommonMark. Fenced code stays code. Headings become anchors and, for the chunk export, cut points.

**Ports, attachments and task states.** Items may declare *ports* (`produces`/`consumes` type names) that the combiner wires; a concept of kind *architecture* stores a selection the combiner can re-run; items may carry *attachments* (on a pattern, images must be SVG under a safety allow-list); a task may carry an Agent2Agent `task_state`.

Rules: `spec/02-item.md`, `AGSC-02-01` … `AGSC-02-99`.
