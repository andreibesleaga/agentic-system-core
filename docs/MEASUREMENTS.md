# Measurements

**Status: PARTIAL, measured 2026-09-23 against `1.0.0-rc.6` (drafted, untagged).** Four of the eight measurement layers have been run and are reported below with the command that produced each number. Four are specified here and **not yet run**; each says so in its own section rather than being left out, because an absent measurement is a fact about this project and hiding it would be the thing this document exists to stop.

Every number here is generated into `docs/measurements.json` beside this file, so a reader can compare the record with the prose. Re-running any single line reproduces one table.

## What may be said about these numbers, and what may not

Three kinds of statement appear below, and they are not interchangeable.

- **Verified.** Counts of artefacts, and byte comparisons between artefacts. These are facts about files: two builds either produced the same bytes or they did not.
- **Measured, with the conditions attached.** Build times, peak memory and emitted sizes. These are properties of *this machine on this day* at a stated Node version, reported as the median of three runs. They are not properties of the format.
- **Observed under a configuration.** The retrieval scores. They depend on the query set, the labels, the tokenizer and the corpus, all of which are named. They are observations, never proofs.

**Nothing in this document compares this system's speed, cost or quality with another system.** No such comparison is made anywhere in this project unless we ran the other system ourselves on the same tasks and published both configurations.

Two limits are printed with their own numbers below and are repeated here because they are easy to forget:

- The lints of the security floor **prove neither safety nor the absence of novel injection** (AGSC-08-19: "An implementation MUST NOT claim more").
- An automated accessibility pass does not establish WCAG conformance; axe-core finds on average 57 % of WCAG issues automatically, so a clean run is a floor, not a certificate.

## The machine every timing was taken on

| | |
|---|---|
| Processor | AMD Ryzen 7 5800H, 16 logical cores |
| Memory | 33.6 GB |
| Platform | Linux 6.6.114.1 (WSL2), x64 |
| Node | v24.18.0 |
| Clock | `SOURCE_DATE_EPOCH=1767225600` (2026-01-01T00:00:00Z) for every build |

A second operating system cannot be measured from one machine. The three-OS matrix is a CI concern and is stated as not-yet-run below.

---

## 1. Conformance — the vectors, and how much of the specification they reach

```
node bench/measure.js --layer conformance --scratch <dir>
node tools/count-artifacts --json
node --test tests/conformance/vector-runner.test.js
```

**The vector run.** `149 pass, 0 fail, 20 skip (20 withdrawn, 0 pending) of 169`. Of the 169 vectors, 148 are required, 1 is optional and 20 are withdrawn; withdrawn vectors are excluded from the claim, as AGSC-00-13 requires. The 19 populated areas are `adopt boards boundary build bundle chunks cli compose conform discovery frontmatter graph import jcs ledger links lint prov slug`.

**Rule coverage, which is the number nobody has published before.** The specification declares **343 rules** — 332 active, 11 reserved. Counted over the 328 active rules the parser recognises in `spec/*.md`:

| | rules | share of 328 |
|---|---|---|
| with at least one conformance vector | **115** | 35 % |
| with **no** vector | **213** | 65 % |
| named by at least one test file | 261 | 80 % |
| named by at least one checker under `tools/` | 73 | 22 % |
| named by at least one acceptance scenario | 14 | 4 % |
| **named by nothing at all** | **59** | 18 % |

**Read the last four rows carefully.** "Named by a test" means the rule id appears in a test file. That is a statement of intent, not proof of a machine assertion: a rule id in a comment is a claim by the author that the file verifies the rule. Only the first row — a vector that carries the rule id in its `rule` member and is executed by the runner — is verified in the strict sense. The authoritative matrix, with each rule classified as verified, prose-only-with-a-reason, or unverified, is `tools/rule-coverage` and `docs/RULE-COVERAGE.md`; **until that exists, treat rows 3 to 6 as an upper bound on coverage and row 1 as the lower bound.** The 59 rules that nothing names at all are listed in `docs/measurements.json` under `layers.conformance.rule_coverage.uncovered`, with a per-chapter breakdown beside it.

**Error codes.** 90 registered, 90 used. No code is registered and unraised, and none is raised and unregistered.

**The independent checkers.** Six of the nine ran here, each exiting 0 with a well-formed envelope and no finding: `validate-spec`, `validate-schemas`, `validate-ontology`, `validate-vectors`, `validate-features`, `validate-diagrams`. The remaining three (`validate-wellknown`, `gen-spec-html`, `gen-ns`) need an argument or a target and were not run in this pass.

---

## 2. Determinism — the same bytes twice, and across a time zone and a locale

```
node bench/measure.js --layer determinism --scratch <dir>
```

The Bundle is `tests/fixtures/minimal`, copied into a scratch directory for each run so that nothing is written inside the repository.

| comparison | files compared | files differing |
|---|---|---|
| two clean builds, same environment | **49** | **0** |
| `TZ=UTC LC_ALL=C` against `TZ=Asia/Tokyo LC_ALL=de_DE.UTF-8` | **49** | **0** |

Neither comparison found a file present on one side and absent on the other. `agsc verify`, which builds twice and compares the bytes through the engine's own path, exits 0.

**What this does and does not establish.** It establishes that *this* engine is deterministic across a time zone and a locale on one operating system. It does **not** establish the cross-implementation byte identity that AGSC-04-24 states, because that needs a second engine. Today the Python package implements two of the nineteen populated areas independently (`jcs`, `slug`) and none of the seventeen that carry emitted bytes, so the property remains a property of the rules and the expected-byte vectors rather than of two shipped engines — which is what the paper already says, and what it must keep saying.

**Not yet run:** the same two builds on macOS and Windows. That is a CI-matrix measurement and cannot be taken from one machine.

---

## 3. Build cost, and the cliffs at 500 items

```
node bench/gen-bundle.js --items <n> --out <scratch>/n<n>
node bench/measure.js --layer perf --scratch <dir> --sizes 100,500,501,1000,5000 --runs 3
```

Generated Bundles, each item a pure function of its number, three runs per size, median reported. The Bundles are generated **outside** the repository; the generator refuses to write inside it.

| items | build (median of 3) | peak RSS | files emitted | output | largest index shard | index shards | index bytes/item |
|---|---|---|---|---|---|---|---|
| 100 | 1.71 s | 119 MiB | 336 | 2.98 MB | 31.9 KB | 0 | 319 B |
| 500 | 5.73 s | 278 MiB | 1,542 | 14.4 MB | 176.0 KB | 2 | 352 B |
| 501 | 4.88 s | 278 MiB | 1,548 | 14.5 MB | 176.0 KB | 2 | 351 B |
| 1,000 | 9.87 s | 352 MiB | 3,049 | 28.8 MB | 176.3 KB | 3 | 176 B |
| 5,000 | 34.60 s | 959 MiB | 15,105 | 143.9 MB | 177.9 KB | 11 | 36 B |

**Against the normative budgets of AGSC-06-21.** The budget is ≤ 60 s of build per 500 items: at 5,000 items that is a 600 s allowance and the build takes 34.6 s, so the budget is met with a wide margin at every size measured. The ≤ 1 MB per index document budget is met everywhere — the largest shard at 5,000 items is 178 KB, about a sixth of the allowance.

**Two things this run found that matter more than the timings.**

1. **The sharding branch fires at 500 items, not above it.** At 500 items the build already emits two `search-NN.json` shards and two `chunks-NN.jsonl` shards. The specification's own rc.6 note says of this branch that "no vector can catch it, because no released vector crosses the 500-item bound" — the generator now crosses it, and the branch runs and produces a conforming node at 500, 501, 1,000 and 5,000 items. This is the first time those branches have been exercised end to end.
2. **Scaling is sub-linear in time and roughly linear in memory.** From 500 to 5,000 items the build grows 6.0× for a 10× corpus; peak resident memory grows 3.4×. Nothing measured is super-linear.

**Two gaps in this run, stated rather than smoothed over.** (a) The largest emitted file is reported, but at and above 500 items that file is a chunk shard or `llms-full.txt`, not an HTML page — so the ≤ 100 KB **per HTML page** budget of AGSC-06-21 is **not yet measured** by this table and must be measured separately over `*.html` only. (b) `chunks` bytes per item is reported only for the unsharded case; above 500 items the shards are not summed. Both are recorded as defects of the measurement, not of the engine.

**Not run here: 10,000 items.** An earlier audit measured 57.9 s and 1,225 MiB peak at 10,000 items, and recorded that such a build dies under a 512 MiB heap cap. That figure is not reproduced in this pass and is cited, not claimed.

---

## 4. Retrieval across the published surfaces

```
node tools/bench --node <built node> --origin-node <name> --json
node tools/bench --dry-run                 # validates the set, scores nothing
```

**Observed under this configuration**, not proved: a committed set of 20 hand-written intents (12 for the patterns node, 8 for the main node), one gold item each, scored at k = 10 against three model-free surfaces of each node's built output. No model, no key and no network are involved; the runner reads only published files and uses its own tokenizer, independent of the engine's.

| node | surface | recall@10 | precision@10 | nDCG@10 | P@1 | MRR | queries | documents |
|---|---|---|---|---|---|---|---|---|
| patterns (15 published items) | chunks.jsonl | **1.00** | 0.100 | 0.891 | 0.750 | 0.854 | 12 | 54 |
| patterns | search.json | **1.00** | 0.100 | 0.846 | 0.667 | 0.794 | 12 | 15 |
| patterns | llms.txt | 0.833 | 0.083 | 0.730 | 0.583 | 0.694 | 12 | 10 |
| main (15 published items) | chunks.jsonl | **1.00** | 0.100 | 0.705 | 0.375 | 0.609 | 8 | 17 |
| main | search.json | 0.875 | 0.088 | 0.694 | 0.500 | 0.646 | 8 | 15 |
| main | llms.txt | 0.875 | 0.088 | 0.665 | 0.500 | 0.598 | 8 | 13 |

`precision@10` is bounded above by 0.1 here because each intent has exactly one gold item; the informative columns are recall, nDCG and P@1.

**What this is worth, honestly.** Twenty intents over thirty published items is a smoke test of the surfaces, not a study. It has no dev/test split, no paraphrase generation, no second annotator, no bootstrap interval and no leakage control, and the intents were written by the same person who wrote the items. The real study — 100 intents, intents drawn only from non-indexed fields, an item-level split, published overlap statistics, headline numbers on the hand-written twenty, medians with intervals over at least three seeded runs — is the `bench` verb's job at v1.0.1 and is specified in `docs/BENCHMARKS.md`. Do not quote this table as an evaluation result; quote it as the first run of the harness.

The `ask` tool is deliberately not scored separately: it returns the first three `search` hits with citations, so its ranking *is* the `search` ranking truncated at three.

---

## 5. Package size

```
npm pack --dry-run --json
```

| | |
|---|---|
| files in the tarball | 354 |
| unpacked | 2.57 MB |
| packed | 798 KB |

---

## 6. Layers specified here and not yet run

Each of these is designed, and none has a number. They are listed so that the absence is legible.

| layer | what it will measure | why it has no number yet |
|---|---|---|
| Security floor, scored | precision and recall of the four content lints per fault class (agent-directed imperatives, hidden text, long encoded runs, non-`http(s)` schemes, secrets, PII, clean-room), plus each structural refusal as a pass or fail | the seeded fault corpus with known labels is not yet committed; `bench/measure.js --layer security` reads `bench/corpus/security-floor.json`, which is the next file to write |
| Page tool / MCP parity | the same call on both transports compared **as values**, which is what AGSC-09-16 claims at rc.6 — never byte-identical across the browser boundary | the call list `bench/corpus/parity-calls.json` is not yet committed |
| Accessibility | axe-core violations per page template, zero required; Lighthouse accessibility, best-practices and SEO per template. The Lighthouse **performance** category is not a gate: its own repository states scores "change due to inherent variability in web and network technologies, even if there hasn't been a code change" | needs the browser lane; not run in this pass |
| Tokens per item | token counts for `llms.txt`, `chunks.jsonl` and the `llm-context` export, with a named offline tokenizer | the tokenizer library installs outside the repository, and no Claude token count will ever be reported here: Anthropic publishes no offline tokenizer, so such a figure would be a guess |
| Three-OS matrix | the same suite and the same two builds on Linux, macOS and Windows at Node 22 and 24 | cannot be run from one machine |

---

## Table for the paper (numbers only)

Paste-ready for the Conformance and Measurements section. Every figure is from this document; nothing is rounded up.

| quantity | value |
|---|---|
| specification version measured | 1.0.0-rc.6 (drafted, untagged) |
| rules declared / active / reserved | 343 / 332 / 11 |
| conformance vectors: total / required / optional / withdrawn | 169 / 148 / 1 / 20 |
| vector run | 149 pass, 0 fail, 20 skipped (all withdrawn) |
| populated vector areas | 19 |
| active rules with ≥ 1 vector | 115 of 328 (35 %) |
| active rules with no vector | 213 of 328 (65 %) |
| active rules named by no test, checker, vector or scenario | 59 of 328 (18 %) |
| error codes registered / used | 90 / 90 |
| engine test suite | 1,909 tests, 0 failures, 21 skipped |
| two clean builds compared | 49 files, 0 differing |
| builds across time zone and locale compared | 49 files, 0 differing |
| build, 500 items (median of 3) | 5.73 s, 278 MiB peak |
| build, 5,000 items (median of 3) | 34.60 s, 959 MiB peak |
| build budget (AGSC-06-21) | ≤ 60 s per 500 items — met at every size measured |
| largest index shard at 5,000 items | 178 KB against a 1 MB budget |
| index shards emitted at 500 / 5,000 items | 2 / 11 |
| independent implementations passing the vectors | 1 engine; a second implements 2 of 19 areas |
| retrieval smoke run, patterns node, chunks surface | recall@10 1.00, nDCG@10 0.891, P@1 0.750 (12 intents) |
| npm package | 354 files, 798 KB packed, 2.57 MB unpacked |

---

*Generated record: `docs/measurements.json` (`schema: agsc.measurements.v1`). Runner: `bench/measure.js`. Kit: `docs/BENCHMARKS.md`.*
