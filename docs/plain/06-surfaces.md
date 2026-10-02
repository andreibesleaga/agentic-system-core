# 06 — Surfaces, in plain language

**Routes.** A writer emits a fixed set of pages and files — item pages, clusters, tags, search, NOW, compose, skills, specs, the graph files, `llms.txt`, sitemap, robots, the ledger, the chunk export, the context file, boards when tasks exist — and nothing else.

**The discovery file.** `/.well-known/knowledge-linkset` is an RFC 9264 link set: one document that points at every machine artefact with its SHA-256 digest, the spec version, counts, the ledger head, peers, surfaces and contribution targets. Pages point at it with the standard `describedby` relation; the Internet-Draft asks IANA for the well-known name, and the profile identifier is requested separately; neither is registered yet. The file can also carry optional links to related systems — an llms.txt file, an agent card, a server card, a memory or ontology endpoint — using standard relations only.

**llms.txt.** The agent-facing text file has a fixed byte layout — a provenance header, the title, the description, one section per cluster with one line per item — so two tools produce the same file.

**The chunk export.** `/chunks.jsonl` is the Bundle pre-split for agents: one line per chunk, cut at headings outside code fences and at a size bound, with a stable id, the text, provenance, licence and terms, and a digest. No embeddings.

**Headers.** No third-party scripts, no beacons; strict security headers; public artefacts readable cross-origin.

Rules: `spec/06-surfaces.md`, `AGSC-06-01` … `AGSC-06-36`.
