# The six modes, in plain language

One Bundle, one format, six ways of using it. No mode adds a type or a key; each is a way of reading the same files.

**Mode 0 — auto-wiki (the default, no model).** Write Markdown, run one command, get a site with a graph, search, an agent-facing text file and a discovery document. Nothing needs a language model. *Optional, since rc.4:* an **agent lane** — a declared, budgeted model-driven agent that creates, edits, reviews and updates pages non-deterministically, always as proposals; with the channel's `publish: auto` the wiki becomes self-driving, evolving by the model alone under the standing ratification, the lints, the budget and the rule that procedures, gates and configuration stay with people (spec/08 §8.6).

**Mode 1 — distributed agentic memory.** Agents read the Bundle through the local tool server or the page tools, cite chunks by stable id, and propose changes that a human ratifies. Peers federate on the client side; everything from elsewhere is marked untrusted with its origin.

**Mode 2 — live specs and SDLC memory.** Concepts of kind principle, decision, spec, task and term, plus gates and episodes, with the five engineering links (`implements`, `verifies`, `covers`, `blocked-by`, `decided-by`). Project mode turns tasks and clusters into boards.

**Mode 3 — evolutive skills wiki.** Procedures are skills: they export to `SKILL.md`, install into agent tool trees, and come back as items through import. Lessons distilled from episodes are the error record.

**Mode 4 — runnable knowledge.** A composition of concepts yields a harness — seven files an architect or a runtime can execute — and a saved architecture item can be re-run.

**Mode 5 — the live board (since rc.4).** Product and project management by many agents and people at once: the Bundle is the shared pull board — decisions, specs, tasks on boards, gates, procedures as skills, lessons — every participant reads it through the published surfaces and writes to it only by proposals, agent lanes plan, claim and work tasks until a board is done, each holding at most its configured number of tasks at a time, and a board export says who holds what and whether it is finished. Two lanes: a fast one (agents, automatic merges, refresh, ledger, exports) and a slow one (gates, human review, decisions, releases, everything that touches procedures or configuration), and the fast lane can never reach the slow one — the System 1 / System 2 of the node. Remote agents take part through contribute targets, channels or a declared responder; nodes never call nodes (spec/10 §10.6).

Requirements by mode: `docs/PRD.md` §2.2–§2.6 and Amendment 8. Rules: the whole of `spec/`.
