# 10 — Implementation profiles, in plain language

**Levels.** Level 0 is a publisher that can be hand-made over any site — a wiki, a CMS export: the items with their frontmatter, the root document, a discovery file without digests, `graph.jsonld` and `llms.txt`. Level 1 adds reading any Bundle: links, inverses and the checks. Level 2 adds the graph, the build outputs, the chunk export, boards and the boundary rules. Level 3 is everything. The Level is the single source of which vector areas a claim runs.

**Foreign knowledge bases.** A mapping guide for existing wikis and note systems, so that adopting means adding a header, not rewriting.

**Peers.** Two nodes that list each other can be checked for mutual conformance with one command, online or from two local files. It proves the declaration and the shape, not shared content.

**Project mode.** Without a new data model, tasks are concepts of kind `task` with an Agent2Agent state, clusters holding tasks are boards, and `/boards/` is a static export a client can merge across nodes by IRI.

**The live board.** A Bundle with boards, a contribute target and a participation surface is a live board — a live, shared pull board: people and agents, local or remote, read it through the published surfaces and change it only by proposals; a task is pulled by whoever claims it, by proposing its working state, and an agent holds at most one task at a time unless configured otherwise; the board export says who holds each task and whether the board is done; agent lanes work until it is. The fast lane (agents, automatic merges, refresh) never reaches the slow lane (gates, reviews, decisions, procedures, configuration).

Rules: `spec/10-implementation-profiles.md`, `AGSC-10-01` … `AGSC-10-18`.
