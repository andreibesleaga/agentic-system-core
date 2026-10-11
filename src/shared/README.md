# `src/shared/` — Shared kernel — the two orderings and the trailing trims

**Summary.** Two files. `ordering.js` holds the two string orderings the whole system uses: UTF-16 order for JSON member names (RFC 8785) and code-point order for everything else. `trailing.js` holds the trailing-slash trim every context applies to a base address or a folder path, and the trailing line-feed trim of a text, in linear steps. Both depend on nothing, so that a context and an adapter can share them without either reaching into the other.

**Read after:** [the module guide](../README.md). **Specification:** `spec/04` (canonical bytes).
**May depend on:** nothing — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/knowledge/` (the ordering tests, `trailing-slashes-linear.test.js` and `trailing-feeds-linear.test.js`).

## What each file does

| File | What it does |
|---|---|
| `ordering.js` | `compareUtf16` and `compareCodePoint` |
| `trailing.js` | `withoutTrailingSlashes` and `collapseTrailingSlashes`: the trailing `/` run removed, or made one `/`, read back from the end; `withoutTrailingFeeds` and `withOneTrailingFeed`: the trailing line-feed run removed, or made one line feed, the same way |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§1).

## Working here

```bash
node --test "tests/knowledge/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
