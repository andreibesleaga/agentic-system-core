# `tests/acceptance/`

**Summary.** Acceptance tests: the persona scenarios of `features/*.feature`, parsed with
the Gherkin reference parser and run step by step against the real command line and the
real local tool server on a copy of `bundle/`; and the use cases of `docs/USE-CASES.md`,
run end to end in `use-cases/`. A scenario that cannot run offline, or that needs a
forge, a model, a browser or an outside service, is listed in `pending.json` with its
class and a sentence of reason, and is reported as skipped.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md),
"The acceptance scenarios".

| Path | What it holds |
|---|---|
| `features.test.js` | the scenario runner: every scenario, every example of an outline, one test each |
| `steps/` | the step definitions, one file per persona plus shared offline helpers |
| `bundle/` | the Bundle the scenarios run on (copied, never changed in place) |
| `pending.json` | the scenarios that cannot run offline, each with its reason |
| `use-cases/` | the use cases of `docs/USE-CASES.md`, end to end |

```bash
npm run test:acceptance
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
