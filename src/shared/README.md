# `src/shared/` — Shared kernel — the two orderings

**Summary.** One file, `ordering.js`, with the two string orderings the whole system uses: UTF-16 order for JSON member names (RFC 8785) and code-point order for everything else. It depends on nothing, so that a context and an adapter can share it without either reaching into the other.

**Read after:** [the module guide](../README.md). **Specification:** `spec/04` (canonical bytes).
**May depend on:** nothing — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/knowledge/ (the ordering tests)`.

## What each file does

| File | What it does |
|---|---|
| `ordering.js` | `compareUtf16` and `compareCodePoint` |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§1).

## Working here

```bash
node --test "tests/knowledge/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
