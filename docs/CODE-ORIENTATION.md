# Code orientation — a guided walk through the repository

**Summary.** This page walks through the repository folder by folder, names the
twenty-two files that matter most and says what each does, shows how one command
travels through the code, and gives a reading path for the common tasks — fixing a
lint, adding a surface, writing an adapter, changing a rule. The specification is the
truth; the engine is one implementation of it.

**Who this is for:** a developer about to read or change the code, human or agent.
**Read after:** [ARCHITECTURE-GUIDE.md](ARCHITECTURE-GUIDE.md). **Read next:**
[src/README.md](../src/README.md) (the module map) and [TESTING.md](TESTING.md).

---

## 1. The folders, top to bottom

| Folder | What it is | Start with |
|---|---|---|
| `spec/`, `schema/`, `ontology/`, `tests/vectors/` | **the standard**: rules, schemas, vocabulary, vectors. Frozen between release candidates | [SPEC-ORIENTATION.md](SPEC-ORIENTATION.md) |
| `src/` | **the engine**: five bounded contexts, a supporting context, the application layer, ports and adapters | [src/README.md](../src/README.md) |
| `bin/` | the commands `agsc`, `agentic-system-core` and `agsc-host` | [bin/README.md](../bin/README.md) |
| `index.js` | the package's programmatic entry: discovery constants, versions, `run()` | the file itself |
| `tools/` | the nine standalone checkers, the counter, the benchmark runner, the maintainer tools | [tools/README.md](../tools/README.md) |
| `tests/` | every level of test, from one function to a real browser | [tests/README.md](../tests/README.md) |
| `features/` | the persona scenarios in Gherkin, executed by the acceptance runner | [features/README.md](../features/README.md) |
| `docs/` | explanations for every audience; none normative | [docs/README.md](README.md) |
| `examples/` | connector examples, one plugin of each kind, a hosting profile | [examples/README.md](../examples/README.md) |
| `bench/` | the benchmark kit: measurement script, query sets, the security corpus | [bench/README.md](../bench/README.md) |
| `packages/agsc-cli/` | the short-name alias package on npm | [packages/agsc-cli/README.md](../packages/agsc-cli/README.md) |
| `internet-draft/`, `w3id/`, `w3c/` | the Internet-Draft, the persistent-identifier files, the community-group material | their READMEs |
| `.github/workflows/` | the test lane and the release lane | [.github/workflows/README.md](../.github/workflows/README.md) |
| `action.yml`, `.pre-commit-hooks.yaml` | the GitHub Action and the pre-commit hook other repositories use | the root [README.md](../README.md) |

There is no `templates/` folder: the page templates are code, in
`src/distribution/html.js` and `src/distribution/theme.js`.

## 2. The twenty-two files that matter most

Read them roughly in this order; each names, in its header comment, the rules it
implements.

| # | File | What it does |
|---|---|---|
| 1 | `bin/agsc.js` | the entry point: builds the four ports from the Node adapters and hands them to the command line |
| 2 | `src/application/cli/main.js` | parses the arguments, dispatches to a verb, prints the diagnostics envelope, sets the exit code |
| 3 | `src/application/cli/verbs/_helpers.js` | what every verb shares: loading the Bundle, reading the git history once, the build options |
| 4 | `src/application/bundle.js` | reads a folder into the Bundle record: configuration, root document, items |
| 5 | `src/knowledge/frontmatter.js` | splits one file into its YAML block and body, and builds the Item record |
| 6 | `src/knowledge/validate.js` | checks an item, the root and the configuration against the schemas; orders the codes |
| 7 | `src/knowledge/links.js` | resolves the fourteen Link keys, computes inverses, finds cycles and orphans |
| 8 | `src/knowledge/jcs.js` | canonical JSON (RFC 8785) after NFC: the bytes every JSON file is written in |
| 9 | `src/knowledge/nquads.js` | the RDF dataset of a Bundle and its canonical N-Quads, the source of `graph.nq` |
| 10 | `src/knowledge/chunks.js` | cuts items into the chunk export for retrieval |
| 11 | `src/knowledge/content-version.js` | derives the content version of a Bundle from its history |
| 12 | `src/governance/lint.js` | runs every lint over a Bundle and sorts the findings |
| 13 | `src/governance/prov.js` | the provenance record and the gates a proposal must pass |
| 14 | `src/governance/ledger.js` | derives the hash-chained ledger from the history and verifies it |
| 15 | `src/composition/compose.js` | selection, closure over `requires`, `supersedes`, `excludes`: the verdict |
| 16 | `src/composition/harness.js` | writes the seven Harness files for a valid selection |
| 17 | `src/distribution/site.js` | the build: every route of the route set, `build`, `write`, `verify` |
| 18 | `src/distribution/discovery.js` | writes and checks the discovery document with its digests |
| 19 | `src/distribution/mcp-tools.js` | the seven tools, one implementation for both transports |
| 20 | `src/distribution/page-tools.js` | the same seven tools as a script the built page runs |
| 21 | `src/application/conformance.js` | runs the vectors; shared by `agsc conform` and the test suite |
| 22 | `src/application/plugins.js` | the plugin contract: one registry per kind, the capability check |

## 3. How one command travels: `agsc build`

1. `bin/agsc.js` creates the FileSystem (rooted at the current directory), the Clock
   (from `SOURCE_DATE_EPOCH` or the last commit), the ProcessRunner and a Network that
   refuses every call.
2. `application/cli/main.js` recognises `build`, checks its flags, and calls
   `application/cli/verbs/build.js`.
3. The verb loads the configuration (`application/config/load.js`) and the Bundle
   (`application/bundle.js`), reads the git history once through the ProcessRunner
   (`verbs/_helpers.js`), and calls `distribution/site.js#build`.
4. `site.js` asks Knowledge for the validated items and the graph, Governance for the
   provenance, lints and ledger, Composition for the skill packs and the compose page's
   algebra, and Boundary for the headers and visibility; then it writes every route.
5. The verb writes the files through the FileSystem port and prints one summary line,
   or the envelope under `--json`. Any fault is a Finding with a registered code.

`agsc ci` runs lint, then build twice into two directories, compares every byte, and
verifies (`distribution/ci.js`).

## 4. Where to start, by task

| Task | Read first | Then |
|---|---|---|
| Fix a wrong lint result | the rule in `spec/08-governance.md` or `spec/03-links.md` | `src/governance/lint.js` or `src/knowledge/links.js`, and the vectors of the `lint` or `links` area |
| Change what a page looks like | AGSC-06-02, AGSC-06-05, AGSC-06-20 (accessibility) | `src/distribution/html.js`, `src/distribution/theme.js`, `tests/distribution/` |
| Change a machine file's bytes | the rule, and the vector that pins the bytes | the emitter in `src/knowledge/` or `src/distribution/`; a released vector is never edited — a specification pass withdraws and replaces it |
| Add an import or export format | AGSC-01-22, AGSC-01-26a, [PLUGINS.md](PLUGINS.md) | write a memory-adapter plugin (`examples/plugins/memory-adapter.js`); built-in adapters live in `src/interchange/adapters/` |
| Put a node on a new kind of host | [CONNECTORS.md](CONNECTORS.md#where-a-node-can-live) | a deployment-profile plugin (`examples/hosts/header-rules.js`); built-ins in `src/distribution/hosts/` |
| Change a tool of the tool surface | AGSC-09-13, AGSC-09-16 | `src/distribution/mcp-tools.js`; the page gets the same code through `page-tools.js`, and vector `cli-0003` compares the two |
| Add a verb flag | AGSC-09-09 (the flags are a closed list) | `src/application/cli/main.js` and the verb's module |
| Change a rule | [CONTRIBUTING.md](../CONTRIBUTING.md) | a specification pass: dated amendment note, the vector withdrawn and replaced, `node tools/validate-spec` and `node tools/count-artifacts` |
| Port the engine to another language | [IMPLEMENTERS-GUIDE.md](IMPLEMENTERS-GUIDE.md) | you need `spec/`, `schema/`, `ontology/` and `tests/vectors/`, not `src/` |

## 5. Before you finish

```bash
npm test                              # 0 fail
node tools/rule-coverage --check      # every active rule has a check or a stated reason
node tools/count-artifacts --json     # "ok": true
```

A new test fixes its clock, reaches no network and cleans up what it writes
([TESTING.md](TESTING.md), "Determinism"). A new `require` must follow the context map
([src/README.md](../src/README.md) §2).
