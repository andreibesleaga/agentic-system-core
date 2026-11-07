# `src-ts/` — the TypeScript parts of the engine

**Summary.** The sources of the engine's TypeScript parts: the new modules that carry a protocol's messages to agents (the Model Context Protocol core and its HTTP transport, the A2A agent card, an A2A responder when one is written (2.0), the benchmark runners) and any later module in the places `tests/arch/typescript-parts.test.js` checks. Each source `src-ts/<context>/<name>.ts` is compiled by `tools/build-ts` to CommonJS at `src/<context>/<name>.js`, and each benchmark runner `src-ts/bench/<name>.ts` to `bench/runners/<name>.js`; the compiled file is committed with a first line that names its source and the compiler. What runs and what ships is that compiled file, except the install layer's runner `bench/runners/install.js`, which stays in the repository with `bench/measure.js`, its only caller; this folder does not ship. Today it holds six modules: `shared/version-line.ts`, the proof of the chain (the line `agsc --version` prints, which the command line prints through it), `distribution/mcp-core.ts`, the MCP core of the tool server: a thin adapter on the official MCP TypeScript SDK (`@modelcontextprotocol/server`) that serves the ten tools, the resources and the prompt under revision 2026-07-28 and, over standard input and output, 2025-11-25 (AGSC-09-19), and `distribution/mcp-http.ts`, its Streamable HTTP transport (`agsc mcp --http`, AGSC-09-18): wiring of the SDK's `createMcpHandler` and the official Node adapter `@modelcontextprotocol/node`, with no socket of its own, and `distribution/a2a-card.ts`, the A2A agent card of AGSC-06-34, typed as the official A2A SDK's `AgentCard` and written by its codec (`@a2a-js/sdk`), and `bench/kit.ts`, the runner that checks the kit of the agent-side study (the gold index against a build, the gold labels, the results-row contract through Ajv) for `tools/bench --dry-run` and writes the gold index from builds, and `bench/install.ts`, the `install` layer of `bench/measure.js` (the install of the packed tarball, the cold start, the module trace); like `tools/bench` they require nothing of `src/`.

**Read after:** [the module guide](../src/README.md). **Read next:** [docs/ENGINEERING.md](../docs/ENGINEERING.md) §8, the commands, the compiler options and how to add a module.
**May depend on:** what the same folder of `src/` may depend on (`npm run arch`, [docs/ENGINEERING.md](../docs/ENGINEERING.md) §3); `bench/` on nothing of `src/`. Each context folder of `src-ts/` is described by the README of the same folder under `src/`, and `bench/` by [bench/README.md](../bench/README.md).
**Tests:** `tests/arch/typescript-parts.test.js` (the committed output equals the sources; strict options; no TypeScript at run time; no new protocol module in plain JavaScript), `tests/arch/bench-runners.test.js` (a runner requires nothing of `src/` and reads no clock, and the runner `tools/bench` calls ships), `tests/tools/build-ts.test.js`, and each module's own test under `tests/`.

## Working here

```bash
npm run build:ts    # compile src-ts/ and write the changed files under src/
npm run check:ts    # write nothing; exit 1 when a committed file is stale
npm run typecheck   # tsc --noEmit
npm run lint        # typescript-eslint's strict rules, the house style, the size budgets
```

Commit a source and its compiled file together; never edit a compiled file by hand.
