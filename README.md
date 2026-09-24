# Agentic System Core

A specification for publishing machine-discoverable knowledge bundles — the Agentic Knowledge Web.

What this repository holds is the specification itself — numbered normative rules, three JSON Schemas, an OWL 2 RL ontology and a suite of conformance test vectors — together with the reference engine that implements it, its command line `agsc`, and the nine independent checkers of AGSC-09-90 — seven validators and two generators — that anyone can run against any distribution of the format (the repository also holds the maintainer's own tools, which do not ship).

## Status
**Release candidate.** This tree states specification `1.0.0-rc.6`, drafted on 2026-09-22 and not yet tagged; the latest tag is `1.0.0-rc.5`. `spec/00-overview.md` is authoritative, and it is the file to read rather than this line. The packages — `agentic-system-core` and its short alias `agsc-cli` on npm, and `agentic-system-core` on PyPI — carry version `1.0.0-rc.6` in this tree and are published from the release tag. The earlier 0.0.x releases only reserved the names, shipped no runtime, and are marked deprecated on npm and yanked on PyPI. Once `1.0.0-rc.6` is published: `npm install agentic-system-core`, or `pip install --pre agentic-system-core` (pip installs a release candidate only when asked with `--pre`).

The specification's own site is [AgenticSystemCore.com](https://agenticsystemcore.com).

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
