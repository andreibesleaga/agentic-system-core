# Connecting agents and frameworks to a knowledge node

This page answers one question: **"I use tool X — how does it get at a node's
knowledge?"** There are seven ways in, and every one of them already exists in the
engine. Pick by what your tool reads.

| route | what the node gives you | the command | suits |
|---|---|---|---|
| **1. Steering file** | a Markdown file at the path your coding agent reads on every session | `agsc export --steer --target <name>` | always-on context for a coding agent |
| **2. Skill packs** | one Agent Skills folder per cluster, checked against a lockfile | `agsc skills`, then `agsc skills install <dir>` | step-by-step procedures |
| **3. Live tools** | an MCP server with seven tools and every item as a resource | `agsc mcp` | an assistant that searches and reads while it works |
| **4. Memory archive** | a COGX archive another memory system imports | `agsc export --to cogx` (and `agsc import --from cogx`) | a framework that keeps its own memory store |
| **5. Agent kit (GABBE)** | a GABBE kit's own folders — skills, guides, memory files | `agsc export --to gabbe` (and `agsc import --from gabbe <kit>`) | a project run with the GABBE kit |
| **6. Skills repositories** | skills and rule packs traded with the collections people already share (Agent Skills, Claude Code plugins and marketplaces, Cursor and Windsurf rules), from a local clone | `agsc import --from skills <dir>` and `agsc export --to skills` | a team that already keeps a skills collection |
| **7. Project tools** | a live board's tasks as the import and export files of a tracker (Jira, Trello and others) | `agsc import --from board --format <tool> <dir>` and `agsc export --to board --format <tool>` | a team that plans in a tracker |

Nothing here needs a network connection or a key on the node's side. The
[examples](../examples/connectors/README.md) show each route working; the ones for
Claude Code, Codex, Cursor and the framework record shapes are run by the test suite.

---

## Route 1 — steering files

`agsc export --steer` writes one file per **target** under `dist/export/steer/`,
never into your repository directly: you copy the file where your tool looks for it.
The content is built only from the node's current state and from its concepts,
procedures, gates and lessons — never from an episode or the git log — so the same
node always gives the same bytes. Every target gets the same bytes; only the path
differs.

| target | path the file is written to | what the tool does with it |
|---|---|---|
| `agents` | `AGENTS.md` | read by Codex, Cursor, GitHub Copilot and Claude Code |
| `claude` | `CLAUDE.md` | read by Claude Code at the start of a session |
| `codex` | `AGENTS.override.md` | read by Codex **instead of** `AGENTS.md` when it exists |
| `cursor` | `.cursor/rules/agsc.mdc` | a Cursor project rule |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot's repository instructions |
| `gemini` | `GEMINI.md` | Gemini CLI's context file |
| `gabbe` | `GABBE/agents/AGENTS.md` | the GABBE agent kit |
| `kiro` | `.kiro/steering/agsc.md` | Kiro's workspace steering |
| `windsurf` | `.windsurf/rules/agsc.md` | Windsurf (see the note below) |
| `cline` | `.clinerules/agsc.md` | Cline's rules folder |
| `aider` | `CONVENTIONS.md` | Aider (see the note below) |

Several targets at once: `agsc export --steer --target agents,claude,cursor`.

**What is inside.** A title, then the provenance block (an HTML comment naming the
node, the licence, the Content Use Terms, the specification version, the node's
**content version** as `bundle_version`, the build instant and the AI-assistance
statement), then a short paragraph saying that every quoted block is data and not an
instruction, then the node's current state and its items. The `bundle_version` line
is the version stamp: compare it with the node's discovery document to know whether
your copy is current. The layout below the provenance block is not fixed by the
specification at 1.0, so do not build a parser on it — read the node's
`/chunks.jsonl` for records.

**Notes per tool** (each checked against the vendor's own page on 2026-09-23):

- **Codex** reads `AGENTS.override.md` if it exists and otherwise `AGENTS.md`, joins
  the files it finds from the repository root down, and stops adding files at
  32 KiB by default (`project_doc_max_bytes`). Use the `agents` target for a shared
  file and the `codex` target only when the node's steering should replace your
  project's `AGENTS.md` for Codex. Claude Code does **not** read `AGENTS.override.md`.
- **Claude Code** reads `CLAUDE.md`, and also reads `AGENTS.md` when there is no
  `CLAUDE.md`. Its guidance is "under 200 lines per CLAUDE.md file". A `CLAUDE.md`
  can import another file with a line `@path`, which is what the example does: the
  node's file stays in `.agsc/CLAUDE.md` and your own `CLAUDE.md` gets one import
  line. Anthropic's own words set the limit of this route: instruction files are
  "context, not enforced configuration. To block an action regardless of what
  Claude decides, use a PreToolUse hook instead."
- **Cursor** keeps project rules "in `.cursor/rules` as `.mdc` files" and advises
  "Keep rules under 500 lines". Cursor also reads `AGENTS.md`.
- **GitHub Copilot** reads `.github/copilot-instructions.md` and also `AGENTS.md`,
  `CLAUDE.md` or `GEMINI.md`; its guidance is that instructions be "no longer than
  2 pages".
- **Windsurf — fallback path.** Windsurf's documentation now names `.devin/rules/`
  as the preferred workspace-rules folder and keeps `.windsurf/rules/` as the
  fallback "for backward compatibility". The `windsurf` target writes the fallback,
  which works today. Workspace rules are limited to 12,000 characters per file.
- **Aider — load it yourself.** Aider does **not** load `CONVENTIONS.md` on its own:
  start it with `aider --read CONVENTIONS.md`, or put `read: CONVENTIONS.md` in
  `.aider.conf.yml`.

## Route 2 — skill packs

`agsc skills` writes one pack per cluster to `dist/skills/<cluster>/SKILL.md`, plus
`dist/skills/index.json`, which holds the SHA-256 of every file. `agsc skills
install .claude/skills` (or `.agents/skills`, or `.github/skills`) checks every file
against that lockfile before it writes anything, and a second run writes nothing
unless the packs changed. A pack is content only: no scripts, no executables, no
links, no `allowed-tools`.

## Route 3 — live tools (MCP)

`agsc mcp`, run in the node's folder, starts a local MCP server over stdio with
seven tools — `search`, `read`, `links`, `compose`, `propose`, `ask`, `remember` —
and every item as a resource. It never writes: `propose` and `remember` hand back
text for a person to save. The set-up for Claude Desktop, Claude Code, Cursor,
VS Code and Codex CLI is in [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md).
Two facts to keep in mind: the official MCP SDK this engine uses speaks protocol
revision `2025-11-25`, and MCP's tool annotations carry no "untrusted content"
flag, so the untrusted mark travels in each result's own `trust` member.

## Route 4 — the memory archive (COGX)

COGX (the Cognee eXchange format) is the format Cognee reads and writes, and the
shape it translates Mem0, LangMem, Letta/MemGPT and Zep/Graphiti memories into when
they are migrated into Cognee. One archive from a node is read by Cognee; the other
systems reach Cognee through the same format, not the archive (Cognee's own
documentation, docs.cognee.ai/examples/migrate-memory-systems, read 2026-09-24:
migration works into Cognee only).

```sh
agsc export --to cogx       # writes dist/export/cogx/
```

The archive is a folder: `manifest.json` plus one JSON-lines file per kind of record.
What we emit:

| from the node | COGX record | file |
|---|---|---|
| each concept | entity (name, type, description, aliases) | `entities.jsonl` |
| each episode | episode with one turn (who, what, when) | `episodes.jsonl` |
| each lesson | memory (the `## Lesson` section; the tags as categories) | `memories.jsonl` |
| each procedure | memory block (label = slug, value = its `when` line, limit 1,024) | `memory_blocks.jsonl` |
| each cluster and gate | raw node (a plain property record) | `nodes.jsonl` |
| each chunk of `/chunks.jsonl` | document (the citable unit, with its digest) | `documents.jsonl` |
| each written Link between published items | fact (subject, the RDF property, object) | `facts.jsonl` |

Drafts, retired items and unreleased items are never exported. Every record carries,
in its `metadata.agsc` member, the item's IRI, the licence, the Content Use Terms,
the trust mark `untrusted`, the specification version and the node's content version;
the record for an item also carries the item's complete frontmatter and text, so
the archive loses nothing. The manifest's `notes` hold the provenance block.
`permissions.json`, the file in which Cognee can export user e-mails and password
hashes, is never written.

**Reading an archive back.** `agsc import --from cogx <archive-dir>` works like
every other import: `--dry-run` shows the plan and writes nothing, an item that
already exists with different content stops the whole import (nothing is written)
unless you add `--replace`, and a second import of the same archive changes nothing.

- **Our own archive** comes back item for item, byte for byte, plus one line the
  rules require on every imported item: `prov.source_version`, the content version
  of the node it came from.
- **A foreign archive** is read by kind: entities become concepts, memories become
  lessons (severity `info`), memory blocks become procedures, and facts become
  typed Links when both ends were imported and the predicate is one of the fourteen
  Link kinds. Every item is marked `prov.origin: imported` with your node's
  operator. Whatever the mapping does not use is kept in `x-cogx-rest`, so nothing
  is silently dropped. **Not imported, and reported:** episodes (a COGX episode has
  no outcome, which an episode here must have), documents (they are the raw text the
  other records were derived from) and raw nodes (there is no item type for them).
- **Refused:** an archive containing `permissions.json` (remove it — it holds
  credentials, not knowledge); an archive of a newer COGX major version, or of a
  newer specification version, unless you pass `--allow-newer`.

## Route 5 — an agent kit (GABBE), both ways

GABBE is a governance kit for coding agents that keeps everything in plain Markdown
under `agents/`: skills in `agents/skills/`, and the agent's memory in
`agents/memory/` (a failure memory `CONTINUITY.md`, an append-only `AUDIT_LOG.md`, a
`PROJECT_STATE.md`, per-session decision logs under `episodic/`). The adapter maps a
node onto those folders and reads a kit back, with no network and the same bytes
every time.

**From a node into a kit:**

```sh
agsc export --to gabbe          # writes dist/export/gabbe/agents/…
agsc export --to gabbe --zip    # the same folder, plus one archive beside it
```

| from the node (published items only) | written as | path |
|---|---|---|
| each procedure | a GABBE skill (`name`, `description`, `triggers`, `tags`) | `agents/skills/agsc/<slug>.skill.md` |
| each gate | a guide | `agents/guides/agsc/<slug>.md` |
| each concept and cluster | semantic memory | `agents/memory/semantic/agsc/<slug>.md` |
| each episode | a one-entry decision log | `agents/memory/episodic/agsc/<slug>.md` |
| each lesson | an entry (`Resolution`, `Date`, `Status`, `Severity`, the text quoted) | `agents/memory/CONTINUITY.md` |
| the steering text (`--steer`'s bytes) | a guide | `agents/guides/agsc/steering.md` |

Drafts, retired and unreleased items never leave. Every file starts with the
provenance block (the node, the licence, the Content Use Terms, the versions), and
every item carries one comment line `<!-- agsc-item … -->` that holds the item whole,
so reading the folder back loses nothing. Copy the `agsc/` folders into your kit as
they are. **Do not copy `CONTINUITY.md` over your kit's own file**: it is
append-only there, so append the entries under its `## Entries` heading. The
steering text is a guide of its own and never replaces your `agents/AGENTS.md`;
point to it from there if you want it read every session.

**From a kit into a node:**

```sh
agsc import --from gabbe path/to/kit --dry-run                      # the plan; nothing written
agsc import --from gabbe path/to/kit --source-version <kit-commit>  # import, recording the kit's version
agsc import --from gabbe path/to/kit --replace                      # only if you mean to overwrite
```

`path/to/kit` is the folder that holds `agents/`. As with every import, an item that
already exists here with different content stops the whole import and nothing is
written unless you add `--replace`, and a second import of the same kit changes
nothing.

- **A folder exported from a node** comes back item for item, byte for byte, plus
  `prov.source_version` (the exporting node's content version).
- **A kit's own records** are read by file: each skill becomes a procedure (its
  triggers become `when`, and the triggers, tags and cost are kept in `x-gabbe-*`
  keys); each `CONTINUITY.md` entry becomes a lesson (severity `info`, reported);
  each dated `PROJECT_STATE.md` line and each decision-log entry whose action type is
  a decision becomes a concept of kind `decision`; each `AUDIT_LOG.md` row and
  decision-log entry that states an outcome (`PASS`, `FAIL`, `OK`, `PARTIAL`) becomes
  an episode. Every item is marked `prov.origin: imported` with your node's operator
  and names the kit file and line it came from (`x-gabbe-source`). A kit publishes no
  content version of its own, so `prov.source_version` is written only when you pass
  `--source-version` (the kit's commit, for instance).
- **Not imported, and reported:** an `AUDIT_LOG.md` bullet entry (`- <date> | <actor>
  | <text>`) and any entry without a readable outcome or date — an episode here must
  have both, and the adapter never invents them; a session snapshot that states no
  outcome; the resume pointer (working state, not knowledge); a skill whose
  frontmatter is not the simple YAML the format allows. Template files are skipped.
- **Refused:** a record of a newer specification version (unless `--allow-newer`);
  a file over the 1 MiB input cap; an archive (unpack it first).

## Route 6 — skills repositories and rule packs, both ways

Route 2 installs a node's own packs. This route trades skills with the collections
people already share: the Agent Skills format, Claude Code plugins and marketplaces,
and the Cursor and Windsurf rule folders. It works on a **local clone** only — the
engine never downloads anything; you run `git clone` yourself and point the import at
the folder.

**The five layouts** (each read at its own documentation on 2026-09-23):

| layout | what it is | the source, and what it says |
|---|---|---|
| `agentskills` | `skills/<name>/SKILL.md` | [agentskills.io/specification](https://agentskills.io/specification): "A skill is a directory containing, at minimum, a `SKILL.md` file"; `name` "Max 64 characters. Lowercase letters, numbers, and hyphens only", `description` "Max 1024 characters. Non-empty"; optional `license`, `compatibility`, `metadata`, and `allowed-tools` "(Experimental)"; optional `scripts/` "Contains executable code that agents can run" |
| `claude-plugin` | `.claude-plugin/plugin.json` + `skills/` | [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference): "If you include a manifest, `name` is the only required field"; `version` "Setting this pins the plugin to that version string"; skills in `skills/` "with `<name>/SKILL.md` structure" |
| `marketplace` | `.claude-plugin/marketplace.json` | [code.claude.com/docs/en/plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces): required `name`, `owner`, `plugins`; each plugin a `name` and a `source`, optionally `version`, `strict` and `skills` ("Custom paths to skill directories containing `<name>/SKILL.md`") |
| `cursor` | `.cursor/rules/*.mdc` | [cursor.com/docs/context/rules](https://cursor.com/docs/context/rules): "Project rules live in `.cursor/rules` as `.mdc` files"; "A plain `.md` file in `.cursor/rules` is ignored by the rules system" |
| `windsurf` | `.windsurf/rules/*.md` (or `.devin/rules/*.md`) | [docs.devin.ai/desktop/cascade/memories](https://docs.devin.ai/desktop/cascade/memories) (where `docs.windsurf.com` now redirects): "One file per rule, each with its own activation mode. Limited to 12,000 characters per file"; `trigger` is `always_on`, `manual`, `model_decision` or `glob` |

**The collections, and the exact commands** (clone first, then import the clone):

| collection | layout to use | commands |
|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) — "Most skills in this repo are open source (Apache 2.0)", while `skills/docx`, `skills/pdf`, `skills/pptx`, `skills/xlsx` are "source-available, not open source" | `marketplace` (its `.claude-plugin/marketplace.json` lists the plugins) or `agentskills` (every skill) | `git clone https://github.com/anthropics/skills && agsc import --from skills --list skills` then `agsc import --from skills skills --dry-run` |
| a "garden" collection, e.g. [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills) (MIT; `skills/<name>/`, plus a marketplace file) | `marketplace` or `agentskills` | `agsc import --from skills --layout agentskills <clone>` |
| an "awesome" link list, e.g. [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — a README of links, no skill folders | none: `--list` counts its entries | `agsc import --from skills --list <clone>`, then clone the repository an entry points to and import that |
| a Claude Code plugin repository | `claude-plugin` | `agsc import --from skills --layout claude-plugin <clone>` |
| a Codex or `gh skill` project (`.agents/skills/<name>/SKILL.md`) | `agentskills` | `agsc import --from skills --layout agentskills <project>` |
| a repository's Cursor rules | `cursor` | `agsc import --from skills --layout cursor <repo>` |
| a repository's Windsurf rules | `windsurf` | `agsc import --from skills --layout windsurf <repo>` |

`--list` prints what each layout found would import — name, file, licence, version,
how many files are dropped, and whether it would arrive as a draft — and writes
nothing. With no `--layout` the import takes the first layout found, in the order
marketplace, plugin, Agent Skills, Cursor, Windsurf, and names the others.

**From a clone into a node.** A skill becomes a procedure: its `description` becomes
`when`, its body is kept as written, and it is marked `prov.origin: imported` with
your node's operator. The version recorded as `prov.source_version` is the one you
pass with `--source-version`, else the plugin's or marketplace's `version`, else the
skill's `metadata.version`. A Cursor or Windsurf rule becomes a concept of kind
`explainer` (a rule explains how to work; it has no steps), with its `globs`,
`alwaysApply` or `trigger` kept. The file it came from, the layout and the licence are
kept in `x-skills-source`, `x-skills-layout` and `x-skills-license`; any other
frontmatter is kept whole in `x-skills-rest`.

- **What is dropped, and why.** This format's skills are content only (no scripts, no
  executables, no links, no `allowed-tools`), so an import never brings executable
  content in: a skill's `allowed-tools`, everything under its `scripts/` and every
  file with an executable extension, and a plugin's `hooks/`, `.mcp.json`,
  `.lsp.json`, `bin/` and `scripts/` are dropped. Each is reported by file (code
  `AGSC-E407`, as a warning) and listed on the item in `x-skills-dropped`. A skill's
  other files (`references/`, `assets/`, a README) are not items: they are reported
  and listed too, and a body that links to one is told that the link will not
  resolve until the body is edited. A plugin's `commands/` and `agents/` are reported
  and not mapped. A plugin whose `source` is another repository is named and never
  fetched.
- **The licence check.** The licence is read from the skill's `license` key (an SPDX
  name such as `Apache-2.0`, or a sentence naming a bundled file such as
  `LICENSE.txt`, which is then read), else from a licence file beside the skill, else
  from the plugin, else from the collection's root licence. A skill whose licence is
  not a recognised open licence — or that has none — is imported with
  `status: draft` and a warning, so it is **never published** until a person has read
  the terms and changed the status. Anthropic's four document skills arrive this way.
  A recognised licence is carried and reported once: check it agrees with your
  node's `bundle.license_prose` before you publish.
- As with every import: nothing is written if an item already here would be
  overwritten (add `--replace` if you mean it), `--dry-run` shows the plan, a second
  import of the same clone changes nothing, and a record of a newer specification
  version is refused unless `--allow-newer`.

**From a node into a collection:**

```sh
agsc export --to skills                          # Agent Skills: dist/export/skills/agentskills/skills/<cluster>/SKILL.md
agsc export --to skills --layout claude-plugin   # + .claude-plugin/plugin.json
agsc export --to skills --layout marketplace     # + .claude-plugin/marketplace.json listing every pack
agsc export --to skills --layout cursor          # .cursor/rules/<cluster>.mdc
agsc export --to skills --layout windsurf        # .windsurf/rules/<cluster>.md
agsc export --to skills --layout marketplace --zip   # the same folder, plus one archive beside it
```

The packs are the ones `agsc skills` emits — one per cluster, published items only —
laid out for that tool: the frontmatter each tool reads (an Agent Skill's `name`,
`description`, `license` and a `metadata` map with the node, its content version and
the specification version), the provenance block, the quoted prose, and one
`<!-- agsc-item … -->` comment line per item so that importing the folder back loses
nothing. A Windsurf rule over its 12,000-character limit is still written and
reported: split the cluster, or use another layout.

## Route 7 — a live board to and from project and product management tools

A node's tasks (`kind: task` concepts with a `task_state`, filed in a cluster — the
live board) travel to and from the trackers people already use, **as files**. There is
no API client and no key: a person, or a CI job, moves the tool's export file into a
folder and the tool's import file out of `dist/export/board/`.

```sh
agsc import --from board --format jira ./from-jira --dry-run   # see the plan
agsc import --from board --format jira ./from-jira             # write the draft tasks
agsc export --to board --format trello                          # dist/export/board/trello/<board>.json
```

`--format` is one of `agsc-board`, `asana`, `github`, `gitlab`, `jira`, `linear`,
`markdown`, `notion`, `obsidian-kanban`, `todotxt`, `trello`.

**Getting the file out of each tool** (read at each tool's documentation on 2026-09-23
where a link is given):

| tool | export steps | the file the import reads | what our export writes |
|---|---|---|---|
| GitHub | `gh issue list --state all --json number,title,body,state,stateReason,labels,assignees,milestone,createdAt,updatedAt > issues.json`, or `gh api repos/<o>/<r>/issues?state=all`, or `gh project item-list <n> --owner <o> --format json` ([REST issues](https://docs.github.com/en/rest/issues/issues): "GitHub's REST API considers every pull request an issue" — pull requests are skipped and counted) | `*.json` | an array of issue objects (`title`, `body`, `labels`, `assignees`, `milestone`) — the fields of the create-issue call; create them with `gh issue create` or the API (the milestone must exist, by number) |
| GitLab | **Plan › Work items**, filter **Type = Issue**, **Actions › Export as CSV** (e-mailed) ([CSV export](https://docs.gitlab.com/user/project/issues/csv_export/)); or the REST `GET /projects/:id/issues` JSON | `*.csv`, `*.json` | the REST JSON shape; a non-open state becomes a `status::<state>` scoped label (GitLab boards are label lists) |
| Jira | issue search › **Export › Export Excel CSV (all fields)** | `*.csv` (both the "Issue" and the newer "Work item" column names) | a CSV for **System › External system import › CSV**: one `Labels` column per label ([CSV import](https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/): "entering each label in a separate column"), `Inward issue link (Blocks)`; set the wizard's date format to `yyyy-MM-dd` |
| Trello | board menu › **Print, Export, and Share** › **Export as JSON** ([export](https://support.atlassian.com/trello/docs/exporting-data-from-trello/): "All board members can export a board to raw JSON format"; CSV is Premium only) | `*.json` | a board JSON (lists = states). Trello has no JSON import of its own: use a Power-Up or the API to create the cards |
| Linear | open a project or view, click its name › **Export issues as CSV…** ([export](https://linear.app/docs/exporting-data)) | `*.csv` | a CSV with Linear's export columns, for Linear's CSV importer or a spreadsheet |
| Asana | project › **Export/Print › CSV** | `*.csv` | a CSV with Asana's export columns (`Section/Column` = state), for Asana's CSV importer |
| Notion | database page › **••• › Export › Markdown & CSV** ([export](https://www.notion.com/help/export-your-content): "Full page databases will be exports as a CSV file") | `*.csv` (the 32-character id Notion appends to the file name is dropped) | a CSV (`Name`, `Status`, `Type`, `Assignee`, `Tags`, `Due`, …) for **Merge with CSV** or a new import |
| Obsidian Kanban | the board **is** the Markdown file in the vault | `*.md` with `kanban-plugin` frontmatter | a board file: one lane per state, `@{date}` due dates, a `**Complete**` lane |
| Markdown task lists | any `.md` with `- [ ]` / `- [x]` lines | `*.md` (`# Title` = board, `## Heading` = state) | one `.md` per board, one `##` section per state |
| Todo.txt | the `todo.txt` file ([format](https://github.com/todotxt/todo.txt)) | `*.txt` (`+project` = board, `@context` = label, `due:`, `state:`) | one `.txt` per board, with `state:` for the states Todo.txt cannot say |
| another node (a peer) | download its `/boards/<cluster>.json` | `*.json` (a board index is named and skipped) | the same board-export shape; its tasks come in as read-only drafts whose `x-board-id` is the peer's task IRI, so a task here can be `blocked-by` the copy |

**How the states map** (one table for every tool; case, spaces, `-` and `_` are
ignored). Import: Backlog, Icebox, Triage → `UNSPECIFIED`; To Do, Todo, Open, New,
Ready, Not started, Planned, Reopened → `SUBMITTED`; In Progress, Doing, Started, In
Review, Review, Testing, Active → `WORKING`; Blocked, Waiting, On hold, Needs info,
Pending → `INPUT_REQUIRED`; Needs approval, Awaiting approval → `AUTH_REQUIRED`; Done,
Closed, Resolved, Complete, Shipped, Released, Fixed → `COMPLETED`; Failed →
`FAILED`; Canceled, Cancelled, Won't do, Won't fix, Duplicate, Not planned (GitHub's
`not_planned`), Obsolete → `CANCELED`; Rejected, Declined, Invalid → `REJECTED`
(each `TASK_STATE_…`). A ticked box or a completion date is `COMPLETED`; an open box
with no heading is `SUBMITTED`. Any other word is read as `TASK_STATE_UNSPECIFIED`
and reported — never guessed. Export writes Backlog, To Do (Linear: Todo), In
Progress, Input Required, Auth Required, Done, Failed, Canceled, Rejected — or the
tool's own word the task came in with, while it still names the same state.

**What an import keeps and what it decides.** Every foreign row becomes a draft
(`status: draft`): a tracker's export states no licence and may hold private work,
so nothing it holds is published until a person changes the status. Its board becomes
a draft cluster, unless your node already has a cluster of that name — then the tasks
join it and it is not touched. The tool's state word, assignee, due date, labels, id,
the links it could not resolve and every column the table does not name are kept in
`x-board-*` keys; blocking links become `blocked-by`. The assignee is not `claimed_by`:
that is derived from the merge history (who proposed the claim), never written.
E-mail addresses are cut to the part before the `@`, telephone numbers removed, and
the count reported (an item may carry neither). Collisions, `--dry-run`, `--replace`,
`--source-version` and `--allow-newer` work as in every import; a row carrying a
record from our own export comes back exactly, and one whose record names another
origin is read as foreign.

**What each tool loses on the way out** (the full item always survives in the
record our own import reads back):

| tool | lost for a reader of the tool |
|---|---|
| GitHub | only open/closed: Backlog, To Do, In Progress, Input and Auth Required all read as open; Failed and Rejected as closed "not planned"; decisions and specs become labels; `created_at` is set by GitHub on creation |
| GitLab | Canceled, Failed and Rejected all read as closed; other states travel as `status::` labels |
| Jira | states outside your workflow must be mapped in the import wizard; decisions need a `Decision` issue type or arrive as tasks |
| Trello | no import of its own; states are list names; no created date |
| Linear | states must exist in the team's workflow |
| Asana | states are section names; `blocked-by` travels as task ids of the same file |
| Notion | the body is one text property; the board is the database |
| Obsidian Kanban | the body is not written on the card (it stays in the record); no created or updated date |
| Markdown | as Obsidian Kanban |
| Todo.txt | the body; states beyond done/not done travel in a `state:` key only Todo.txt add-ons read |

**Moving the files in CI.** A scheduled job can run the tool's CLI, drop the file in a
folder and import it with `--dry-run` first; the plan then goes to review like any
proposal. For GitHub, one step does it: `gh issue list --state all --json … > board/issues.json`
followed by `agsc import --from board --format github board`. Nothing merges by
itself, and the import never publishes: every foreign row is a draft.

### Working a live board with agents

Agents and assistants work a board through the same seven tools, locally (`agsc mcp`)
or in the page — no new transport, no server of ours. Every write is a **prepared
Proposal**: the tool returns it, and a person (or a standing decision) merges it.

| to | call | what comes back |
|---|---|---|
| read the board | `/boards/index.json`, `/boards/<cluster>.json`; or `search`, `read` | the tasks, their states, `claimed_by` and `done` |
| claim a task | `propose({slug, task_state: "TASK_STATE_WORKING", at: "2026-09-23"})` | `{from, iri, markdown, patch, path, slug, task_state}` — the patch sets `task_state` and `modified` and nothing else |
| move or finish it | `propose({slug, task_state: "TASK_STATE_COMPLETED"})` | the same shape |
| open a new task | `remember({kind: "task", cluster: "<board>", title, body})` | a `kind: task` concept in `TASK_STATE_SUBMITTED`, filed on that board |
| comment on a task | `remember({kind: "lesson", about: "<task>", title, body})` | a lesson whose `related` names the task |

Apply the patch (`git apply`, a commit, a pull request to the node's `contribute`
target); the next build publishes the new state under `/boards/` and moves the
content version. When the caller declares one of the node's agent lanes (its
declared identity names an `agents[]` entry), the lane's gates run on the prepared
Proposal on the local tool server: a lane that is not enabled, or a task or type it
did not declare, is `AGSC-E509`; more new items than `max_new_items`, more claims
than `max_claims`, or a claim of a task another participant already holds in
`TASK_STATE_WORKING` is `AGSC-E511`. The first merged claim wins: a second claim
prepared against the old state no longer applies, and prepared again it is refused.
The page cannot see a node's lanes (they are configuration, never published), so a
page answers the same payload and the gates run at review.

Two nodes work one board when one is a clone of the other, or when a node's `peers[]`
names the other: each agent prepares against its own copy and the person merges into
the board's home.

**Never automatic:** no tool writes a file, merges, pushes, opens a pull request or
sends anything to another node; `claimed_by` is derived from history and never
written; a claim is not a merge.

## Which route for which framework

| framework | route | what to do |
|---|---|---|
| Claude Code | 1 + 2 + 3 | `examples/connectors/claude-code/connect.js`; add `agsc mcp` as in USING-WITH-ASSISTANTS.md |
| Codex CLI | 1 (+ 3) | `examples/connectors/codex/connect.js` |
| Cursor | 1 + 3 | `examples/connectors/cursor/connect.js` |
| GitHub Copilot, Gemini CLI, Kiro, Windsurf, Cline, Aider | 1 | the matching `--target`; mind the Windsurf and Aider notes |
| Cognee (and, through Cognee, what it imported from Mem0, Letta, LangMem, Zep/Graphiti) | 4 | `agsc export --to cogx`, then `cognee` reads the archive |
| LangGraph / LangChain | 4, or the chunk corpus | `examples/connectors/frameworks/records.js … langgraph`, then `store.put` |
| AutoGen | the chunk corpus | `records.js … autogen` gives `MemoryContent`-shaped records |
| CrewAI | 2 + the chunk corpus | skills for procedures; keep the item IRI in the text, because CrewAI rewrites memories it consolidates |
| OpenAI Agents SDK | 3, or the chunk corpus | attach `agsc mcp` as an MCP server; sessions hold conversation, not knowledge |
| GABBE kit (any coding agent it drives) | 5 (+ 1) | `agsc export --to gabbe`, copy the `agsc/` folders, append the CONTINUITY entries |
| a skills collection, a Claude Code plugin or marketplace, Cursor or Windsurf rules | 6 | clone it, `agsc import --from skills --list <clone>`, then import; `agsc export --to skills --layout <l>` the other way |
| GitHub, GitLab, Jira, Trello, Linear, Asana, Notion, Obsidian Kanban, Markdown task lists, Todo.txt | 7 | export the board from the tool, `agsc import --from board --format <tool> <dir>`; `agsc export --to board --format <tool>` the other way |

Files marked *illustrative* in `examples/connectors/frameworks/` are not run by any
test: they need the framework installed. The record shapes they read are produced by
`records.js`, which is tested.

## Checking a node in CI and before a commit

- **GitHub Actions:** `uses: andreibesleaga/agentic-system-core@<tag-or-commit-sha>`
  runs `agsc ci` with the engine at that ref. Give the job `contents: read` and check
  out with `fetch-depth: 0`. See the root `action.yml`.
- **pre-commit:** the hook `agsc-lint` from `.pre-commit-hooks.yaml` runs `agsc lint`
  when an item or `agsc.config.json` changed.

The README shows both snippets.

## Where a node can live

**In short:** a Bundle is a set of files and so is its build, so a node can be put
anywhere that serves a directory over HTTPS — a web host, a laptop, a small device, a
clone of its repository, IPFS behind a gateway, or a web interface in front of a
ledger. What the standard asks of the place is fixed; how a host is told is not. The
`agsc-host` command carries a *hosting profile* for each kind of place, and each
profile says plainly what that place cannot do.

**What every place must do.** Conformance is claimed for an HTTPS origin: the
discovery document and the routes of the route set are served there, by the host
itself or by something in front of it (the informative paragraph "Where a node can
live" in `spec/10-implementation-profiles.md`). The normative content is the header
set of AGSC-06-17, AGSC-11-03 and AGSC-11-05 and the redirect of AGSC-06-17 — never a
file format. `agsc build` writes that content as `_headers` and `_redirects`, the
files of the reference host; a writer targeting another host emits the equivalent
configuration for it and names the profile in its conformance claim (AGSC-06-01).

**The profiles.** Each is a plugin of the `deployment-profile` kind (AGSC-00-24): it
reads the build and writes host configuration beside it, and it never changes a route
or a served byte. `agsc-host list` prints every profile with its claim and its limits.

| profile | the command | what it writes | what it proves | what it cannot do |
|---|---|---|---|---|
| `cloudflare-pages` — the reference | `agsc build` | `_headers`, `_redirects` (already written by the build) | the header and redirect sets exactly as the rules state them | the host allows at most 100 header rules and 2,100 redirects per site |
| `static-host` — nginx or Apache httpd | `agsc-host emit static-host` | `dist/hosts/static-host/nginx.conf` (to `include` in a `server {}` block) and `www/.htaccess` | the test suite parses both files and checks, route by route, that each sends exactly the reference headers; both were also run against nginx 1.31.3 and Apache httpd 2.4.58, where the discovery checker passed at Level 2 | the server must terminate HTTPS or sit behind something that does; the nginx file is regenerated after every build; Apache needs mod_headers, mod_alias and `AllowOverride All` |
| `github-pages` | `agsc-host emit github-pages` | `www/.nojekyll`, and `dist/hosts/github-pages/headers.json` for the proxy in front | the header table equals the reference, route by route | GitHub Pages lets a site set no response header and no redirect, and serves the discovery document with a type derived from its (absent) extension: **no Level can be claimed for a bare Pages origin**; a proxy or CDN in front must set what `headers.json` lists |
| `local` — a laptop, a device, an appliance | `agsc-host serve` | nothing | over loopback, the discovery checker passes the served node at Level 2, and every route carries the reference headers, the built bytes and a SHA-256 entity tag | plain HTTP: fine on `http://localhost`, the development origin the configuration admits; any other origin needs a TLS terminator in front; read-only, one machine, no `Date` header |
| `git-clone` — the repository itself | `agsc build`, then `agsc-host serve` | nothing | the same as `local`, over a build of the clone; the ledger and content version come from the clone's own history | a forge's raw-file service is not a host: its URLs carry the owner, repository and ref before the path, so RFC 8615's well-known location is never at the top of an origin, and GitHub's raw service answers `text/plain` for every file |
| `ipfs` — through an HTTP gateway | `agsc-host emit ipfs` | `www/_redirects` in the IPFS web-redirects grammar (the alias, plus `/* /404.html 404`), and `dist/hosts/ipfs/manifest.json` with every file's size and SHA-256 | the redirects file carries the reference redirect; the manifest lets anyone check that a gateway serves the built bytes | a gateway sniffs content types and takes no publisher headers, so the discovery document's media type needs a web interface in front; redirects work only on a subdomain or DNSLink gateway; every build is a new CID |
| `ledger-anchor` | `agsc-host emit ledger-anchor`, and `agsc-host verify-anchor <anchor.json>` | `dist/hosts/ledger-anchor/anchor.json` (JCS-canonical) and `anchor.sha256` | the anchor holds the Bundle IRI, bundle hash, content version, ledger head, specification version, build instant and the discovery document's digest; `verify-anchor` tells whether a build is the anchored one (`AGSC-E210`, or `AGSC-E701` for the ledger head) | a ledger does not serve the node; recording the anchor (or `ots stamp anchor.json`) is the operator's own step, and nothing here reaches a chain |

**A Solid pod** holding a copy of the Bundle is a surface a node may *declare*
(AGSC-11-21), declaration-only at 1.0, so there is no host configuration to emit. A
Solid server answers CORS by echoing the request's `Origin` rather than with the `*`
AGSC-11-03 names, which is one more reason the pod is a copy and not the node's
origin.

**Your own profile.** Name a file or an installed package instead of a built-in name:
`agsc-host emit ./my-host.js`. It passes the same capability check as every plugin; a
specifier with a protocol is refused with `AGSC-E905` before anything is loaded. The
hook is `emit(input)`, where `input` holds the header sets, the redirects, every build
file with its size and SHA-256, and the discovery document's text; it answers
`{site, server, findings}` — lists of `{path, text}`. `site` files are written into
the build directory and may not replace a route (`AGSC-E004`); `server` files go under
`dist/hosts/<name>/` or `--out`; a path that is absolute, climbs with `..` or passes
through a link is `AGSC-E902`, and a run with an error writes nothing.
`examples/hosts/header-rules.js` is a complete one in under fifty lines.

**Saying where it lives.** AGSC-06-01 requires a claim to name the deployment
profile, so add it to the end of the conformance sentence of
[`CONFORMANCE-STATEMENTS.md`](CONFORMANCE-STATEMENTS.md): "… «passed» of «total»
passed. Deployment profile: «profile» — «its claim»." Each profile's claim text is
printed by `agsc-host emit` and `agsc-host list`.
