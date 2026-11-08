# `examples/demos/` — the files the demos use

**Summary.** One small folder per mode of using a Bundle, each holding the tiny
Bundle or notes that the demo of that mode starts from, plus `agents/`, the two
scripts an agent demo uses to call the tools. Every folder is derived from the
engine's own minimal fixture (`tests/fixtures/minimal/`): two concepts, one cluster,
a neutral operator, nothing private. The demos themselves — the commands, the lines
they print and what each proves — are on one page, [docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md),
and every command there is run by `tests/docs/demos.test.js`.

**Read first:** [docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md).

| Folder | What is in it | Demo |
|---|---|---|
| [mode-0-wiki/](mode-0-wiki/README.md) | three plain notes and a security contact, to be adopted by `agsc init` | Mode 0 — the self-correcting wiki |
| [mode-1-memory/](mode-1-memory/README.md) | three nodes (`a` and `b` peer with each other, `c` one-sidedly) and a node written without the engine | Mode 1 — distributed memory; the agent demo |
| [mode-2-project/](mode-2-project/README.md) | a decision, a specification, two tasks, a procedure and a gate | Mode 2 — live specifications |
| [mode-3-skills/](mode-3-skills/README.md) | a cluster with a procedure, and a foreign skill in the Agent Skills layout | Mode 3 — evolving skills |
| [mode-4-compose/](mode-4-compose/README.md) | two runnable procedures, a run record, and a configuration that enables `run` for `echo` | Mode 4 — runnable knowledge |
| [mode-5-board/](mode-5-board/README.md) | a board of two tasks and one agent lane with its channel | Mode 5 — the live board |
| [agents/](agents/README.md) | `mcp-call.js` (one tool call over the tool server) and `page-tools.js` (one tool call the way a page makes it) | every agent step |

Copy a folder somewhere and run the demo's commands inside the copy; nothing here is
meant to be run in place.

**One warning, kept on purpose.** The `.well-known/security.txt` of `mode-2-project/`,
`mode-3-skills/`, `mode-4-compose/` and `mode-5-board/` says `Expires: 2027-06-01T00:00:00Z`.
At the build instant of the demos, `SOURCE_DATE_EPOCH=1789380000` (14 September 2026, as
[docs/DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md)
sets it), that date is less than a year away and `agsc build` passes with no warning. Built at
an earlier instant, such as `SOURCE_DATE_EPOCH=1767225600` (1 January 2026), the instant the
engine's own checks use, it is more than a year away, and the build passes with one warning,
`AGSC-E204`, because RFC 9116 section 2.5.5 recommends an `Expires` less than a year into the
future. The date stays as it is, so that the bytes of these examples do not change. A node of
your own sets an `Expires` less than a year after its build.
