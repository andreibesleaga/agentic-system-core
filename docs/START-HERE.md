# Start here

**Summary.** This repository holds the AgenticSystemCore specification — rules for
turning a folder of Markdown files into a knowledge node that people and agents can
find, verify, cite and build on — together with the reference engine, its command line
and the checkers. Different readers need different doors. Find yourself in the list
below and follow that path; every step is one document, in the order given.

**Who this is for:** everyone, on the first visit. **Read after:** the root
[README.md](../README.md), which says in a screen what the project is and what is
different about it.

---

## Who it is for, what you get, try it

| Reader | What you get today | Try it |
|---|---|---|
| A person with a folder of notes | a static site of your notes with search, each page also as Markdown, a graph file and text files for assistants; no model, no server | [guides/mode-0.md](guides/mode-0.md) |
| A developer | a local tool server: seven tools over your folder for an assistant; nothing leaves the machine | [guides/mode-1.md](guides/mode-1.md); [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md) |
| A team running an agent-assisted development process | decisions, specifications, tasks and gates as checked files; one steering file with the same bytes for every coding assistant; a gate compiled to one required CI check | [guides/mode-2.md](guides/mode-2.md) |
| A team that keeps its procedures as skills | each procedure as an installable skill pack, checked against a lockfile and holding no scripts; skills collections and rule folders imported as procedures, and the packs exported back for five tools | [guides/mode-3.md](guides/mode-3.md); `agsc import --from skills --list <clone>`; [USE-CASES.md](USE-CASES.md), L4 and L7 |
| An architect | a selection of items checked against their typed links and written as seven kinds of file: a starting point, not a running system | [guides/mode-4.md](guides/mode-4.md); the `/compose/` page of [a live node](https://patterns.agenticsystemcore.com/compose/) |
| A team of people and agents on a live board | tasks as checked files, and every cluster that holds tasks published as a board; claims and moves as proposals through the tool server, merged by a person; board files to and from eleven project tools | [guides/mode-5.md](guides/mode-5.md); [USE-CASES.md](USE-CASES.md), M7 and M8 |
| An engineer implementing or checking the format | test cases with expected bytes; checkers that judge any implementation's files; a second checker in Python | `agsc conform --level 3`; [IMPLEMENTERS-GUIDE.md](IMPLEMENTERS-GUIDE.md) |
| A security reviewer | a ledger re-derived from git history and checked offline; an anchor file that `agsc-host verify-anchor` checks against the build; `security.txt` checked by `ci`; untrusted prose fenced in every tool result; a security corpus with its scores | `agsc verify --ledger`; [SECURITY-CONSIDERATIONS.md](SECURITY-CONSIDERATIONS.md), [SECURITY.md](../SECURITY.md); the [security reviewer's scenarios](https://github.com/andreibesleaga/agentic-system-core/blob/main/features/persona-m-security-reviewer.feature) |
| A researcher | a benchmark kit that runs offline with no model and no key; the graph as JSON-LD, Turtle and N-Quads, which hold the same statements; a citation file and a conformance report to cite | [BENCHMARKS.md](BENCHMARKS.md), [MEASUREMENTS.md](MEASUREMENTS.md), [CITATION.cff](../CITATION.cff); the [researcher's scenarios](https://github.com/andreibesleaga/agentic-system-core/blob/main/features/persona-n-researcher.feature) |
| A publisher whose content is gated | a node that says it exists while its content stays behind access control: the discovery document stays public, the bundle facts a public node shows are left out, and the checker accepts their absence | `"visibility": "restricted"` in `agsc.config.json` (AGSC-11-20 in [spec/11-boundary.md](../spec/11-boundary.md)); the [restricted publisher's scenarios](https://github.com/andreibesleaga/agentic-system-core/blob/main/features/persona-o-restricted.feature) |
| A manager deciding whether to depend on it | what you can rely on (open licences, permanent addresses, archived releases, checks by published bytes) and what you cannot (one maintainer, no support promise, no schedule) | [GOVERNANCE.md](../GOVERNANCE.md), [SECURITY.md](../SECURITY.md), the [status page](https://agenticsystemcore.com/docs/status/) |
| An agent or its operator reading a node | one discovery document that lists every machine file with its digest; text files, chunks and graph files at fixed addresses | `curl -s https://agenticsystemcore.com/.well-known/knowledge-linkset` |

The paths below say what to read, in order, for each of these readers and a few more.

## Someone curious — "what is this, and why would I care?"

1. [AgenticSystemCore.com](https://agenticsystemcore.com) — the project's own site, a
   node of itself: the guide, the six modes and the specification pages, readable
   without JavaScript.
2. [plain/modes.md](plain/modes.md) — the six ways of using one Bundle, in plain words.
3. [DEMOS.md](DEMOS.md) — every mode and every persona as a demo you can run in five
   minutes from an empty folder, with the lines it prints.
4. [USE-CASES.md](USE-CASES.md) — twenty-one concrete scenarios: who, what goes where,
   which command.
5. [plain/README.md](plain/README.md) — each chapter of the specification in a few
   paragraphs.

## A person with a folder of notes — "I want a site out of my notes"

1. [guides/mode-0.md](guides/mode-0.md) — install, adopt the notes, check, build, change
   a note as a proposal, publish; every command with the lines it prints.
2. [guides/README.md](guides/README.md) — the five other modes, one short guide each.
3. [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md) — let an assistant read and cite
   the notes.

## A developer — "I want to run it, read the code or change it"

1. The root [README.md](../README.md), "Quick start" — install, run the tests, build the
   reference fixture.
2. [ARCHITECTURE-GUIDE.md](ARCHITECTURE-GUIDE.md) — the system in pictures.
3. [CODE-ORIENTATION.md](CODE-ORIENTATION.md) — a guided walk through the repository,
   the twenty-two files that matter most, and where to start for each kind of task.
4. [src/README.md](../src/README.md) — the module map, the verb-to-module table, the
   libraries.
5. [TESTING.md](TESTING.md) — the test levels, how to run each, what a green run means.
6. [CONTRIBUTING.md](../CONTRIBUTING.md) — how a change gets in.

## A team with coding assistants — "our decisions, specifications and tasks, kept in one checked place"

1. [guides/mode-2.md](guides/mode-2.md) — decision, specification, task and gate files;
   a board; the forge files of a gate; one steering file for every assistant.
2. [guides/mode-3.md](guides/mode-3.md) and [guides/mode-5.md](guides/mode-5.md) — the
   team's procedures as skills, and a board that agents and people share.
3. [CONNECTORS.md](CONNECTORS.md) — every route from the files into an assistant.

## An implementer in another language — "I want my own implementation to conform"

1. [SPEC-ORIENTATION.md](SPEC-ORIENTATION.md) — how the twelve chapters fit and how a
   rule is written.
2. [IMPLEMENTERS-GUIDE.md](IMPLEMENTERS-GUIDE.md) — the reading order, the byte-level
   pitfalls, a ten-step path to a Level-0 node, the platform table, running the vectors.
3. [tests/vectors/README.md](../tests/vectors/README.md) — the vector file format.
4. [tools/README.md](../tools/README.md) — the nine standalone checkers you can run
   against your own output.
5. [CONFORMANCE-STATEMENTS.md](CONFORMANCE-STATEMENTS.md) — how to say that your
   implementation conforms.

## An architect — "how does it fit together, and what does it guarantee?"

1. [ARCHITECTURE-GUIDE.md](ARCHITECTURE-GUIDE.md) — nodes, the five bounded contexts,
   the build, the page tools, the conformance chain, the release, where a node can live.
2. [plain/modes.md](plain/modes.md) — the six modes, including the live board.
3. [spec/07-composition.md](../spec/07-composition.md) — how selected items become a
   Harness: seven kinds of file an architect or a runtime starts from; and
   [guides/mode-4.md](guides/mode-4.md) to try it.
4. [spec/11-boundary.md](../spec/11-boundary.md) — the boundary chapter: federation,
   visibility, the agent surfaces and their plugin contract.
5. [SECURITY-CONSIDERATIONS.md](SECURITY-CONSIDERATIONS.md) — threats, the rules that
   close them, and what stays open.
6. [ARCHITECTURE-DDD.md](ARCHITECTURE-DDD.md) and [PLAN.md](PLAN.md) — the domain model
   and the architecture decisions.

## A manager — "can we depend on this?"

1. [GOVERNANCE.md](../GOVERNANCE.md), "Who stands behind this" — one maintainer, open
   licences, what happens if the maintainer stops; no support promise and no schedule.
2. [SECURITY.md](../SECURITY.md) — how to report a vulnerability, and which versions are
   looked after.
3. [The status page](https://agenticsystemcore.com/docs/status/) — what is live and the
   state of every outside step.
4. A live node, to look at rather than read about: <https://patterns.agenticsystemcore.com/>.

## An agent or a coding assistant — "I have been asked to work here, or to use a node"

1. [AGENTS.md](../AGENTS.md) — what this repository is, how to check your work, what you
   may and may not change, where everything is.
2. [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md) — `agsc mcp`: seven tools over a
   Bundle.
3. [CONNECTORS.md](CONNECTORS.md) — every route into a node: steering files, skill
   packs, the tool server, memory archives, the page tools.
4. On a published node: `/.well-known/knowledge-linkset` (the discovery document),
   `/llms.txt`, `/chunks.jsonl` and the graph dumps.

## A standards reviewer — "what exactly is specified, and what is requested?"

1. [spec/00-overview.md](../spec/00-overview.md) — scope, terms, versions, conformance
   classes.
2. [SPEC.md](SPEC.md) — the index of the specification and its standards register.
3. [PROTOCOLS.md](PROTOCOLS.md) — every outside standard the system uses, why, and in
   which rules.
4. [internet-draft/README.md](../internet-draft/README.md) — the Internet-Draft that
   asks for the well-known name (not registered; no request has been sent to the
   registry) and records the profile identifier, which is registered in the IANA
   Profile URIs registry.
5. [w3id/README.md](../w3id/README.md) and [w3c/README.md](../w3c/README.md) — the
   persistent identifiers and the community-group material.
6. [RELATED-WORK.md](RELATED-WORK.md) — the dated comparison with other systems.

## A maintainer — "I look after this repository"

1. [CONTRIBUTING.md](../CONTRIBUTING.md), [GOVERNANCE.md](../GOVERNANCE.md),
   [SECURITY.md](../SECURITY.md).
2. [.github/workflows/README.md](../.github/workflows/README.md) — the test lane and the
   release lane.
3. [tools/README.md](../tools/README.md) — the maintainer tools: `rule-coverage`,
   `public-hygiene`, `release`, `gen-glossary`, `publish-set`, `lint-claims`.
4. [CHANGELOG.md](../CHANGELOG.md) — what changed, release by release.
5. [MEASUREMENTS.md](MEASUREMENTS.md) — the measured numbers and the commands that
   reproduce them.

---

Everything under `docs/` explains; nothing here is normative. Where a page disagrees
with a rule in `spec/`, the rule wins.
