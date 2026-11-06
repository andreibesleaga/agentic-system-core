# Engineering: the gates, the limits, the dependency rule, and how the repositories are checked

**Summary.** Every change to this engine passes the same set of checks on one machine
and in the forge: the test suite, a linter with zero warnings, a dependency-rule
checker, a duplication limit, the rule-coverage and requirements matrices, the
public-hygiene sweep and, for a release, a dry run of the release lane. This page says
what each check enforces, how to run it, what the size limits are and why they exist,
how to add a module without breaking the dependency rule, and how the workflows of
the four public repositories fit together. Nothing here is normative: where this page and a
rule of `spec/` disagree, the rule wins.

**Who this is for:** a contributor to the engine, or a maintainer setting up the
forge. **Read after:** [CODE-ORIENTATION.md](CODE-ORIENTATION.md) and
[TESTING.md](TESTING.md). **Read next:** [CONTRIBUTING.md](../CONTRIBUTING.md).

## 1. The gates

Run from the repository root, with Node 22.13 or later, after `npm ci`. Each command
exits 0 when the gate holds and 1 otherwise, so a script can chain them. The forge
runs the same commands (§5); nothing runs there that cannot run here.

| Gate | Command | What it enforces |
|---|---|---|
| Suite | `npm test` | Every level of [TESTING.md](TESTING.md): unit, integration, architecture, the conformance vectors, the executed acceptance scenarios, the tests of the standard, the end-to-end lanes that need nothing outside the repository. 0 failures. Fixed clocks, no network. |
| Lint | `npm run lint` | ESLint's recommended rules, the house style (two-space indent, single quotes, semicolons, trailing commas on multi-line lists, LF), the order of `require` lines (Node built-ins, then packages, then this repository's files) and the size budgets of §2. **Zero warnings**: a warning is a failure. |
| Format | `npm run format` | The same linter with `--fix`: it rewrites what it can (style, order) and reports what it cannot. There is no second formatter, so the formatter and the linter cannot disagree. |
| Dependency rule | `npm run arch` | dependency-cruiser over `src/`, the TypeScript sources of `src-ts/` (§8), `bin/` and `index.js` with the map of §3: each part of `src/` may require only the parts its row allows; the pure contexts use no Node built-in but `crypto`; an adapter is constructed only by the application layer or `bin/`; Interchange and Distribution never require each other; no module requires a sample plugin, a checker or `examples/`; no devDependency at run time; no undeclared or unresolvable require; no cycle; no orphan. |
| Purity | part of `npm test` (`tests/arch/core-purity.test.js`, `never-touches.test.js`, `application-builtins.test.js`) | No bounded context touches `process`, `Date.now`, `new Date`, `Math.random`; the outside world is reached through a port. No context loads what the "Never touches" column of [ARCHITECTURE-DDD.md](ARCHITECTURE-DDD.md) §2 excludes, and the application layer loads only the Node built-ins listed in §3. |
| TypeScript output | `npm run check:ts` | `tools/build-ts --check`: every file compiled from `src-ts/` into `src/` is byte for byte what the pinned compiler writes now, names its source in its first line, and has a source that still exists (§8). |
| TypeScript types | `npm run typecheck` | `tsc --noEmit` over `src-ts/` with the strict options of `tsconfig.json` (§8). |
| Duplication | `npm run duplicates` | jscpd over the same files: at most 2 % duplicated lines. The clones kept on purpose are listed in §2. |
| Rule coverage | `npm run rule-coverage` | Every active rule of `spec/` is verified by a vector, a test, an executed scenario or a checker, or is prose-only for a stated reason; [RULE-COVERAGE.md](RULE-COVERAGE.md) is current. `node tools/rule-coverage --write` regenerates the page. |
| Requirements | `npm run requirements` | Every requirement of [PRD.md](PRD.md) is traced by a rule or named by a test or a live vector, or stays unmapped for a stated reason; a requirement met only in part, or traced only by rules that carry no check, names the part that waits; [REQUIREMENTS-MATRIX.md](REQUIREMENTS-MATRIX.md) is current. `node tools/requirements-matrix --write` regenerates the page. |
| Counts | `node tools/count-artifacts --json` | Every published count (rules, codes, vectors, terms) is derived from the files, never typed; `ok: true` and no finding. |
| Validators | `for t in tools/validate-*; do node "$t" --json; done` | The independent checkers over the distribution: rule text, schemas, ontology, vectors, scenarios, diagrams; the discovery document of a fixture build at Level 2 (`validate-wellknown`). |
| Hygiene | `node tools/public-hygiene .` | "Public means clean": no private path, working-process vocabulary, secret, e-mail address, personal data beyond the canonical name, or forbidden wording in any file of the tree. The allowed hits, each with its reason, are in `.public-hygiene.json`. 0 errors. |
| Audit | `npm run audit` | `npm audit --audit-level=low`: 0 advisories on the pinned dependency set. |
| Release | `node tools/release --json` | The release lane as a dry run: the version in `package.json`, the alias package and the changelog agree; the package file list ships what it must and nothing private; the provenance step is present. Nothing is published. |
| Node floor | part of `npm test` (`tests/arch/node-floor.test.js`) | `engines.node` of both packages equals the lowest Node of every workflow matrix, so the floor is a version a run has exercised. |

Before opening a pull request, the short form is:

```bash
npm run lint && npm run arch && npm run check:ts && npm run typecheck && npm run duplicates && npm test \
  && npm run rule-coverage && npm run requirements && node tools/public-hygiene .
```

## 2. The size limits, and why

The linter carries five budgets per file class. Each budget is the largest value
measured on the day the gate was introduced, rounded up: the gate was set to hold the
code at its size, not to describe an ideal. A change may lower a budget; a change may
not raise one without saying so in the pull request, because a silent raise is how a
limit stops meaning anything.

| Budget | Engine code (`src/`, `src-ts/`, `bin/`, `tools/`, `index.js`) | Tests |
|---|---:|---:|
| Cyclomatic complexity of a function | 150 | 30 |
| Lines per function | 660 | 210 |
| Nesting depth | 7 | 5 |
| Parameters of a function | 7 | 6 |
| Lines per file | 1,960 | 770 |

A few places sit at or near the top of these budgets. Each is a candidate for a split
into smaller functions, and the budgets hold them where they are until that happens. A
change inside one of them starts by extracting a helper, with no change in what the
engine writes (the golden build test proves it), and never by raising the budget:

| Where | The budget it is near | The split it is a candidate for |
|---|---|---|
| `src/distribution/site.js`, `buildSite` | complexity and lines per function | one function per family of routes |
| `src/distribution/site.js`, the whole file | lines per file | those route families in modules of their own |
| `src/knowledge/diagrams.js`, `compile` | the largest function of the Knowledge context | one function per diagram construct |
| `src/application/cli/main.js`, `main` | the largest command-line function, well under both budgets | one function per group of options |

Duplication is limited to 2 % of lines. A few clones are kept on purpose and are
worth knowing before "fixing" them: the page tools' function source is emitted into
every published node, so its text stays as it is; the Composition context cannot use
the Boundary's `finding` helper without crossing the map; two version comparators
compare unrelated version strings; and the checkers under `tools/` share boilerplate
because each one must stand alone (AGSC-09-90), so a shared helper would be exactly
the import the rule forbids.

Two more limits are the specification's, not the linter's: a page of a built node is
at most 100 KB (AGSC-06-21) and an index document at most 1 MB, so that a node stays
readable on a slow connection and a search index loads in one request.

## 3. Adding a module without breaking the dependency rule

The directory layout is the domain model, and `npm run arch` checks it. Each part of
`src/` may require only the parts its row names:

| Part of `src/` | May require |
|---|---|
| `shared/` | nothing inside `src/` (the shared kernel: the two string orderings, the trailing-slash and trailing line-feed trims, and the reader of the rest of a line after a fixed head) |
| `knowledge/` | `knowledge/`, `shared/` |
| `governance/` | `knowledge/`, `governance/`, `ports/`, `shared/` |
| `composition/` | `knowledge/`, `composition/`, `ports/`, `shared/` |
| `boundary/` | `knowledge/`, `boundary/`, `ports/`, `shared/` |
| `interchange/` | `knowledge/`, `governance/`, `interchange/`, `ports/`, `shared/` |
| `distribution/` | `knowledge/`, `governance/`, `composition/`, `boundary/`, `distribution/`, `ports/`, `shared/` |
| `adapters/` | `ports/`, `adapters/`, `shared/` |
| `application/` | everything, adapters included: the only layer that wires |

To add a module:

1. **Place it by what it knows.** A module that parses, validates or links items
   belongs to Knowledge; one that judges provenance, gates or the ledger to
   Governance; one that composes to Composition; one that classifies a peer, an
   address or a surface to the Boundary; one that reads or writes a foreign format to
   Interchange; one that emits a surface of this format to Distribution. A verb that
   ties them together is application code. A module that reaches the host (a file, a
   process, a clock, the network) is an adapter behind a port.
2. **Require downward only.** Read the row for the part you chose and require nothing
   outside it. If your module needs something from a part the row does not allow,
   the thing you need belongs lower down (move it, or pass it in as a value from the
   application layer). Interchange and Distribution never require each other: the
   first speaks foreign formats, the second this format's own surfaces. What both
   need goes to `knowledge/`: `knowledge/link-graph.js` holds the typed Links between
   published items that the Mermaid export and the graph view of the pages both draw.
   Code a published page runs is written as **portable** functions and shipped as their
   own source text, so the page runs what the Node tests test: each such module lists
   them in `PORTABLE`, and a portable function names no module-scope binding and
   requires nothing (`tests/arch/composition-portable.test.js` for the composition
   algebra, the Harness, the archive, the brief and the blueprint that `/compose/` runs,
   `tests/arch/page-tools-portable.test.js` for the page tools and the answers of the tools of
   1.1 they carry (`distribution/tool-answers.js`, which the local server calls too),
   `tests/arch/explorer-portable.test.js` for the explorer of `/clusters/`, which also
   depends on nothing outside its own folder, and `tests/arch/query-portable.test.js` for
   the `/query/` page and its worker, which reuse the explorer's layout and scene writer).
   Code from another project that a page runs is vendored, never hand-copied: the query
   engine of `/query/` is one release of Oxigraph under `src/distribution/vendor/`, byte
   for byte, with its licence texts, its SHA-256 pinned by
   `tests/arch/query-engine-pin.test.js` and kept equal to the pinned `oxigraph`
   dependency; no scan, linter or duplicate check reads that folder.
3. **Reach the host through a port.** `knowledge/`, `governance/`, `composition/`,
   `interchange/`, `distribution/` and `shared/` may use the Node built-in `crypto`
   and nothing else; the Boundary may also use `net` and `url` to classify addresses
   without opening a connection. Anything else — `fs`, `child_process`, a socket, the
   clock — is an adapter, and only `application/` and `bin/` construct one. The
   application layer itself loads only `path`, `crypto` and `util`, plus `os` in
   `cli/verbs/run.js`, and `fs` in one module: `src/application/hosting.js`, the
   deployment profiles and local server of `agsc-host`, is the one exception that
   reads and writes files directly instead of through the FileSystem port. Moving it
   behind the port is planned for 1.1. `tests/arch/application-builtins.test.js` holds
   this list, and fails when a module loads anything else or when an exception is no
   longer used.
4. **Give it a header and a README line.** The module header names the rules it
   serves (`AGSC-nn-nn`); the README of its folder gets one line. `npm run arch`
   refuses an orphan module, and the rule-coverage gate warns when a test names a
   rule that does not exist.
5. **Run the two checks.** `npm run arch` (the map) and `npm test` (the purity and
   boundary tests). Both print the offending `require` with its file.

A plugin — a memory adapter, a channel adapter, a forge shim, a deployment profile,
a surface, a page tool, a composition emitter or a checker — is loaded by path or
package and is never required by the engine; that too is a rule of the map.

## 4. Determinism

Every gate runs offline. Tests fix their clocks (`SOURCE_DATE_EPOCH` for a build, a
fixed instant elsewhere), refuse the network, and write only under the system
temporary directory. A build of the same inputs gives the same bytes on every
operating system; the suite runs on Ubuntu, macOS and Windows with the Node floor and
the current line so that this is measured, not assumed. The forge runs the suite
without `SOURCE_DATE_EPOCH` in its environment (only the fixture build sets it), so the
default path — the instant of the last commit — is exercised on every run.

## 5. How the repositories are checked

Four public repositories carry the work: the engine, the reference site, the demo
node and the Python package. Each has its own workflow file; none holds a secret;
every action is pinned to a commit hash with the version beside it, so that a moved
tag cannot change what runs; every job has read-only permissions unless it publishes.

| Repository | Workflow | Runs on | What it runs |
|---|---|---|---|
| `agentic-system-core` (this engine) | `test.yml` on every pull request, every push to `main` or a `release/` branch, and weekly | Ubuntu, macOS, Windows × Node 22.13.0, 24 and 26 (nine legs; the six of 22.13.0 and 24 are the required checks, the three of 26 are not), plus one `actionlint` job on Ubuntu and one browser job on Ubuntu that is not a required check | every step of the release gates, with the same wording and under the same condition: `npm ci`, lint, the duplicate check, the dependency rule, the two TypeScript checks of §8 (`npm run check:ts`, `npm run typecheck`; these two run in `test.yml` only, and `npm pack` runs them again through `prepack`), the suite (on Ubuntu × Node 24 measured by `npm run test:coverage`, which fails below 99.9 % of lines, 99 % of functions or 93 % of branches of `src/`), `npm audit`, rule coverage, the requirements matrix, the counting tool, every validator, the Level-1 check of a fixture built without git, `validate-wellknown` at Level 2 on a fixture build, the packed install (both tarballs installed together in an empty folder, each command printing the packed version), the release dry run, hygiene, the architecture lane (a test fails if the two workflows drift apart or a required check context is no longer produced); `actionlint` over the workflow files themselves |
| | `release.yml` on a `v*` tag | the same nine legs, then one publish job | the same gates again; then, only for a tag whose commit is on `main`, npm trusted publishing with build provenance, under the dist-tag `next` for a pre-release and `latest` for a final release |
| `AgenticSystemCore.com` (the reference site) | `test.yml` on every push and pull request | Ubuntu, Node 22.13.0, the engine checked out beside it | `node scripts/build.js && node scripts/check.js` (two identical builds equal to the committed output; the discovery document at Levels 0 and 2; links, headers, contrast, hygiene), `node scripts/page-tools-check.js`, the hygiene sweep; the browser lane (`scripts/a11y.js`, axe-core) on request |
| | `live.yml` on Mondays and on request | Ubuntu, Node 22.13.0 | a read-only check of both live nodes, `node scripts/live-check.mjs --require-checkers`: the served pages against the committed output, the promised response headers, the `security.txt` expiry, the age of the sustainability report, the w3id redirects, the npm and PyPI versions, and both released checkers at Level 2 with the mutual check; not a required check, because what it reads can change without a commit |
| `agsc-demo-node` (the demonstration node) | `test.yml` on every push and pull request | Ubuntu, Node 22.13.0, the engine checked out beside it | `agsc lint`, `agsc build`, `agsc verify --ledger`, `agsc ci`, `agsc conform --level 2`, `validate-wellknown --level 2` on the built discovery document, `publish-set --check`, the hygiene sweep |
| `agentic-system-core-python` (the Python package) | `test.yml` on every push and pull request, and called by `release.yml` | Ubuntu 24.04, Python 3.9, 3.13 and 3.14 (three legs; 3.9 and 3.13 are required checks together with `ruff and mypy (Python 3.13)`, 3.14 is not), the engine and the main site beside it, Node 22.13.0 | `pytest` under `coverage` (the equivalence tests run the engine's checker and vector runner); the engine's port-implementer scenarios (`persona-l`) with the package beside the engine, where a skipped scenario fails the leg; on 3.13 also `ruff check` and `mypy` at exact pins |
| | `release.yml` on a `v*` tag | Ubuntu 24.04 | the tag must be the version and its commit must be on `main`; the whole `test.yml` with the engine at its package tag `v<version>`, which exists for every engine release; one build; PyPI trusted publishing |

**The demo node is an export.** `agsc-demo-node` holds the published items of the
demonstration node and only those. The maintainer keeps the node in a private working
copy that also holds items still in draft; the public repository is exported from it.
The private copy carries the same workflow, with the same `node` job on every push,
so the node is checked by the same steps on both sides of the export. A PHP package
also exists, as a private placeholder with no workflow; it is not one of the four.

**The engine beside the other repositories.** The site, the demo node and the
Python package all need the engine at a known state: the site's generator reads the
specification and the engine emits every machine file; the demo node is built by
the engine; the Python suite compares its checker with the engine's. Each of those
workflows therefore checks out `andreibesleaga/agentic-system-core` side by side with
its own repository, at the ref named by the `ENGINE_REF` variable at the top of
the file (`main` by default; a tag or a commit to pin), with full history so that the
release tag is visible, and runs `npm ci` there. The site's gate compares a fresh
build with the committed output, so the site must be rebuilt and committed whenever
the engine changes what it emits; a red site run after an engine change means
exactly that.

**Which checks to require on `main`.** A maintainer who protects the default branch
can require the status checks the workflows produce: for the engine the six `test`
legs and the `actionlint` job; for the site the `site` job; for the demo node the
`node` job; for the Python package the two `tests` legs and the `ruff and mypy` job.
GitHub's own page (read 2026-09-25) names the path: Settings → Branches → "Add classic branch
protection rule", then "Require status checks to pass before merging" with "Require
branches to be up to date before merging", "Require a pull request before merging",
and "Do not allow bypassing the above settings"; force pushes and deletions stay
disallowed unless the rule enables them.

**The workflow files are checked too.** An `actionlint` job in the engine's
`test.yml` downloads the tool's release binary (version 1.7.12), verifies its SHA-256
against the value recorded in the workflow, and runs it over every workflow file of
the repository. The same binary can check the other repositories' workflows from one
machine:

```bash
actionlint .github/workflows/*.yml   # 0 lines of output and exit 0 when clean
```

## 6. What a failing gate means

| Output | Meaning | What to do |
|---|---|---|
| a test name with `✖` | a behaviour the rules or the tests fix has changed | read the rule the test names; change the code, or change the test with the rule |
| a linter line with a rule name | style, order or a budget | `npm run format`; if a budget, split the function or file |
| `dependency violations found` | a `require` points the wrong way | move the module or the function to the part that may be required (§3) |
| `AGSC-E202 … has no machine check` | a rule or a requirement nothing verifies | add a test, a vector or a scenario, or a reason in the allow-list with a sentence |
| `is not the generated text` | a generated page is stale | run the `--write` form named in the message |
| a hygiene line with a check name | a word or a path that must not be public | remove it; add an allow entry only when the hit is public by intent, with its reason |

## 7. The REUSE check

From 1.1 the repository follows the REUSE layout (specification 3.3, <https://reuse.software/>):
`REUSE.toml` assigns one licence and one copyright line to each licence area of the table in
`README.md` ("Licences"), and `LICENSES/` holds the text of each licence it names (`Apache-2.0`,
`CC0-1.0`, `CC-BY-4.0`, and `MIT` for the vendored query engine). No source file carries an SPDX header, so adding the layout changed no
byte of the specification, the schemas, the vectors or any built output. `tests/arch/reuse-layout.test.js`
holds what can be read without the tool (every named licence has its text, no text is unused).
`LICENSE-CONTENT`, the Content Use Terms of a published node's prose, is a licence text and not a
licensed file: REUSE does not annotate it and it has no entry in `LICENSES/`.

To run the real check, use a scratch virtualenv, never a global install:

```bash
python3 -m venv /tmp/reuse-venv && /tmp/reuse-venv/bin/pip install reuse
/tmp/reuse-venv/bin/reuse lint     # ends with "compliant with version 3.3 of the REUSE Specification"
```

Nine files quote an SPDX line as data (browser-script templates, the licence-line reader, one
ontology test); `REUSE.toml` annotates them with `precedence = "override"` so the quotation is not
read as the file's own licence. A new file of that kind needs the same entry, and
`tests/arch/reuse-layout.test.js` fails until it has one. The query engine vendored under
`src/distribution/vendor/oxigraph-0.5.13/` (AGSC-06-39) has an annotation of its own: its two files
keep their upstream bytes with no SPDX header, and `REUSE.toml` gives them the engine's copyright line
and its licence, `MIT OR Apache-2.0`, whose texts sit beside them.

## 8. TypeScript parts

**Why.** The new parts of the engine that carry a protocol's messages to agents are to
be written in strict TypeScript: the Model Context Protocol core of revision 2026-07-28
and its HTTP transport, the A2A responder, the runners of the benchmark kit, and any
later module in the places `tests/arch/typescript-parts.test.js` checks. None of them
exists yet. A narration step of the brief would be one too, once a distribution adds a
model adapter; the reference engine has none (`compose --narrate` is `AGSC-E001`). A
message shape the compiler checks cannot drift from the protocol's schema unnoticed.
The rest of the engine stays JavaScript and is not rewritten. The tool answers of
`src/distribution/tool-answers.js` and `page-tools.js` stay JavaScript as well: the
page tools emit the source text of those functions into the page's script, so each one
is written as a self-contained function in the form a browser runs, and the bytes a
node publishes come from that text.

**Where.** A source lives at `src-ts/<context>/<name>.ts`, in the folder of the context
it belongs to, and the dependency rule of §3 applies to it as written: `npm run arch`
reads every rule as `src(?:-ts)?/`. `tools/build-ts` compiles it to CommonJS at
`src/<context>/<name>.js`, and that compiled file is committed. Its first line names
its source and the compiler:

```js
// generated from src-ts/shared/version-line.ts by tsc 6.0.3; do not edit
```

So running the engine, an install with `npm ci --omit=dev` and the published package
need no TypeScript: what runs and what ships is the JavaScript under `src/`, and the
sources under `src-ts/` do not ship. Two tests load the pinned compiler, a development
dependency: `tests/tools/build-ts.test.js` and `tests/arch/typescript-parts.test.js`. The
first module, `src-ts/shared/version-line.ts`, is the proof of the chain: it gives the
line `agsc --version` prints, the command line prints that line through it
(`src/application/cli/main.js`), and the bytes are those 1.0 printed
(`tests/knowledge/version-line.test.js`).

**Commands.**

| Command | What it does |
|---|---|
| `npm run build:ts` | compiles `src-ts/` and writes each compiled file whose bytes changed |
| `npm run check:ts` | writes nothing; exits 1 when a committed file is not what the compiler writes now, when a compiled file's source is gone, or on a type error |
| `npm run typecheck` | `tsc --noEmit`: the compiler's own check of the sources |
| `npm pack` | runs `prepack`, which is `npm run check:ts && npm run typecheck`, so a package is never packed from stale output |

A bare `tsc` writes nothing (`tsconfig.json` sets `noEmit`); `tools/build-ts` is the one
writer, and it compiles in memory.

**The compiler and the options.** `typescript` 6.0.3, `@types/node` 22.20.5 (the major
line of the Node floor, 22.13) and `typescript-eslint` 8.72.1 are development
dependencies at exact pins. TypeScript 7.0 is not used: it is the native compiler and
ships without the JavaScript compiler interface that `typescript-eslint` and
`dependency-cruiser` read, and `typescript-eslint` 8.72.1 accepts TypeScript below 6.1.
`tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, the two unused
checks and `isolatedModules`; `module` `node20` with `moduleResolution` `node16`, which
compile a `.ts` file of this package (no `"type"` field) to CommonJS; `target` and `lib`
ES2024, which Node 22.13 runs; no source maps and no declarations. `allowJs` with
`checkJs` off lets a source import a JavaScript module of `src/`: the compiler reads
that module's JSDoc types and never emits it. `skipLibCheck` leaves the type packages of
the dependencies unchecked; every source of `src-ts/` is checked in full.

**Adding a module.**

1. Place it as §3 says, under `src-ts/<context>/`, and give it the header every module
   has: what it does, the rules it implements, and why it exists.
2. Import another TypeScript module by its relative path with `.js`
   (`import { x } from './other.js'`). Import a JavaScript module of `src/` by the path
   that holds from both trees, `../../src/<context>/<file>.js`: from `src-ts/<context>/`
   and from `src/<context>/` it names the same file.
3. Write its test first, under `tests/`, in JavaScript, requiring the compiled file
   (`require('../../src/<context>/<name>.js')`), and see it fail.
4. Write the module, then `npm run build:ts`, and commit the source and the compiled
   file together. A JavaScript module requires the compiled file like any other.
5. Run `npm run check:ts`, `npm run typecheck`, `npm run lint` (the strict rules of
   `typescript-eslint`, the house style and the size budgets of §2 apply to `src-ts/`;
   the compiled files are linted at their source) and `npm test`.

`tools/build-ts` refuses to write over a hand-written module of `src/`, and names a
compiled file whose source is gone, which is then deleted by hand.

**How it is checked.** `test.yml` runs `npm run check:ts` and `npm run typecheck` on every
leg. `tests/arch/typescript-parts.test.js` compiles `src-ts/` in memory and fails when a
committed file differs, when the compiler options lose a strict flag, when TypeScript
becomes a run-time dependency, and when a new agent-facing protocol module is plain
JavaScript: a file `src/distribution/mcp-*.js`, `src/distribution/a2a*.js`,
`src/application/hosting-http*.js` or under `bench/runners/` must be compiled from a
source under `src-ts/`, except the three MCP modules that predate this rule
(`mcp-stdio.js`, `mcp-tools.js`, `mcp-resources.js`). `tools/build-ts` compiles
`src-ts/` into `src/` only, so the first runner of `bench/runners/` also extends it.
The architecture scans of `tests/arch/` read the compiled files, which write
`require("…")` with double quotes, like every other module of `src/`.
