# AGENTS.md — orientation for AI agents and coding assistants

This file is for an agent working in this repository. People may read it too; the
human front door is [README.md](README.md) and [docs/START-HERE.md](docs/START-HERE.md).

## What this repository is

The AgenticSystemCore specification and its reference engine, in one tree:

- **The standard** — `spec/` (twelve chapters of numbered rules, `AGSC-nn-nn`),
  `schema/` (three JSON Schemas), `ontology/` (the vocabulary) and `tests/vectors/`
  (the conformance vectors). These four folders define the format. **The
  specification is the truth**: where code, a document or a test disagrees with a
  rule, the rule wins.
- **The engine** — `src/` (five bounded contexts, a supporting context, an application
  layer, ports and adapters), `bin/` (the `agsc` and `agsc-host` commands), `index.js`.
- **The checkers** — `tools/` (nine standalone checkers that import nothing from
  `src/`, plus maintainer tools).
- **Everything else** — `tests/` (every level), `features/` (persona scenarios),
  `docs/` (explanations, none normative), `examples/`, `bench/`, `internet-draft/`,
  `w3id/`, `w3c/`, `packages/agsc-cli/` (the short-name alias package).

## How to check your work

Run from the repository root, with Node 22.13 or later, after `npm ci`:

```bash
node tools/count-artifacts --json    # "ok": true and "findings": [] — the counts, never typed by hand
node tools/validate-spec --json      # status "pass"; likewise validate-schemas, -ontology, -vectors
npm test                             # the whole suite: 0 fail
node tools/rule-coverage --check     # every active rule has a check or a stated reason
node tools/public-hygiene .          # 0 errors before anything is published
```

Tests are deterministic: fixed clocks (`SOURCE_DATE_EPOCH`), no network, scratch files
only under the system temporary directory. Keep them that way.

## What you may change, and what you may not

- **Do not edit** `spec/`, `schema/`, `ontology/`, `tests/vectors/*.json` or
  `docs/SPEC.md` unless the task is a specification pass. Rule ids are permanent; a
  changed rule gets a dated amendment note; a released vector is withdrawn and
  replaced, never edited; a new error code only where no registered one fits.
- **Do not edit generated files by hand**: `docs/GLOSSARY.md`
  (`node tools/gen-glossary`), `docs/RULE-COVERAGE.md` (`node tools/rule-coverage
  --write`), `docs/measurements.json` (`node bench/measure.js`).
- **Do not add a dependency** unless a maintained, permissively licensed library at an
  exact pinned version replaces hand-written parsing of a standard format; no library
  may use the network or the clock at run time; `npm audit` must stay at 0.
- **Keep the architecture**: a `require` must follow the context map in
  [src/README.md](src/README.md) §2 (`tests/arch/context-boundaries.test.js` enforces
  it); the pure contexts never touch a file, a process, a clock or the network.
- **Public wording**: no superlatives, no performance claims against other systems,
  nothing called "registered" before the registry has acted, and no personal contact
  details in public files. A claim of novelty uses only the sentence in
  [README.md](README.md) "What is different about it".
- **Never** commit, tag, push or publish on your own; a person does that.
- Cite rules by id (`AGSC-nn-nn`); every id you cite must exist in `spec/`.

## Where things are

| You need | Read |
|---|---|
| the map of the code | [src/README.md](src/README.md), then the README of each `src/` folder |
| a guided walk and where to start for a task | [docs/CODE-ORIENTATION.md](docs/CODE-ORIENTATION.md) |
| the pictures | [docs/ARCHITECTURE-GUIDE.md](docs/ARCHITECTURE-GUIDE.md) |
| how the specification is organised | [docs/SPEC-ORIENTATION.md](docs/SPEC-ORIENTATION.md) |
| the outside standards used | [docs/PROTOCOLS.md](docs/PROTOCOLS.md) |
| the test levels | [docs/TESTING.md](docs/TESTING.md), [tests/README.md](tests/README.md) |
| writing a plugin | [docs/PLUGINS.md](docs/PLUGINS.md) |
| a port to another language | [docs/IMPLEMENTERS-GUIDE.md](docs/IMPLEMENTERS-GUIDE.md) |
| the terms | [docs/GLOSSARY.md](docs/GLOSSARY.md) |
| how to contribute | [CONTRIBUTING.md](CONTRIBUTING.md) |

A published node is read by agents through its own files — `/.well-known/knowledge-linkset`,
`/llms.txt`, `/chunks.jsonl`, the graph dumps — or through `agsc mcp`; see
[docs/USING-WITH-ASSISTANTS.md](docs/USING-WITH-ASSISTANTS.md).
