# `packages/` — companion npm packages

**Summary.** Packages published beside the engine from this repository. Each sub-folder is one package with its own `package.json`, README and licence.

| Package | What it is |
|---|---|
| [`agsc-cli/`](agsc-cli/README.md) | the short alias `agsc-cli`: no logic of its own, it depends on `agentic-system-core` at a pinned version and forwards to its `agsc` command, so `npx agsc-cli <verb>` works without a global install |

A package's `version`, and its dependency on the engine, always equal the engine's own version: `tools/release` checks both and writes both on a version bump, and the release workflow publishes the package after the engine. Nothing here is part of the engine's own npm package.
