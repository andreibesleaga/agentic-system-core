# 03 — Links, in plain language

**Fourteen names, no more.** Nine core keys — `related`, `broader`, `narrower`, `uses`, `requires`, `excludes`, `derived-from`, `contradicts`, `supersedes` — and five engineering keys — `implements`, `verifies`, `covers`, `blocked-by`, `decided-by`. A link value is always a slug in the same Bundle; a URL in a link is an error. Citing another node is done through `sources`, never through a link.

**Inverses are computed.** You write `uses`; the graph gets `usedBy` for free. You never author an inverse.

**Integrity.** Cycles in `requires` and `broader` are errors; orphans are reported; an unresolved target is an error.

**Inline links.** A Markdown link between items becomes an untyped *mentions* edge; a wikilink is the same thing.

**What the combiner reads.** Only the nine core keys carry composition meaning: `requires` pulls items in, `supersedes` hides, `excludes` forbids, `contradicts` warns. The five engineering keys are navigation and provenance only.

Rules: `spec/03-links.md`, `AGSC-03-01` … `AGSC-03-22`.
