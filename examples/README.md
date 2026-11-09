# `examples/` — working examples

**Summary.** Small programs that show how to connect a knowledge node to other tools
and how to extend the engine. Most of them are run by the test suite, so they stay
true; the few that need a framework or a service installed say so.

**Read after:** the root [README](../README.md).

| Folder | What is in it | Read with |
|---|---|---|
| [connectors/](connectors/README.md) | connecting a node to Claude Code, Codex, Cursor and agent frameworks | [docs/CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md) |
| [plugins/](plugins/README.md) | one minimal plugin of each of the eight kinds | [docs/PLUGINS.md](../docs/PLUGINS.md) |
| [demos/](demos/README.md) | the fixture files of every demo of the six modes, one folder per mode | [docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md) |
| [hosts/](hosts/README.md) | a hosting profile written outside the engine | [docs/ARCHITECTURE-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/ARCHITECTURE-GUIDE.md), "Where a node can live" |
| [blueprints/](blueprints/README.md) | three saved architectures, the engine itself, two linked knowledge sites and the agent tool server with a client, each turned into C4 diagrams, decision records and a build plan by `compose --from` | [docs/guides/mode-4.md](../docs/guides/mode-4.md) |

```bash
node --test tests/connectors/examples.test.js   # runs the connector examples offline
node --test tests/arch/plugin-contract.test.js  # proves every plugin sample against its kind
node --test tests/examples/blueprints.test.js   # builds the three blueprints and runs their dry runs
```
