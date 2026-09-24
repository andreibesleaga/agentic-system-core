# `tests/` — every level of testing

**Summary.** The whole test suite of the specification and the engine: unit tests per
bounded context, integration tests of the command line, architecture tests, the
conformance vectors, the executed persona scenarios, tests of the standard itself and
end-to-end tests. `npm test` runs all of them that need nothing outside this
repository. Every test fixes its clock, reaches no network and cleans up after itself.

**Read first:** [docs/TESTING.md](../docs/TESTING.md) — the levels, the rule-coverage
matrix, the optional lanes and the three operating systems.

| Folder | Level | What it proves |
|---|---|---|
| [knowledge/](knowledge/README.md), [governance/](governance/README.md), [composition/](composition/README.md), [distribution/](distribution/README.md), [boundary/](boundary/README.md), [interchange/](interchange/README.md), [adapters/](adapters/README.md), [ports/](ports/README.md) | unit | one module of `src/<same name>/` does what the rules it cites say |
| [application/](application/README.md), [bin/](bin/README.md), [connectors/](connectors/README.md) | integration | the command line, spawned as a user runs it, wires the modules together |
| [arch/](arch/README.md) | architecture | boundaries, purity, pinned libraries, the package, the plugin contract |
| [vectors/](vectors/README.md) + [conformance/](conformance/README.md) | conformance | every required vector passes; the vectors are the language-neutral acceptance test |
| [acceptance/](acceptance/README.md) | acceptance | the persona scenarios of `features/`, executed against the real command line; `pending.json` lists what cannot run offline, with a reason |
| [standard/](standard/README.md), [ontology/](ontology/README.md) | the standard itself | the specification, schemas, vectors and ontology agree with one another |
| [e2e/](e2e/README.md) | end to end | a node written without the engine, the real Bundles, a real browser |
| [tools/](tools/README.md), [bench/](bench/README.md) | checkers | each shipped checker and the benchmark kit |
| [fixtures/](fixtures/README.md) | — | the inputs the tests share |

## Run it

```bash
npm install
npm test                                  # everything that needs nothing outside the repository
node --test "tests/knowledge/*.test.js"   # one folder
node tools/rule-coverage --check          # every active rule has a check or a stated reason
```

Requires Node 22.13 or later. The suite gives the same result with and without
`SOURCE_DATE_EPOCH` in the environment, and under another time zone and locale.
