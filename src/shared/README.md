# `src/shared/` — Shared kernel — the two orderings, the trailing trims and the line reader

**Summary.** Three files. `ordering.js` holds the two string orderings the whole system uses: UTF-16 order for JSON member names (RFC 8785) and code-point order for everything else. `trailing.js` holds the trailing-slash trim every context applies to a base address or a folder path, and the trailing line-feed trim of a text, in linear steps. `key-value-line.js` reads the rest of one line after a fixed head (a "key: value" line of a foreign frontmatter block, a heading's text) in linear steps. All three depend on nothing, so that a context and an adapter can share them without either reaching into the other.

**Read after:** [the module guide](../README.md). **Specification:** `spec/04` (canonical bytes).
**May depend on:** nothing — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/knowledge/` (the ordering tests, `trailing-slashes-linear.test.js`, `trailing-feeds-linear.test.js` and `key-value-line-linear.test.js`).

## What each file does

| File | What it does |
|---|---|
| `ordering.js` | `compareUtf16` and `compareCodePoint` |
| `trailing.js` | `withoutTrailingSlashes` and `collapseTrailingSlashes`: the trailing `/` run removed, or made one `/`, read back from the end; `withoutTrailingFeeds` and `withOneTrailingFeed`: the trailing line-feed run removed, or made one line feed, the same way |
| `key-value-line.js` | `keyValueLine`, `lineRest` and `lineText`: the key and value of a "key: value" line, or the text after a fixed head and its blanks, with one match of the head, one search for a line terminator and one slice; `hasLineTerminator`: whether a text holds a line feed, a carriage return, U+2028 or U+2029 |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§1).

## Working here

```bash
node --test "tests/knowledge/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
