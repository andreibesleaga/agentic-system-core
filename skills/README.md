# `skills/` — the agent skill

**Summary.** `agentic-system-core/` is a skill in the Agent Skills format (`SKILL.md` plus two reference files) that teaches a coding agent to use this engine in every mode. Agents and skill directories that read `skills/<name>/SKILL.md` find it here. The Claude Code plugin in [`plugins/agentic-system-core/`](../plugins/agentic-system-core/README.md) carries the same files, and `tests/docs/agent-skill.test.js` keeps the two copies equal.

**Who this is for:** a person installing the skill, or a directory indexing it. **Read after:** the root [README](../README.md).

```bash
npx skills add andreibesleaga/agentic-system-core     # the skills CLI (skills.sh)
claude plugin marketplace add andreibesleaga/agentic-system-core && claude plugin install agentic-system-core@agentic-system-core
```

The skill text is CC0-1.0. It is not part of the npm package.
