# Benchmarks — the kit, what it can claim, and what it refuses to

**Who this is for:** anyone who wants to know how the numbers in MEASUREMENTS.md are produced and what they can and cannot show. **Read after:** [MEASUREMENTS.md](MEASUREMENTS.md).

This document describes the benchmark kit under `bench/` and the standalone runner `tools/bench`. The measured results live in `docs/MEASUREMENTS.md`; this file is about method.

**Two halves, deliberately separated.** The *measurements* half needs no model, no key and no external dataset, and every layer of it but the install runs without a network: conformance counts, determinism byte comparisons, the security floor, build curves, accessibility. It runs today, and it is what carries this format's own property claims. The *studies* half — retrieval quality, memory competencies, the six modes end to end — needs a corpus, a judge model and a licence check for every dataset, and it is the work of the `tools/bench` program at **1.1**, the version at which the declared scope makes the benchmark kit normative (AGSC-00-20). There is no `agsc bench` verb.

## Run it yourself: one command

```sh
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --all --scratch <dir>
```

From a clone of this repository, after `npm ci`, this one command measures every layer whose inputs the repository holds: conformance, determinism, the security floor and the build curves (layers A to D), the package and the install. It needs no key, no model, no judge and no dataset; the install layer alone reaches the npm registry, to install the packed tarball's dependencies, and `--offline` leaves it out. It writes `<dir>/measurements.json` in the layout of `docs/measurements.json` and leaves the repository's record alone, so you compare the two files. The conformance counts, the determinism byte comparisons and the pass/fail outcomes should be equal on any machine. The install layer's package count and sizes depend on what the npm registry serves on the day, and every byte size describes the tree when it was measured (the documents and the record ship in the tarball). Times and memory are your machine's, and the record states the machine they were taken on. The build curves reach 10,000 items by default and take the longest; `--sizes 100 --runs 1` gives a quick check of the command itself.

What the command needs besides the clone: Linux with GNU `time` at `/usr/bin/time` (the build curves and the install layer read wall time and peak memory from `time -v`), and for the install layer Node 22.15 or later (its module trace uses `module.registerHooks`). The install layer names what is missing before it runs anything.

Four layers need what the repository does not hold: accessibility (layer E) and the token counts need three libraries installed outside the repository (axe-core, `playwright-core` and `gpt-tokenizer`) and a Chromium binary; the parity layer reads Bundles, and the retrieval, token and accessibility layers read nodes you have built. Their commands are below. The mechanical scoring needs no key either: `tools/bench` scores the committed query set over a built node with no model and no judge, and `tools/bench --dry-run` checks the agent-side study's kit. Only the model runs of the studies need a model, a local one or a key, and they are not part of this command.

`bench/measure.js --assemble` merges: a layer measured into the scratch directory replaces the layer of that name in the record at `--out`, and every other layer of that record is kept. The record's `measured` member lists the layers the last assembly measured.

## Running it, layer by layer

```sh
# the measurements (no key; the install layer alone reaches the npm registry)
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer conformance  --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer determinism  --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer perf --scratch /tmp/bench --sizes 100,500,501,1000,5000 --runs 3
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer security     --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer parity       --scratch /tmp/bench --nodes <name>=<bundle dir>,…
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer retrieval    --scratch /tmp/bench --nodes <name>=<built output>,…
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer package      --scratch /tmp/bench
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer install      --scratch /tmp/bench   # npm install of the packed tarball, cold start, module trace
# these two need libraries installed OUTSIDE the repository (npm i --no-save in a scratch dir)
SOURCE_DATE_EPOCH=1767225600 NODE_PATH=<scratch>/node_modules node bench/measure.js --layer tokens --scratch /tmp/bench --nodes <name>=<built output>,… --exports <name>=<llm-context dir>,…
SOURCE_DATE_EPOCH=1767225600 NODE_PATH=<scratch>/node_modules CHROME_EXE=<chromium> node bench/measure.js --layer a11y --scratch /tmp/bench --nodes <name>=<built output>,…
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --assemble --scratch /tmp/bench --out /tmp/bench/measurements.json   # maintainers write docs/measurements.json

# the retrieval runner, against a node you have built
node tools/bench --help
node tools/bench --dry-run                                    # validate the query set, score nothing
node tools/bench --node <built-output-dir> --origin-node patterns --json
node tools/bench --set bench/queries/agent-study --node <built-output-dir> --dry-run   # the agent-study kit against a build
node bench/runners/kit.js gold-index <host>=<built-output-dir>   # the gold index of a build
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

## The committed query set, `bench/queries/bench-v2`

Twenty hand-written intents, one gold item each: twelve answered by published items of the demonstration node (`patterns.agenticsystemcore.com`) and eight by published items of the main node. Every gold item is on its node's public site and in its public repository, so anyone can rebuild the node and repeat the run. `bench-v2` replaces `bench-v1`, whose twelve intents for the demonstration node named items that node no longer publishes; the two sets are not comparable, and no `bench-v1` number is cited. Every query declares its origin (`hand-written`) and its node. The set is in the repository so that a reviewer can read every label; the runner warns on any query without a label and fails if no query has one, so a vacuous pass is impossible.

**This set is a harness test, not a study.** It has no dev/test split, no generated paraphrases, no second annotator, no leakage control and no confidence intervals, and the intents and the items have the same author. It is published as the first run of the instrument.

## The study the kit is built for (1.1)

The retrieval study is the one benchmark contribution this project claims, and only in this form: *to the author's knowledge no published benchmark measures intent-to-item retrieval across a knowledge node's several agent surfaces — a plain-text index, a prebuilt lexical index, a chunk export, a tool server and a graph dump — so the task set and its labels are released as a contribution in their own right.* No superlative, and no performance claim.

Its design, fixed before any number exists:

- **100 intents**, of which 20 are hand-written and carry the headline numbers; the other 80 are generated from **non-indexed fields only**, paraphrased by a different model, and human-checked.
- An **item-level** dev/test split, with overlap statistics published.
- Conditions isolated one at a time: `llms.txt` alone; `search.json` alone; `chunks.jsonl` as a retrieval corpus; the tool server's `search` plus `links`; the `ask` tool; skill packs installed; the graph dump queried by the consumer.
- Every model condition: temperature pinned, model id and date recorded, at least three seeded runs, medians with 95 % bootstrap intervals, paired tests with Holm correction, pass^k at k = 3, effect sizes as Cliff's δ.
- Release in BEIR layout with a datasheet, machine-readable dataset metadata and an archival DOI. The corpus snapshot is fetched from the archive, never from the live site, and no comparator's live endpoint is ever a dependency: a comparator's published files are downloaded once, pinned by hash and dated.
- `bench-v2` freezes at submission. A change makes `bench-v3`; a cited benchmark is never rewritten.

## The agent-side study: its kit

The second study asks whether an agent finds, checks and cites a node's published units better through the node's contract — its tool server, its chunk export and its discovery document (condition C2) — than over plain pages (C0) or over plain pages and `llms.txt` (C1). Its unit is a chunk, not an item: a question's gold labels are chunk ids, and an answer is scored on the chunk ids it cites (`bench/metrics.js#citationScore`, with the interval, paired test, correction and effect size of the list above). The model runs are not part of the engine and have not been run; what the engine ships is everything that must exist, dated, before any scored run:

| File | What it is |
|---|---|
| `bench/queries/agent-study/queries.jsonl`, `qrels/test.tsv` | the question template and the gold labels in the BEIR layout; one example row until the questions are written |
| `bench/queries/agent-study/gold-index.tsv` | every chunk of the two public nodes (`agenticsystemcore.com`, 21 chunks; `patterns.agenticsystemcore.com`, 128): node, chunk id, item, ordinal, kind, section, title and digest prefix. The question writer picks gold units from it. The 21 rows of the main node come from its published build, made with the 1.0.1 engine, until that site is built with 1.1. The repository copy leaves the chunk-text column empty, because that text is the nodes' prose, under their Content Use Terms; `node bench/runners/kit.js gold-index` writes the full index from the builds |
| `bench/queries/agent-study/datasheet.md` | the datasheet, filled in when the set is frozen |
| `bench/queries/agent-study/README.md` | the six rules for writing the set: gold labels before any run, no leakage, the counts, the split by item, one gold set per question, the freeze |
| `bench/queries/results-row.schema.json` | the results-row contract (below) |

**The results-row contract.** A results file is `{ "rows": [...] }`, one row per reported number. Each row names its `model`, its `date` (a calendar day), its sample size `n`, its `metric`, its `value` and a confidence interval `ci: [low, high]`; a row that compares with another system names it in `system` and publishes both configurations in `configs`. A row of the agent-side study also carries `cited_unit_ids` and `gold_unit_ids`. The contract is a JSON Schema of draft 2020-12. `tools/lint-claims --results <file>` holds a results file to the same contract and adds the two checks a schema cannot state: `low` is not above `high`, and the other system's configuration is keyed by its name. Every row the lint accepts, the schema accepts (a property test in `tests/bench/agent-kit.test.js`).

**The dry run.** `tools/bench --dry-run` scores nothing and reads files only. With any set it checks that the contract is a schema of draft 2020-12 that accepts its own examples. With a set that carries a gold index it checks that each row of the index has its nine columns, a 64-digit chunk id, an ordinal and a 16-digit digest prefix, and names a chunk id once, and that every gold label names a chunk of the index. With `--node <built output>` it reads the build's `chunks.jsonl`, and a sharded export through the shards its manifest lists (a line that is no chunk record is `AGSC-E201` with its file and line): a gold row of a node the build publishes must name a chunk of that build (`AGSC-E301`, exit 1, otherwise), and its digest prefix must match (the warning `AGSC-E210` otherwise: the chunk changed, so its questions need a second look). A row of another node is a fixture id for that build, counted under `fixture_ids` and not checked, because only a build of its own node can check it; when no row names the build's node, nothing was checked, and the warning `AGSC-E210` says so. The report under `kit` gives the counts: `index`, the gold rows read and the gold labels checked against them, and with `--node`, `gold_index`, the rows checked and found and the fixture ids, and two runs over the same inputs give the same bytes. On 7 November 2026 a build of the demonstration node (`agsc-demo-node`) with this engine at the fixed epoch held all 128 chunk ids of `patterns.agenticsystemcore.com` with the digest prefixes the index records, and the 21 rows of the main node were fixture ids for it.

The runner behind the dry run, `bench/runners/kit.js`, is compiled from strict TypeScript (`src-ts/bench/kit.ts`) and, like `tools/bench`, requires nothing of `src/`; it validates through Ajv, the JSON Schema validator the engine already pins. The statistics stay in `bench/metrics.js`. The maintained statistics package read on 7 November 2026, `simple-statistics` 8.0.0, has a permutation test for two independent samples, drawn by default from `Math.random`, and none of the rest the study needs: a paired permutation test that is exact up to 16 pairs, a percentile bootstrap interval, Holm's correction and Cliff's delta, each reproducible from a seed.

## The studies and the twelve statements: planned, to be measured

The six studies of the kit and the twelve statements they test are written down before any of them is run, so that a result cannot reshape its own question. None has been measured. Each row stays "to be measured" until a run on a dated tag fills it with its model, date, sample size, value and interval; the model runs are planned for January 2027.

<!-- claims:start --><!-- measured:start -->
| study | what it measures | result |
|---|---|---|
| E1 retrieval as access | intents to item ids over each published surface in isolation (`llms.txt`, the lexical index, the tool server's `search` and `links`, the graph, skill packs): P@1, P@5, MRR, nDCG@10, tool calls and tokens per answer, 3 seeded runs | to be measured |
| E2 knowledge update and abstention | 30 scripted edit episodes (supersede, contradict then resolve, retract, stale then re-verify): update accuracy, abstention accuracy and citation rate, reported apart | to be measured |
| E3 the governance pipeline | 50 seeded faulty proposals and 25 valid ones: lint precision and recall per fault class, the review step on the classes a lint cannot see, minutes and cost per decision | to be measured |
| E4 ontology and graph quality | SHACL conformance, label and cycle checks on the vocabularies, competency questions with gold answers over the exported graph | to be measured |
| E5 composition validity | 50 labelled pattern pairs and triples (compatible, conflicting, a requirement missing): no invalid composition accepted, valid ones accepted, `workspace.dsl` parses offline | to be measured |
| E6 a Mode 2 study | two matched small projects, one with a specs node and one with flat files: task completion, spec-drift errors, human interventions; small n, reported descriptively | to be measured |

| # | statement | the study that would refute it | result |
|---|---|---|---|
| 1 | A deterministic consolidation step run by CI (`refresh`) reaches the knowledge-update accuracy of a model-driven memory-evolution baseline within the interval, at a small part of its token cost | E2 | to be measured |
| 2 | Showing `verified`, `status` and `stale_after` to the reading agent raises abstention accuracy and citation rate and leaves update accuracy unchanged | E2, metadata shown against stripped | to be measured |
| 3 | For a curated corpus of up to a thousand items, search plus the nine typed links reaches the P@5 and nDCG@10 of an embedding index with fewer tokens per answer | E1, with an embedding condition added | to be measured |
| 4 | In a Mode 2 node, the share of failed Episodes with no Lesson derived from them predicts repeated failures of the same class | E6 | to be measured |
| 5 | A strict superset of the plain knowledge format loses nothing for plain consumers and round-trips the memory formats it imports with at most 5 % field loss | the conformance vectors and the import and export round trips | to be measured |
| 6 | A store whose units keep their identity and change only by reviewed diffs loses no accuracy on untouched facts after new merges, so it needs no replay | E2, 50 untouched control facts before and after 30 merged edits | to be measured |
| 7 | A proposal that links to an existing item merges with fewer review rounds than an unlinked proposal of the same size | E3, stratified by links | to be measured |
| 8 | For a shared store, `stale_after` predicts wrong answers at least as well as a decay model computed from access logs | E2, stale then re-verify items | to be measured |
| 9 | A store that reads without rewriting answers 20 identical queries, interleaved with other reads, more stably than a store whose reads rewrite it, at equal accuracy | E2 protocol with a stability metric | to be measured |
| 10 | A team whose specs, decisions, tasks and Lessons live in one typed node drifts from its specs less often than a matched team with flat files | E6 | to be measured |
| 11 | Gate items compiled to CI checks reach a lint precision and recall of at least 0.95 on the mechanical fault classes, and human time goes to the classes a lint cannot see | E3 | to be measured |
| 12 | A NOW page derived from git and front matter answers state questions with fewer tool calls than reading the log, and two builds give it the same bytes | E1, a state sub-study of 20 intents, plus the determinism vectors | to be measured |
<!-- measured:end --><!-- claims:end -->

`tools/lint-claims --record docs/measurements.json docs/BENCHMARKS.md` holds the region above to the claims rules and its numbers to the record: a row that is not "to be measured" may only carry numbers the record holds. The suite runs the check on this page and on `docs/MEASUREMENTS.md` (`tests/docs/claims.test.js`).

## The kit and the ACM artifact badges

ACM's policy "Artifact Review and Badging" (Version 1.1, by that source) names five badges that a venue's artifact evaluation may award to a paper. A badge is awarded by such an evaluation, never by this project; the table says what the kit offers one and what it still lacks. The badge names, the version and the one-line criteria below come from a secondary source and have not yet been checked against the policy page (`https://www.acm.org/publications/policies/artifact-review-and-badging-current`); they are paraphrases, not quotations.

| ACM badge | its criterion, in one line (paraphrased, not yet checked against the policy page) | what the kit offers | what it still lacks |
|---|---|---|---|
| Artifacts Available | the artifacts are on a publicly accessible archival repository, with a DOI or a link and an identifier for the object | the software of each GitHub release is archived on Zenodo (concept DOI 10.5281/zenodo.23233817, one version per release); the specification archive and the paper are 10.5281/zenodo.23052709 (PRD-045); the kit, its query sets and its gold labels are in the public repository and the npm package of each release | an archived deposit of the kit itself: the frozen query set, its gold labels and the corpus snapshot, with a version DOI of their own |
| Artifacts Evaluated – Functional | the artifacts are documented, consistent, complete and exercisable, and include evidence of verification and validation | the one-command run above, which needs no key; the dry run of the agent-side kit; the tests of `tests/bench/` and the claims check; a results-row contract with a JSON Schema | an evaluation by someone other than the author; the studies' model runs, which are not part of the command |
| Artifacts Evaluated – Reusable | beyond functional: documented and structured carefully enough that others can reuse and repurpose them, following the norms of the field | the BEIR layout for query sets, a datasheet, the six rules for writing a set, the metrics in one tested module | a frozen and filled-in datasheet and machine-readable dataset metadata; a second annotator for the gold labels; pinned versions of the three outside libraries and the Chromium binary in one install file; a guide for running the kit on a corpus other than the two public nodes |
| Results Reproduced | the main results were obtained again by another team, using in part the author's artifacts | nothing yet: there are no study results to reproduce | the studies' results, then a run by another team |
| Results Replicated | the main results were obtained again by another team without the author's artifacts | nothing yet | as above, and an independent implementation |

## The memory-competency layer, and which benchmarks apply at all

Most memory benchmarks score a *conversational* memory that writes itself during a session. This is a curated, published, versioned store whose writes are proposals a person merges, and it deliberately has no decay maths, no importance scoring, no per-user memories and no automatic rewriting. A benchmark that scores those measures a capability that was refused on purpose, and reporting a low score on it would mislead rather than inform. So each candidate gets a verdict before it gets a run.

| benchmark | what it measures | verdict | licence position |
|---|---|---|---|
| **LongMemEval** (500 instances; information extraction, multi-session reasoning, knowledge updates, temporal reasoning, abstention; judge model required) | long-term recall, update, abstention | **Adopt the Oracle subset, two abilities only: knowledge updates and abstention.** Those are exactly what `supersedes`, `status: deprecated` and the `ask` tool's mandatory "no answer in this memory" are for. The multi-session and temporal abilities score a conversation this system does not have. | code MIT; **dataset card read 2026-09-23**: the card of `xiaowu0162/longmemeval` declares `license: mit` and says "⚠️ This dataset is deprecated. It is replaced by `longmemeval-cleaned`"; the replacement card (`xiaowu0162/longmemeval-cleaned`) also declares `license: mit`. Use the cleaned set, and cite the card and the date. |
| **BEAM** (inside a production memory suite; 100 conversations per size bucket from 100K to 10M tokens, over 2,000 questions) | production-scale conversational memory | **Reference point only, never a target.** A ten-million-token conversation is not a Bundle. Cite it to say what the field measures and why this object differs. Reporting a score on it would be benchmark theatre. | suite Apache-2.0; a judge model is required |
| **MemoryAgentBench** (accurate retrieval, test-time learning, long-range understanding, conflict resolution) | four named competencies | **Adopt the conflict-resolution rows only.** `contradicts` warnings, `excludes` mutual exclusion and `supersedes` hiding are conflict resolution made explicit and checkable — the one place a governed static memory should be *better* than a learned one. | **dataset card read 2026-09-23**: `ai-hyz/MemoryAgentBench` declares `license: mit`, and the card states no further terms. The card's tag covers the packaged set; the rows it was built from came from earlier datasets, whose own terms are to be checked row family by row family before any row is published beside a score. |
| **LoCoMo** | multi-session dialogue recall | **Rejected, and it stays rejected** | non-commercial licence |
| self-evolving and streaming memory benchmarks | a memory that rewrites itself | **Not applicable.** This memory rewrites only through a reviewed proposal. Saying so in the paper is better than silence. | — |
| **τ-bench** | tool-use reliability over repeats | **Adopt the protocol, not the tasks**: pass^k at k = 3 over this system's own ten tools | — |
| **BEIR** | retrieval | **Adopt as the release format** for the intent set | Apache-2.0 |

**The one capability the field measures that this system can measure and has not:** knowledge update as an observable event. The mechanism is `supersedes` plus `status`; the study is thirty scripted edit episodes — supersede, contradict-then-resolve, retract, stale-then-reverify — with update accuracy, abstention accuracy and citation rate reported **separately**. That is the most defensible external comparison available here, because both the mechanism and the metric are ours to state precisely. It is designed and unbuilt.

**No dataset is downloaded, and no benchmark is run, until its licence has been read on the source page and quoted in the kit's licence record.** The two adopted datasets had their cards read on 2026-09-23 (the quotes are in the table above, from `https://huggingface.co/datasets/xiaowu0162/longmemeval`, `https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned` and `https://huggingface.co/datasets/ai-hyz/MemoryAgentBench`, read as the raw `README.md` of each). Nothing was downloaded.

## Tools the kit uses or plans to use

| tool | role | licence |
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
4. That determinism holds across implementations, until a second implementation has run the vectors. Seven of the twenty populated areas are run by a second implementation today, the Python checker distribution, which passes every vector of them that it runs; no second implementation builds a whole node, so the emitted files of two implementations have not been compared byte for byte.

The repository tool `tools/lint-claims` holds a results text and a results file to this list: it fails a ranking word ("first", "unique", "#1", "SOTA", "beat(s)", "win(s)", a hundred per cent written as a number) inside a claims region, and a results row that does not name its model, date, sample size, metric, value and confidence interval, or that compares with another system without publishing both configurations.
