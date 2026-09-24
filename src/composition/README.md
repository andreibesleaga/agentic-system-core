# `src/composition/` — Composition — from a selection of items to something that runs

**Summary.** This folder answers "given these Concepts, what do I get?". It closes a selection over its links, checks it for conflicts, writes the seven files of a Harness, builds the published skill packs, writes the deterministic ZIP archive, and ships the same algebra to the browser so that the `/compose/` page and `agsc compose` give the same bytes. It is pure.

**Read after:** [the module guide](../README.md). **Specification:** `spec/07` (composition), `spec/02` §2.10 (saved architectures).
**May depend on:** `knowledge/`, `ports/` (types only), `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/composition/`.

## What each file does

| File | What it does |
|---|---|
| `compose.js` | selection, closure and the verdict (conflicts, missing parts) |
| `architecture.js` | a saved architecture: a selection kept as an item |
| `harness.js` | the seven Harness files |
| `skills.js` | the published skill packs and their lockfile |
| `archive.js` | the deterministic ZIP container (store only, fixed timestamps) |
| `browser.js` | the browser build of the algebra, so the page runs the same code |
| `conform.js` | the conformance report and the Level a run supports |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§10).

## Working here

```bash
node --test "tests/composition/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
