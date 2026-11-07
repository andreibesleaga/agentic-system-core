# bench/ — the benchmark kit

Method, claims discipline and the full dataset verdicts are in [`../docs/BENCHMARKS.md`](../docs/BENCHMARKS.md).
The measured results are in [`../docs/MEASUREMENTS.md`](../docs/MEASUREMENTS.md) with the generated record
`../docs/measurements.json` beside them.

| path | what it is |
|---|---|
| `measure.js` | the measurements runner: conformance, determinism, the security floor, build curves, retrieval, page-tool/MCP parity, tokens per item, accessibility, package size, install and cold start. One layer per invocation; `--assemble` merges the partials into `docs/measurements.json`, keeping the layers it did not measure; `--all` runs every layer the repository alone can run and assembles them into the scratch directory (the one-command run of `docs/BENCHMARKS.md`). |
| `install.js` | the `install` layer: `npm install --omit=dev` of the packed tarball, its package folders and sizes, the cold start of `--version`, `lint` and `build`, and a module trace of each (Node's `module.registerHooks`) that shows which protocol packages a verb loads. |
| `security.js` | the security-floor scorer: runs every case of `corpus/security-floor.json` through the real code path (`lint`/`ci` and the other verbs, `agsc-host emit`, `import`, `tools/validate-wellknown`, the federation walk, the skill checks) and reports detected / refused / refused under another code / neutralised / finished / missed, plus false positives on the valid controls. A case that feeds a run just under 1 MiB long starts its command with a kill bound: finished inside it is handled, stopped by it is missed. |
| `parity.js` | page-tool / MCP parity: the call list of `corpus/parity-calls.json` asked of the real `agsc mcp` process over stdio, of the emitted page script, of the module and of the in-process server, compared as values (AGSC-09-16). |
| `tokens.js` | token counts per item for `llms.txt`, `chunks.jsonl` and the `llm-context` export; the tokenizer is injected (installed outside the repository). |
| `a11y.js` | axe-core counts per page template through a headless browser (installed outside the repository), and the HTML-only page-weight sweep against the ≤ 100 KB budget. |
| `corpus/` | the seeded fault corpus of the security floor and the parity call list — data, readable by a reviewer. Every credential-shaped string in it is fabricated. |
| `metrics.js` | the pure arithmetic both halves share — median, precision/recall/nDCG/MRR at k, detector precision and recall, rule coverage — and the statistics of the agent-side study: citation precision and recall on unit ids, a percentile bootstrap interval, a paired permutation test, Holm's correction and Cliff's delta. No file, clock or network; the resampling draws from a seeded generator, so a seed fixes the bytes. |
| `gen-bundle.js` | the deterministic synthetic-Bundle generator behind the build curves. Item *n* is a pure function of *n*. It **refuses to write inside this repository**: point it at a scratch directory. |
| `queries/bench-v2/` | the committed labelled query set in BEIR layout (`queries.jsonl`, `qrels/test.tsv`). Twenty hand-written intents over the two reference nodes, one gold item each, every gold item published on its node, every label readable by a reviewer. |
| `queries/agent-study/` | the kit of the agent-side study, before its questions are written: the question template and gold labels in the BEIR layout (one example row), the gold index of the 149 chunks of the two public nodes, the datasheet to fill in at freeze, and the rules for writing the questions ([its README](queries/agent-study/README.md)). |
| `queries/results-row.schema.json` | the results-row contract: the JSON Schema (draft 2020-12) of a results file, one row per reported number with its model, date, sample size, metric, value and confidence interval, and both configurations for a row that compares with another system. `tools/lint-claims` holds a results file to the same contract. |
| `runners/` | the runners of the kit, compiled from strict TypeScript under `src-ts/bench/` (`src-ts/bench/kit.ts`) by `tools/build-ts` (never edited by hand). The folder `runners/` has no README of its own, because every file in it is a compiled runner (`tests/arch/typescript-parts.test.js`). `runners/kit.js` checks the agent-study kit for `tools/bench --dry-run` (the gold index against a build, the gold labels, the contract) and writes the gold index from builds: `node bench/runners/kit.js gold-index <node>=<built output>…`. Like `tools/bench`, a runner requires nothing of `src/`. |

The retrieval runner itself is [`../tools/bench`](../tools/bench), standalone and independent of `src/` by the
rule that governs every checker here (AGSC-09-90).

```sh
node ../tools/bench --help
node ../tools/bench --dry-run
node ../tools/bench --set queries/agent-study --node <built output> --dry-run   # the agent-study kit against a build
SOURCE_DATE_EPOCH=1767225600 node measure.js --layer conformance --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node measure.js --all --scratch /tmp/bench     # every layer the repository alone can run
node ../tools/lint-claims --record ../docs/measurements.json ../docs/BENCHMARKS.md ../docs/MEASUREMENTS.md
```

Nothing in this kit needs a key or a model, and only the `install` layer reaches a network: the npm registry, for the packed tarball's dependencies. The parts that do — the scored runs of the
retrieval, agent-side and memory studies — are the work of the `tools/bench` program at 1.1 and are specified,
not run, in `docs/BENCHMARKS.md`; their question sets, gold labels and results contract are here.
