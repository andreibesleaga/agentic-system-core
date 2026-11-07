# `src/composition/` — Composition — from a selection of items to something that runs

**Summary.** This folder answers "given these Concepts, what do I get?". It closes a selection over its links, checks it for conflicts, writes the seven file kinds of a Harness (two of them one file per selected item), builds the published skill packs, writes the deterministic ZIP archive, and ships the same algebra to the browser so that the `/compose/` page and `agsc compose` give the same bytes. From 1.1 it also explains a composition in a brief written beside the Harness, never inside it. It is pure.

**Read after:** [the module guide](../README.md). **Specification:** `spec/07` (composition), `spec/02` §2.10 (saved architectures).
**May depend on:** `knowledge/`, `ports/` (types only), `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/composition/`.

## What each file does

| File | What it does |
|---|---|
| `compose.js` | selection, closure and the verdict (conflicts, missing parts) |
| `architecture.js` | a saved architecture: a selection kept as an item |
| `harness.js` | the seven Harness file kinds |
| `context-map.js` | the context map of a composition, `context-map.json` beside the Harness, written only for a node that declares bounded contexts (AGSC-07-30) |
| `brief.js` | the brief of a composition, valid or not: `brief.json`, `BRIEF.md`, `context.md` and `brief.mmd` beside the Harness, in the dependency order, with the gaps and the checklist (AGSC-07-25…07-27), and, when a member states a key of AGSC-02-25 or a domain link joins, the domain paragraph (`DOMAIN_PORTABLE`; `domainOf` is the one reader of the parts for pages and tools, `domainWithheld` and `domainWithin` leave out a context that is a cluster not listed); its functions run in the page too |
| `blueprint.js` | the blueprint outputs of a saved architecture: the three C4 levels, one decision record per decision the members cite and a build plan, in `blueprint/` beside the Harness (AGSC-07-29); its functions run in the page too |
| `skills.js` | the published skill packs and their lockfile |
| `skill-format.js` | the Agent Skills check of a `SKILL.md` before it is written: the six fields, the bounds of `name` (at most 64, equal to the directory) and `description` (at most 1024), one code per fault; a published pack that fails is not written, a bound fault in a Harness skill file is a warning (AGSC-07-22) |
| `archive.js` | the deterministic ZIP container (store only, fixed timestamps) |
| `browser.js` | the browser build of the algebra, so the page runs the same code; it carries `DOMAIN_PORTABLE`, the declared contexts that are listed and the domain links only on a node whose listed items state a domain key or a domain link |
| `conform.js` | the conformance report and the Level a run supports |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§10).

## Working here

```bash
node --test "tests/composition/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
