# Measurements

**Who this is for:** anyone checking what has been measured, on what, and with which command. **Read after:** [BENCHMARKS.md](BENCHMARKS.md) (the method).

**Status: every one of the ten layers was measured on 2026-11-11, one after another, into one scratch directory, on the `1.1.0` tree (the specification and engine of this release, before the release tag).** `docs/measurements.json` is that run, assembled; each section below gives the command that produced its numbers. The figures outside the ten layers were measured on 2026-10-12 on the `1.0.0` tree and are not in the record; each is marked "1.0.0 run; not in the record" where it stands: the `verify` line of §4, the folder breakdown and the 1.0.0 install of §9, and the cost figures of §11. `tools/lint-claims --record` holds the measured regions of this page and of BENCHMARKS.md to the record. The same suite on macOS and Windows runs in the CI matrix on every push, not on this machine.

Every number in the ten layers is generated into `docs/measurements.json` beside this file, so a reader can compare the record with the prose. Re-running any single line reproduces one table. The record names nodes, never the paths they were built into.

## What may be said about these numbers, and what may not

Three kinds of statement appear below, and they are not interchangeable.

- **Verified.** Counts of artefacts, byte comparisons between artefacts, and pass/fail outcomes of a fixed case list. These are facts about files and runs: two builds either produced the same bytes or they did not; a seeded fault was either stopped or it was not.
- **Measured, with the conditions attached.** Build times, peak memory, emitted sizes and token counts. These are properties of *this machine on this day* at a stated Node version, or of a named tokenizer vocabulary. They are not properties of the format.
- **Observed under a configuration.** The retrieval scores. They depend on the query set, the labels, the tokenizer and the corpus, all of which are named. They are observations, never proofs.

**Nothing in this document compares this system's speed, cost or quality with another system.** No such comparison is made anywhere in this project unless we ran the other system ourselves on the same tasks and published both configurations.

Three limits are printed with their own numbers below and are repeated here because they are easy to forget:

- The lints of the security floor **prove neither safety nor the absence of novel injection** (AGSC-08-19: "An implementation MUST NOT claim more"). A full score on the seeded corpus says the engine stops *those* shapes.
- An automated accessibility pass does not establish WCAG conformance; axe-core finds on average 57 % of WCAG issues automatically, so a clean run is a floor, not a certificate.
- No token count here is Claude's. Anthropic publishes no offline tokenizer, so a Claude figure would be a guess; the two vocabularies below are named proxies.

## The machine every timing was taken on

| | |
|---|---|
| Processor | AMD Ryzen 7 5800H, 16 logical cores |
| Memory | 33.6 GB |
| Platform | Linux 6.6.114.1 (WSL2), x64 |
| Node | v24.18.0 |
| Clock | `SOURCE_DATE_EPOCH=1767225600` (2026-01-01T00:00:00Z) for every build |

Nothing else ran on the machine while the timed layer (§4) ran; the other layers were run after it, one at a time.

---

## 1. Conformance — the vectors, and how much of the specification they reach

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer conformance --scratch <dir>
node tools/count-artifacts --json
```

**The vector run.** `374 pass, 0 fail, 23 skip (23 withdrawn, 0 pending) of 397`. Of the 397 vectors, 372 are required, 2 are optional and 23 are withdrawn; a withdrawn vector stays in the set, carries the id of the case that replaces it, and is excluded from every claim, as AGSC-00-13 requires. The 20 populated areas are `adopt boards boundary build bundle chunks cli compose conform discovery export frontmatter graph import jcs ledger links lint prov slug`.

**Rule coverage.** The specification declares **385 rules** — 374 active, 11 reserved. Counted over the 374 active rules, a rule being reserved exactly when `tools/count-artifacts` says so:

| | rules | share of 374 |
|---|---|---|
| with at least one conformance vector | **211** | 56 % |
| with **no** vector | **163** | 44 % |
| named by at least one test file (a file that contains the id — a proxy; `tools/rule-coverage`, which counts test titles and `// verifies` markers, reports 356) | 369 | 99 % |
| named by at least one checker under `tools/` | 119 | 32 % |
| named by at least one acceptance scenario | 110 | 29 % |
| **named by nothing at all** | **4** | 1 % |

*(The runner counts a rule as reserved by the counter's own test, not by whether its opening words mention "reserved".)*

**Read the last four rows carefully.** "Named by a test" means the rule id appears in a test file. That is a statement of intent, not proof of a machine assertion. Only row 1 — a vector that carries the rule id in its `rule` member and is executed by the runner — is verified in the strict sense. **Treat rows 3 to 6 as an upper bound on coverage and row 1 as the lower bound.** The authoritative classification is `tools/rule-coverage` (`docs/RULE-COVERAGE.md`), which reports 361 rules verified, 11 prose-only with a stated reason, 0 unverified and 2 listed as gaps. The 4 rules that nothing names are listed in `docs/measurements.json` under `layers.conformance.rule_coverage.uncovered`, with a per-chapter breakdown beside it.

**Error codes.** 105 registered, 105 used by the engine; 94 are asserted by a conformance case, and the other 11 are named, each with its reason, in the paragraph "Codes no case asserts" of the registry (spec/09 §9.4).

**The independent checkers.** Six of the eleven ran, each exiting 0 with a well-formed envelope and no finding: `validate-spec`, `validate-schemas`, `validate-ontology`, `validate-vectors`, `validate-features`, `validate-diagrams`. `validate-wellknown` ran in §3 against sixteen hostile discovery inputs; `gen-spec-html`, `gen-ns`, `gen-shapes` and `gen-dc-profile` are generators and have no pass/fail to report here.

---

## 2. Determinism — the same bytes twice, and across a time zone and a locale

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer determinism --scratch <dir>
```

| comparison | files compared | files differing |
|---|---|---|
| two clean builds, same environment | **61** | **0** |
| `TZ=UTC LC_ALL=C` against `TZ=Asia/Tokyo LC_ALL=de_DE.UTF-8` | **61** | **0** |

The 61 files are the build output (`www/`) of the reference fixture.

`agsc verify` exits 0. **What this does not establish:** the cross-implementation byte identity of AGSC-04-24, which needs a second engine — the Python package runs seven of the twenty populated areas (`build`, `discovery`, `frontmatter`, `graph`, `jcs`, `links`, `slug`; `agsc run-vectors tests/vectors` gives 114 pass and 0 fail — the other 34 vectors of those areas need a whole build, a writer it does not carry or the domain layer, which only the engine checks in 1.1, and are not run, and 7 are withdrawn) and agrees with the engine on the vectors both run, but it does not build a whole node, so byte identity of the emitted files between two engines is not measured. **Not run here:** the same builds on macOS and Windows, which the CI matrix runs on every push.

---

## 3. The security floor, scored

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer security --scratch <dir>      # corpus: bench/corpus/security-floor.json
```

A seeded corpus of **128 cases**: **108 faults the rules name**, **14 valid controls** and **6 shapes reported but never scored**. Every case runs through the real code path — a scratch copy of the reference fixture linted, built or gated (`agsc lint`, `agsc build`, `agsc ci`), some with a git history of their own, some with a hostile `build.out` handed to `agsc-host emit` or to the environment layer (`AGSC_BUILD_OUT`), `agsc init` and `agsc lint --fix` on a run just under 1 MiB under a kill bound, the skills, old-site and GABBE imports, `agsc skills import` and `agsc init` on a line just under 1 MiB that ends in a carriage return, U+2028 or U+2029, under the same bound, a hostile foreign corpus handed to `agsc import --from okf`, an agent-run record handed to `agsc trace`, a hostile discovery document handed to `tools/validate-wellknown`, hostile peer lists walked by the federation walk with an in-memory fetch (no socket is opened), redirect chains through the redirect guard, and forged skill packs and Harness file sets through the AGSC-07-15 checks. Every credential-shaped value in the corpus is fabricated and stored base64-encoded.

An outcome is one of six: **detected** (the rule's code, exit 0), **refused** (the rule's code, non-zero exit), **refused under another code** (stopped, non-zero exit, but with a different registered code from the one the rule names — handled, and still a diagnostic defect), **neutralised** (no finding, but the construct demonstrably reached no output: the scorer searches the output bytes), **finished** (a case that feeds a long run: the verb ended inside the kill bound with an exit code the case allows) and **missed** (including any internal error, or a run stopped by the kill bound, which is never a verdict).

**Score: 108 of 108 faults stopped, each under the code its rule names.** 21 detected, 74 refused, 5 neutralised, 8 finished, none refused under another code and none missed. **Controls: 14 of 14 clean.** This is a statement about these 108 shapes and nothing more (AGSC-08-19).

**The package published at `1.0.0-rc.6`**, scored on the 104 cases the corpus held at that release, stops all 85 of its faults, 84 under the expected code. One case, the symlinked item, is refused there under `AGSC-E601` instead of `AGSC-E902`: `agsc ci` wrote a finding that has no line number into its gate file, the canonical writer refused the missing value, and `ci` reported that refusal in place of the real finding. This version carries the fix (every finding carries its position; `tests/distribution/ci-findings-without-position.test.js`).

| class | faults | stopped | how | controls clean |
|---|---|---|---|---|
| agent-directed imperatives (title, description, body, upper case, vendor key, agent-authored, text attachment, configured pattern) | 8 | 8 | 7 detected, 1 refused (agent-authored ⇒ error) | — |
| hidden text (zero-width, tag characters, bidi override, HTML comment, both variation-selector ranges) | 6 | 6 | detected | — |
| encoded runs at the 256-character threshold (base64, hex, inside a fence) | 3 | 3 | detected | 2 of 2 |
| link schemes (`javascript:`, `data:`, `file:` autolink, `vbscript:`) | 4 | 4 | detected | — |
| secrets (access-key id, token, private-key block, assignment) | 4 | 4 | refused | 1 of 1 |
| personal data (e-mail, telephone, an e-mail address after a 200,000-character run) | 3 | 3 | refused | 1 of 1 |
| clean room (`bookRef`, reading-order phrase, excluded file) | 3 | 3 | 2 refused, 1 neutralised | — |
| path traversal (attachment `..`, absolute, backslash; body link and image escaping; symlinked item; symlinked attachment directory; `build.out` escaping; `build.out` naming the source tree) | 9 | 9 | refused | — |
| NUL / BOM / CR and encoding (BOM, CRLF, bare CR, NUL and U+2028 in a title, non-NFC, invalid UTF-8) | 7 | 7 | refused | — |
| oversized inputs (item over 1 MiB, configuration over 1 MiB, attachment over the cap, a combining run over the normalisation bound) | 4 | 4 | refused | — |
| archives (in `content/`, as an attachment) | 2 | 2 | 1 refused, 1 neutralised | — |
| hostile YAML (alias bomb, language tag, duplicate key) | 3 | 3 | refused | — |
| prototype-named keys and selectors (a frontmatter key `__proto__` hiding a missing `prov`, a configuration member `__proto__`, a prototype name as a steer target and as an export adapter) | 4 | 4 | refused | — |
| a hostile git history (a commit message forging a ledger entry, a repository configuration that would run a command, a commit trailer long enough to stall a slow scanner) | 3 | 3 | 2 neutralised, 1 finished | — |
| unsafe SVG on a pattern (script, embedded raster, DOCTYPE with an entity) | 3 | 3 | refused | — |
| a hostile skill (forged by a title, a script, `allowed-tools`, a shebang, a path escaping the Harness, an executable extension) | 6 | 6 | refused | 1 of 1 |
| a hostile discovery file (not JSON, over 1 MiB, 100,000-deep nesting, script anchor, unknown relation, extra members; peers at `file:`, link-local metadata, loopback, private range, IPv6 loopback, DNS resolving to a private address, an unresolved host, a 60-peer fan-out flood; a redirect to loopback, a four-hop chain) | 16 | 16 | refused; no refused peer ever reached the fetch | 1 of 1 |
| a hostile foreign corpus on import (an archive, a symlink out of the source, injection, a NUL in a title, a file over 1 MiB, an excluded file) and an agent-run record whose usage is not a finite number, handed to `trace` | 7 | 7 | 1 detected, 5 refused, 1 neutralised | 1 of 1 |
| a hostile `build.out` handed to `agsc-host emit` (the parent folder, an absolute path, the source tree) | 3 | 3 | refused | — |
| the environment layer: `AGSC_BUILD_OUT` naming the source tree | 1 | 1 | refused | 1 of 1 |
| a run just under 1 MiB for `agsc init` and `agsc lint --fix`, and a line just under 1 MiB ending in a carriage return, U+2028 or U+2029 for the skills, old-site and GABBE imports, `agsc skills import` and `agsc init`, under a kill bound | 7 | 7 | finished | — |
| valid Bundle controls (clean item under `ci` and `lint`, `https` link, emoji sequence, the word "ignore", a clean SVG) | — | — | — | 6 of 6 |

**Reported, never scored (6).** Three shapes beyond what AGSC-08-13 enumerates — a full-width-letter imperative, a paraphrased imperative, an imperative split across two lines — are not detected, which is what AGSC-08-19 says to expect. The other three are caught: a NUL byte in an item **body** is refused with `AGSC-E108` (AGSC-01-14 names every C0 control but TAB and LF), and **`agsc build` run on its own, without `lint`**, refuses an SVG attachment carrying a `<script>` element (`AGSC-E412`) and an attachment path with `..` segments (`AGSC-E902`), as AGSC-02-98 requires of `build` itself.

---

## 4. Build cost, the cliffs at 500 items, and the HTML page budget

```
node bench/gen-bundle.js --items <n> --out <scratch>/n<n>
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer perf --scratch <dir> --sizes 100,500,501,1000,5000,10000 --runs 3
```

Generated Bundles, each item a pure function of its number, three runs per size, median reported. The Bundles are generated outside the repository; the generator refuses to write inside it.

| items | build (median of 3) | runs | peak RSS (median) | files | output | largest index shard | shards | chunks, all shards |
|---|---|---|---|---|---|---|---|---|
| 100 | **2.33 s** | 2.33 / 2.35 / 2.25 | 175 MiB | 355 | 8.3 MB | 31.9 KB | 0 | 0.71 MB |
| 500 | **5.88 s** | 5.88 / 5.84 / 6.41 | 304 MiB | 1,559 | 22.2 MB | 176.0 KB | 2 | 3.57 MB |
| 501 | **6.24 s** | 10.09 / 6.24 / 5.75 | 305 MiB | 1,565 | 22.2 MB | 176.0 KB | 2 | 3.57 MB |
| 1,000 | **10.21 s** | 10.27 / 10.06 / 10.21 | 440 MiB | 3,065 | 39.4 MB | 176.3 KB | 3 | 7.13 MB |
| 5,000 | **49.93 s** | 50.05 / 47.53 / 49.93 | 1,057 MiB | 15,113 | 178.2 MB | 177.9 KB | 11 | 35.81 MB |
| 10,000 | **119.13 s** | 119.13 / 128.61 / 116.68 | 1,692 MiB | 30,173 | 351.6 MB | 177.9 KB | 21 | 71.66 MB |

These timings are of this machine on this day; they vary between days on the same machine, and none is a property of the format.

**Cluster pages.** An item page is never paginated (AGSC-06-21), so a cluster page lists at most 500 members — the bound the rule uses for every index page — and says how many members there are and where the complete membership is (the search index carries `cluster` per document; the graph carries the membership). Neither reference node has a cluster of more than 500 members.

**Against the normative budgets of AGSC-06-21.** ≤ 60 s of build per 500 items: at 10,000 items that is a 1,200 s allowance and the build takes 119.13 s. ≤ 1 MB per index document: the largest shard is 178 KB at every size above 500. Both are met with wide margins.

**≤ 100 KB per HTML page — measured over `*.html` only.**

| items | HTML pages | largest page | which | median page | over 100 KB |
|---|---|---|---|---|---|
| 100 | 116 | 32.5 KB | `clusters/bench-cluster/index.html` | 10.3 KB | 0 |
| 500 | 517 | 95.1 KB | `clusters/bench-cluster/index.html` | 10.3 KB | 0 |
| 501 | 521 | 95.4 KB | `clusters/bench-cluster/index.html` | 10.3 KB | 0 |
| 1,000 | 1,021 | 95.5 KB | `clusters/bench-cluster/index.html` | 10.3 KB | 0 |
| 5,000 | 5,053 | 96.6 KB | `clusters/bench-cluster/index.html` | 10.3 KB | 0 |
| 10,000 | 10,093 | 96.6 KB | `clusters/bench-cluster/index.html` | 10.3 KB | 0 |

No HTML page exceeds the budget at any size. The largest page is the cluster page that lists 500 members, at 96.6 KB — a 3 % margin. The published sites were swept the same way (§7): the largest page of the main site is under the budget, because its longest specification chapters are published in parts.

**Supported scale, stated from these numbers and nothing else.** The reference engine is measured to **10,000 published items** on one machine: 119.13 s of build, 1,692 MiB peak, 351.6 MB of output in 30,173 files, every budget of AGSC-06-21 met. From 1,000 to 10,000 items the build grows 11.7× in time and 3.8× in peak memory for a 10× corpus: memory grows less than the corpus, time somewhat more. Above 10,000 items nothing is measured and nothing is claimed. Where such a node can be hosted is §11.

*(1.0.0 run; not in the record.)* `agsc verify` (two builds in one process, digests kept, AGSC-04-02), with `SOURCE_DATE_EPOCH=1767225600 /usr/bin/time -v node bin/agsc.js verify`: on the 5,000-item Bundle 54.7 s wall and **1,244 MiB** peak — about 220 MiB above one build, the earlier build's garbage not yet reclaimed while the second runs; on the 500-item Bundle 6.4 s and 298 MiB.

---

## 5. Page-tool / MCP parity, call by call

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer parity --scratch <dir> --nodes fixture=<bundle>,patterns=<bundle>,main=<bundle>
```

The call list (`bench/corpus/parity-calls.json`) has 34 fixed calls — every tool of AGSC-09-13, every domain-error path (unknown tool, missing argument, unknown slug, a foreign `memory://` IRI, a 1 MiB + 1 argument), the two local-only writers — and seven per-item templates (`read`, `links`, `propose`, `compose`, `brief`, `check`, `explain`) run once for every published item. Each call is asked of **the real `agsc mcp` process over stdio**, of **the emitted page script** run in a fresh `vm` context over the build's own bytes, of the page-tools module, and of the in-process server, and the answers are compared **as values** after a JSON round trip — the comparison AGSC-09-16 makes, never byte-identity across the browser boundary.

Measured on three Bundles anyone can rebuild: the reference fixture, the demonstration node's public repository (`agsc-demo-node`) and the main node as its site build hands it to the engine. Each is measured as files without a git history (the demonstration node as `git archive` writes it): the in-process server is built without the history, so on a git checkout the content version in the answers of `read` and `brief` would differ between the stdio process and the in-process server, a limit of the runner and not of the transports.

| Bundle | items / published | calls | page = server (published projection) | the one difference the rule requires | other differences | stdio = in-process server |
|---|---|---|---|---|---|---|
| reference fixture | 3 / 3 | 55 | **53** | 2 | **0** | 55 / 55 |
| demonstration node | 42 / 42 | 328 | **326** | 2 | **0** | 328 / 328 |
| main node | 17 / 17 | 153 | **151** | 2 | **0** | 153 / 153 |
| **total** | | **536** | **530** | **6** | **0** | **536 / 536** |

**The one difference the rule requires.** AGSC-09-16: "The one input on which the two transports MUST differ is a `remember` call that declares no operator: the local server refuses it with `AGSC-E003` and a page tool, which has no identity to declare, returns the item with `prov.operator` absent and `AGSC-E506`." The call list holds two such calls, and on every Bundle both answers have exactly that shape; the runner checks the shape and counts these calls apart (`required_difference` in the record).

**Unpublished items.** None of these three Bundles holds an unpublished item, so the page's `AGSC-E301` answer for one is exercised by `tests/bench/kit.test.js` (a draft item: 3 of 3 calls answered `AGSC-E301`). AGSC-09-16 makes the listed set the comparison: the stdio server of a Bundle that holds drafts sees every item, and a page sees only the listed ones (AGSC-00-05).

---

## 6. Retrieval across the published surfaces

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer retrieval --scratch <dir> --nodes patterns=<build>,main=<build>     # query set: bench/queries/bench-v2
```

**Observed under this configuration**, not proved: the committed set `bench-v2` of 20 hand-written intents (12 for the demonstration node, 8 for the main node), one gold item each, k = 10, against three model-free surfaces of each node's build by the current engine. No model, no key, no network.

| node | surface | recall@10 | precision@10 | nDCG@10 | P@1 | MRR | queries | documents |
|---|---|---|---|---|---|---|---|---|
| demonstration | chunks.jsonl | 0.667 | 0.067 | 0.547 | 0.417 | 0.533 | 12 | 128 |
| demonstration | search.json | **0.917** | 0.092 | 0.737 | 0.583 | 0.688 | 12 | 42 |
| demonstration | llms.txt | **0.917** | 0.092 | 0.736 | 0.583 | 0.679 | 12 | 22 |
| main | chunks.jsonl | **1.00** | 0.100 | 0.698 | 0.375 | 0.601 | 8 | 21 |
| main | search.json | 0.875 | 0.088 | 0.695 | 0.500 | 0.647 | 8 | 17 |
| main | llms.txt | 0.875 | 0.088 | 0.665 | 0.500 | 0.598 | 8 | 14 |

Twenty intents over 59 published items is a smoke test of the surfaces, not a study: no split, no paraphrases, no second annotator, no intervals, and the intents and items share an author. The study is specified in `docs/BENCHMARKS.md` and is the `tools/bench` program's work at 1.1. The `ask` tool is not scored separately: its ranking is the `search` ranking truncated at three.

---

## 7. Accessibility per page type

```
SOURCE_DATE_EPOCH=1767225600 NODE_PATH=<scratch>/node_modules CHROME_EXE=<chromium> node bench/measure.js --layer a11y --scratch <dir> --nodes <name>=<build>,…
```

axe-core 4.13.0 in headless Chromium through playwright-core 1.61.1 (both installed outside the repository), the WCAG 2.0/2.1/2.2 A and AA tags plus best practices — the tag set of the site repository's own browser lane — over every page, in the light and in the dark colour scheme. Every request to another origin is blocked and counted.

| build | pages | checks (× 2 schemes) | page types | axe violations | third-party requests | largest HTML page |
|---|---|---|---|---|---|---|
| reference fixture (engine) | 17 | 34 | 15 | **0** | 0 | 21.9 KB |
| demonstration node (engine) | 89 | 178 | 17 | **0** | 0 | 25.5 KB |
| main node (engine page shell) | 35 | 70 | 18 | **0** | 0 | 22.0 KB |
| main site (its own generator) | 109 | 218 | 38 | **0** | 0 | 96.1 KB |

Page types are the templates a route is rendered from: home, each section's index, each section's item or term page, paginated indexes. The per-type counts are in `docs/measurements.json` under `layers.a11y.nodes.<build>.by_type`; every type has zero violations. **axe-core finds on average 57 % of WCAG issues automatically: zero is a floor, not a conformance claim.** This lane loads every page at one size, 1200 × 900; the site repository's own lane (`scripts/a11y.js`) loads every page at 390, 768 and 1280 px. The Lighthouse performance category is not measured and is never a gate.

---

## 8. Tokens per item

```
SOURCE_DATE_EPOCH=1767225600 NODE_PATH=<scratch>/node_modules node bench/measure.js --layer tokens --scratch <dir> --nodes <name>=<build>,… --exports <name>=<llm-context dir>,…
```

`gpt-tokenizer` 2.9.0 (MIT, offline, the published BPE tables), two vocabularies: `o200k_base` and `cl100k_base`. **No Claude count**: there is no offline Claude tokenizer, so such a number would be a guess. Median tokens **per item**, `o200k_base` (`cl100k_base` in brackets):

| node | llms.txt index line | chunk text only | chunk records as served (JSON lines) | llm-context skim sections | llm-context TOON index rows |
|---|---|---|---|---|---|
| reference fixture (3 items) | 32 (33.5) | 102 (103) | 1055 (1073) | 349 (350) | 165 (174) |
| demonstration node (42 items) | 49 (49) | 204 (204) | 1197.5 (1209) | 439 (444) | 166 (166.5) |
| main node (17 items) | 40.5 (40.5) | 99 (99) | 304 (306) | 144 (144) | 30 (30) |

Whole files, `o200k_base`: `llms.txt` 219 / 1,333 / 782 tokens; `llms-ctx.txt` 1,008 / 12,274 / 3,445; `chunks-index.toon` 403 / 5,085 / 761 (fixture / demonstration node / main). The two vocabularies differ by at most 5.2 % on any median above. The distance between the chunk text and the chunk record as served is the provenance an agent receives with every chunk — digest, IRI, licence, terms, trust and links; the skim view drops it on purpose and says so in its own header.

---

## 9. Package size

```
npm pack --dry-run --json
npm ls --omit=dev --parseable --all | xargs du -sk      # what a consumer's install holds
```

| | |
|---|---|
| files in the tarball | **993** |
| unpacked | **11.06 MB** |
| packed | **3,418 KB** |

By folder, the largest shipped parts are `tests/vectors` (632 KB, 251 files, read by `conform`), `src/distribution` (468 KB, 31 files), the specification `spec/` (451 KB), `src/interchange` (383 KB) and `tests/conformance` (314 KB, 32 files). What no verb reads and still ships — `examples/` (107 files, 85 KB), `docs/diagrams/` (22 files, 52 KB, read by the `validate-diagrams` checker over the engine's own tree), `docs/guides/` and the changelog (149 KB) — is shipped on purpose and left as it is. *(1.0.0 run; not in the record.)*

**What an install actually costs** (`npm install --omit=dev` of the packed tarball in an empty folder): **137 packages**, the package itself among them. The largest by far are the MCP server's: `zod` 8.2 MB, `@modelcontextprotocol/sdk` 6.2 MB, `hono` 3.7 MB, `undici` 1.6 MB — then `ajv` 2.5 MB, `jsonld` 2.1 MB, `markdown-it` 1.9 MB, `fast-xml-parser` 1.4 MB, `yaml` 1.3 MB, `diff` 1.0 MB, `n3` 0.9 MB (on disk, `du -sk`). The package's own 4.2 MB is a small part of the install, and the lever on the install is the MCP SDK's dependency tree, not this manifest. *(1.0.0 run; not in the record. 1.1, 7 November 2026: re-measured on the 1.1 tree, below.)*

**Cold start** (`/usr/bin/time`, five runs, from that install, the reference fixture): `agsc --version` 0.23–0.24 s and 65 MB with 120 modules loaded (`node -e ""` alone: 0.05–0.06 s, 44 MB); `agsc lint` 0.88–0.97 s and 93–95 MB with 288 modules. Every verb is required only when it runs; `jsonld` (183–206 ms to load) and the MCP SDK (323–344 ms) are loaded only by the verbs that emit RDF or serve MCP, never by `--version`, `lint`, `build` or `verify`. *(1.0.0 run; not in the record. 1.1, 7 November 2026: re-measured on the 1.1 tree, below.)*

**1.1: the install and the cold start, measured again (11 November 2026).** The two paragraphs above are the 1.0.0 run and stay as they were. The 1.1 tree replaces `@modelcontextprotocol/sdk` with the official MCP packages `@modelcontextprotocol/server` and `@modelcontextprotocol/node`, and adds `oxigraph`, `rdf-validate-shacl`, `@traqula/parser-sparql-1-1`, `@a2a-js/sdk`, `structured-headers` and `http-link-header` as run-time packages. The figures are the record's `install` layer, measured by one command on the `1.1.0` tree with Node 24.18.0 on Linux (WSL 2), the machine above. Its byte sizes describe the tree on the day it was measured: the documents and this record ship in the tarball, so a later commit packs to other sizes. The record's `spec_version` is the version the measured tree's specification states, 1.1.0:

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer install --scratch <dir>
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --assemble --scratch <dir> --out docs/measurements.json
```

<!-- measured:start -->
- **The tarball:** 993 files, 3,417,692 bytes packed, 11,058,497 unpacked (`npm pack`, at package version 1.1.0).
- **Install:** `npm install --omit=dev` of the tarball in an empty folder holds **88 packages**, the package itself among them, and 70.6 MB of files. The count is of the package folders under `node_modules`; `npm ls --parseable`, which gave the 1.0.0 figure above, also prints the install root, one line more, so the two counts differ in method as well as in tree. The ten largest, each without the packages nested in it: the package 11.06 MB, `oxigraph` 8.80 MB, `@modelcontextprotocol/server` 7.02 MB, `zod` 6.15 MB, `@tpluscode/rdf-ns-builders` 5.05 MB, `@a2a-js/sdk` 4.52 MB, `@types/node` 2.59 MB, `@traqula/chevrotain` 2.32 MB, `jsonld` 2.08 MB and `markdown-it` 2.06 MB. `@types/node` holds type declarations only and still lands in a production install, because `@rdfjs/types`, which `rdf-validate-shacl` and its RDF helpers depend on, lists it as a dependency. The other protocol packages: `@modelcontextprotocol/core` 1.37 MB, `hono` 1.31 MB, `@modelcontextprotocol/node` 0.15 MB, `@hono/node-server` 0.14 MB, `structured-headers` 0.14 MB and `http-link-header` 0.02 MB.
- **Cold start** (GNU `time -v`, five runs each, from that install, on a copy of the reference fixture `tests/fixtures/minimal`): `node -e ""` alone 0.06 s and 44–45 MB; `agsc --version` 0.23–0.25 s and 67 MB, 174 modules loaded; `agsc lint` 0.86–0.89 s and 104–105 MB, 335 modules; `agsc build` 1.12–1.15 s and 126–128 MB, 336 modules.
- **What a verb loads.** One more run of each verb preloads a resolve hook (`module.registerHooks`, which sees `require` and `import` alike) and records every file the process resolved. `--version`, `lint` and `build` load no file of `@modelcontextprotocol/*`, `@a2a-js/sdk`, `hono` or `@hono/node-server`. The control run, `agsc mcp` with an empty input, loads `@modelcontextprotocol/server`, `@modelcontextprotocol/core`, `@modelcontextprotocol/node`, `hono` and `@hono/node-server`, so the trace sees these packages when a verb does load them. Loading each alone takes 234–241 ms for `@modelcontextprotocol/server`, 287–293 ms for `@modelcontextprotocol/node` and 80–88 ms for `@a2a-js/sdk` (five runs each). The A2A package is loaded only by a build of a node whose `surfaces[]` declares `a2a-card`.
<!-- measured:end -->

`tests/bench/measure.test.js` holds the record to the trace claim. `tools/lint-claims --record docs/measurements.json` checks that every number between the two markers above is a number of the record, which does not say which member it is; `tests/docs/quoted-counts.test.js` binds each figure of the list to its member of the `install` layer, the ten largest packages to the record's own order.

---

## 10. Not run, and why

| layer | why it has no number |
|---|---|
| Three-OS matrix | the same suite and builds on macOS and Windows at Node 22.13, 24 and 26 cannot be run from one machine; the CI matrix runs them on every pull request and every push to `main` |
| COGX import | the engine ships a COGX adapter, but the security corpus does not yet feed it hostile archives; the OKF adapter is the import lane scored in §3 |

---

## 11. Cost — what a visit, an agent session and a month of hosting cost

*1.0.0 run; not in the record: every figure of this section was measured on 2026-10-12 by the commands below, or read from the host's pages on the dates given, and `docs/measurements.json` holds none of them.*

```
# page weight: a real headless Chromium (chrome-headless-shell 1228 through playwright-core 1.62.1, both outside the repository) over a loopback server of the built node; every request counted, every other origin blocked
# MCP: one `agsc mcp` process over stdio, 20 calls per tool, median of the wall time per call and the bytes of each answer's text
```

**Requests and bytes per visit** ("plain" is a browser without `document.modelContext`, "WebMCP" one that exposes it; KiB of 1,024 bytes):

| page | plain: requests / bytes | WebMCP browser: requests / bytes |
|---|---|---|
| main site, an item page (`/concepts/concept/`) | **6 / 111.5 KiB** | 27 / 146.2 KiB |
| demonstration node, an item page (`/concepts/autonomy-ladder/`) | **6 / 113.6 KiB** | 50 / 209.6 KiB |
| 5,000-item Bundle, an item page | **6 / 112.8 KiB** | not measured: see below |
| main site, front page | 3 / 33.9 KiB | 3 / 33.9 KiB |
| demonstration node, front page | 3 / 18.5 KiB | 3 / 18.5 KiB |

The page tools of an item page (AGSC-09-16) read their corpus — the discovery document, the index and one Markdown view per published item, plus the boards — at once only where a caller is expected: in a browser that exposes `document.modelContext`, and on the `/compose/` page. Elsewhere the read starts with the page's earliest tool call, and every call before the corpus is in returns a promise of the envelope (`tests/distribution/page-tools-lazy.test.js` compares the two paths call by call). On the 5,000-item Bundle that read is more than 4,000 requests at once, and in each of three runs headless Chromium refused about three in four of them (`ERR_INSUFFICIENT_RESOURCES`), so the count it served is the browser's limit, not the page's, and no figure is given for that cell.

**The search page.** Main site (query "digest"): 5 requests, 494.6 KiB, the earliest result painted 322 ms after typing; the page's own scripts are 5.0 KiB. Demonstration node (query "agent"): 5 requests, 60.1 KiB, 299 ms, scripts 10.2 KiB. The 5,000-item Bundle (query "bench"): 16 requests (the manifest, the index shards, the scripts), 1,835.4 KiB, 338 ms, scripts 9.7 KiB. The index is what a search costs, as AGSC-06-21 shards it.

**The MCP server, per call** (the 5,000-item Bundle; the reference fixture in brackets):

| tool | answer bytes | ms per call (median of 20) |
|---|---|---|
| `search` | 591,921 (450) | 80.20 (1.23) |
| `read` | 3,841 (1,022) | 0.93 (0.96) |
| `links` | 487 (297) | 1.86 (1.02) |
| `compose` | 217 (212) | 6.16 (1.03) |
| `ask` | 569 (627) | 8.01 (0.99) |
| `propose` | 3,845 (1,020) | 0.94 (1.45) |

A served Bundle is loaded once and never changes, so the search tokens and the resolved edges are computed on their initial use and kept. On the 5,000-item Bundle the query `bench` occurs in every item and the `search` answer is 592 KB, because no rule bounds a tool's answer (recorded as a specification item). Starting the server costs one in-memory build — 1.2 s on the reference fixture, 34.5 s on the 5,000-item Bundle, until it answers `initialize` — because the resource catalogue serves the built routes.

**Hosting, by the host's published limits.** Cloudflare Pages is the reference profile. Its limits page (`https://developers.cloudflare.com/pages/platform/limits/`, read 2026-09-25, "Last updated Sep 5, 2026") says: "Cloudflare Pages sites can contain up to 20,000 files on the Free plan." and "Paid plans (such as Pro, Business, and Enterprise plans) can have up to 100,000 files per site."; "The maximum file size for a single Cloudflare Pages site asset is 25 MiB."; "A `_headers` file can have a maximum of 100 header rules."; "A `_redirects` file can have a maximum of 2,000 static redirects and 100 dynamic redirects, for a combined total of 2,100 redirects." Its Functions pricing page (`https://developers.cloudflare.com/pages/functions/pricing/`, read 2026-09-25) says: "On both free and paid plans, requests to static assets are free and unlimited."

| node | files | bytes | Free plan | cost |
|---|---|---|---|---|
| main site (`www`) | 189 | 3.37 MB | fits | **0 USD / month** |
| demonstration node (`www`) | 219 | 1.26 MB | fits | **0 USD / month** |
| 5,000-item Bundle | 15,102 (28 header rules, 1 redirect) | 150.5 MB | fits | 0 USD / month |
| 10,000-item Bundle | 30,162 | 300.9 MB | **over the 20,000-file limit** | a paid Pages plan (100,000 files; its price was not read in this run), or another hosting profile of `agsc-host` |

A published node costs three files per item (the page, the Markdown view, the JSON-LD view) plus its index pages, so the Free plan holds a node of about **6,600 items**; a static node serves no function and no request is metered, so bandwidth is not a cost at any size. Both reference nodes are hosted for 0 USD a month, within the ≤ 10 USD a month the project sets itself for hosting.

**An agent session.** Over WebMCP on the main site, the corpus read is 146 KiB once per item page (above). Reading the node's files directly, an agent takes `/llms.txt` (3.2 KB, 782 tokens in `o200k_base`, §8), `/llms-full.txt` (13.1 KB), `/chunks.jsonl` (18.7 KB, a median of 270 tokens per item as served), `/search.json` (11.8 KB) or `/graph.jsonld` (20.7 KB). Over stdio the node costs the host nothing.

---

## Summary table (numbers only)

Every figure is from this document; nothing is rounded up. Rows from the 1.0.0 run; not in the record: `verify`, the item-page visit, the MCP calls and the hosting (§4, §11). The rc.6 figures of the security-floor row are the score of that published package (§3).

| quantity | value |
|---|---|
| specification version measured | measured on 2026-11-11 at 1.1.0 |
| rules declared / active / reserved | 385 / 374 / 11 |
| conformance vectors: total / required / optional / withdrawn | 397 / 372 / 2 / 23 |
| vector run | 374 pass, 0 fail, 23 skipped (the 23 withdrawn) |
| populated vector areas | 20 |
| active rules with ≥ 1 vector | 211 of 374 (56 %) |
| active rules named by no test, checker, vector or scenario | 4 of 374 (1 %) |
| error codes registered / used | 105 / 105 |
| error codes asserted by a conformance case | 94 of 105; the other 11 named with their reason in the registry |
| two clean builds compared | 61 output files, 0 differing |
| builds across time zone and locale compared | 61 output files, 0 differing |
| security floor: seeded faults stopped | 108 of 108, each under its rule's code (21 detected, 74 refused, 5 neutralised, 8 finished; none missed); the published rc.6 package, on its 104 cases: 85 stopped, 84 under the expected code (§3) |
| security floor: valid controls clean | 14 of 14 |
| security floor: hostile discovery inputs refused | 16 of 16 |
| page-tool / MCP parity, 3 Bundles | 536 calls: 530 equal as values, 6 the one difference AGSC-09-16 requires, 0 other differences; stdio = in-process 536 of 536 |
| unpublished items hidden from the page tools | 3 of 3 calls in the test suite |
| build, 500 items (median of 3) | 5.88 s, 304 MiB peak |
| build, 5,000 items (median of 3) | 49.93 s, 1,057 MiB peak |
| build, 10,000 items (median of 3) | 119.13 s, 1,692 MiB peak, 351.6 MB output in 30,173 files |
| build budget (AGSC-06-21) | ≤ 60 s per 500 items — met at every size measured |
| largest index shard at 10,000 items | 178 KB against a 1 MB budget |
| largest HTML page at 10,000 items | 96.6 KB against a 100 KB budget (a cluster page listing 500 members) |
| `verify`, 5,000 items | 54.7 s, 1,244 MiB peak |
| an item page, one visit (main site / demonstration node) | 6 requests, 111.5 KiB / 6 requests, 113.6 KiB |
| MCP `search`, `links`, `ask` on 5,000 items (median of 20) | 80.20 ms, 1.86 ms, 8.01 ms per call |
| hosting of both reference nodes on Cloudflare Pages | 0 USD / month (189 and 219 files against a 20,000-file Free-plan limit; static requests unlimited) |
| axe-core violations, 4 builds, 250 pages, both colour schemes, at 1200 × 900 | 0 |
| tokens per item, demonstration node, median (o200k_base) | 49 in llms.txt, 204 of chunk text, 1197.5 as served in chunks.jsonl |
| independent implementations passing the vectors | 1 engine; a second (the Python checker distribution) runs 7 of 20 areas: 114 pass and 0 fail, 34 vectors of those areas need a whole build, a writer it does not carry or the domain layer and are not run |
| retrieval smoke run (`bench-v2`), demonstration node, search surface | recall@10 0.917, nDCG@10 0.737, P@1 0.583 (12 intents) |
| npm package | 993 files, 3,418 KB packed, 11.06 MB unpacked; a runtime install holds 88 packages, the package included |

---

*Generated record: `docs/measurements.json` (`schema: agsc.measurements.v1`). Runner: `bench/measure.js`. Kit: `docs/BENCHMARKS.md`.*
