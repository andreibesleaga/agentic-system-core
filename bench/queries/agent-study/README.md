# `bench/queries/agent-study/` — the question set of the agent-side study

**Summary.** The templates, the gold index, the datasheet and the rules for writing the 40 to 60 questions of the agent-side study ([docs/BENCHMARKS.md](../../../docs/BENCHMARKS.md), "The agent-side study"). The study asks whether an agent finds, checks and cites a node's published units better through the node's contract (its tool server, chunk export and discovery document) than over plain pages, or over plain pages and `llms.txt`. The gold labels must exist, dated, before any scored run, so this folder holds no result. The questions themselves are still to be written: `queries.jsonl` holds one example row.

**Read after:** [the query sets](../README.md). **Checked by:** `node tools/bench --set bench/queries/agent-study --dry-run [--node <built output>]` and `tests/bench/agent-kit.test.js`.

## Files

| File | What it is |
|---|---|
| `queries.jsonl` | the questions, in the BEIR layout: `_id`, `text` and `metadata` with `node`, `split` (`dev` or `test`), `answerable`, `author`, `paraphrased_by`, `written` (a date) and `note`. One example row, to delete before any run. |
| `qrels/test.tsv` | the gold units: `query-id`, `corpus-id` (a chunk id) and `score` 1. A question with more than one gold chunk has one row for each. |
| `gold-index.tsv` | every chunk of the two public nodes, `agenticsystemcore.com` (21 chunks) and `patterns.agenticsystemcore.com` (128 chunks): node, chunk id, item, ordinal, kind, section, title, the leading 16 hexadecimal digits of the chunk's digest, and the opening 140 characters of its text. The question writer picks gold units from this list. |
| `datasheet.md` | the datasheet published with the set, filled in when the set is frozen. |
| `../results-row.schema.json` | the results-row contract: the JSON Schema every results file of the study validates against (one row per reported number). |

In this repository the last column of `gold-index.tsv` is empty. The chunk text is the prose of a published node, which is under the node's Content Use Terms and not under this repository's licence. The full index, with the text, is written from the two builds with:

```sh
node bench/runners/kit.js gold-index agenticsystemcore.com=<main build> patterns.agenticsystemcore.com=<demonstration build> > gold-index.tsv
```

`--without-excerpts` before the node list writes the repository copy. The index was written on 26 October 2026 from the builds of the 1.0.1 engine. On 7 November 2026 the command above wrote the same bytes again, the copy here with `--without-excerpts` and the full index without it, from the committed build of the main site and a build of the demonstration node (`agsc-demo-node`, which publishes the chunks of `patterns.agenticsystemcore.com`) with the 1.1 engine at the fixed epoch. The main site's committed build was made with the 1.0.1 engine, so its 21 rows come from that build until the site is built with 1.1.

## Rules

1. **Gold labels before any run.** Every question names its gold chunk ids before any run; the commit date of `qrels/test.tsv` is the proof.
2. **No leakage.** Write each question from the content of a chunk, never from its title, its slug or the wording of an index page. Then have each question paraphrased by a model that is not under test, and record that model in `paraphrased_by`.
3. **Counts.** 40 to 60 answerable questions over both nodes, about one third on the main node and two thirds on the demonstration node, plus 10 unanswerable questions (`answerable: false`, no `qrels` row) that read like the others. Twenty of the answerable questions are written by hand and carry `note: headline`.
4. **Split by item.** About 15 questions carry `split: dev` and are used while the harness is built; the rest carry `split: test`. No item appears in both splits.
5. **One gold set per question.** Prefer one chunk; allow two or three when the answer spans a section.
6. **Freeze.** When the set is done: write `gold-index.tsv` again from the builds of that day, record both nodes' `agsc-bundle-hash` in `datasheet.md`, archive the folder with a version DOI, and write that DOI and the archive's SHA-256 into every results file before the scored runs begin. A frozen set is never edited: a change makes a new set.

## What the dry run checks

`node tools/bench --set bench/queries/agent-study --dry-run` reads the set and scores nothing:

- every row of `gold-index.tsv` has the nine columns, a 64-digit chunk id, an ordinal and a 16-digit digest prefix, and no chunk id appears twice;
- every `corpus-id` of `qrels/test.tsv` is a chunk id of the gold index;
- the results-row contract is a JSON Schema (draft 2020-12) that accepts each of its own examples.

With `--node <built output>` it also reads the build's `chunks.jsonl` and its shards. Each gold row of a node the build publishes must name a chunk the build has (an error otherwise), and its digest prefix must match (a warning otherwise: the chunk changed since the index was written). A row of another node is a fixture id for this build: it is counted, not checked, because only a build of its own node can check it. The dry run reads files only and gives the same report on every run.

## What the study's harness reads

`queries.jsonl` and `qrels/test.tsv` as they are: `tools/bench` already reads this layout. The results rows carry `cited_unit_ids` and `gold_unit_ids` as chunk ids, and `bench/metrics.js#citationScore` scores them.
