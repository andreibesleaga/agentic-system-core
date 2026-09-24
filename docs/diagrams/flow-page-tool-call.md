# Flow — one page tool call

**What this shows.** What happens when a browser's own agent calls a tool on a built
page. The page registers the seven tools only when the browser offers
`document.modelContext`; the tool reads the node's own published files from the same
origin — no server, no key, no other host — and answers exactly what the local MCP
server would answer for the same input over the published items.

```mermaid
sequenceDiagram
  participant AG as Browser agent
  participant MC as document.modelContext
  participant PG as Page script (page tools)
  participant NODE as Same origin (published files)
  PG->>MC: registerTool() x7 (search, read, links, compose, ask, propose, remember)
  AG->>MC: executeTool("search", {query})
  MC->>PG: call search
  PG->>NODE: GET /search.json
  NODE-->>PG: prebuilt index
  PG->>NODE: GET /pages/slug.md
  NODE-->>PG: item text
  PG-->>MC: result, trust untrusted, item IRIs
  MC-->>AG: result
  Note over PG,NODE: propose and remember return text and write nothing
```

Trace: AGSC-09-13 (the seven tools), AGSC-09-16 (page tools equal the local server),
AGSC-06-16 (the search index), AGSC-06-05 (no other origin), AGSC-11-18 (the hints).
