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

## Someone curious — "what is this, and why would I care?"

1. [AgenticSystemCore.com](https://agenticsystemcore.com) — the project's own site, a
   node of itself: the guide, the six modes and the specification pages, readable
   without JavaScript.
2. [plain/modes.md](plain/modes.md) — the six ways of using one Bundle, in plain words.
3. [DEMOS.md](DEMOS.md) — every mode and every persona as a demo you can run in five
   minutes from an empty folder, with the lines it prints.
4. [USE-CASES.md](USE-CASES.md) — nineteen concrete scenarios: who, what goes where,
   which command.
5. [plain/README.md](plain/README.md) — each chapter of the specification in a few
   paragraphs.

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
   Harness of seven files a runtime can execute.
4. [spec/11-boundary.md](../spec/11-boundary.md) — the boundary chapter: federation,
   visibility, the agent surfaces and their plugin contract.
5. [SECURITY-CONSIDERATIONS.md](SECURITY-CONSIDERATIONS.md) — threats, the rules that
   close them, and what stays open.
6. [ARCHITECTURE-DDD.md](ARCHITECTURE-DDD.md) and [PLAN.md](PLAN.md) — the domain model
   and the architecture decisions.

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
   requests the well-known name and the profile identifier (registration to be
   requested; nothing is registered yet).
5. [w3id/README.md](../w3id/README.md) and [w3c/README.md](../w3c/README.md) — the
   persistent identifiers and the community-group material.
6. [RELATED-WORK.md](RELATED-WORK.md) — the dated comparison with other systems.

## A maintainer — "I look after this repository"

1. [CONTRIBUTING.md](../CONTRIBUTING.md), [GOVERNANCE.md](../GOVERNANCE.md),
   [SECURITY.md](../SECURITY.md).
2. [.github/workflows/README.md](../.github/workflows/README.md) — the test lane and the
   release lane.
3. [tools/README.md](../tools/README.md) — the maintainer tools: `rule-coverage`,
   `public-hygiene`, `release`, `gen-glossary`, `publish-set`.
4. [CHANGELOG.md](../CHANGELOG.md) — what changed, release by release.
5. [MEASUREMENTS.md](MEASUREMENTS.md) — the measured numbers and the commands that
   reproduce them.

---

Everything under `docs/` explains; nothing here is normative. Where a page disagrees
with a rule in `spec/`, the rule wins.
