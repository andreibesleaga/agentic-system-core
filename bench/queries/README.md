# `bench/queries/` — labelled query sets for the retrieval benchmark

**Summary.** Each sub-folder is one query set in the BEIR layout: `queries.jsonl` (one query per line, with its `_id`, its `text` and the node it is asked of) and `qrels/test.tsv` (the gold item of each query). `tools/bench` scores a node's search surfaces against a set.

| Set | What it is |
|---|---|
| `bench-v2/` | the committed set and the default of `tools/bench`: hand-written intents over the two reference nodes, one gold item each, every gold item published on its node |

```sh
node tools/bench --dry-run                  # reads the default set, scores nothing
node tools/bench --set <dir> --dry-run      # another set in the same layout
```

The folder ships in the npm package, because `tools/bench` reads it. Method and claims: [docs/BENCHMARKS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/BENCHMARKS.md).
