# `src/application/` — Application layer — the command line and the wiring

**Summary.** This folder runs use cases across the contexts and owns no domain rule of its own. It holds configuration loading, the command line with one module per verb, the Bundle loader, the conformance run, the plugin contract and loader, and `agsc-host`. It is the only layer, besides `bin/`, allowed to construct an adapter.

**Read after:** [the module guide](../README.md). **Specification:** `spec/09` (the command line and the conformance run), `spec/00` §0.6 (plugins), `spec/01` §1.8 (configuration).
**May depend on:** every context, `ports/`, `adapters/`, `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/application/`.

## What each file does

| File | What it does |
|---|---|
| `cli/main.js` | verb dispatch, global flags, usage and help, the diagnostics envelope |
| `cli/verbs/` | one module per verb of the sixteen, plus shared helpers |
| `config/load.js` | the configuration layers and their precedence |
| `config/env.js` | the `.env` file and the `AGSC_*` environment names |
| `bundle.js` | the Bundle loader: reads a folder into the Bundle record |
| `conformance.js` | the vector run shared by `agsc conform` and the test suite |
| `plugins.js` | the plugin contract: one registry per kind of the eight |
| `plugin-loader.js` | how a verb finds a plugin: a path or an installed package, never the network |
| `hosting.js` | `agsc-host`: list, emit, serve, verify-anchor |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§6 and §11).

## Working here

```bash
node --test "tests/application/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
