# Agentic System Core

A specification for publishing machine-discoverable knowledge bundles — the Agentic Knowledge Web.

What this repository holds is the specification itself — numbered normative rules, three JSON Schemas, an OWL 2 RL ontology and a suite of conformance test vectors — together with the reference engine that implements it, its command line `agsc`, and nine independent checkers that anyone can run against any distribution of the format.

## Status
**Release candidate.** The published packages `agentic-system-core` (npm) and `agsc-cli` (the short command name) are at `1.0.0-rc.6`; the specification's latest tag is `1.0.0-rc.5`, while this tree states `1.0.0-rc.6`, drafted on 2026-09-22 and not yet tagged — `spec/00-overview.md` is authoritative, and it is the file to read rather than this line. The earlier 0.0.x releases reserved the package names and shipped no runtime.

For architecture specifications, visit [AgenticSystemCore.com](https://agenticsystemcore.com).

## Reference engine (in progress) — added 2026-09-18

A reference implementation of the specification is being written in this
repository, under `src/`. It is **not published** and **claims no conformance
Level**: AGSC-10-05 says a claim exists only after a green run of the Level's
vector set at 1.0.0, and four verbs of AGSC-09-07 answer honestly that they are
not implemented yet.

* `src/README.md` is the engine's own documentation — the bounded contexts, the
  module map, the verb → module table, how to run the conformance vectors, and
  the list of specification items this work found and reported rather than
  worked around.
* `tests/vectors/**` is the acceptance test, and it is the part that matters to
  anyone implementing this format in another language: a port needs `spec/`,
  `schema/`, `ontology/` and those vectors, and nothing from `src/`.
* `node --test 'tests/**/*.test.js'` runs the whole suite, and the conformance
  runner prints one summary line.
* `docs/PLUGINS.md` is the plugin contract: the eight kinds this format admits
  (AGSC-00-24), what a plugin of each may read, emit and never do, how the engine
  finds one, and what is promised not to break within 1.x. `examples/plugins/`
  holds one minimal, working sample per kind.

The engine's arrangement is one implementation choice, not part of the format.
Where this engine and the specification disagree, the specification wins.

## Connecting agents and repositories — added 2026-09-23

`docs/CONNECTORS.md` says, route by route, how an agent or a framework uses a
published Bundle — steering files, skill packs, the MCP server, and the COGX
memory archive (`agsc export --to cogx` / `agsc import --from cogx`), which Cognee's
importers carry on to Mem0, Letta, LangMem and Zep. `examples/connectors/` holds the
working examples, and `docs/USE-CASES.md` walks through sixteen concrete scenarios
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
marks of their owners and are used only to say what is being talked about. AgenticSystemCore™ is a trademark of Andrei N. Besleaga. Other names belong to their owners.
Every right not expressly granted by the licences is reserved, and nothing here promises
that the work or its addresses will stay available.

## Licences

| What | Licence |
|---|---|
| The engine, the command line and the checkers | Apache-2.0 (`LICENSE`) |
| The JSON Schemas, the ontology, the identifiers and the discovery document | CC0-1.0 |
| The specification text under `spec/` | Apache-2.0 |
| The prose of a published node — item bodies, descriptions and the pages and exports that carry them | the Content Use Terms in `LICENSE-CONTENT` |

Contributions are signed off under the agreement in `CONTRIBUTOR-AGREEMENT`, which the
token `CA-v1` names; `CONTRIBUTING.md` says what that means in plain words.

© 2026 Andrei N. Besleaga. Code: Apache-2.0. Schemas, ontology, identifiers and the
discovery document: CC0-1.0. Prose: the Content Use Terms in `LICENSE-CONTENT`.
