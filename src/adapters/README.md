# `src/adapters/` — Adapters — the Node implementations of the ports

**Summary.** The four ports implemented over Node: the file system (with the size cap, the path checks and strict UTF-8 decoding), the clock over `SOURCE_DATE_EPOCH`, a process runner with no shell and a scrubbed environment, and a network that refuses every call. Only the application layer and `bin/` may require them.

**Read after:** [the module guide](../README.md). **Specification:** `spec/01` §1.3 (paths and discovery order), `spec/04` (the clock and the network).
**May depend on:** `ports/`, `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/adapters/`.

## What each file does

| File | What it does |
|---|---|
| `node-fs.js` | FileSystem over `node:fs`, plus the one door the schemas and the ontology enter by |
| `node-clock.js` | Clock over `SOURCE_DATE_EPOCH` |
| `node-proc.js` | ProcessRunner over `child_process`, no shell, stderr captured |
| `node-network-refusing.js` | a Network that refuses every call |
| `node-http-server.js` | the read-only HTTP server of `agsc-host serve`; what it answers is the `local` profile's decision |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§2).

## Working here

```bash
node --test "tests/adapters/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
