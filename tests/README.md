# `tests/` — every level of testing

**Summary.** The whole test suite of the specification and the engine: unit tests per
bounded context, integration tests of the command line, architecture tests, the
conformance vectors, the executed persona scenarios, tests of the standard itself and
end-to-end tests. `npm test` runs all of them that need nothing outside this
repository. Every test fixes its clock, reaches no network and cleans up after itself.

**Read first:** [docs/TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md) — the levels, the rule-coverage
matrix, the optional lanes and the three operating systems.

| Folder | Level | What it proves |
|---|---|---|
| [knowledge/](knowledge/README.md), [governance/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/governance/README.md), [composition/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/composition/README.md), [distribution/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/distribution/README.md), [boundary/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/boundary/README.md), [interchange/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/interchange/README.md), [adapters/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/adapters/README.md), [ports/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/ports/README.md) | unit | one module of `src/<same name>/` does what the rules it cites say |
| [application/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/application/README.md), [bin/](bin/README.md), [connectors/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/connectors/README.md) | integration | the command line, spawned as a user runs it, wires the modules together |
| [arch/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/arch/README.md) | architecture | boundaries, purity, pinned libraries, the package, the plugin contract |
| [security/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/security/README.md) | hostile input | the seeded fuzz lane: each text scanner finds what the pattern it replaced found, in a bounded number of steps per character |
| [vectors/](vectors/README.md) + [conformance/](conformance/README.md) | conformance | every required vector passes; the vectors are the language-neutral acceptance test |
| [acceptance/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/acceptance/README.md) | acceptance | the persona scenarios of `features/`, executed against the real command line; `pending/` holds one file per scenario that cannot run offline, with its class and reason |
| [standard/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/standard/README.md), [ontology/](ontology/README.md) | the standard itself | the specification, schemas, vectors and ontology agree with one another |
| [e2e/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/e2e/README.md) | end to end | a node written without the engine, the real Bundles, a real browser |
| [tools/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/tools/README.md), [bench/](https://github.com/andreibesleaga/agentic-system-core/blob/main/tests/bench/README.md) | checkers | each shipped checker and the benchmark kit |
| [fixtures/](fixtures/README.md) | — | the inputs the tests share |

## Run it

```bash
npm install
npm test                                  # everything that needs nothing outside the repository
npm run test:coverage                     # the suite measured over src/; fails below the coverage bar
node --test "tests/knowledge/*.test.js"   # one folder
node tools/rule-coverage --check          # every active rule has a check or a stated reason
```

Requires Node 22.13 or later. The suite gives the same result with and without
`SOURCE_DATE_EPOCH` in the environment, and under another time zone and locale.
