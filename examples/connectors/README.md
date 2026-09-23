# Connector examples

Small, working examples of the four ways an agent can use a published knowledge
Bundle. `docs/CONNECTORS.md` explains the routes and which one a framework wants;
this folder is the code.

**Executed by the test suite** (`tests/connectors/examples.test.js`, offline, on the
engine's own test Bundle, with a fixed build instant):

| example | what it does in your project |
|---|---|
| `claude-code/connect.js <bundle> <project>` | writes the node's steering to `.agsc/CLAUDE.md` and, only if you have no `CLAUDE.md`, a one-line `CLAUDE.md` that imports it; copies the skill packs into `.claude/skills/` after checking each against the lockfile; copies the skim view `llms-ctx.txt`, the recall hook `agsc-recall.js` and a hook snippet `.claude/settings.agsc.json` for you to merge |
| `claude-code/agsc-recall.js [ctx-file]` | reads a prompt on stdin (plain text or `{"prompt": …}`) and prints the three sections of `llms-ctx.txt` that share the most words with it, still fenced as quoted data |
| `codex/connect.js <bundle> <project> [--override]` | writes `AGENTS.md` if you have none; with `--override`, also `AGENTS.override.md`, which Codex reads **instead of** `AGENTS.md` |
| `cursor/connect.js <bundle> <project>` | writes `.cursor/rules/agsc.mdc` and reports its length against Cursor's 500-line guidance |
| `frameworks/records.js <chunks.jsonl> <langgraph\|autogen\|mem0>` | reshapes a node's `/chunks.jsonl` into the record shape each store takes, keeping the IRI, digest, licence, terms and trust mark |

**Illustrative only — not executed by any test** (they need a framework installed
and, for some, a running service; none contains a key):

| file | route |
|---|---|
| `frameworks/langgraph_store.py` | seed a LangGraph store from `records.js langgraph` |
| `frameworks/autogen_memory.py` | load `records.js autogen` into an AutoGen memory |
| `frameworks/crewai_knowledge.md` | CrewAI: why the citation must live in the text, and skills for procedures |
| `frameworks/openai_agents_mcp.md` | OpenAI Agents SDK: the MCP server, or the chunk corpus — not a session |
| `frameworks/letta_mem0_via_cogx.md` | Letta, Mem0, Zep/Graphiti, LangMem through one COGX archive |

Every example writes into YOUR project and never over a file you already have,
except its own earlier copies. Nothing here reaches a network.
