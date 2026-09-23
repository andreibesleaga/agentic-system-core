# OpenAI Agents SDK — ILLUSTRATIVE (not executed by the test suite)

The SDK's Sessions "maintain conversation history across multiple agent runs"; they
hold conversation items, not knowledge, and "the documentation does not describe
any built-in export/interchange formats or data provenance tracking mechanisms"
(openai.github.io/openai-agents-python/sessions/, read 2026-09-23). So the connector
is **not** a session adapter. Use one of two routes:

- **Live tools.** Run the node's MCP server over stdio — `agsc mcp` in the Bundle
  directory — and attach it to the agent as an MCP server. It serves seven tools
  (`search`, `read`, `links`, `compose`, `propose`, `ask`, `remember`); `propose` and
  `remember` return text and never save it. The SDK's own MCP class names are not
  quoted here because this package did not re-read that page; take them from the
  SDK's MCP documentation.
- **A retrieval corpus.** Build the node (`agsc build`) and index `/chunks.jsonl`
  in your own vector store; keep `iri`, `digest` and `trust` beside each vector.
