# Testing

**Who this is for:** a developer or a contributor running or adding tests. **Read after:** [CODE-ORIENTATION.md](CODE-ORIENTATION.md).

## Summary

Every level of this distribution is tested, from one function to the whole command line on real Bundles, and every rule of the specification is accounted for. `npm test` runs the unit, integration and architecture tests, the conformance vectors, the executed acceptance scenarios, the tests of the standard itself and the end-to-end tests that need nothing outside this repository. Two further end-to-end lanes — the real Bundles and a real browser — are optional because they need files or a program the repository does not carry; each says why when it is skipped.

A generated matrix, [`docs/RULE-COVERAGE.md`](RULE-COVERAGE.md), lists for every active rule the checks that verify it. The suite fails when a rule has no check and no stated reason, and when that page is out of date. Rules the reference engine does not implement yet are listed there as gaps, with what is missing, and are never counted as verified.

## The levels

| Level | Where | What it proves | How to run it |
|---|---|---|---|
| Unit | `tests/<context>/` (`knowledge`, `governance`, `distribution`, `composition`, `interchange`, `boundary`, `adapters`, `ports`) | one module does what the rules it cites say, for the cases its title names | `npm test`, or `node --test "tests/knowledge/*.test.js"` |
| Integration | `tests/application/`, `tests/bin/`, `tests/connectors/` | the command line, spawned as a user runs it, wires the modules together; exit codes and envelopes | `npm test` |
| Architecture | `tests/arch/` | the context boundaries, the pinned libraries, the package's file list, the plugin contract | `npm test`; the slower audit lane with `AGSC_AUDIT=1` |
| Conformance vectors | `tests/vectors/`, run by `tests/conformance/vector-runner.test.js` | every required vector passes; withdrawn vectors are skipped and counted | `npm test`, or `agsc conform --level <n>` |
| Acceptance | `features/*.feature`, run by `tests/acceptance/features.test.js` with the steps of `tests/acceptance/steps/` | the persona scenarios, executed against the real command line and the real local tool server on a copy of `tests/acceptance/bundle/` | `npm run test:acceptance` |
| The standard itself | `tests/standard/` | the specification, schemas, vectors, route set, discovery relations and Internet-Draft agree with one another; the rules no vector pins; the rule-coverage matrix | `npm run test:standard` |
| End to end | `tests/e2e/` | a Level-0 node written without the engine passes the shipped checker; with the options below, the two real Bundles through every verb, and the page tools in a browser | `npm run test:e2e` |
| Checkers | `tests/tools/` | each shipped checker and generator on good and bad input, with no import from `src/` | `npm test` |

## The acceptance scenarios

The runner parses every feature file with the Gherkin reference parser and runs each scenario — each example of a Scenario Outline separately — as one test. Each step must match exactly one step definition. A scenario that cannot run offline, or whose text asks for something the specification does not define, is listed in `tests/acceptance/pending.json` with one of six classes (`browser`, `drift`, `external`, `forge`, `gap`, `model`) and a sentence of reason; it is reported as skipped and counted. The runner itself checks that every pending entry names a scenario, that every scenario that runs has a definition for each step, and that every step definition is used.

The persona files are written to the command line as `agsc <verb> --help` states it, so no scenario is pending as `drift`. What stays pending needs something the reference distribution does not ship: a forge, a model adapter, an outside service or a live browser session — or it waits on a `gap`, a rule the engine does not meet yet, whose steps are already written. A scenario listed under `conditional` in the same file runs wherever what it names is present on the machine (the port implementer's comparison with the Python checker package needs that package's checkout beside the engine and Python 3.9 or newer) and is reported as skipped, with the reason, elsewhere. Every step that runs offline does so under a preload that refuses every network call, so a scenario that passes also proves that its lane reached no network and no model service.

## The rule-coverage matrix

`node tools/rule-coverage` reads the rules of `spec/*.md` and, for each active rule, the checks that name it:

- a live conformance vector whose `rule` member is the rule (a withdrawn vector counts for nothing);
- a test whose title carries the rule id, or any file under `tests/` that carries a marker comment `// verifies AGSC-nn-nn, AGSC-nn-nn` — the marker states that the assertions of that file check those rules;
- an acceptance scenario that is executed, whose tags or steps carry the id;
- the header comment of a checker under `tools/validate-*`.

A rule no check names must be listed in `tests/rule-coverage.allow.json`, either under `rules` as prose-only — with one of the reasons `definition`, `scope`, `pointer`, `person`, `forge`, `deferred` or `adapter` and a sentence — or under `gaps`, with what the engine does not do yet. An allow entry for a rule that is in fact verified is an error, so the list stays short. `node tools/rule-coverage --write` regenerates the page; `--check` (run by the suite and by CI) fails when the page is stale; `--json` prints the whole matrix.

## Optional lanes

- **Real Bundles.** `AGSC_E2E=1 npm run test:e2e` copies the patterns node and the Bundle the main site hands the engine (by default from the sibling checkouts `../AgenticSystemCore-Patterns` and `../AgenticSystemCore.com/dist/engine-bundle`; override with `AGSC_E2E_PATTERNS` and `AGSC_E2E_SITE`) and runs lint, build twice with a byte comparison, verify, `verify --ledger`, ci, `conform --level 2`, every export form and adapter, skills and compose, then the shipped checkers on the output. No draft may appear in any published file.
- **Browser.** `AGSC_BROWSER=1` with `CHROME_EXE` naming a Chromium or chrome-headless-shell binary and `playwright-core` resolvable (installed outside the repository with `npm i --no-save`, reached through `NODE_PATH`) serves the built fixture from 127.0.0.1 with its own Content-Security-Policy, and checks that the seven page tools register and answer through a stubbed `document.modelContext`, and that a page without it logs no error.
- **Coverage.** `node --test --experimental-test-coverage --test-coverage-include="src/**" "tests/**/*.test.js"`; the bar is 99.9 % of lines.

## Determinism

Every test fixes its clock (`SOURCE_DATE_EPOCH`, or fixed git author and committer dates), gives a spawned command an empty git identity and a scratch home, reaches no network — a local server binds 127.0.0.1 only — and writes only under the system temporary directory, removing what it wrote. The suite gives the same result with and without `SOURCE_DATE_EPOCH` in the environment and under another time zone and locale.

## Three operating systems

`.github/workflows/test.yml` runs `npm ci`, `npm test`, the rule-coverage check and every shipped checker on Ubuntu, macOS and Windows, on Node 22 and 24, with read-only permissions and actions pinned to commit hashes. Paths are joined with `path.join`, text files are LF on every checkout (`.gitattributes`), and the test scripts quote their globs for `cmd.exe`.

## For a second implementation

- The conformance vectors are language-neutral JSON; `tests/vectors/README.md` states their format, and a claim of a Level is a green run of that Level's set in any language.
- The persona scenarios in `features/` are plain Gherkin: write step definitions against your own command line, as `tests/acceptance/steps/` does against this one, and use `tests/acceptance/pending.json` as the list of what the scenarios cannot yet show offline.
- `tests/standard/` reads only the specification, the schemas, the vectors and a build output, so its checks apply to any writer's output.
- `tests/e2e/level-0-without-engine.test.js` shows the smallest Level-0 node, written by a few lines of code, passing the shipped checker.
