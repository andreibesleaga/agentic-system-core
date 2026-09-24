# `src/boundary/` — Boundary — where a node meets the outside

**Summary.** This folder is the anti-corruption layer. Everything that crosses the edge of a node passes here: another node (peers and the federation walk), a stranger who may not see everything (visibility, restricted nodes, cross-origin headers), and the agent surfaces whose outside specifications move (MCP, WebMCP, the A2A card). An outside change moves a declared version or a plugin here, never the core.

**Read after:** [the module guide](../README.md). **Specification:** `spec/11` (the boundary).
**May depend on:** `knowledge/`, `ports/` (types only), `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/boundary/`.

## What each file does

| File | What it does |
|---|---|
| `federation.js` | peers, the client-side federation walk, fetch safety, peer citations |
| `visibility.js` | what a stranger may see: CORS, `no-cache`, restricted nodes, the profile link header |
| `surfaces.js` | the surface declaration and the plugin contract: declare, pin, inherit, prove |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§10).

## Working here

```bash
node --test "tests/boundary/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
