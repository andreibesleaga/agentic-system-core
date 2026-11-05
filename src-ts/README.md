# `src-ts/` — the TypeScript parts of the engine

**Summary.** The sources of the engine's TypeScript parts: the modules that speak a protocol to agents (the Model Context Protocol core and its HTTP transport, the A2A responder, the narration step of the brief, the benchmark runners) and any later agent-facing module. Each source `src-ts/<context>/<name>.ts` is compiled by `tools/build-ts` to CommonJS at `src/<context>/<name>.js`, and the compiled file is committed with a first line that names its source and the compiler. What runs and what ships is that compiled file; this folder does not ship. Today it holds one module, `shared/version-line.ts`, the proof of the chain: the line `agsc --version` prints, required by its test only.

**Read after:** [the module guide](../src/README.md). **Read next:** [docs/ENGINEERING.md](../docs/ENGINEERING.md) §8, the commands, the compiler options and how to add a module.
**May depend on:** what the same folder of `src/` may depend on (`npm run arch`, [docs/ENGINEERING.md](../docs/ENGINEERING.md) §3). Each context folder of `src-ts/` is described by the README of the same folder under `src/`.
**Tests:** `tests/arch/typescript-parts.test.js` (the committed output equals the sources; strict options; no TypeScript at run time; no new protocol module in plain JavaScript), `tests/tools/build-ts.test.js`, and each module's own test under `tests/`.

## Working here

```bash
npm run build:ts    # compile src-ts/ and write the changed files under src/
npm run check:ts    # write nothing; exit 1 when a committed file is stale
npm run typecheck   # tsc --noEmit
npm run lint        # typescript-eslint's strict rules, the house style, the size budgets
```

Commit a source and its compiled file together; never edit a compiled file by hand.
