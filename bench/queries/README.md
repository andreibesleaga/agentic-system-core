# `bench/queries/` — labelled query sets for the retrieval benchmark

**Summary.** Each sub-folder is one query set in the BEIR layout: `queries.jsonl` (one query per line, with its `_id`, its `text` and the node it is asked of) and `qrels/test.tsv` (the gold item of each query). `tools/bench` scores a node's search surfaces against a set.

| Set | What it is |
|---|---|
| `bench-v2/` | the committed set and the default of `tools/bench`: hand-written intents over the two reference nodes, one gold item each, every gold item published on its node |
| `agent-study/` | the kit of the agent-side study: gold units are chunk ids, listed in its `gold-index.tsv`; one example question until the set is written ([its README](agent-study/README.md)) |

`results-row.schema.json` is the results-row contract: the JSON Schema every results file of a study validates against. `tools/bench --dry-run` checks that it accepts its own examples, and, for a set that carries a `gold-index.tsv`, that the index parses, that every gold label names a chunk of it and, with `--node`, that the index names chunks of that build.

```sh
node tools/bench --dry-run                  # reads the default set, scores nothing
node tools/bench --set <dir> --dry-run      # another set in the same layout
node tools/bench --set bench/queries/agent-study --node <built output> --dry-run
```

The folder ships in the npm package, because `tools/bench` reads it; so does `bench/runners/`, which its dry run calls. Method and claims: [docs/BENCHMARKS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/BENCHMARKS.md).
