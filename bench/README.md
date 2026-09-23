# bench/ — the benchmark kit

Method, claims discipline and the full dataset verdicts are in [`../docs/BENCHMARKS.md`](../docs/BENCHMARKS.md).
The measured results are in [`../docs/MEASUREMENTS.md`](../docs/MEASUREMENTS.md) with the generated record
`../docs/measurements.json` beside them.

| path | what it is |
|---|---|
| `measure.js` | the pre-GA measurements runner: conformance, determinism, the security floor, build curves, parity. One layer per invocation; `--assemble` merges the partials into `docs/measurements.json`. |
| `metrics.js` | the pure arithmetic both halves share — median, precision/recall/nDCG/MRR at k, detector precision and recall, rule coverage. No file, clock, network or random source. |
| `gen-bundle.js` | the deterministic synthetic-Bundle generator behind the build curves. Item *n* is a pure function of *n*. It **refuses to write inside this repository**: point it at a scratch directory. |
| `queries/bench-v1/` | the committed labelled query set in BEIR layout (`queries.jsonl`, `qrels/test.tsv`). Twenty hand-written intents over the two reference nodes, one gold item each, every label readable by a reviewer. |

The retrieval runner itself is [`../tools/bench`](../tools/bench), standalone and independent of `src/` by the
rule that governs every checker here (AGSC-09-90).

```sh
node ../tools/bench --help
node ../tools/bench --dry-run
SOURCE_DATE_EPOCH=1767225600 node measure.js --layer conformance --scratch /tmp/bench
```

Nothing in this kit needs a key, a network connection or a model. The parts that do — the retrieval and
memory studies — are the `bench` verb's work at v1.0.1 and are specified, not run, in `docs/BENCHMARKS.md`.
