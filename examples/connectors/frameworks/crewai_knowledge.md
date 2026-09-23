# CrewAI — ILLUSTRATIVE (not executed by the test suite)

CrewAI keeps "a single unified Memory class" that scores recall over "semantic
similarity, recency, and importance" and **consolidates** similar memories at a
threshold of 0.85 (docs.crewai.com/en/concepts/memory, read 2026-09-23). Two
consequences for a node's knowledge:

1. **Consolidation rewrites what you hand it.** A citation must therefore survive in
   the TEXT, not only in metadata: prefix each chunk with its item IRI before it is
   saved, for example with `node records.js www/chunks.jsonl mem0` and
   `f"{r['metadata']['iri']}\n\n{r['text']}"`.
2. **Procedures belong in skills, not memory.** `agsc skills` emits one Agent Skills
   pack per Cluster (AGSC-07-19); give those to the crew as skills or task
   instructions rather than as memories.

The CrewAI runtime emitter of AGSC-07-18 (`compose --emit crewai`) is named by the
specification and is not built yet; until it is, a Harness's `AGENTS.md` and
`SKILL.md` files are the portable input.
