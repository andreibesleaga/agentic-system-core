# `plugins/` — the Claude Code plugin

**Summary.** [`agentic-system-core/`](agentic-system-core/README.md) is a Claude Code plugin that carries the agent skill of [`skills/agentic-system-core/`](../skills/README.md), byte for byte, and nothing else: no hooks, no tool server, no scripts. The marketplace file `.claude-plugin/marketplace.json` at the repository root points at this folder, so `claude plugin marketplace add andreibesleaga/agentic-system-core` finds it.

`tests/docs/agent-skill.test.js` keeps the two copies of the skill equal and holds the plugin to its content-only file list, so the plugin folder takes no file beyond that list. The plugin is not part of the npm package.
