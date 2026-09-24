# `bin/` — the commands

**Summary.** The executables the npm package installs. `agsc` is the command line of
the specification: sixteen verbs, from `init` to `conform` (AGSC-09-07).
`agentic-system-core` is the same command under the package's full name. `agsc-host`
is a separate helper that puts a built node on a host; it is separate because the
`agsc` verb set is closed at sixteen.

**Read after:** the root [README](../README.md). **Read next:** [the module guide](../src/README.md) §3, which says which module answers each verb.

| File | What it is |
|---|---|
| `agsc.js` | the real entry point: builds the four ports from `src/adapters/` and calls `src/application/cli/main.js` |
| `agentic-system-core` | a wrapper that runs `agsc.js` under the package's own name |
| `agsc-host.js` | `agsc-host list`, `emit`, `serve`, `verify-anchor` — the hosting profiles (`docs/ARCHITECTURE-GUIDE.md`, "Where a node can live") |

## Try it

```bash
node bin/agsc.js --help                                   # the verbs and the global flags
(cd tests/fixtures/minimal && node ../../../bin/agsc.js lint)  # "lint: pass (0 error, 0 warn)"
node bin/agsc-host.js list                                # the seven hosting profiles
```

A verb runs on the Bundle in the current directory (the folder holding
`agsc.config.json`). Requires Node 22.13 or later and `npm install` at the repository
root. Installed from npm, the same commands are `agsc …` and `agsc-host …`.
