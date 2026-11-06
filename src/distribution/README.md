# `src/distribution/` — Distribution (Emission) — everything a node serves

**Summary.** This folder is the build. It writes every route of the route set: the HTML pages and their theme, the discovery document, the response headers, the agent-facing text files, the search index and the `/search/` page that searches it, the NOW page, the `/compose/` page, the `/query/` page with the query engine it ships, the ten tools over MCP and as page tools, and the files each hosting profile needs. It also holds the two use cases that drive a build, `init` and `ci`. It reads results from the other contexts and adds nothing to their meaning.

**Read after:** [the module guide](../README.md). **Specification:** `spec/06` (surfaces), `spec/09` §9.3 (the command line), `spec/10` §10.5 (hosting).
**May depend on:** `knowledge/`, `governance/`, `composition/`, `boundary/`, `ports/` (types only), `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/distribution/`.

## What each file does

| File | What it does |
|---|---|
| `site.js` | the build use case: every route, `build`, `write` and `verify` |
| `html.js` | the page templates |
| `graph-view.js` | the graph view of item and cluster pages (1.1, AGSC-06-38): the figure of an item's neighbourhood and its relations table with the backlinks and the meaning of each key, and the map of a cluster's members and the links among them, drawn from published items only; for `/clusters/`, the overview of how the clusters connect (figure and table, filtered by relation with no script) and the legend of the fourteen keys |
| `domain-view.js` | the domain layer on item pages (1.1, AGSC-06-38): on a node with a site vocabulary, the item's domain type, role, context and warrant in a definition list under the relations table, each with its label, and the other item's domain type and context as two more columns where a row's item has one; and whether the two page scripts of `/compose/` carry the domain parts of the brief and of the tool answers (only when a listed item states a domain key, so every other node's scripts keep their bytes) |
| `clusters-page.js` | what `/clusters/` carries beyond its list (1.1, AGSC-06-38): the overview, the legend and the explorer, and the two files the page loads |
| `explorer/` | the explorer of `/clusters/` (1.1, AGSC-06-38): the whole published graph as a picture with a list, a find box, a detail panel and a tooltip, operable from the keyboard alone. `graph-data.js` reads `/graph.jsonld`, `layout.js` places the nodes (no random number), `tooltip.js` cuts the summary and picks the tooltip's side, `controller.js` turns what the visitor does into the next state, `view.js` writes what is drawn and is the one way into the page (text as text, no handler, no style, only routes of this site as links), `main.js` wires the live page; `page.js` emits the script, made of the SOURCE TEXT of those functions, the stylesheet and the section. No dependency; tested in Node (`tests/distribution/explorer/`) and in a browser (`tests/distribution/explorer-browser.test.js`) |
| `query-page.js` | the `/query/` page (1.1, AGSC-06-39): an editor for SPARQL 1.1 over the node's own `/graph.nq`, run in the visitor's browser; the result as a table and, for a graph result, a picture; CSV and JSON downloads; a share link whose fragment holds the query; the ten questions of the graph as examples, filled in from the node (`query-examples.js`), and the node's own competency questions; the vocabulary explorer, with the node's site vocabulary. It writes the page, its script, its worker and its stylesheet, and copies the engine's files. Off with `site.query_page: false` |
| `query-examples.js` | what the examples and the vocabulary explorer of `/query/` say for one node (1.1, AGSC-06-39 (b), (f)): the values each of the ten questions is asked with (a subject the question has something to say about, a selection, the build's instant), the filled query and the sentence that says what was put in; the node's competency questions (AGSC-05-41) and its site vocabulary's classes and relations (AGSC-05-38). Runs at build time only; never shipped as source text |
| `query/` | the query page's portable functions, shipped as their own source text: `tokens.js` reads a query and refuses an update or a `SERVICE` clause before it runs, `view.js` writes the table, the picture's data, the status line and the share link, `engine.js` is the worker over the engine (the engine's own CSV and JSON writers), `main.js` wires the live page. Tested in Node (`tests/distribution/query/`) and in a browser (`tests/distribution/query-browser.test.js`) |
| `vendor/oxigraph-0.5.13/` | the query engine of `/query/`: one release of Oxigraph (WebAssembly), byte for byte, with its licence texts and a list of the crates that may be compiled into it, each with its licence expression; pinned by SHA-256 (`tests/arch/query-engine-pin.test.js`); its README says how to move to another release |
| `theme.js` | the default look of every engine-built page and the theme switcher |
| `front-page.js` | the front page `/`: the Bundle's own introduction, a Browse block with each non-empty type index and its count, and the footer's peer links |
| `internal-links.js` | the build's dangling-link check: every internal link a built page carries resolves to a route the same build emits (AGSC-06-01) |
| `discovery.js` | the discovery document (`/.well-known/knowledge-linkset`) and its checker |
| `headers.js` | `_headers` and `_redirects` |
| `llms.js` | `/llms.txt` and `/llms-full.txt`, byte for byte |
| `search.js` | the prebuilt search index, its tokenizer and the ranking a query gets over it |
| `search-page.js` | the `/search/` page's one script: the tokenizer and the ranking above as their own source text, so the box searches exactly as the index was built |
| `now.js` | the NOW page from stored state only |
| `compose-page.js` | the `/compose/` page: filters by text, cluster and tag, the verdict in words, the brief inline with its downloads and the blueprint of a saved architecture, the Harness and skills archives; no element inside `<main>` moves while it loads (the footer moves as the page grows, cumulative layout shift under 0.1) |
| `architecture-brief.js` | the brief on a saved architecture's item page, written by the build (AGSC-07-25) |
| `forge.js` | `dist/forge/`: files a forge needs |
| `mcp-stdio.js` | the `mcp` verb's entry: checks the Bundle and the two streams, starts the core |
| `mcp-core.js` | compiled from `src-ts/distribution/mcp-core.ts` (do not edit): the MCP core on the official SDK (`@modelcontextprotocol/server`) — one server for the ten tools, the resources and the prompt, revision 2026-07-28 and, over stdio, 2025-11-25 (AGSC-09-19) |
| `mcp-tools.js` | the ten tools |
| `mcp-resources.js` | the MCP resources and prompts beside the tools |
| `page-tools.js` | the ten tools as page tools in a built site |
| `tool-answers.js` | what 1.1 adds to the tools (the bound, the citation records, `brief`, `explain`, `check`, and the domain parts of `search` and `read`), portable: the local server calls it and the page-tool script carries its source (the domain parts only on a node whose items state a domain key) |
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
