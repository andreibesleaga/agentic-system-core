# Benchmarks — the kit, what it can claim, and what it refuses to

**Who this is for:** anyone who wants to know how the numbers in MEASUREMENTS.md are produced and what they can and cannot show. **Read after:** [MEASUREMENTS.md](MEASUREMENTS.md).

This document describes the benchmark kit under `bench/` and the standalone runner `tools/bench`. The measured results live in `docs/MEASUREMENTS.md`; this file is about method.

**Two halves, deliberately separated.** The *measurements* half needs no model, no network, no key and no external dataset: conformance counts, determinism byte comparisons, the security floor, build curves, accessibility. It runs today, and it is what carries this format's own property claims. The *studies* half — retrieval quality, memory competencies, the six modes end to end — needs a corpus, a judge model and a licence check for every dataset, and it is the `bench` verb's work at **v1.0.1**, within thirty days of the 1.0 release. Nothing here moves that date.

## Running it

```sh
# the measurements (no key, no network)
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer conformance  --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer determinism  --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer perf --scratch /tmp/bench --sizes 100,500,501,1000,5000 --runs 3
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer security     --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer parity       --scratch /tmp/bench --nodes <name>=<bundle dir>,…
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer retrieval    --scratch /tmp/bench --nodes <name>=<built output>,…
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer package      --scratch /tmp/bench
# these two need libraries installed OUTSIDE the repository (npm i --no-save in a scratch dir)
SOURCE_DATE_EPOCH=1767225600 NODE_PATH=<scratch>/node_modules node bench/measure.js --layer tokens --scratch /tmp/bench --nodes <name>=<built output>,… --exports <name>=<llm-context dir>,…
SOURCE_DATE_EPOCH=1767225600 NODE_PATH=<scratch>/node_modules CHROME_EXE=<chromium> node bench/measure.js --layer a11y --scratch /tmp/bench --nodes <name>=<built output>,…
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --assemble --scratch /tmp/bench --out docs/measurements.json

# the retrieval runner, against a node you have built
node tools/bench --help
node tools/bench --dry-run                                    # validate the query set, score nothing
node tools/bench --node <built-output-dir> --origin-node patterns --json
```

The synthetic Bundles behind the build curves are written by `bench/gen-bundle.js`, which **refuses to write inside this repository**: they are derived data, up to a quarter of a gigabyte, and they belong in a scratch directory.

## The retrieval runner

`tools/bench` reads a query set in BEIR layout — `queries.jsonl` plus `qrels/test.tsv` — and scores three **published surfaces** of a built node, each isolated from the others:

| surface | what is read | what a hit means |
|---|---|---|
| `search` | `/search.json` and its shards | the prebuilt lexical index matched a query term |
| `chunks` | `/chunks.jsonl` and its shards | a chunk of the item matched; the item's best chunk decides its rank |
| `llms` | `/llms.txt` | the item's line in the plain-text index matched |

It reports recall@k, precision@k, nDCG@k (binary relevance), P@1 and MRR.

Three design decisions worth stating:

- **It imports nothing from `src/`**, by the same rule that governs the nine independent checkers (AGSC-09-90). It measures what a consumer of the published files gets, not what the engine believes it emitted, and it carries its own tokenizer for the same reason.
- **`ask` is not scored separately.** AGSC-09-14a makes `ask` the first three `search` hits with mandatory citations, so its ranking is the `search` ranking truncated at three; reporting it as a fourth surface would report one number twice.
- **`--origin-node` exists because a multi-node set measures nothing without it.** The committed set draws intents from two nodes; asking one node for the other's items produces a misses-by-construction score. Each node is scored only on the intents its own items answer.

## The committed query set, `bench/queries/bench-v1`

Twenty hand-written intents, one gold item each, over the thirty published items of the two reference nodes. Every query declares its origin (`hand-written`) and its node. The set is in the repository so that a reviewer can read every label; the runner warns on any query without a label and fails if no query has one, so a vacuous pass is impossible.

**This set is a harness test, not a study.** It has no dev/test split, no generated paraphrases, no second annotator, no leakage control and no confidence intervals, and the intents and the items have the same author. It is published as the first run of the instrument.

## The study the kit is built for (v1.0.1)

The retrieval study is the one benchmark contribution this project claims, and only in this form: *to the author's knowledge no published benchmark measures intent-to-item retrieval across a knowledge node's several agent surfaces — a plain-text index, a prebuilt lexical index, a chunk export, a tool server and a graph dump — so the task set and its labels are released as a contribution in their own right.* No superlative, and no performance claim.

Its design, fixed before any number exists:

- **100 intents**, of which 20 are hand-written and carry the headline numbers; the other 80 are generated from **non-indexed fields only**, paraphrased by a different model, and human-checked.
- An **item-level** dev/test split, with overlap statistics published.
- Conditions isolated one at a time: `llms.txt` alone; `search.json` alone; `chunks.jsonl` as a retrieval corpus; the tool server's `search` plus `links`; the `ask` tool; skill packs installed; the graph dump queried by the consumer.
- Every model condition: temperature pinned, model id and date recorded, at least three seeded runs, medians with 95 % bootstrap intervals, paired tests with Holm correction, pass^k at k = 3, effect sizes as Cliff's δ.
- Release in BEIR layout with a datasheet, machine-readable dataset metadata and an archival DOI. The corpus snapshot is fetched from the archive, never from the live site, and no comparator's live endpoint is ever a dependency: a comparator's published files are downloaded once, pinned by hash and dated.
- `bench-v1` freezes at submission. A change makes `bench-v2`; a cited benchmark is never rewritten.

## The memory-competency layer, and which benchmarks apply at all

Most memory benchmarks score a *conversational* memory that writes itself during a session. This is a curated, published, versioned store whose writes are proposals a person merges, and it deliberately has no decay maths, no importance scoring, no per-user memories and no automatic rewriting. A benchmark that scores those measures a capability that was refused on purpose, and reporting a low score on it would mislead rather than inform. So each candidate gets a verdict before it gets a run.

| benchmark | what it measures | verdict | licence position |
|---|---|---|---|
| **LongMemEval** (500 instances; information extraction, multi-session reasoning, knowledge updates, temporal reasoning, abstention; judge model required) | long-term recall, update, abstention | **Adopt the Oracle subset, two abilities only: knowledge updates and abstention.** Those are exactly what `supersedes`, `status: deprecated` and the `ask` tool's mandatory "no answer in this memory" are for. The multi-session and temporal abilities score a conversation this system does not have. | code MIT; **dataset card read 2026-09-23**: the card of `xiaowu0162/longmemeval` declares `license: mit` and says "⚠️ This dataset is deprecated. It is replaced by `longmemeval-cleaned`"; the replacement card (`xiaowu0162/longmemeval-cleaned`) also declares `license: mit`. Use the cleaned set, and cite the card and the date. |
| **BEAM** (inside a production memory suite; 100 conversations per size bucket from 100K to 10M tokens, over 2,000 questions) | production-scale conversational memory | **Reference point only, never a target.** A ten-million-token conversation is not a Bundle. Cite it to say what the field measures and why this object differs. Reporting a score on it would be benchmark theatre. | suite Apache-2.0; a judge model is required |
| **MemoryAgentBench** (accurate retrieval, test-time learning, long-range understanding, conflict resolution) | four named competencies | **Adopt the conflict-resolution rows only.** `contradicts` warnings, `excludes` mutual exclusion and `supersedes` hiding are conflict resolution made explicit and checkable — the one place a governed static memory should be *better* than a learned one. | **dataset card read 2026-09-23**: `ai-hyz/MemoryAgentBench` declares `license: mit`, and the card states no further terms. The card's tag covers the packaged set; the rows it was built from came from earlier datasets, whose own terms are to be checked row family by row family before any row is published beside a score. |
| **LoCoMo** | multi-session dialogue recall | **Rejected, and it stays rejected** | non-commercial licence |
| self-evolving and streaming memory benchmarks | a memory that rewrites itself | **Not applicable.** This memory rewrites only through a reviewed proposal. Saying so in the paper is better than silence. | — |
| **τ-bench** | tool-use reliability over repeats | **Adopt the protocol, not the tasks**: pass^k at k = 3 over this system's own seven tools | — |
| **BEIR** | retrieval | **Adopt as the release format** for the intent set | Apache-2.0 |

**The one capability the field measures that this system can measure and has not:** knowledge update as an observable event. The mechanism is `supersedes` plus `status`; the study is thirty scripted edit episodes — supersede, contradict-then-resolve, retract, stale-then-reverify — with update accuracy, abstention accuracy and citation rate reported **separately**. That is the most defensible external comparison available here, because both the mechanism and the metric are ours to state precisely. It is designed and unbuilt.

**No dataset is downloaded, and no benchmark is run, until its licence has been read on the source page and quoted in the kit's licence record.** The two adopted datasets had their cards read on 2026-09-23 (the quotes are in the table above, from `https://huggingface.co/datasets/xiaowu0162/longmemeval`, `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned` and `https://huggingface.co/datasets/ai-hyz/MemoryAgentBench`, read as the raw `README.md` of each). Nothing was downloaded.

## Tools the kit uses or plans to use

| tool | role | licence, as recorded in the project's research file of 2026-09-23 |
|---|---|---|
| this repository's vectors and checkers | conformance, determinism | Apache-2.0 (code), CC0 (schemas, vectors) |
| **BEIR** | the release format and the measure set | Apache-2.0 |
| **ir_measures** | independent scoring of the released set | Apache-2.0 |
| **axe-core** | accessibility violations per template | MPL-2.0 |
| **Lighthouse** | accessibility, best-practices and SEO per template — **never the performance category** | Apache-2.0 |
| Python `zipfile` | an independent reader for the archive profile | PSF |
| **gpt-tokenizer** 2.9.0 | token counts per item, `o200k_base` and `cl100k_base`, offline, installed outside the repository | MIT (read from the installed package's `package.json`). The version named in the research record, 2.9.1, does not exist on the registry (`npm view gpt-tokenizer@2.9.1` → E404); 2.9.0 is the nearest published release and is the one used |
| **playwright-core** 1.62.1 + a headless Chromium | the browser that runs axe-core, installed outside the repository | Apache-2.0 |

Every licence in this table is quoted from the source page in the project's dated research record; a licence that could not be read live is marked unverified above rather than assumed.

## What this project will never claim

1. That it is faster, cheaper or more accurate than another system — unless that system was run here on the same tasks and both configurations are published, and even then as an observation on a date.
2. That the content lints prove safety. AGSC-08-19 forbids it in terms: "These lints prove neither safety nor the absence of novel injection … An implementation MUST NOT claim more."
3. That an automated accessibility pass establishes WCAG conformance. axe-core finds on average 57 % of WCAG issues automatically; that is the ceiling of what an automated pass can say.
4. That determinism holds across implementations, until a second implementation has run the vectors. Two of nineteen populated areas have an independent pass today, and none of the seventeen that carry emitted bytes.
