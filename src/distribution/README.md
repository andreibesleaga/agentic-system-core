# `src/distribution/` — Distribution (Emission) — everything a node serves

**Summary.** This folder is the build. It writes every route of the route set: the HTML pages and their theme, the discovery document, the response headers, the agent-facing text files, the search index and the `/search/` page that searches it, the NOW page, the `/compose/` page, the seven tools over MCP and as page tools, and the files each hosting profile needs. It also holds the two use cases that drive a build, `init` and `ci`. It reads results from the other contexts and adds nothing to their meaning.

**Read after:** [the module guide](../README.md). **Specification:** `spec/06` (surfaces), `spec/09` §9.3 (the command line), `spec/10` §10.5 (hosting).
**May depend on:** `knowledge/`, `governance/`, `composition/`, `boundary/`, `ports/` (types only), `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/distribution/`.

## What each file does

| File | What it does |
|---|---|
| `site.js` | the build use case: every route, `build`, `write` and `verify` |
| `html.js` | the page templates |
| `graph-view.js` | the graph view of item and cluster pages (1.1, AGSC-06-38): the figure of an item's neighbourhood and its relations table with the backlinks and the meaning of each key, and the map of a cluster's members and the links among them, drawn from published items only; for `/clusters/`, the overview of how the clusters connect (figure and table, filtered by relation with no script) and the legend of the fourteen keys |
| `clusters-page.js` | what `/clusters/` carries beyond its list (1.1, AGSC-06-38): the overview, the legend and the explorer, and the two files the page loads |
| `explorer/` | the explorer of `/clusters/` (1.1, AGSC-06-38): the whole published graph as a picture with a list, a find box, a detail panel and a tooltip, operable from the keyboard alone. `graph-data.js` reads `/graph.jsonld`, `layout.js` places the nodes (no random number), `tooltip.js` cuts the summary and picks the tooltip's side, `controller.js` turns what the visitor does into the next state, `view.js` writes what is drawn and is the one way into the page (text as text, no handler, no style, only routes of this site as links), `main.js` wires the live page; `page.js` emits the script, made of the SOURCE TEXT of those functions, the stylesheet and the section. No dependency; tested in Node (`tests/distribution/explorer/`) and in a browser (`tests/distribution/explorer-browser.test.js`) |
| `theme.js` | the default look of every engine-built page and the theme switcher |
| `front-page.js` | the front page `/`: the Bundle's own introduction, a Browse block with each non-empty type index and its count, and the footer's peer links |
| `internal-links.js` | the build's dangling-link check: every internal link a built page carries resolves to a route the same build emits (AGSC-06-01) |
| `discovery.js` | the discovery document (`/.well-known/knowledge-linkset`) and its checker |
| `headers.js` | `_headers` and `_redirects` |
| `llms.js` | `/llms.txt` and `/llms-full.txt`, byte for byte |
| `search.js` | the prebuilt search index, its tokenizer and the ranking a query gets over it |
| `search-page.js` | the `/search/` page's one script: the tokenizer and the ranking above as their own source text, so the box searches exactly as the index was built |
| `now.js` | the NOW page from stored state only |
| `compose-page.js` | the `/compose/` page |
| `forge.js` | `dist/forge/`: files a forge needs |
| `mcp-stdio.js` | the local MCP server over stdio (official SDK) |
| `mcp-tools.js` | the seven tools |
| `mcp-resources.js` | the MCP resources and prompts beside the tools |
| `page-tools.js` | the seven tools as page tools in a built site |
| `webmcp.js` | the browser transport for page tools |
| `init.js` | the `init` use case |
| `ci.js` | the `ci` use case: lint, build twice, compare, verify |
| `hosts/` | the seven hosting profiles (Cloudflare Pages is the reference) and their shared rules |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§9 and §10).

## Working here

```bash
node --test "tests/distribution/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
