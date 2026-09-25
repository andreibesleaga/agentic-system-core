# `examples/demos/agents/` — two ways to call a tool

**Summary.** Two scripts that stand in for an assistant, so the agent demos can make
real tool calls with nothing but Node. Both print the tool's answer as indented
JSON and exit 1 on a refusal; neither writes a file.

| Script | What it does | Run as |
|---|---|---|
| `mcp-call.js` | starts `agsc mcp` in the current Bundle, sends the three JSON-RPC lines every Model Context Protocol client sends first (`initialize`, `notifications/initialized`, `tools/call`), prints the answer | `node mcp-call.js <tool> '<json arguments>'` inside a Bundle |
| `page-tools.js` | loads the three scripts an item page of a built node loads, with a `fetch` that reads the node's own files, and calls one tool the way the page's WebMCP registration does | `node page-tools.js <built node> <tool> '<json arguments>'` |

The tools are the seven of the specification: `search`, `read`, `links`, `compose`,
`ask`, `propose`, `remember`. For the same Bundle and the same arguments the two
scripts print the same bytes; [docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md) shows it.
