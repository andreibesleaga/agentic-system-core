# `tests/acceptance/`

**Summary.** Acceptance tests: the persona scenarios of `features/*.feature`, parsed with
the Gherkin reference parser and run step by step against the real command line and the
real local tool server on a copy of `bundle/`; and the use cases of `docs/USE-CASES.md`,
run end to end in `use-cases/`. A scenario that does not run as written in this offline
lane has one file of its own under `pending/`, with its class and a sentence of reason,
and is reported as skipped and counted.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md),
"The acceptance scenarios".

| Path | What it holds |
|---|---|
| `features.test.js` | the scenario runner: every scenario, every example of an outline, one test each, and the checks that keep the pending files and the step definitions honest |
| `_runner.js` | the runner's rules: reading the scenarios, the step definitions and the pending files, and what a pending file means for the run |
| `runner.test.js` | each rule of `_runner.js` shown on a small scratch tree |
| `steps/` | the step definitions: one file per persona, the shared phrases of `_common.js`, and helpers whose names start with `_` |
| `common-steps.test.js` | every shared phrase of `steps/_common.js` driven once before any scenario uses it |
| `loopback.test.js` | the node served on loopback is reached through `localhost` whichever address `localhost` resolves to first; `steps/_localhost-v6-first.js` gives the `::1`-first order of the hosted CI runners on any machine |
| `bundle/` | the Bundle the scenarios run on (copied, never changed in place) |
| `pending/` | one JSON file per scenario that does not run as written here; its `README.md` lists the classes |
| `use-cases/` | the use cases of `docs/USE-CASES.md`, end to end |

```bash
npm run test:acceptance
```

## Writing a scenario

1. Write the scenario in its feature file with its tags: `@persona-x`, `@human` or `@agent`
   (who acts), `@mode-n`, the `@PRD-…` ids it shows, and `@matrix-<row>` for each row of
   `features/MATRIX.md` it covers. `node tools/validate-features` checks the tags.
2. Reuse a phrase of `steps/_common.js` where one fits (the list is at the top of that
   file); write the persona-specific phrases in `steps/persona-x.js`. One phrase has
   exactly one definition across all step files, and every definition of a persona file
   is used by a scenario that runs or waits.
3. Run it and see it fail for the reason the scenario states, then make it pass. A
   scenario that cannot pass yet gets its pending file (below); its steps are still
   written, and the runner holds them to the one-definition rule.

## The pending files

`pending/<feature-stem>--<scenario-slug>.json`, where the slug is the scenario name in
lower-case ASCII letters and digits joined by `-` (at most 100 characters), holds one
JSON object:

| Member | When | What |
|---|---|---|
| `scenario` | always | the exact name of the scenario |
| `class` | always | `forge`, `model`, `external`, `conditional` or `gap` (`pending/README.md`); never `drift`: a scenario whose text disagrees with the specification is rewritten |
| `reason` | always | at least one sentence: why it does not run here, and what checks the behaviour meanwhile |
| `closes_in` | `gap` only | the change that makes the scenario run; that change deletes the file |
| `needs` | `conditional` only | what the scenario needs on the machine, probed by `steps/_<needs>.js` |

A `conditional` scenario runs wherever its probe answers `available: true`, and is
skipped with the probe's reason elsewhere. Its probe module exports
`probe() → { available, reason }` and never reaches the network; until that module is
written the scenario runs nowhere and counts as pending (the rule-coverage matrix
counts it the same way). Each file is owned by the change that wrote it; the change
that makes a scenario run deletes its file.

## Helpers for step definitions

`steps/_world.js` holds the World of one scenario: `bundle()` (a scratch copy of
`bundle/`), `agsc(argv, {offline, env, unset})` (the real command line; `offline`
adds the network trap of `steps/_offline.js`), `tool(name, argv)`, `git(argv)`,
`commitAll(message)`, `commit(subject, trailers)` and `trailers()` (a scratch git
history on fixed dates), `json()` (the last command's envelope), `serve(dir)` (the real
`agsc-host serve` on a loopback port the system picks, at the address `localhost`
resolves to first, stopped when the scenario ends),
`mcp()` (the real local tool server through the official client), `read`, `write`,
`exists`, `snapshot`, `networkAttempts()` and `overrides` (the environment the next
commands add or remove). Every test here fixes its own clock, reaches no network beyond
the loopback servers it starts, and writes only under the system temporary directory,
removing what it wrote.
