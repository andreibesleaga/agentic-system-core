# Use cases — what people and agents do with a knowledge node

**Who this is for:** anyone deciding whether the system fits a need. **Read after:** [plain/modes.md](plain/modes.md).

Nineteen concrete scenarios, in three groups: **one machine, one person**;
**many nodes, no server**; and **many agents on one Bundle**. Each says who is
involved, where the data goes, which published surfaces it touches, which of the
node's modes it is, the exact commands, and how it is proven.

The modes are the node's six ways of being used: **0** auto-wiki, **1** distributed
agentic memory, **2** live specifications, **3** evolving skills library,
**4** runnable knowledge, **5** the live board.

"Proven by" names the test that runs the scenario. The scenarios whose test is
`tests/acceptance/use-cases/use-cases.test.js` run there end to end through the real
command line, offline, with a fixed build instant. Where a scenario needs a forge, a
model, a live peer or a browser, the entry says so and names the test that covers
the part that can run offline.

In every command below, `agsc` is the engine's command line and runs in the
Bundle's own folder.

---

## One machine, one person

### L1 — The assistant that answers from one folder

- **Who:** one person, their assistant, one local server.
- **Data flow:** files on disk → the local MCP server → the assistant's context.
  Nothing leaves the machine and no key exists.
- **Surfaces:** the seven MCP tools and the item resources.
- **Mode:** 1, used locally.
- **Commands:** `agsc mcp` (configured in the assistant as in
  [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md)). The assistant calls
  `search`, then `read`, then `links`, and answers citing item IRIs.
- **Proven by:** `tests/acceptance/persona-d-agent-proposer.test.js`, which drives the
  real server with the official MCP client.

### L2 — The correction that becomes a page

- **Who:** one person, one assistant.
- **Data flow:** conversation → `remember` → prepared text in the person's hands → a
  file → a patch → a pull request → CI → merge.
- **Surfaces:** the tools, then the forge.
- **Mode:** 0, with a person deciding.
- **Commands:** the assistant calls `remember`; the person saves the text it returns,
  then runs `agsc lint --fix` and `agsc propose <slug>`, and runs the git commands
  `propose` prints. `propose` and `remember` never save or push anything themselves.
- **Proven by:** `tests/acceptance/persona-d-agent-proposer.test.js` (everything up
  to the printed commands; the pull request itself is the forge's).

### L3 — The steering file that keeps a coding agent on course

- **Who:** one person, one coding agent.
- **Data flow:** items → steering files at the paths the agent reads → the agent's
  context at the start of every session.
- **Surfaces:** the steer bundle.
- **Mode:** 2.
- **Commands:** `agsc export --steer --target agents,claude,cursor`, then copy
  `dist/export/steer/*` into the project (or run
  `node examples/connectors/claude-code/connect.js <bundle> <project>`).
  The files come only from the current state and from concepts, procedures, gates
  and lessons, so the same Bundle always gives the same bytes.
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js`.

### L4 — Procedures as installable skills

- **Who:** one person, any tool that reads Agent Skills.
- **Data flow:** procedures and clusters → skill packs → the tool's skills folder.
- **Surfaces:** `/skills/**`.
- **Mode:** 3.
- **Commands:** `agsc skills`, then `agsc skills install .claude/skills` (or
  `.agents/skills`, `.github/skills`). Every file is checked against the SHA-256
  lockfile in `dist/skills/index.json` first; a pack holds no scripts and no
  `allowed-tools`.
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js`.

### L5 — A folder of notes becomes a node

- **Who:** one person.
- **Data flow:** bare Markdown files → items → a built site.
- **Surfaces:** all of them.
- **Mode:** 0.
- **Commands:** `agsc init` in the folder (each file gets a type, a title and a
  provenance block; `agsc.config.json` and `content/index.md` are written), then add
  `.well-known/security.txt` with a `Contact:` line, then `agsc ci`. Without the
  security contact `ci` stops with one error, because a published node must name
  where to report a security problem.
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js`.

## Many nodes, no server

### D1 — Two nodes that check each other

- **Who:** two publishers.
- **Data flow:** two discovery documents, compared. It works on two local files, with
  no network.
- **Surfaces:** `/.well-known/knowledge-linkset`.
- **Mode:** 1.
- **Commands:** each lists the other's discovery URL in `peers[]` of
  `agsc.config.json`; each runs `agsc build`; then
  `node tools/validate-wellknown a/www/.well-known/knowledge-linkset --peer b/www/.well-known/knowledge-linkset`.
  If only one side lists the other, the check fails with "resolved, not mutual".
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js`.

### D2 — A client that walks a neighbourhood

- **Who:** one client, many publishers.
- **Data flow:** client side only — nodes never call nodes. The walk follows peer
  links within fixed limits (3 hops, 50 peers per node, 500 requests, 3 redirects,
  10 seconds, 1 MiB per discovery document), HTTPS only, private addresses refused,
  and reports `partial: true` when a limit is reached.
- **Surfaces:** the discovery documents and what they point at.
- **Mode:** 1.
- **Commands:** none at 1.0 — the walk is a library function
  (`src/boundary/federation.js`, `walk`) that takes the fetch function it may use; no
  command line wraps it yet.
- **Proven by:** `tests/boundary/federation.test.js`, with an injected fetch and no
  network. A walk over real peers needs the network and is not run by any test.

### D3 — Citing another node without linking to it

- **Who:** two publishers.
- **Data flow:** an item names a peer's page in `sources[]`; the rule says the graph
  then states `rdfs:seeAlso` to that page and `asc:peerOrigin` to the peer, with no
  fetch. A Link key whose value is a URL is an error.
- **Surfaces:** the graph exports.
- **Mode:** 1.
- **Commands:** add `sources: [{resource: "https://peer.example/concepts/x/"}]` to an
  item of a node that lists the peer, then `agsc build`.
- **Proven by:** `tests/boundary/federation.test.js` covers the function that makes
  the two statements. **Not yet in the build:** the reference engine's `graph.nq`
  does not carry them today — the function is not wired into the build. This is
  recorded as an open item.

### D4 — One answer from three corpora

- **Who:** one consumer, three publishers.
- **Data flow:** the consumer downloads three nodes' `/graph.nq` and `/chunks.jsonl`
  and joins them in its own process; everything taken from a peer stays marked
  `untrusted` with that peer as its origin. No node fetches on anyone's behalf.
- **Surfaces:** the graph and chunk exports.
- **Mode:** 1.
- **Commands:** download the files; the join is the consumer's own code (the
  engine's `clientUnion` in `src/boundary/federation.js` is one such join).
- **Proven by:** `tests/boundary/federation.test.js` (the join); the downloads need
  the network.

### D5 — A contribution from a stranger

- **Who:** a stranger, their agent, the publisher.
- **Data flow:** the discovery document → the first contribution route the agent
  supports (a pull request, a channel or a form) → CI → a person. With no route it
  can use, the agent returns the proposal to its caller and writes nothing anywhere.
- **Surfaces:** the discovery document and the forge.
- **Mode:** 1 into 0.
- **Commands:** the publisher declares `contribute[]` in `agsc.config.json` and runs
  `agsc build`; the stranger's side uses `agsc propose <slug>` or the `propose` tool.
- **Proven by:** `tests/boundary/federation.test.js` (the declaration and its
  checks). **Gap:** no channel adapter
  ships, so a `channel` route can be declared but not used.

### D6 — A knowledge base mirrored into someone else's memory system

- **Who:** a team running Cognee, Letta, Mem0, LangGraph or similar; one publisher.
- **Data flow:** Bundle → a COGX archive → their importer. Every record keeps its
  IRI, digest, licence and terms, so an answer their system gives can be traced back.
- **Surfaces:** the chunk export and the items, through the COGX adapter.
- **Mode:** 1.
- **Commands:** `agsc export --to cogx`, then Cognee's COGX import of
  `dist/export/cogx/` (the other memory systems are reached through Cognee, which
  reads this format; they do not read the archive themselves). Back again: `agsc import --from cogx <archive-dir>`.
  See [CONNECTORS.md](CONNECTORS.md), route 4.
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js`, and the full format
  and round-trip tests in `tests/interchange/cogx.test.js`. The foreign system's own
  import is not run.

## Many agents on one Bundle

### M1 — The live board: one person and three agents

- **Who:** one operator, three agents, any number of readers.
- **Data flow:** published surfaces in, proposals out, merges by a person or under a
  standing decision. Tasks are concepts with `kind: task` and a `task_state`; every
  cluster holding a task is a board, published as `/boards/index.json` and
  `/boards/<cluster>.json`. Each agent lane declares its model, monthly budget, tasks
  and item types, claims a task by proposing `TASK_STATE_WORKING`, holds at most
  `max_claims`, and stops when its boards are done, a task needs a person, or its
  budget is spent.
- **Surfaces:** boards, chunks, `llms.txt`, the NOW page, the tools.
- **Mode:** 5.
- **Commands:** add task concepts to a cluster, `agsc build`; an agent lane's run is
  `agsc refresh --agent <name> --dry-run`.
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js` (the board is
  published); the agent lanes' limits by `tests/application/cli/verbs-wired.test.js`
  and the bundle vectors.

### M2 — The fast lane and the slow lane

- **Who:** as M1.
- **Data flow:** two lanes over one set of files. Everything that runs without a fresh
  decision by a person — agent lanes, automatic channel merges, `refresh`, the
  ledger, the boards, the peer check — is the fast lane. Everything that needs one —
  gates, review, decisions, releases, retirement, and any change to a procedure,
  gate, cluster, configuration, workflow or schema — is the slow lane, and the fast
  lane can never reach it. Every fast-lane merge is marked `mode: "auto"` in the
  ledger.
- **Surfaces:** the ledger and each run's episode.
- **Mode:** 5.
- **Commands:** `agsc verify --ledger` re-derives the ledger from git history.
- **Proven by:** `tests/governance/ledger.test.js` (the `mode: auto` marking) and
  `tests/governance/agents.test.js` (what a lane may touch). The
  merges themselves happen on a forge and are not run here.

### M3 — A self-driving wiki under a standing decision

- **Who:** one operator who decided once, one or more agents.
- **Data flow:** as M1, with `publish: auto` on an agent lane's channel: items are
  created and updated with no fresh decision per change, but only under every
  condition the rules set — the pull request's author is the channel's author, the
  operator is the channel's owner, every item says which agent wrote it, the safety
  lints run at error severity, and the merge uses the owner's own credential, not
  the CI token. Procedures, gates, clusters, configuration, workflows and schemas
  stay with people. A reviewing agent adds a label and a comment, never a
  verification.
- **Surfaces:** as M1.
- **Mode:** 0 with the agent lane, or 5.
- **Commands:** set `publish: auto` on the channel in `agsc.config.json`.
- **Proven by:** `tests/governance/agents.test.js` (the agent-lane conditions) and
  `tests/distribution/forge.test.js` (the enforcement files a forge needs). The merges
  run on the forge; **no channel adapter ships**, so the channel
  itself is not runnable yet.

### M4 — Cost that cannot run away

- **Who:** the operator.
- **Data flow:** every model-calling path records an episode with its usage
  (`model`, `tokens_in`, `tokens_out`, `cost_usd`); the month's spend is summed in a
  fixed order and compared with a whole-number cap; when the node's
  `budget.usd_month` or a lane's `budget_usd_month` is reached, every model-calling
  path stops for the month and the NOW page says so. A tool that cannot compute the
  month's spend must not call a model. A dry run counts as spend.
- **Surfaces:** the NOW page.
- **Mode:** 0 or 5.
- **Commands:** `agsc refresh --agent <name> --dry-run` shows the proposal a run would
  open; `agsc build` publishes the NOW page with the meter.
- **Proven by:** `tests/distribution/now-spend.test.js`. This engine ships no model
  adapter, so no real model call is made anywhere.

### M5 — A selection that becomes a running system

- **Who:** an architect, then a runtime.
- **Data flow:** selected concepts → five fixed steps (requirements closure, hiding
  superseded items, mutual exclusions, warnings, port wiring) → a Harness: up to
  seven kinds of file — `harness.jsonld`, `AGENTS.md`, `workspace.dsl`,
  `diagram.mmd`, `arc42.md`, one decision record per concept and one `SKILL.md` per
  procedure — the same bytes from the browser and from the command line. An invalid
  selection gives only the verdict.
- **Surfaces:** `/compose/` and the page tools.
- **Mode:** 4.
- **Commands:** `agsc compose <slug> [<slug>…]` writes `dist/harness/<name>/`; add
  `--zip` for one archive. The runtime emitters (`--emit crewai` and the other five
  names) are named by the specification and **not built yet**.
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js`.

### M6 — The same page, answered by the browser's own agent

- **Who:** a visitor and their browser's agent.
- **Data flow:** the seven tools are registered on the page itself, with no install
  and no server of ours; the page reads the node's published files, and each tool's
  result equals the local server's for the same input. `propose` and `remember`
  hand back text. The node's discovery document is what tells an agent the tools
  exist — the in-page tool standard has no discovery of its own.
- **Surfaces:** the page tools and the `webmcp` declaration.
- **Mode:** 1.
- **Commands:** `agsc build`, then open any item page or `/compose/` in a browser
  whose agent supports in-page tools.
- **Proven by:** `tests/distribution/page-tools.test.js` (the page tools give the
  same results as the local tools). A real browser agent is not run.

### M7 — A team's board becomes a live board

- **Who:** a team that plans in Jira, GitHub, GitLab, Trello, Linear, Asana, Notion,
  an Obsidian Kanban board, a Markdown task list or a Todo.txt file, and the agents
  that will work its tasks.
- **Data flow:** the tool's export file into the node, the node's board out to the
  tool's import file; files only, moved by a person or a CI job. The import turns each
  card or issue into a draft task on a draft board (its state through one table, its
  assignee, labels, due date, id and unknown columns kept in `x-board-*` keys, its
  blocking links as `blocked-by`); a person reviews, fixes what the table could not
  read, and publishes. The board is then published as `/boards/` and worked as in M1;
  the export writes it back in the tool's format, one file per board, and our own
  import reads that file back exactly.
- **Surfaces:** the board files, `/boards/index.json`, the tools.
- **Mode:** 5.
- **Commands:** `agsc import --from board --format jira ./from-jira --dry-run`, then
  without `--dry-run`; change `status: draft` where the work may be public;
  `agsc build`; `agsc export --to board --format jira` for the way back.
- **Proven by:** `tests/interchange/board.test.js` (every format: import, export, and
  the round trip). No tool's own importer is run.

### M8 — Working a live board with agents, on two nodes

- **Who:** one person who merges, agent A working through node A's tool server,
  agent B working through node B (a second node of the same board — a clone, or any
  node whose `peers[]` names A).
- **Data flow:** every step is a **prepared Proposal**, never a write. An agent reads
  the board (`/boards/index.json`, `/boards/<cluster>.json`, or the `read` and
  `search` tools); claims or moves a task with `propose({slug, task_state, at?})`,
  which returns the patch that sets `task_state` (and `modified` when `at` is given)
  and nothing else; opens a new task with `remember({kind: "task", cluster, title,
  body})`; and comments with `remember({kind: "lesson", about: <task>, …})`. When the
  caller names one of the node's agent lanes, the lane's gates run on the prepared
  Proposal: an undeclared task or type (`AGSC-E509`), `max_new_items` and
  `max_claims` (`AGSC-E511`), and a claim of a task already in
  `TASK_STATE_WORKING` under someone else (`AGSC-E511`). The person merges one
  claim; the other claim's patch no longer applies — the first merged claim wins —
  and, prepared again against the merged state, it is refused. The build then
  publishes the new state on the board page and under `/boards/`, and the content
  version moves.
- **Surfaces:** `/boards/`, the seven tools (local and in-page), the proposal patch.
- **Mode:** 5.
- **Commands:** `agsc mcp` (the agents' tool server); `git apply <patch>` and a
  commit, or a pull request, by the person; `agsc lint`; `agsc build`.
- **Never automatic:** no tool writes to the content branch, merges, pushes or opens
  a pull request; nothing is sent to another node; the in-page tools know no lanes
  (lanes are configuration, never published), so on a page the gates run at review.
- **Proven by:** `tests/acceptance/use-cases/use-cases.test.js` (the whole
  scenario, with two clones of one repository and real `git apply`), and
  `tests/distribution/board-tools.test.js` (the same payload on both transports; every
  lane gate).
