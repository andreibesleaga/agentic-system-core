# The six modes, in plain language

One Bundle, one format, six ways of using it. No mode adds a type or a key; each is a way of reading the same files.

**Mode 0 — auto-wiki (the default, no model).** Write Markdown, run one command, get a site with a graph, search, an agent-facing text file and a discovery document. Nothing needs a language model. *Optional:* an **agent lane** — a declared, budgeted model-driven agent that creates, edits, reviews and updates pages non-deterministically, always as proposals; with the channel's `publish: auto` the wiki becomes self-driving, evolving by the model alone under the standing ratification, the lints, the budget and the rule that procedures, gates and configuration stay with people (spec/08 §8.6).

**Mode 1 — distributed agentic memory.** Agents read the Bundle through the local tool server or the page tools cite items by address — a chunk by its stable id from `/chunks.jsonl`, which the tools do not return — and propose changes that a human ratifies. Peers federate on the client side; everything from elsewhere is marked untrusted with its origin.

**Mode 2 — live specs and SDLC memory.** Concepts of kind principle, decision, spec, task and term, plus gates and episodes, with the five engineering links (`implements`, `verifies`, `covers`, `blocked-by`, `decided-by`). Project mode turns tasks and clusters into boards.

**Mode 3 — evolutive skills wiki.** Procedures are skills: each cluster exports as one `SKILL.md` pack holding its published items (the procedures are the runnable part), which installs into agent tool trees and comes back as items through import. Lessons distilled from episodes are the error record.

**Mode 4 — runnable knowledge.** A composition of concepts yields a harness — seven kinds of file an architect or a runtime starts from, not a running system — and a saved architecture item can be re-run.

**Mode 5 — the live board.** Product and project management by many agents and people at once: the Bundle is the shared pull board — decisions, specs, tasks on boards, gates, procedures as skills, lessons — every participant reads it through the published surfaces and writes to it only by proposals, agent lanes plan, claim and work tasks until a board is done, each holding at most its configured number of tasks at a time, and a board export says who holds what and whether it is finished. Two lanes: a fast one (agents, automatic merges, refresh, ledger, exports) and a slow one (gates, human review, decisions, releases, everything that touches procedures or configuration), and the fast lane can never reach the slow one — the System 1 / System 2 of the node. Remote agents take part through contribute targets, channels or a declared responder; nodes never call nodes (spec/10 §10.6).

One short guide per mode, with the commands and what they print: [docs/guides/](../guides/README.md). Requirements by mode: `docs/PRD.md` §2.2–§2.6 and Amendment 8. Rules: the whole of `spec/`.
