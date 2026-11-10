# 06 — Surfaces, in plain language

**Routes.** A writer emits a fixed set of pages and files — item pages, clusters, tags, search, NOW, compose, skills, specs, the graph files, `llms.txt`, sitemap, robots, the ledger, the chunk export, the context file, boards when tasks exist — and nothing else.

**The discovery file.** `/.well-known/knowledge-linkset` is an RFC 9264 link set: one document that points at every machine artefact with its SHA-256 digest, the spec version, counts, the ledger head, peers, surfaces and contribution targets. Pages point at it with the standard `describedby` relation; the Internet-Draft asks for the well-known name, which is not registered, and the profile identifier is registered in the IANA Profile URIs registry. The file can also carry optional links to related systems — an llms.txt file, an agent card, a server card, a memory or ontology endpoint — using standard relations only.

**llms.txt.** The agent-facing text file has a fixed byte layout — a provenance header, the title, the description, one section per cluster with one line per item — so two tools produce the same file.

**From 1.1, llms.txt follows v2 of the convention, and every page points at it.** The title comes first and the description straight after it, so a reader of llms.txt v2 finds the summary; the provenance header follows them, and a `[`, `]`, `(` or backslash in a title or description is escaped. Every page names `/llms.txt` in its head with the relation `describedby` and the type `text/plain`, beside the discovery file, and an item page names its Markdown copy `/pages/<slug>.md` with the relation `alternate` and the type `text/markdown` (AGSC-06-13a, AGSC-06-46).

**The chunk export.** `/chunks.jsonl` is the Bundle pre-split for agents: one line per chunk, cut at headings outside code fences and at a size bound, with a stable id, the text, provenance, licence and terms, and a digest. No embeddings.

**From 1.1, the chunks can be checked as a set.** Each chunk line also carries the item's own description (`abstract`) and a licence address that resolves (`license_url`); no chunk text begins with a blank line. The discovery document states the digest of `/chunks.jsonl`, the number of lines and one hash over all their ids, so a reader finds a line that was dropped or added. A node with at most 500 items also serves `/chunks-index.toon`, a compact table of the lines (AGSC-06-29, AGSC-06-37, AGSC-06-44, AGSC-06-45).

**From 1.1, the graph is on the page.** An item page shows its typed Links in both directions, the links back to it included, as a small figure and a table that says what each relation means; a cluster page maps its members; `/clusters/` adds an overview of the links between clusters, a legend and an explorer that works from the keyboard. Where a node uses the domain layer, an item page also shows its domain type, role, warrant and domain links. Only published items are drawn.

**From 1.1, `/query/` answers questions in SPARQL.** The page runs a query over the node's own graph in the browser, with the ten questions of the graph as examples, and offers the result as CSV or JSON; it calls no server and stores nothing. `site.query_page: false` leaves it out.

**Headers.** No third-party scripts, no beacons; strict security headers; public artefacts readable cross-origin.

Rules: `spec/06-surfaces.md`, `AGSC-06-01` … `AGSC-06-46`.
