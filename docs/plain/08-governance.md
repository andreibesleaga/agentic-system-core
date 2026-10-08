# 08 — Governance, in plain language

**Provenance on everything.** Every item says how it came to be — human, ai-assisted, ai-generated or imported — with the operator accountable for it and, when a model wrote it, which model.

**Changes are proposals.** Nobody writes to the published branch directly, agents included. A change is a pull request with a DCO-Plus trailer; gates run as CI checks; a human ratifies. One narrow, configured, revocable exception exists for a trusted automatic channel.

**Agent safety.** Four safety lints run on every build: an injection scan over bodies, frontmatter at any depth, attachment text and every prose export; a secrets check; a personal-data check; and a clean-room check. Skill packs stay inert by rule: no scripts, no executables. (AGSC-08-13 to AGSC-08-17.) Every text handed to a model is marked *untrusted*.

**The ledger.** A hash chain derived from git history — never appended by hand — whose head is pinned in the discovery file. It proves the published history was not altered; it does not prove who the author was.

**The agent lane.** A node may declare an agent — a model or a program, with a budget — that creates, edits, reviews and updates items on its own. It never writes: everything it does is a proposal through a channel, every run is recorded as an episode with its cost, it may only touch concepts, episodes and lessons, it creates at most a set number of items per proposal, and it stops for the month at its own budget or at the node's. `refresh --agent <name> --dry-run` shows the proposal it would open without opening it. If the channel's publish choice is `auto`, the node is self-driving; the human's ratification is that one configured choice, and procedures, gates and configuration still wait for a person.

**The agent lane, in the terms of a decision engine.** Systems that let software decide often describe each decision by three things: a typed question, an explicit threshold, and a recorded judgment. The agent lane has all three. The question is typed: an agent's `tasks` is a list chosen from a closed set (`create`, `edit`, `update`, `review`, `summarize`, `translate`, `refresh`, `plan`, `claim`, `work`), and a proposal for any other task is refused (`AGSC-E509`). The thresholds are numbers in the configuration, not judgement calls: the agent's monthly budget and the node's, the most items one proposal may create (`max_new_items`), the most tasks it may hold at once (`max_claims`). The judgment is recorded: every run leaves an episode with its cost, and a change merged under the channel's standing `auto` choice is marked `mode: "auto"` in the ledger. What the lane never does is decide for a person: a proposal is the only thing it produces.

Rules: `spec/08-governance.md`, `AGSC-08-01` … `AGSC-08-30`.
