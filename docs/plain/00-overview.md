# 00 — Overview, in plain language

**What it is.** AgenticSystemCore is a file format plus a few fixed outputs. You write knowledge as Markdown files with a small YAML header, keep them in one directory with one configuration file, and a conforming tool turns that directory into a website, a graph, a search index, an agent-facing text file, a chunk export and a discovery document — the same bytes every time, on any machine.

**What conformance means.** A tool is a *reader*, a *writer* or a *full engine*; a published site is a *node* at Level 0 to 3. A claim names the class or Level, the `spec_version` and the test vectors passed. There is no badge and no registry — the vectors are the proof.

**Terms you will meet.** A *Bundle* is the directory. An *Item* is one file; its `type` is one of concept, episode, procedure, lesson, cluster or gate. *NOW* is a generated summary page. Words like card, deck or page are never types.

**How versions move.** The `spec_version` is MAJOR.MINOR.PATCH. A MINOR adds and never removes; a reader must ignore what it does not know and must not fail on a higher MINOR. Only a MAJOR may break.

**Where requirements live.** Every product requirement that is served by the *shape* of the artefacts rather than one sentence is cited in §0.5, so a validator can check the citation.

**Added at rc.4.** Two terms complete the language for Mode 5 — an *agent lane* (a declared, budgeted
agent that proposes, never writes) and the *live board* — and one rule names the whole declared scope of
the specification with the version at which each part becomes normative.

Rules: `spec/00-overview.md`, ids `AGSC-00-01` … `AGSC-00-25`.
