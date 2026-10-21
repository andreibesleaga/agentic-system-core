# `tools/` — the checkers, the generators and the maintainer's tools

**Summary.** Standalone programs that check or generate the artefacts of the
specification. The nine checkers of AGSC-09-90 are independent by construction: none
imports anything from `src/`, because a checker that imported the engine it checks
would prove nothing. Anyone can run them against any distribution of the format.
Every tool prints the diagnostics envelope of AGSC-09-11 with `--json` and exits 0
(pass), 1 (findings) or 2 (usage).

**Read after:** the root [README](../README.md). **Read next:**
[docs/IMPLEMENTERS-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/IMPLEMENTERS-GUIDE.md) §5, on checking your own
output with them.

## Shipped in the npm package

| Tool | What it checks or writes |
|---|---|
| `validate-spec` | the rule text of `spec/`: rule ids, key words, trace brackets, the error-code registry |
| `validate-schemas` | `schema/*.json` against JSON Schema 2020-12 |
| `validate-ontology` | `ontology/agsc.ttl`: Turtle, the OWL 2 RL axiom list and datatypes, the declarations of the entities of other vocabularies, SKOS pitfalls |
| `validate-vectors` | every conformance vector's members and the rule and code it cites |
| `validate-wellknown` | one discovery document, at a Level; given a URL, also the cross-origin and caching headers it is served with; `--peer` for the mutual check |
| `validate-features` | the Gherkin scenarios of `features/` and their requirement tags |
| `validate-diagrams` | the Mermaid pack of `docs/diagrams/` against its index |
| `gen-spec-html` | `spec/` → the `/specs/` pages; `--check` compares a publisher's pages |
| `gen-ns` | the ontology → `context.jsonld`, `agsc.rdf` and the `/ns/` index |
| `count-artifacts` | every published count, derived from the files (rules, codes, vectors, terms) |
| `bench` | the retrieval benchmark over a built node's published surfaces (`docs/BENCHMARKS.md`) |

**What `validate-wellknown` does not check at 1.0.** Given a URL, it checks the
response headers of the discovery document and of every same-origin public artefact
it fetches. It does not read the home page `/`, so the `describedby` response header
that AGSC-11-05 recommends there goes unchecked; that rule is a recommendation, not a
requirement. Checking it, with one more fetch, is planned for 1.1.

## Kept in the repository only

| Tool | What it is for |
|---|---|
| `rule-coverage` | the rule-coverage matrix; `--write` regenerates `docs/RULE-COVERAGE.md`, `--check` fails when it is stale |
| `requirements-matrix` | the requirements matrix: for every requirement of `docs/PRD.md`, the rules that trace to it and the checks that name it; `--write` regenerates `docs/REQUIREMENTS-MATRIX.md`, `--check` fails when it is stale |
| `gen-glossary` | writes `docs/GLOSSARY.md` from the specification and the ontology; `--check` |
| `lint-claims` | the claims lint of the benchmark kit: ranking words in a results text, and results rows that name no model, date, sample size or interval ([docs/BENCHMARKS.md](../docs/BENCHMARKS.md)) |
| `public-hygiene` | "public means clean": a sweep of a working tree for text that must never be published |
| `publish-set` | sets which items of a Bundle are published, from one list |
| `release` | the release lane as a dry run: version, changelog, package contents, provenance step |

## Run them

```bash
node tools/count-artifacts --json      # the counts, never typed by hand
node tools/validate-spec --json        # and the same for the other six validate-* checkers
node tools/rule-coverage --check       # one summary line; exit 0 when the matrix is current
node tools/requirements-matrix --check # the same for the requirements matrix
node tools/gen-glossary --check        # "docs/GLOSSARY.md: current (…)"
```

Each takes `--help`. Requires Node 22.13 or later and `npm install` at the root (the
checkers that read Turtle, XML, Markdown or JSON Schema use the same pinned libraries
as the engine, listed in [src/README.md](../src/README.md) §4).
