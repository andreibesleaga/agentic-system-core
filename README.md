# Agentic System Core

A specification for publishing machine-discoverable knowledge bundles — the Agentic Knowledge Web.

What this repository holds is the specification itself — numbered normative rules, three JSON Schemas, an OWL 2 RL ontology and a suite of conformance test vectors — together with the reference engine that implements it, its command line `agsc`, and the nine independent checkers of AGSC-09-90 — seven validators and two generators — that anyone can run against any distribution of the format (the repository also holds the maintainer's own tools, which do not ship).

## Status
**Release candidate.** This tree states specification `1.0.0-rc.6`, drafted on 2026-09-22 and not yet tagged; the latest tag is `1.0.0-rc.5`. `spec/00-overview.md` is authoritative, and it is the file to read rather than this line. The packages — `agentic-system-core` and its short alias `agsc-cli` on npm, and `agentic-system-core` on PyPI — carry version `1.0.0-rc.6` in this tree and are published from the release tag. The earlier 0.0.x releases only reserved the names, shipped no runtime, and are marked deprecated on npm and yanked on PyPI. Once `1.0.0-rc.6` is published: `npm install agentic-system-core`, or `pip install --pre agentic-system-core` (pip installs a release candidate only when asked with `--pre`).

The specification's own site is [AgenticSystemCore.com](https://agenticsystemcore.com).

## In three sentences

A **Bundle** is a folder of Markdown files with a small block of typed fields at the
top of each; the specification says how that folder becomes a **knowledge node** — a
static website plus a graph, a search index, text files for agents and a discovery
document — with the same bytes from any implementation. People and agents read a node
through ordinary web addresses, change it only by proposals that a person ratifies, and
compose its items into files a runtime can execute. Nodes find and cite each other with
no server in between.

## What is different about it

To our knowledge, no other system combines discovery through already-registered web
mechanisms with an integrity digest on every artefact it names, a typed graph with a
published ontology, machine artefacts whose bytes are fixed by expected-byte
conformance vectors, governance in which every change — human or agent — arrives as a
proposal carrying its provenance and a person ratifies it (directly, or by a standing
rule a person recorded in the node's configuration), and composition of the same files
into a runnable harness, with no server required at any point.

This is a claim about the specification's text and its vectors, not a performance
claim. Other systems have some of these properties; the dated comparison is in
[docs/RELATED-WORK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/RELATED-WORK.md).

| Property | What it means | Where it is stated and proved |
|---|---|---|
| Discovery through registered mechanisms | one link set at a well-known address, found through the registered relation `describedby` | [AGSC-06-07](spec/06-surfaces.md), [AGSC-06-25](spec/06-surfaces.md); `tools/validate-wellknown` |
| A digest on every artefact | each file the discovery document names carries its SHA-256 digest | [AGSC-06-08](spec/06-surfaces.md); the `discovery` vectors |
| A typed graph with an ontology | fourteen typed links, four RDF views, a published OWL 2 RL vocabulary | [spec/05-graph.md](spec/05-graph.md), [ontology/agsc.ttl](ontology/agsc.ttl) |
| Bytes fixed by vectors | two implementations given one Bundle emit the same machine files | [AGSC-04-24](spec/04-canonicalization.md); [tests/vectors/](tests/vectors/README.md) |
| Governance with provenance | every change is a proposal with its provenance; a person ratifies; a ledger is derived from the history | [spec/08-governance.md](spec/08-governance.md) (AGSC-08-08, AGSC-08-20) |
| Composition into a harness | selected items close over their links and become seven files a runtime can execute | [AGSC-07-12](spec/07-composition.md); `agsc compose` |
| No server | a file format and static files; no protocol, server, database or reasoner is defined | [AGSC-00-02](spec/00-overview.md) |

Beside that combination, and each available elsewhere on its own: **six modes** of use
([docs/plain/modes.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md)); **seven tools on every page** for a
browser's own agent, identical to the local tool server ([AGSC-09-16](spec/09-conformance.md));
**eight plugin kinds** with a forward-compatibility promise ([docs/PLUGINS.md](docs/PLUGINS.md),
[AGSC-00-24](spec/00-overview.md)); a **content version** stamped on every surface
([AGSC-04-25](spec/04-canonicalization.md)); and **federation** walked by the client,
never by a node ([AGSC-11-06](spec/11-boundary.md)).

## What it is best for

**For agents**

- **Memory for one agent.** `agsc mcp` in a Bundle gives an assistant seven tools to
  search, read, follow links and cite items by address; nothing leaves the machine
  ([Mode 1](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case L1](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#l1--the-assistant-that-answers-from-one-folder)).
- **Shared memory for many agents.** Every agent reads the same published files and
  writes only by proposals a person ratifies
  ([Mode 1](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [docs/CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md)).
- **A source of skills.** Procedures become skill packs, with a lockfile of their
  digests, that install into agent tool folders; skills from other repositories come
  in as procedures
  ([Mode 3](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case L4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#l4--procedures-as-installable-skills)).
- **Runnable procedures.** A selection of items becomes a harness of seven files a
  runtime can execute ([Mode 4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case M5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m5--a-selection-that-becomes-a-running-system)).
- **A live board for a team of agents.** Agents claim and finish tasks on shared boards
  until they are done; decisions stay with people
  ([Mode 5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case M1](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m1--the-live-board-one-person-and-three-agents)).
- **Knowledge across nodes.** A client reads several nodes' graph dumps and joins them
  locally, every foreign result marked with its origin
  ([Mode 1](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case D4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#d4--one-answer-from-three-corpora)).

**For people**

- **A wiki that corrects itself.** Markdown in, a checked and linked site out, with
  every change reviewed ([Mode 0](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case L5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#l5--a-folder-of-notes-becomes-a-node)).
- **A project's living specifications.** Decisions, specifications, tasks and gates
  as one governed memory, and steering files that keep a coding agent on course
  ([Mode 2](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case L3](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#l3--the-steering-file-that-keeps-a-coding-agent-on-course)).
- **A pattern catalogue.** Concepts with sources and provenance, readable without
  JavaScript, composable into a starting architecture
  ([Mode 4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [docs/USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md)).
- **A team board.** A board from GitHub, GitLab, Jira, Trello, Linear, Asana, Notion,
  Obsidian or plain Markdown becomes a live board and goes back again
  ([Mode 5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case M7](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m7--a-teams-board-becomes-a-live-board)).

## Quick start

From a clone of this repository (Node 22.13 or later):

```bash
npm ci                                   # the exact pinned libraries
npm test                                 # the whole suite, offline
REPO=$PWD; cp -r tests/fixtures/minimal /tmp/agsc-try && cd /tmp/agsc-try
SOURCE_DATE_EPOCH=1767225600 node "$REPO/bin/agsc.js" ci   # lint, build twice, compare, verify: "ci: pass"
```

On a folder of your own Markdown notes, once the package is installed
(`npm install agentic-system-core`): run `agsc init` in the folder, add
`.well-known/security.txt` with a `Contact:` line, and run `agsc ci`. Then read
[docs/USING-WITH-ASSISTANTS.md](docs/USING-WITH-ASSISTANTS.md) to connect an assistant.

## Where to start reading

[docs/START-HERE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/START-HERE.md) sends each kind of reader — someone curious,
a developer, an implementer in another language, an architect, an agent, a standards
reviewer or a maintainer — down one path. Agents and coding assistants working in this
repository read [AGENTS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/AGENTS.md) first.

## Reference engine

The reference implementation of the specification lives in this repository,
under `src/`. It **claims no conformance Level** yet: AGSC-10-05 says a claim
exists only after a green run of the Level's vector set at 1.0.0. All sixteen
verbs of AGSC-09-07 are implemented; `run` and `trace` are off by default, as
AGSC-09-94 requires. `agsc init` adopts a folder of Markdown; before the first
build the publisher adds `.well-known/security.txt` with a `Contact:` line (RFC
9116) and commits once or sets `SOURCE_DATE_EPOCH`, as `init` says on its way out.

* `src/README.md` is the engine's own documentation — the bounded contexts, the
  module map, the verb → module table, how to run the conformance vectors, and
  the list of specification items this work found and reported rather than
  worked around.
* `tests/vectors/**` is the acceptance test, and it is the part that matters to
  anyone implementing this format in another language: a port needs `spec/`,
  `schema/`, `ontology/` and those vectors, and nothing from `src/`.
* `npm test` runs the whole suite, and the conformance runner prints one summary
  line.
* `docs/PLUGINS.md` is the plugin contract: the eight kinds this format admits
  (AGSC-00-24), what a plugin of each may read, emit and never do, how the engine
  finds one, and what is promised not to break within 1.x. `examples/plugins/`
  holds one minimal, working sample per kind.

The engine's arrangement is one implementation choice, not part of the format.
Where this engine and the specification disagree, the specification wins.

## Connecting agents and repositories

`docs/CONNECTORS.md` says, route by route, how an agent or a framework uses a
published Bundle — steering files, skill packs, the MCP server, and the COGX
memory archive (`agsc export --to cogx` / `agsc import --from cogx`), the format Cognee
reads and writes and into which it translates Mem0, LangMem, Letta and Zep memories
when they are migrated into Cognee. `examples/connectors/` holds the
working examples, and `docs/USE-CASES.md` walks through nineteen concrete scenarios
with their commands.

**Check a Bundle on every push (GitHub Actions).** `action.yml` at the root of this
repository is a composite action that runs `agsc ci` with the engine at the same
commit as the action, so the ref you write pins the engine version. Pin it to a
release tag or a full commit SHA, give the job read access only, and fetch the
history the ledger reads:

```yaml
permissions:
  contents: read
jobs:
  agsc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<commit-sha>
        with:
          fetch-depth: 0
      - uses: andreibesleaga/agentic-system-core@<tag-or-commit-sha>
```

**Lint before every commit (pre-commit).** `.pre-commit-hooks.yaml` offers one hook,
`agsc-lint`, which runs `agsc lint` over the whole Bundle whenever an item or the
configuration changed:

```yaml
repos:
  - repo: https://github.com/andreibesleaga/agentic-system-core
    rev: <tag-or-commit-sha>
    hooks:
      - id: agsc-lint
```

## How this is made

This work is written and maintained by Andrei N. Besleaga with the help of AI
assistants. A person decides what is written, an assistant drafts and checks it, and a
person reads, edits and approves everything that is published and answers for it. Every
published item records how its text was made and names the person accountable for it.
Written with AI assistance, reviewed and published by a person.

## What this does not claim

This is the independent work of one person, published as it is, with no warranty of any
kind and no liability for anything that follows from using it. Nothing in it is legal or
professional advice. No standards body, foundation, company or institution named in this
repository has reviewed, approved or is connected with this work, and it is not a document
of the IETF, of the W3C or of any other body. Other product and organisation names are the
marks of their owners and are used only to say what is being talked about.
Every right not expressly granted by the licences is reserved, and nothing here promises
that the work or its addresses will stay available.

## Notice

AgenticSystemCore™ is a trademark of Andrei N. Besleaga. Other names belong to their owners.

## Licences

| What | Licence |
|---|---|
| The engine, the command line and the checkers | Apache-2.0 (`LICENSE`) |
| The JSON Schemas, the ontology, the identifiers and the discovery document | CC0-1.0 |
| The specification text under `spec/` | Apache-2.0 |
| The conformance vectors under `tests/vectors/` | Apache-2.0 |
| The prose of a published node — item bodies, descriptions and the pages and exports that carry them | the Content Use Terms in `LICENSE-CONTENT` |

Contributions are signed off under the agreement in `CONTRIBUTOR-AGREEMENT`, which the
token `CA-v1` names; `CONTRIBUTING.md` says what that means in plain words.
`GOVERNANCE.md` says who decides and what happens if the maintainer stops,
`TRADEMARK-POLICY.md` how the project's name may be used,
`docs/CONFORMANCE-STATEMENTS.md` how to say that an implementation conforms,
`CODE_OF_CONDUCT.md` how people are expected to behave, and `SECURITY.md` how to
report a vulnerability privately.

© 2026 Andrei N. Besleaga. Code: Apache-2.0. Schemas, ontology, identifiers and the
discovery document: CC0-1.0. Prose: the Content Use Terms in `LICENSE-CONTENT`.
