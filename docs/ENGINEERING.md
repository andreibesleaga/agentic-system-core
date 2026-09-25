# Engineering: the gates, the limits, the dependency rule, and how the repositories are checked

**Summary.** Every change to this engine passes the same set of checks on one machine
and in the forge: the test suite, a linter with zero warnings, a dependency-rule
checker, a duplication limit, the rule-coverage and requirements matrices, the
public-hygiene sweep and, for a release, a dry run of the release lane. This page says
what each check enforces, how to run it, what the size limits are and why they exist,
how to add a module without breaking the dependency rule, and how the workflows of
the five repositories fit together. Nothing here is normative: where this page and a
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
| Dependency rule | `npm run arch` | dependency-cruiser over `src/`, `bin/` and `index.js` with the map of §3: each part of `src/` may require only the parts its row allows; the pure contexts use no Node built-in but `crypto`; an adapter is constructed only by the application layer or `bin/`; Interchange and Distribution never require each other; no module requires a sample plugin, a checker or `examples/`; no devDependency at run time; no undeclared or unresolvable require; no cycle; no orphan. |
| Purity | part of `npm test` (`tests/arch/core-purity.test.js`) | No bounded context touches `process`, `Date.now`, `new Date`, `Math.random`; the outside world is reached through a port. |
| Duplication | `npm run duplicates` | jscpd over the same files: at most 2 % duplicated lines. The clones kept on purpose are listed in §2. |
| Rule coverage | `npm run rule-coverage` | Every active rule of `spec/` is verified by a vector, a test, an executed scenario or a checker, or is prose-only for a stated reason; [RULE-COVERAGE.md](RULE-COVERAGE.md) is current. `node tools/rule-coverage --write` regenerates the page. |
| Requirements | `npm run requirements` | Every requirement of [PRD.md](PRD.md) is traced by a rule or named by a test or a live vector, or stays unmapped for a stated reason; [REQUIREMENTS-MATRIX.md](REQUIREMENTS-MATRIX.md) is current. `node tools/requirements-matrix --write` regenerates the page. |
| Counts | `node tools/count-artifacts --json` | Every published count (rules, codes, vectors, terms) is derived from the files, never typed; `ok: true` and no finding. |
| Validators | `for t in tools/validate-*; do node "$t" --json; done` | The independent checkers over the distribution: rule text, schemas, ontology, vectors, scenarios, diagrams; the discovery document of a fixture build at Level 2 (`validate-wellknown`). |
| Hygiene | `node tools/public-hygiene .` | "Public means clean": no private path, working-process vocabulary, secret, e-mail address, personal data beyond the canonical name, or forbidden wording in any file of the tree. The allowed hits, each with its reason, are in `.public-hygiene.json`. 0 errors. |
| Audit | `npm run audit` | `npm audit --audit-level=low`: 0 advisories on the pinned dependency set. |
| Release | `node tools/release --json` | The release lane as a dry run: the version in `package.json`, the alias package and the changelog agree; the package file list ships what it must and nothing private; the provenance step is present. Nothing is published. |
| Node floor | part of `npm test` (`tests/arch/node-floor.test.js`) | `engines.node` of both packages equals the lowest Node of every workflow matrix, so the floor is a version a run has exercised. |

Before opening a pull request, the short form is:

```bash
npm run lint && npm run arch && npm run duplicates && npm test \
  && npm run rule-coverage && npm run requirements && node tools/public-hygiene .
```

## 2. The size limits, and why

The linter carries five budgets per file class. Each budget is the largest value
measured on the day the gate was introduced, rounded up: the gate was set to hold the
code at its size, not to describe an ideal. A change may lower a budget; a change may
not raise one without saying so in the pull request, because a silent raise is how a
limit stops meaning anything.

| Budget | Engine code (`src/`, `bin/`, `tools/`, `index.js`) | Tests |
|---|---:|---:|
| Cyclomatic complexity of a function | 150 | 30 |
| Lines per function | 660 | 210 |
| Nesting depth | 7 | 5 |
| Parameters of a function | 7 | 6 |
| Lines per file | 1,960 | 770 |

The functions nearest the top of these budgets are the site builder, the discovery
checker, the diagram compiler and the command-line entry; each is a candidate for a
split into per-route or per-check functions, and the budgets hold them where they are
until that happens.

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
| `shared/` | nothing inside `src/` (the shared kernel: the two string orderings) |
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
   first speaks foreign formats, the second this format's own surfaces.
3. **Reach the host through a port.** `knowledge/`, `governance/`, `composition/`,
   `interchange/`, `distribution/` and `shared/` may use the Node built-in `crypto`
   and nothing else; the Boundary may also use `net` and `url` to classify addresses
   without opening a connection. Anything else — `fs`, `child_process`, a socket, the
   clock — is an adapter, and only `application/` and `bin/` construct one.
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

Five public repositories carry the work. Each has its own workflow file; none holds a
secret; every action is pinned to a commit hash with the version beside it, so that a
moved tag cannot change what runs; every job has read-only permissions unless it
publishes.

| Repository | Workflow | Runs on | What it runs |
|---|---|---|---|
| `agentic-system-core` (this engine) | `test.yml` on every push and pull request | Ubuntu, macOS, Windows × Node 22.13.0 and 24 (six legs), plus one `actionlint` job on Ubuntu | `npm ci`, lint, the dependency rule, the suite, rule coverage, every validator, `validate-wellknown` at Level 2 on a fixture build; `actionlint` over the workflow files themselves |
| | `release.yml` on a `v*` tag | the same six legs, then one publish job | the gates again, the release dry run, hygiene, the architecture lane; then npm trusted publishing with build provenance |
| `AgenticSystemCore.com` (the reference site) | `test.yml` on every push and pull request | Ubuntu, Node 22.13.0, the engine checked out beside it | `node scripts/build.js && node scripts/check.js` (two identical builds equal to the committed output; the discovery document at Levels 0 and 2; links, headers, contrast, hygiene), `node scripts/page-tools-check.js`, the hygiene sweep; the browser lane (`scripts/a11y.js`, axe-core) on request |
| `AgenticSystemCore-Patterns` (the second node) | `test.yml` on every push and pull request | Ubuntu, Node 22.13.0, the engine checked out beside it | `agsc lint`, `agsc build`, `agsc verify --ledger`, `agsc ci`, `agsc conform --level 2`, `validate-wellknown --level 2` on the built discovery document, `publish-set --check`, the hygiene sweep |
| `agentic-system-core-python` (the Python package) | `test.yml` on every push and pull request | Ubuntu 24.04, Python 3.9 and 3.13, the engine beside it with Node 22.13.0 | `pytest` under `coverage` (the equivalence tests run the engine's checker and vector runner); on 3.13 also `ruff check` and `mypy` at exact pins |
| | `release.yml` on a `v*` tag | Ubuntu 24.04 | the tests, one build, PyPI trusted publishing |
| `agentic-system-core-php` (the PHP package) | none yet | — | the checks are run by hand until a workflow exists |

**The engine beside the other repositories.** The site, the patterns node and the
Python package all need the engine at a known state: the site's generator reads the
specification and the engine emits every machine file; the patterns node is built by
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
legs and the `actionlint` job; for the site the `site` job; for the patterns node the
`node` job; for the Python package the two `tests` legs and the `lint` job. GitHub's
own page (read 2026-09-25) names the path: Settings → Branches → "Add classic branch
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
