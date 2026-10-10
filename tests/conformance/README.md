# `tests/conformance/`

**Summary.** The conformance vector runner: `vector-runner.test.js` runs every vector of `tests/vectors/` through the handlers in `areas/` and prints one summary line; `pending.json` lists any vector held back (empty today). Subject: `tests/vectors/`.

The handlers of the `build`, `bundle`, `chunks`, `cli`, `discovery`, `export`, `frontmatter`, `links`, `lint`, `prov` and `slug` areas are guarded by `areas/_expected-reads.js` (tested by `expected-reads.test.js`, `guarded-areas.test.js`, `guarded-handlers.test.js` and `guarded-discovery.test.js`): a pass that left a member of a case's `expected` unread becomes a fail, and a case with no handler fails, so no case passes without being checked.

`vectors-readme.test.js` checks that `tests/vectors/README.md` names every member a case uses, and `codes-asserted.test.js` that every registered error code is asserted by a case or named, with its reason, in the registry's paragraph "Codes no case asserts" (`spec/09-conformance.md` §9.4).

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md).

```bash
node --test "tests/conformance/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
