# agentic-system-core — Claude Code plugin

This plugin carries one skill, `agentic-system-core`, that teaches Claude Code to use the AgenticSystemCore engine (`agsc`): turn a folder of Markdown into a knowledge node, read and cite a published node, write items that pass the checks, prepare a change as a proposal for a person to merge, compose a harness, and export skill packs, steering files and boards. It is plain Markdown: it runs no script, starts no server and sends nothing anywhere. The engine itself is a separate install (`npm install -g agentic-system-core`, or `npx -y agsc-cli <verb>`).

```bash
claude plugin marketplace add andreibesleaga/agentic-system-core
claude plugin install agentic-system-core@agentic-system-core
```

The same skill, for any agent that reads Agent Skills, is in [`skills/agentic-system-core/`](../../skills/agentic-system-core/SKILL.md) at the root of this repository, and on the site at <https://agenticsystemcore.com/docs/agent-skill/>. The plugin does not start the engine's tool server (`agsc mcp`): that server serves the Bundle of the folder it starts in, so it is added per project, as the skill's `references/connectors.md` shows.

The skill text is CC0-1.0.
