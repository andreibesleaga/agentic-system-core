# Agentic System Core

A specification for publishing machine-discoverable knowledge bundles — the Agentic Knowledge Web.

What this repository holds is the specification itself — numbered normative rules, three JSON Schemas, an OWL 2 RL ontology and a suite of conformance test vectors — together with the reference engine that implements it, its command line `agsc`, and the nine independent checkers of AGSC-09-90 — seven validators and two generators — that anyone can run against any distribution of the format (the repository also holds the maintainer's own tools, which do not ship).

## Status
**Released.** This tree states specification `1.0.0`. `spec/00-overview.md` is authoritative, and it is the file to read rather than this line. The packages — `agentic-system-core` and its short alias `agsc-cli` on npm, and `agentic-system-core` on PyPI — carry version `1.0.1` (see "Versions" below) and are published from the package tag; the name-reservation placeholders that preceded them shipped no runtime and are marked deprecated on npm and yanked on PyPI. Install with `npm install agentic-system-core`, or `pip install agentic-system-core`. The reference engine claims Level 3 ([its claim](docs/CONFORMANCE-STATEMENTS.md#the-reference-engines-claim)).

**Versions.** Two numbers, stated apart. The *specification version* (`spec_version`,
declared in `spec/00-overview.md`) names the rules, schemas, vocabulary and conformance
vectors; a Bundle declares it in `agsc.config.json`. The *package version* (`package.json`,
`agentic-system-core` and `agsc-cli` on npm, `agentic-system-core` on PyPI) names the
implementation; it moves alone for a patch that changes no rule and no emitted byte —
a dependency fix, a defect in a check — and a package-only release carries the package
tag `v<version>` and no specification tag. `agsc --version` prints the package version;
the conformance claim names both ("agentic-system-core 1.0.1 conforms to
AgenticSystemCore 1.0.0, Level 3"); the change log says for every release whether the
specification moved.

The specification's own site is [AgenticSystemCore.com](https://agenticsystemcore.com).

## In three sentences

A **Bundle** is a folder of Markdown files with a small block of typed fields at the
top of each; the specification says how that folder becomes a **knowledge node** — a
static website plus a graph, a search index, text files for agents and a discovery
document — with the same bytes from any implementation. People and agents read a node
through ordinary web addresses, change it only by proposals that a person ratifies, and
compose its items into a starting harness — files an architect or an agent runtime
starts from. Nodes find and cite each other with no server in between.

## What is different about it

To the author's knowledge, no other system combines discovery through already-registered web
mechanisms with an integrity digest on every artefact link of its discovery document, a typed graph with a
published ontology, machine artefacts whose bytes are fixed by expected-byte
conformance vectors, governance in which every change — human or agent — arrives as a
proposal carrying its provenance and a person ratifies it (directly, or by a standing
rule a person recorded in the node's configuration), and composition of the same files
into a starting harness, with no server required at any point.

This is a claim about the specification's text and its vectors, not a performance
claim. Other systems have some of these properties; the dated comparison is in
[docs/RELATED-WORK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/RELATED-WORK.md).

| Property | What it means | Where it is stated and proved |
|---|---|---|
| Discovery through registered mechanisms | one link set at a well-known address, found through the registered relation `describedby` | [AGSC-06-07](spec/06-surfaces.md), [AGSC-06-25](spec/06-surfaces.md); `tools/validate-wellknown` |
| A digest on every artefact link | at Level 2, each link of the discovery document to a file the node builds (the graph files, `llms.txt`, NOW, the skills and boards indexes, the ledger, the vocabulary files) carries the SHA-256 of that file; links to surfaces, the licence page, peers and contribution targets carry none | [AGSC-06-08](spec/06-surfaces.md); the `discovery` vectors |
| A typed graph with an ontology | fourteen typed links, four RDF views, a published OWL 2 RL vocabulary | [spec/05-graph.md](spec/05-graph.md), [ontology/agsc.ttl](ontology/agsc.ttl) |
| Bytes fixed by vectors | two implementations given one Bundle emit the same machine files | [AGSC-04-24](spec/04-canonicalization.md); [tests/vectors/](tests/vectors/README.md) |
| Governance with provenance | every change is a proposal with its provenance; a person ratifies; a ledger is derived from the history | [spec/08-governance.md](spec/08-governance.md) (AGSC-08-08, AGSC-08-20) |
| Composition into a harness | selected items close over their links and become seven kinds of file an architect or an agent runtime can start from | [AGSC-07-12](spec/07-composition.md); `agsc compose` |
| No server | a file format and static files; no protocol, server, database or reasoner is defined | [AGSC-00-02](spec/00-overview.md) |

Beside that combination, and each available elsewhere on its own: **six modes** of use
([docs/plain/modes.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md)); **seven tools on every item page and on `/compose/`** for a
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
- **A source of skills.** Each cluster becomes one skill pack holding its published
  items — the procedures are the part an agent follows — with a lockfile of their
  digests, installable into agent tool folders; skills from other repositories come
  in as procedures
  ([Mode 3](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case L4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#l4--procedures-as-installable-skills)).
- **A starting harness.** A selection of items becomes a harness — seven kinds of file
  an architect or a runtime can start from; it is not a running system, and no
  rendering for a particular runtime ships at 1.0 ([Mode 4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case M5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m5--a-selection-that-becomes-a-starting-harness)).
- **A live board for a team of agents.** Agents claim and finish tasks on shared boards
  until they are done; decisions stay with people
  ([Mode 5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case M1](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m1--the-live-board-one-person-and-three-agents)).
- **Knowledge across nodes.** A client reads several nodes' graph dumps and joins them
  locally, every foreign result marked with its origin; at 1.0 the walk is a library
  function of the engine, not a command
  ([Mode 1](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case D4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#d4--one-answer-from-three-corpora)).

**For people**

- **A wiki that corrects itself.** Markdown in, a checked and linked site out, with
  every change reviewed ([Mode 0](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case L5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#l5--a-folder-of-notes-becomes-a-node)).
- **A project's living specifications.** Decisions, specifications, tasks and gates
  as one governed memory, and steering files that keep a coding agent on course
  ([Mode 2](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case L3](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#l3--the-steering-file-that-keeps-a-coding-agent-on-course)).
- **A library of patterns.** Concepts with sources and provenance, readable without
  JavaScript, composable into a starting architecture
  ([Mode 4](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [docs/USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md)).
- **A team board.** A board from GitHub, GitLab, Jira, Trello, Linear, Asana, Notion,
  Obsidian, Todo.txt or plain Markdown becomes a live board and goes back again
  ([Mode 5](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [use case M7](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m7--a-teams-board-becomes-a-live-board)).

## Quick start

From a clone of this repository (Node 22.13 or later):

```bash
npm ci                                   # the exact pinned libraries
npm test                                 # the whole suite, offline
REPO=$PWD; cp -r tests/fixtures/minimal /tmp/agsc-try && cd /tmp/agsc-try
SOURCE_DATE_EPOCH=1767225600 node "$REPO/bin/agsc.js" ci   # lint, build twice, compare, verify: "ci: pass"
```

On a folder of your own Markdown notes (Node 22.13 or later, `git`, a POSIX shell):

```bash
npm install agentic-system-core                          # in a working folder
export PATH="$PWD/node_modules/.bin:$PATH"               # puts agsc on the PATH
cd my-notes && agsc init                                 # each note gets a header and moves to content/concepts/
mkdir -p .well-known && printf 'Contact: mailto:you@example.org\n' > .well-known/security.txt
git init -q && git add -A && git commit -q -m 'my notes' # the build takes its instant from this commit
agsc ci                                                  # ci: pass (warnings are advice, errors stop)
agsc build                                               # the site, the graph and the agent files in www/
```

Without the security contact `ci` stops with `AGSC-E901`; without a commit (or
`SOURCE_DATE_EPOCH`) it stops with `AGSC-E204`. The
[Mode 0 guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/mode-0.md)
walks through this with the lines each command prints, and five more
[guides](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/README.md)
do the same for the other modes. To connect an assistant, read
[docs/USING-WITH-ASSISTANTS.md](docs/USING-WITH-ASSISTANTS.md).
To teach a coding agent the engine itself, install the agent skill in
[skills/agentic-system-core/](https://github.com/andreibesleaga/agentic-system-core/blob/main/skills/README.md): `npx skills add andreibesleaga/agentic-system-core`,
or in Claude Code `claude plugin marketplace add andreibesleaga/agentic-system-core`
(the marketplace file `.claude-plugin/marketplace.json` points at the plugin in
[plugins/](https://github.com/andreibesleaga/agentic-system-core/blob/main/plugins/README.md)).

## Who it is for, what you get, try it

| Reader | What you get today | Try it |
|---|---|---|
| A person with a folder of notes | a static site of your notes with search, each page also as Markdown, a graph file and text files for assistants; no model, no server | the quick start above; the [Mode 0 guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/mode-0.md) |
| A developer | a local tool server: seven tools over your folder for an assistant; nothing leaves the machine | `agsc mcp`, set up as in [docs/USING-WITH-ASSISTANTS.md](docs/USING-WITH-ASSISTANTS.md); the [Mode 1 guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/mode-1.md) |
| A team running an agent-assisted development process | decisions, specifications, tasks and gates as checked files; one steering file with the same bytes for every coding assistant; a gate compiled to one required CI check | the [Mode 2 guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/mode-2.md); `agsc ci`, `agsc export --steer` |
| A team that keeps its procedures as skills | each procedure as an installable skill pack, checked against a lockfile and holding no scripts; skills collections and rule folders imported as procedures, and the packs exported back for five tools | the [Mode 3 guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/mode-3.md); `agsc skills install .claude/skills`; `agsc import --from skills --list <clone>` |
| An architect | a selection of items checked against their typed links and written as seven kinds of file (agent instructions, a C4 model, a diagram, an arc42 skeleton, decision records, skill files): a starting point, not a running system | the [Mode 4 guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/mode-4.md); `agsc compose <slug>… --zip`, or the `/compose/` page of [a live node](https://patterns.agenticsystemcore.com/compose/) |
| A team of people and agents on a live board | tasks as checked files, and every cluster that holds tasks published as a board; claims and moves as proposals through the tool server, merged by a person; board files to and from ten project tools and other nodes | the [Mode 5 guide](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/mode-5.md); `agsc import --from board --format jira <folder> --dry-run` |
| An engineer implementing or checking the format | test cases with expected bytes; checkers that judge any implementation's files; a second checker in Python | `agsc conform --level 3`; `node node_modules/agentic-system-core/tools/validate-wellknown https://agenticsystemcore.com/.well-known/knowledge-linkset --level 2`; [docs/IMPLEMENTERS-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/IMPLEMENTERS-GUIDE.md) |
| A security reviewer | a ledger re-derived from git history and checked offline; an anchor file that `agsc-host verify-anchor` checks against the build; `security.txt` checked by `ci`; untrusted prose fenced in every tool result; a security corpus with its scores | `agsc verify --ledger`; [docs/SECURITY-CONSIDERATIONS.md](docs/SECURITY-CONSIDERATIONS.md), [SECURITY.md](SECURITY.md); the [security reviewer's scenarios](https://github.com/andreibesleaga/agentic-system-core/blob/main/features/persona-m-security-reviewer.feature) |
| A researcher | a benchmark kit that runs offline with no model and no key; the graph as JSON-LD, Turtle and N-Quads, which hold the same statements; a citation file and a conformance report to cite | [docs/BENCHMARKS.md](docs/BENCHMARKS.md), [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md), [CITATION.cff](CITATION.cff); the [researcher's scenarios](https://github.com/andreibesleaga/agentic-system-core/blob/main/features/persona-n-researcher.feature) |
| A publisher whose content is gated | a node that says it exists while its content stays behind access control: the discovery document stays public, the bundle facts a public node shows are left out, and the checker accepts their absence | `"visibility": "restricted"` in `agsc.config.json` (AGSC-11-20 in [spec/11-boundary.md](spec/11-boundary.md)); the [restricted publisher's scenarios](https://github.com/andreibesleaga/agentic-system-core/blob/main/features/persona-o-restricted.feature) |
| A manager deciding whether to depend on it | what you can rely on (open licences, permanent addresses, archived releases, checks by published bytes) and what you cannot (one maintainer, no support promise, no schedule); the state of every outside step; the security policy | read [GOVERNANCE.md](GOVERNANCE.md), [SECURITY.md](SECURITY.md) and the [status page](https://agenticsystemcore.com/docs/status/); look at a live node: <https://patterns.agenticsystemcore.com/> |
| An agent or its operator reading a node | one discovery document that lists every machine file with its digest; text files, chunks and graph files at fixed addresses | `curl -s https://agenticsystemcore.com/.well-known/knowledge-linkset`, then the checker line above |

## Where to start reading

[docs/START-HERE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/START-HERE.md) sends each kind of reader — someone curious,
a person with notes, a developer, a team with coding assistants, an implementer in
another language, an architect, a manager, an agent, a standards reviewer or a
maintainer — down one path. Agents and coding assistants working in this
repository read [AGENTS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/AGENTS.md) first.

## Documentation map

The official repository is <https://github.com/andreibesleaga/agentic-system-core>; the site is <https://agenticsystemcore.com>.

| Topic | Read |
|---|---|
| The specification (the standard itself: 343 rule ids, 332 of them active, in twelve chapters) | [spec/](spec/) — start with [spec/00-overview.md](spec/00-overview.md); a plain-language edition is in [docs/plain/](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/) |
| How to read the specification | [docs/SPEC-ORIENTATION.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/SPEC-ORIENTATION.md), [docs/SPEC.md](docs/SPEC.md) |
| The protocol: discovery document, link set, digests, peers, tool surfaces | [docs/PROTOCOLS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PROTOCOLS.md), [spec/06-surfaces.md](spec/06-surfaces.md), [spec/11-boundary.md](spec/11-boundary.md) |
| The Internet-Draft (the well-known link set; an individual Internet-Draft) | [internet-draft/](https://github.com/andreibesleaga/agentic-system-core/blob/main/internet-draft/) |
| Schemas and vocabulary (JSON Schemas, OWL 2 RL ontology, JSON-LD context) | [schema/](schema/), [ontology/](ontology/) |
| Architecture | [docs/ARCHITECTURE-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-GUIDE.md), [docs/ARCHITECTURE-DDD.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-DDD.md), [docs/diagrams/](docs/diagrams/) |
| Standards it builds on and related work | [docs/RELATED-WORK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/RELATED-WORK.md), [docs/COMPLIANCE-CROSSWALK.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/COMPLIANCE-CROSSWALK.md) |
| Conformance: Levels, vectors, how to state a claim | [spec/09-conformance.md](spec/09-conformance.md), [spec/10-implementation-profiles.md](spec/10-implementation-profiles.md), [tests/vectors/](tests/vectors/), [docs/CONFORMANCE-STATEMENTS.md](docs/CONFORMANCE-STATEMENTS.md) |
| Implementing it in another language | [docs/IMPLEMENTERS-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/IMPLEMENTERS-GUIDE.md) |
| Using it: modes, guides, demos, connectors, assistants | [docs/plain/modes.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), [docs/guides/](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/guides/README.md), [docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md), [docs/CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md), [docs/USING-WITH-ASSISTANTS.md](docs/USING-WITH-ASSISTANTS.md) |
| Plugins and extension points | [docs/PLUGINS.md](docs/PLUGINS.md) |
| Security and threat model | [docs/SECURITY-CONSIDERATIONS.md](docs/SECURITY-CONSIDERATIONS.md), [SECURITY.md](SECURITY.md) |
| Engineering, testing, measurements | [docs/ENGINEERING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ENGINEERING.md), [docs/TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md), [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md), [docs/BENCHMARKS.md](docs/BENCHMARKS.md) |
| Requirements and use cases | [docs/PRD.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/PRD.md), [docs/USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md), [docs/REQUIREMENTS-MATRIX.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/REQUIREMENTS-MATRIX.md) |
| What comes next | [docs/ROADMAP.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ROADMAP.md) |
| Governance, trademark, contributing, licences | [GOVERNANCE.md](GOVERNANCE.md), [TRADEMARK-POLICY.md](TRADEMARK-POLICY.md), [CONTRIBUTING.md](CONTRIBUTING.md), [NOTICE](NOTICE) |
| Glossary and the full docs index | [docs/GLOSSARY.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/GLOSSARY.md), [docs/README.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/README.md) |

## Reference engine

The reference implementation of the specification lives in this repository,
under `src/`. It claims **Level 3**, the full engine. A claim of any Level exists
only after a green run of that Level's vector set and is published in the form of
AGSC-09-01 (AGSC-10-05); the engine's claim is kept in
[docs/CONFORMANCE-STATEMENTS.md](docs/CONFORMANCE-STATEMENTS.md#the-reference-engines-claim),
with what each part of it rests on, and reads:

> agentic-system-core 1.0.1 conforms to AgenticSystemCore 1.0.0, Level 3.
> Verified against the published conformance vectors on 2026-10-29: 243 of 243
> passed in the 20 populated areas (adopt, boards, boundary, build, bundle,
> chunks, cli, compose, conform, discovery, export, frontmatter, graph, import,
> jcs, ledger, links, lint, prov, slug), 242 required and 1 optional, the 7
> withdrawn cases excluded, with Unicode 17.0. Deployment profile:
> cloudflare-pages — the reference profile: `_headers` and `_redirects` as
> `agsc build` writes them. Surfaces: llms-txt (proved by disc-0013, disc-0014),
> chunks (proved by chk-0001, chk-0002, chk-0003, chk-0004, chk-0005, chk-0006,
> chk-0008), webmcp (proved by cli-0003).

All sixteen verbs of AGSC-09-07 are implemented; `run` and `trace` are off by
default, as AGSC-09-94 requires. `agsc init` adopts a folder of Markdown; before the first
build the publisher adds `.well-known/security.txt` with a `Contact:` line (RFC
9116) and commits once or sets `SOURCE_DATE_EPOCH`, as `init` says on its way out;
`agsc ci` checks, and `agsc build` writes the site.

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
  holds one minimal sample per kind; at 1.0 a command loads three of the kinds (a
  memory adapter, a composition emitter and a deployment profile), and the other
  five samples are proved by the plugin-contract test only.

The engine's arrangement is one implementation choice, not part of the format.
Where this engine and the specification disagree, the specification wins.

**What the package promises to keep within 1.x.** The command line — the
commands `agsc`, `agsc-host` and `agentic-system-core`, their verbs, flags, exit
codes and output envelopes (AGSC-09-07 to AGSC-09-12) — the plugin contract of
`docs/PLUGINS.md` (plugin API `1.0.0`), the nine checkers run as programs
(`node tools/<name>`), and the six names `require('agentic-system-core')` returns:
`LINK_RELATION`, `PROFILE_URI`, `WELLKNOWN_SUFFIX`, `run`, `specVersion` and
`version`. `package.json` declares no `exports` map, so every file under `src/`,
`bin/` and `tools/` can still be required; none of them is part of the promise,
and their names and signatures may change in any release. The one exception is
`run()` of `bin/agsc.js`, the entry the `agsc-cli` alias package calls.

**Upgrading from a release candidate.** `CHANGELOG.md` has one section for each
step: [Upgrading from 1.0.0-rc.7](CHANGELOG.md#upgrading-from-100-rc7), under
`1.0.0`, and [Upgrading from 1.0.0-rc.6](CHANGELOG.md#upgrading-from-100-rc6), under
`1.0.0-rc.7`. Each says what a node built with the earlier version may now see
refused, what changes in the built files, and what to do. A node still on
`1.0.0-rc.6` reads the second section first, then the first.

## Connecting agents and repositories

`docs/CONNECTORS.md` says, route by route, how an agent or a framework uses a
published Bundle — steering files, skill packs, the MCP server, and the COGX
memory archive (`agsc export --to cogx` / `agsc import --from cogx`), the format Cognee
reads and writes and into which it translates Mem0, LangMem, Letta and Zep memories
when they are migrated into Cognee. `examples/connectors/` holds the
working examples, and `docs/USE-CASES.md` walks through twenty-one concrete scenarios
with their commands.

**Check a Bundle on every push (GitHub Actions).** `action.yml` at the root of this
repository is a composite action that runs `agsc ci` with the engine at the same
commit as the action, so the ref you write pins the engine version. Pin it to the
package tag, `v1.0.1` (not a specification tag: a package may be patched while the specification stays at `1.0.0`), or to that tag's full commit
SHA, give the job read access only, and fetch the history the ledger reads:

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
      - uses: andreibesleaga/agentic-system-core@v1.0.1
```

**Lint before every commit (pre-commit).** `.pre-commit-hooks.yaml` offers one hook,
`agsc-lint`, which runs `agsc lint` over the whole Bundle whenever an item or the
configuration changed. Pin `rev` the same way, to the package tag or its full commit
SHA. The hook runs under the system Node, which must be Node 22.13 or later; where the
system Node is older, set `language_version` for the hook to a newer version:

```yaml
repos:
  - repo: https://github.com/andreibesleaga/agentic-system-core
    rev: v1.0.1
    hooks:
      - id: agsc-lint
```

## How this is made

This work is written and maintained by Andrei N. Besleaga with the help of AI
assistants. A person decides what is written, an assistant drafts and checks it, and a
person reads, edits and approves everything that is published and answers for it. Every
published item records how its text was made and names the person accountable for it.
Written with AI assistance, reviewed and published by a person.
The assistance covered text, code, figures and diagrams alike. The engine itself calls no
AI model and contains no model adapter. The model steps the specification describes are
optional: a live run is made by an agent outside the engine — Claude Code, a script — as a
client of `agsc mcp` or the page tools, under the lane's declared limits (AGSC-08-28), and
it is the responsibility of the person who runs that agent. What an assistant or agent writes from this
work is its own output, not a statement by the author.

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
| The agent skill under `skills/` and `plugins/`, and the plugin marketplace files under `.claude-plugin/` | CC0-1.0 |
| The specification text under `spec/` | Apache-2.0 |
| The conformance vectors under `tests/vectors/` | Apache-2.0 |
| The documentation under `docs/`, the scenarios under `features/` and the examples under `examples/` | Apache-2.0 |
| The W3C-format personal draft under `w3c/` | CC-BY-4.0 |
| The Internet-Draft under `internet-draft/` | Apache-2.0; as a posted Internet-Draft also under BCP 78 and the IETF Trust Legal Provisions |
| The prose of a published node — item bodies, descriptions and the pages and exports that carry them | the Content Use Terms in `LICENSE-CONTENT` |

The text of each licence above is in `LICENSES/`, and `REUSE.toml` assigns each licence to its
paths (the REUSE layout; `docs/ENGINEERING.md` §7).

Outside contributions are signed off under the agreement in `CONTRIBUTOR-AGREEMENT`, which
the token `CA-v1` names; `CONTRIBUTING.md` says what that means in plain words.
`GOVERNANCE.md` says who decides and what happens if the maintainer stops,
`TRADEMARK-POLICY.md` how the project's name may be used,
`docs/CONFORMANCE-STATEMENTS.md` how to say that an implementation conforms,
`CODE_OF_CONDUCT.md` how people are expected to behave, and `SECURITY.md` how to
report a vulnerability privately.

© 2026 Andrei N. Besleaga. Code: Apache-2.0. Schemas, ontology, identifiers and the
discovery document: CC0-1.0. Prose: the Content Use Terms in `LICENSE-CONTENT`.
