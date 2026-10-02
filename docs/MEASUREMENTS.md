# Measurements

**Who this is for:** anyone checking what has been measured, on what, and with which command. **Read after:** [BENCHMARKS.md](BENCHMARKS.md) (the method). *(Header added 2026-09-24.)*

**Status: every one of the nine layers was measured again on 2026-10-02, one after another, into one scratch directory, on the `main` tree of that day — the `1.0.0-rc.6` specification and engine plus the measurement fixes named in this document (§2, §3, §5, §6).** `docs/measurements.json` is that run, assembled; each section below gives the command that produced its numbers. Two parts were not run again and carry their own date: the cost layer of §11 (2026-09-25) and the `verify` memory figure of §4 (2026-09-25). The same suite on macOS and Windows runs in the CI matrix on every push, not on this machine.

Every number here is generated into `docs/measurements.json` beside this file, so a reader can compare the record with the prose. Re-running any single line reproduces one table. The record names nodes, never the paths they were built into.

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

**The vector run** (measured again 2026-10-02). `171 pass, 0 fail, 0 skip (0 withdrawn, 0 pending) of 171`. Of the 171 vectors, 170 are required and 1 is optional; none is withdrawn — this is the first public set, and a vector withdrawn later is excluded from every claim, as AGSC-00-13 requires. The 19 populated areas are `adopt boards boundary build bundle chunks cli compose conform discovery frontmatter graph import jcs ledger links lint prov slug`.

**Rule coverage.** The specification declares **343 rules** — 332 active, 11 reserved. Counted over the 332 active rules, a rule being reserved exactly when `tools/count-artifacts` says so:

| | rules | share of 332 |
|---|---|---|
| with at least one conformance vector | **130** | 39 % |
| with **no** vector | **202** | 61 % |
| named by at least one test file (a file that contains the id — a proxy; `tools/rule-coverage`, which counts test titles and `// verifies` markers, reports 302) | 319 | 96 % |
| named by at least one checker under `tools/` | 84 | 25 % |
| named by at least one acceptance scenario | 52 | 16 % |
| **named by nothing at all** | **10** | 3 % |

*(Corrected 2026-09-24: the earlier table counted 328 active rules, because the runner took any rule whose first words mentioned "reserved" for a reserved one; it now applies the counter's own test.)*

**Read the last four rows carefully.** "Named by a test" means the rule id appears in a test file. That is a statement of intent, not proof of a machine assertion. Only the first row — a vector that carries the rule id in its `rule` member and is executed by the runner — is verified in the strict sense. **Treat rows 3 to 6 as an upper bound on coverage and row 1 as the lower bound.** The authoritative classification is `tools/rule-coverage` (`docs/RULE-COVERAGE.md`), which on 2026-10-02 reports 313 rules verified, 14 prose-only with a stated reason, 0 unverified and 5 listed as gaps. The 10 rules that nothing names are listed in `docs/measurements.json` under `layers.conformance.rule_coverage.uncovered`, with a per-chapter breakdown beside it.

**Error codes.** 91 registered, 91 used.

**The independent checkers.** Six of the nine ran, each exiting 0 with a well-formed envelope and no finding: `validate-spec`, `validate-schemas`, `validate-ontology`, `validate-vectors`, `validate-features`, `validate-diagrams`. `validate-wellknown` ran in §3 against sixteen hostile discovery inputs; `gen-spec-html` and `gen-ns` are generators and have no pass/fail to report here.

---

## 2. Determinism — the same bytes twice, and across a time zone and a locale

```
node bench/measure.js --layer determinism --scratch <dir>
```

| comparison | files compared | files differing |
|---|---|---|
| two clean builds, same environment | **49** | **0** |
| `TZ=UTC LC_ALL=C` against `TZ=Asia/Tokyo LC_ALL=de_DE.UTF-8` | **49** | **0** |

The 49 files are the build output (`www/`). *(Corrected 2026-10-02: until that day the layer also compared the input files copied beside the output, which are identical by construction, and printed 56; it now compares the output only.)*

`agsc verify` exits 0. **What this does not establish:** the cross-implementation byte identity of AGSC-04-24, which needs a second engine — the Python package runs seven of the nineteen populated areas (`build`, `discovery`, `frontmatter`, `graph`, `jcs`, `links`, `slug`; 62 vectors, all passing, measured again 2026-10-02 — the other 3 of the 65 vectors in those areas need a whole build and are not run) and agrees with the engine on the vectors both run, but it does not build a whole node, so byte identity of the emitted files between two engines is not yet measured. **Not run here:** the same builds on macOS and Windows, which the CI matrix runs on every push.

---

## 3. The security floor, scored

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer security --scratch <dir>      # corpus: bench/corpus/security-floor.json
```

A seeded corpus of **104 cases**: **85 faults the rules name**, **13 valid controls** and **6 shapes reported but never scored**. Every case runs through the real code path — a scratch copy of the reference fixture linted or gated (`agsc lint`, `agsc ci`), a hostile foreign corpus handed to `agsc import --from okf`, a hostile discovery document handed to `tools/validate-wellknown`, hostile peer lists walked by the federation walk with an in-memory fetch (no socket is opened), redirect chains through the redirect guard, and forged skill packs and Harness file sets through the AGSC-07-15 checks. Every credential-shaped value in the corpus is fabricated and stored base64-encoded.

An outcome is one of five: **detected** (the rule's code, exit 0), **refused** (the rule's code, non-zero exit), **refused under another code** (stopped, non-zero exit, but with a different registered code from the one the rule names — handled, and still a diagnostic defect), **neutralised** (no finding, but the construct demonstrably reached no output: the scorer searches the output bytes) and **missed** (including any internal error, which is never a verdict).

**Score: 85 of 85 faults stopped, each under the code its rule names** (measured again 2026-10-02). 21 detected, 61 refused, 3 neutralised, none refused under another code and none missed. **Controls: 13 of 13 clean.** This is a statement about these 85 shapes and nothing more (AGSC-08-19).

**The published `1.0.0-rc.6` package scores 85 stopped, 84 under the expected code.** One case, the symlinked item, is refused there under `AGSC-E601` instead of `AGSC-E902`: `agsc ci` wrote a finding that has no line number into its gate file, the canonical writer refused the missing value, and `ci` reported that refusal in place of the real finding. The same defect made `ci` fail on a valid Bundle holding a folder `README.md`. It was fixed on 2026-10-02 (every finding now carries its position; `tests/distribution/ci-findings-without-position.test.js`) and the fix ships with the next release.

| class | faults | stopped | how | controls clean |
|---|---|---|---|---|
| agent-directed imperatives (title, description, body, upper case, vendor key, agent-authored, text attachment, configured pattern) | 8 | 8 | 7 detected, 1 refused (agent-authored ⇒ error) | — |
| hidden text (zero-width, tag characters, bidi override, HTML comment, both variation-selector ranges) | 6 | 6 | detected | — |
| encoded runs at the 256-character threshold (base64, hex, inside a fence) | 3 | 3 | detected | 2 of 2 |
| link schemes (`javascript:`, `data:`, `file:` autolink, `vbscript:`) | 4 | 4 | detected | — |
| secrets (access-key id, token, private-key block, assignment) | 4 | 4 | refused | 1 of 1 |
| personal data (e-mail, telephone) | 2 | 2 | refused | 1 of 1 |
| clean room (`bookRef`, reading-order phrase, excluded file) | 3 | 3 | 2 refused, 1 neutralised | — |
| path traversal (attachment `..`, absolute, backslash; body link and image escaping; symlinked item; symlinked attachment directory; `build.out` escaping) | 8 | 8 | refused | — |
| NUL / BOM / CR and encoding (BOM, CRLF, bare CR, NUL and U+2028 in a title, non-NFC, invalid UTF-8) | 7 | 7 | refused | — |
| oversized inputs (item over 1 MiB, configuration over 1 MiB, attachment over the cap, a combining run over the normalisation bound) | 4 | 4 | refused | — |
| archives (in `content/`, as an attachment) | 2 | 2 | 1 refused, 1 neutralised | — |
| hostile YAML (alias bomb, language tag, duplicate key) | 3 | 3 | refused | — |
| unsafe SVG on a pattern (script, embedded raster, DOCTYPE with an entity) | 3 | 3 | refused | — |
| a hostile skill (forged by a title, a script, `allowed-tools`, a shebang, a path escaping the Harness, an executable extension) | 6 | 6 | refused | 1 of 1 |
| a hostile discovery file (not JSON, over 1 MiB, 100,000-deep nesting, script anchor, unknown relation, extra members; peers at `file:`, link-local metadata, loopback, private range, IPv6 loopback, DNS resolving to a private address, an unresolved host, a 60-peer fan-out flood; a redirect to loopback, a four-hop chain) | 16 | 16 | refused; no refused peer ever reached the fetch | 1 of 1 |
| a hostile foreign corpus on import (an archive, a symlink out of the source, injection, a NUL in a title, a file over 1 MiB, an excluded file) | 6 | 6 | 1 detected, 4 refused, 1 neutralised | 1 of 1 |
| valid Bundle controls (clean item under `ci` and `lint`, `https` link, emoji sequence, the word "ignore", a clean SVG) | — | — | — | 6 of 6 |

**What changed since 2026-09-23.** The two misses of the first run are closed: a file that is not valid UTF-8 is now refused with `AGSC-E108` (AGSC-01-14), and an archive handed to `import` is refused with `AGSC-E903` (AGSC-01-16) instead of ending in an internal error. The two false positives are gone: the encoded-run check uses the 256-character threshold of AGSC-08-13. The five faults that were stopped under another code now carry the code their rule names.

**Reported, never scored (6).** Three shapes beyond what AGSC-08-13 enumerates — a full-width-letter imperative, a paraphrased imperative, an imperative split across two lines — are not detected, which is what AGSC-08-19 says to expect. The other three are now caught: a NUL byte in an item **body** is refused with `AGSC-E108` (AGSC-01-14 names every C0 control but TAB and LF), and **`agsc build` run on its own, without `lint`**, refuses an SVG attachment carrying a `<script>` element (`AGSC-E412`) and an attachment path with `..` segments (`AGSC-E902`), as AGSC-02-98 now requires of `build` itself.

---

## 4. Build cost, the cliffs at 500 items, and the HTML page budget

```
node bench/gen-bundle.js --items <n> --out <scratch>/n<n>
node bench/measure.js --layer perf --scratch <dir> --sizes 100,500,1000,5000,10000 --runs 3
```

**Measured again 2026-10-02** on the `1.0.0-rc.6` tree, same machine, same generator, three runs per size, median reported:

| items | build (median of 3) | runs | peak RSS (median) | files | output | largest index shard | shards | chunks, all shards |
|---|---|---|---|---|---|---|---|---|
| 100 | **1.72 s** | 1.71 / 1.72 / 1.72 | 122 MiB | 343 | 3.2 MB | 31.9 KB | 0 | 0.65 MB |
| 500 | **4.25 s** | 4.27 / 4.25 / 4.18 | 265 MiB | 1,548 | 15.1 MB | 176.0 KB | 2 | 3.25 MB |
| 1,000 | **7.13 s** | 7.45 / 7.00 / 7.13 | 322 MiB | 3,054 | 30.0 MB | 176.3 KB | 3 | 6.50 MB |
| 5,000 | **36.78 s** | 36.61 / 36.78 / 37.61 | 1,018 MiB | 15,102 | 149.5 MB | 177.9 KB | 11 | 32.66 MB |
| 10,000 | **90.02 s** | 91.76 / 89.85 / 90.02 | 1,744 MiB | 30,162 | 298.9 MB | 177.9 KB | 21 | 65.35 MB |

**Slower than on 2026-09-25 at the large sizes** (5,000 items: 36.78 s against 30.17 s; 10,000: 90.02 s against 58.52 s). A separate check the same day built the 5,000-item Bundle with the released `1.0.0-rc.6` code and with the tree of 2026-10-02: 33.9 / 34.6 s and 34.4 / 34.0 s, the same, so the difference does not come from that day's changes. Its cause is not established — the 2026-09-25 figures were taken on an earlier tree, and this machine's timings also vary between days. Both are reported; neither is a property of the format.

**The table of 2026-09-25**, kept as it was measured — twice on that day and the same machine: once on the tree as the day began ("before") and once after the two changes below ("after"). Generated Bundles, each item a pure function of its number, three runs per size, median reported. The Bundles are generated outside the repository; the generator refuses to write inside it. The output of the two trees is byte-identical (`diff -r` of the 5,000-item build: 0 lines).

| items | build before (median of 3) | build after (median of 3) | change | peak RSS before | peak RSS after | files | output | largest index shard | shards | chunks, all shards |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 1.79 s | **1.62 s** (1.65 / 1.62 / 1.59) | -10 % | 121 MiB | 143 MiB | 343 | 3.1 MB | 31.9 KB | 0 | 0.65 MB |
| 500 | 4.63 s | **4.18 s** (4.18 / 4.07 / 4.20) | -10 % | 264 MiB | 264 MiB | 1,548 | 15.0 MB | 176.0 KB | 2 | 3.25 MB |
| 1,000 | 8.23 s | **6.97 s** (6.99 / 6.79 / 6.97) | -15 % | 317 MiB | 311 MiB | 3,054 | 29.7 MB | 176.3 KB | 3 | 6.50 MB |
| 5,000 | 38.18 s | **30.17 s** (30.17 / 30.34 / 28.90) | -21 % | 955 MiB | 943 MiB | 15,102 | 148.2 MB | 177.9 KB | 11 | 32.66 MB |
| 10,000 | 79.10 s | **58.52 s** (61.69 / 58.52 / 57.55) | -26 % | 1,666 MiB | 1,678 MiB | 30,162 | 296.3 MB | 177.9 KB | 21 | 65.35 MB |

**What changed between the two columns, and why it is honest.** A CPU profile of the 5,000-item build (`node --cpu-prof`) put 34.5 % of the run in *writing* the output: the FileSystem adapter walked the real path of every file it wrote — three to four path lookups per file, 15,102 files — to keep a planted link from leading a write out of the Bundle root (AGSC-01-16, AGSC-01-35). The adapter now remembers the directories it has proved literal (every component real, none a link) and judges a new entry under one of them by a single `lstat`; a link found there still takes the full check, and `tests/adapters/node-fs.test.js` plants links under trusted directories to prove it. The second change is one line: the item page's typed-link targets were found by scanning every published item per link (5.7 % of the profile); they are one map lookup. Peak memory is unchanged within the run-to-run spread (the 100-item runs vary between 121 and 144 MiB on either tree).

**What the first run of the day found.** On the tree as the day began the build *failed* at 1,000 items and above: a cluster page listing 1,000 members in full measured 158,420 bytes, over the 100 KB page budget, and an item page is never paginated (AGSC-06-21). The engine now lists at most 500 members on a cluster page — the bound the rule uses for every index page — and says how many members there are and where the complete membership is (the search index carries `cluster` per document; the graph carries the membership). The "before" column is that tree with this one fix, because without it there is nothing to time above 500 items. Neither reference node has a cluster of more than 500 members, so their bytes did not change.

**Against the normative budgets of AGSC-06-21.** ≤ 60 s of build per 500 items: at 10,000 items that is a 1,200 s allowance and the build takes 90.02 s (2026-10-02). ≤ 1 MB per index document: the largest shard is 178 KB at every size above 500. Both are met with wide margins.

**≤ 100 KB per HTML page — measured over `*.html` only.**

| items | HTML pages | largest page | which | median page | over 100 KB |
|---|---|---|---|---|---|
| 100 | 115 | 17.8 KB | `search/index.html` | 6.1 KB | 0 |
| 500 | 516 | 80.3 KB | `clusters/bench-cluster/index.html` | 6.1 KB | 0 |
| 1,000 | 1,020 | 80.6 KB | `clusters/bench-cluster/index.html` | 6.1 KB | 0 |
| 5,000 | 5,052 | 81.6 KB | `clusters/bench-cluster/index.html` | 6.2 KB | 0 |
| 10,000 | 10,092 | 81.6 KB | `clusters/bench-cluster/index.html` | 6.2 KB | 0 |

No HTML page exceeds the budget at any size; the run of 2026-10-02 gives the same largest and median pages to within 0.1 KB. The largest page is now the cluster page that lists 500 members, at 81.6 KB — an 18 % margin; the paginated index pages sit just under it. The published sites were swept the same way (§7): the largest page of the main site is under the budget after its longest specification chapter was published in two parts.

**Supported scale, stated from these numbers and nothing else.** The reference engine is measured to **10,000 published items** on one machine: 90.02 s of build, 1,744 MiB peak, 298.9 MB of output in 30,162 files (2026-10-02), every budget of AGSC-06-21 met. From 1,000 to 10,000 items the build grows 12.6× in time and 5.4× in peak memory for a 10× corpus: memory grows less than the corpus, time somewhat more (on 2026-09-25: 8.4× in time). Above 10,000 items nothing is measured and nothing is claimed. Where such a node can be hosted is §11.

`agsc verify` (two builds in one process, digests kept, AGSC-04-02) on the 5,000-item Bundle, measured 2026-09-25 and not repeated: 40.7 s wall, **1,224 MiB** peak — about 280 MiB above one build, the first build's garbage not yet reclaimed while the second runs; on the 500-item Bundle 3.1 s and 296 MiB.

---

## 5. Page-tool / MCP parity, call by call

```
node bench/measure.js --layer parity --scratch <dir> --nodes fixture=<bundle>,patterns=<bundle>,main=<bundle>
```

The call list (`bench/corpus/parity-calls.json`) has 25 fixed calls — every tool of AGSC-09-13, every domain-error path (unknown tool, missing argument, unknown slug, a foreign `memory://` IRI, a 1 MiB + 1 argument), the two local-only writers — and four per-item templates (`read`, `links`, `propose`, `compose`) run once for every published item. Each call is asked of **the real `agsc mcp` process over stdio**, of **the emitted page script** run in a fresh `vm` context over the build's own bytes, of the page-tools module, and of the in-process server, and the answers are compared **as values** after a JSON round trip — the comparison AGSC-09-16 makes, never byte-identity across the browser boundary.

Measured again 2026-10-02 on three Bundles anyone can rebuild: the reference fixture, the demonstration node's public repository (`agsc-demo-node`) and the main node as its site build hands it to the engine.

| Bundle | items / published | calls | page = server (published projection) | the one difference the rule requires | other differences | stdio = in-process server |
|---|---|---|---|---|---|---|
| reference fixture | 3 / 3 | 37 | **35** | 2 | **0** | 37 / 37 |
| demonstration node | 42 / 42 | 193 | **191** | 2 | **0** | 193 / 193 |
| main node | 17 / 17 | 93 | **91** | 2 | **0** | 93 / 93 |
| **total** | | **323** | **317** | **6** | **0** | **323 / 323** |

**The one difference the rule requires.** AGSC-09-16: "The one input on which the two transports MUST differ is a `remember` call that declares no operator: the local server refuses it with `AGSC-E003` and a page tool, which has no identity to declare, returns the item with `prov.operator` absent and `AGSC-E506`." The call list holds two such calls, and on every Bundle both answers have exactly that shape; the runner checks the shape and counts these calls apart (`required_difference` in the record). *(Corrected 2026-10-02: the table of 2026-09-23 reported 37 of 37 equal on the fixture. On the `1.0.0-rc.6` tree these two calls differ as the rule requires, and the runner, not yet taught that difference, counted them as unequal (35 of 37); it now checks their shape.)*

**Unpublished items.** None of these three Bundles holds an unpublished item, so the page's `AGSC-E301` answer for one is exercised by `tests/bench/kit.test.js` (a draft item: 3 of 3 calls answered `AGSC-E301`). On 2026-09-23 the same check ran on the pattern node's working copy, which holds drafts: 474 of 474 calls.

On 2026-09-23, on a Bundle that holds drafts, the stdio server sees every item and a page sees only the published projection; AGSC-09-16 makes that projection the comparison, and requires the page to answer `AGSC-E301` for every unpublished item, which it does for `read`, `links` and `propose` on all 158 of the pattern node's unpublished items.

---

## 6. Retrieval across the published surfaces

```
node bench/measure.js --layer retrieval --scratch <dir> --nodes patterns=<build>,main=<build>     # query set: bench/queries/bench-v2
```

**Observed under this configuration**, not proved: the committed set `bench-v2` of 20 hand-written intents (12 for the demonstration node, 8 for the main node), one gold item each, k = 10, against three model-free surfaces of each node's build by the current engine. No model, no key, no network. Measured 2026-10-02. *(`bench-v2` replaces `bench-v1`, whose twelve intents for the pattern node named items that node no longer publishes; the two sets are not comparable and no `bench-v1` figure is repeated here.)*

| node | surface | recall@10 | precision@10 | nDCG@10 | P@1 | MRR | queries | documents |
|---|---|---|---|---|---|---|---|---|
| demonstration | chunks.jsonl | 0.667 | 0.067 | 0.547 | 0.417 | 0.533 | 12 | 128 |
| demonstration | search.json | **0.917** | 0.092 | 0.737 | 0.583 | 0.688 | 12 | 42 |
| demonstration | llms.txt | **0.917** | 0.092 | 0.736 | 0.583 | 0.679 | 12 | 22 |
| main | chunks.jsonl | **1.00** | 0.100 | 0.696 | 0.375 | 0.599 | 8 | 21 |
| main | search.json | 0.875 | 0.088 | 0.694 | 0.500 | 0.645 | 8 | 17 |
| main | llms.txt | 0.875 | 0.088 | 0.665 | 0.500 | 0.598 | 8 | 14 |

Twenty intents over 59 published items is a smoke test of the surfaces, not a study: no split, no paraphrases, no second annotator, no intervals, and the intents and items share an author. The study is specified in `docs/BENCHMARKS.md` and is the `bench` verb's job at v1.0.1. The `ask` tool is not scored separately: its ranking is the `search` ranking truncated at three.

---

## 7. Accessibility per page type

```
NODE_PATH=<scratch>/node_modules CHROME_EXE=<chromium> node bench/measure.js --layer a11y --scratch <dir> --nodes <name>=<build>,…
```

axe-core 4.13.0 in headless Chromium through playwright-core 1.62.1 (both installed outside the repository), the WCAG 2.0/2.1/2.2 A and AA tags plus best practices — the tag set of the site repository's own browser lane — over every page, in the light and in the dark colour scheme. Every request to another origin is blocked and counted.

Measured again 2026-10-02:

| build | pages | checks (× 2 schemes) | page types | axe violations | third-party requests | largest HTML page |
|---|---|---|---|---|---|---|
| reference fixture (engine) | 16 | 32 | 14 | **0** | 0 | 3.3 KB |
| demonstration node (engine) | 88 | 176 | 16 | **0** | 0 | 16.3 KB |
| main node (engine page shell) | 35 | 70 | 18 | **0** | 0 | 10.0 KB |
| main site as built on 2026-10-02 (its own generator) | 69 | 138 | 26 | **0** | 0 | 91.8 KB |

Page types are the templates a route is rendered from: home, each section's index, each section's item or term page, paginated indexes. The per-type counts are in `docs/measurements.json` under `layers.a11y.nodes.<build>.by_type`; every type has zero violations. **axe-core finds on average 57 % of WCAG issues automatically: zero is a floor, not a conformance claim.** This lane loads every page at one size, 1200 × 900. A review of both live sites in a browser on 2026-10-02 at 390 px found what this lane cannot see: on a phone each diagram scrolls sideways in a box that keyboard users cannot always reach, some diagram labels are under 12 px, and the outline of the search field and the theme switch is fainter than WCAG 2.2 asks of a form control (1.4.11). These are on the list for the next release. The Lighthouse performance category is not measured and is never a gate.

---

## 8. Tokens per item

```
NODE_PATH=<scratch>/node_modules node bench/measure.js --layer tokens --scratch <dir> --nodes <name>=<build>,… --exports <name>=<llm-context dir>,…
```

`gpt-tokenizer` 2.9.0 (MIT, offline, the published BPE tables), two vocabularies: `o200k_base` and `cl100k_base`. **No Claude count**: there is no offline Claude tokenizer, so such a number would be a guess. Median tokens **per item**, `o200k_base` (`cl100k_base` in brackets):

| node | llms.txt index line | chunk text only | chunk records as served (JSON lines) | llm-context skim sections | llm-context TOON index rows |
|---|---|---|---|---|---|
| reference fixture (3 items) | 32 (33.5) | 102 (103) | 945 (958) | 349 (350) | 165 (174) |
| demonstration node (42 items) | 49 (49) | 204 (204) | 981.5 (993) | 439 (444) | 166 (166.5) |
| main node (17 items) | 40 (40) | 93 (94) | 263 (266) | 140 (139) | 31 (30) |

Measured again 2026-10-02. Whole files, `o200k_base`: `llms.txt` 223 / 1,335 / 783 tokens; `llms-ctx.txt` 1,012 / 12,273 / 3,361; `chunks-index.toon` 403 / 5,086 / 764 (fixture / demonstration node / main). The two vocabularies differ by at most 5.2 % on any median above. The distance between the chunk text and the chunk record as served is the provenance an agent receives with every chunk — digest, IRI, licence, terms, trust and links; the skim view drops it on purpose and says so in its own header.

---

## 9. Package size

```
npm pack --dry-run --json
npm ls --omit=dev --parseable --all | xargs du -sk      # what a consumer's install holds
```

| | 2026-09-24 | 2026-09-25 | **2026-10-02** |
|---|---|---|---|
| files in the tarball | 455 | 581 | **554** |
| unpacked | 3.41 MB | 3.65 MB | **3.31 MB** |
| packed | 1,026 KB | 1,123 KB | **1,011 KB** |

The published `1.0.0-rc.6` tarball holds the same 554 files.

The growth of 2026-09-25 is the day's additions — the runnable demos (`examples/demos/`, 82 files), conformance areas, documents. By folder, the largest shipped parts are `src/distribution` (426 KB, 30 files), `tests/vectors` (409 KB, 200 files, read by `conform`), `src/interchange` (362 KB), `CHANGELOG.md` (235 KB, one file) and `tests/conformance` (228 KB, 25 files). What no verb reads and still ships — `examples/` (95 files, 67 KB), `docs/diagrams/` (22 files, 52 KB, read by the `validate-diagrams` checker over the engine's own tree), the changelog — was shipped on purpose by earlier decisions and is left as it is.

**What an install actually costs** (`npm install --omit=dev`): **135 packages**. The largest by far are the MCP server's: `zod` 8.4 MB, `@modelcontextprotocol/sdk` 6.3 MB, `hono` 3.7 MB, `undici` 1.7 MB — then `ajv` 2.5 MB, `jsonld` 2.1 MB, `markdown-it` 2.0 MB, `fast-xml-parser` 1.4 MB, `yaml` 1.4 MB, `diff` 1.0 MB, `n3` 0.9 MB. The package's own 3.6 MB is a small part of the install, and the lever on the install is the MCP SDK's dependency tree, not this manifest.

**Cold start** (`/usr/bin/time`, five runs, the reference fixture): `agsc --version` 0.18–0.19 s and 65 MB with 117 modules loaded (`node -e ""` alone: 0.05 s, 44 MB); `agsc lint` 0.77–0.81 s and 97 MB with 284 modules. Every verb is required only when it runs; `jsonld` (192 ms to load) and the MCP SDK (291 ms) are loaded only by the verbs that emit RDF or serve MCP, never by `--version`, `lint`, `build` or `verify`. Left as it is.

---

## 10. Not run, and why

| layer | why it has no number |
|---|---|
| Three-OS matrix | the same suite and builds on macOS and Windows at Node 22.13 and 24 cannot be run from one machine; the CI matrix runs them on every push |
| COGX import | the engine ships a COGX adapter, but the security corpus does not yet feed it hostile archives; the OKF adapter is the import lane scored in §3 |

---

## 11. Cost — what a visit, an agent session and a month of hosting cost

```
# page weight: a real headless Chromium (chrome-headless-shell 1228 through playwright-core 1.62.1, both outside the repository) over a loopback server of the built node; every request counted, every other origin blocked
# MCP: one `agsc mcp` process over stdio, 20 calls per tool, median of the wall time per call and the bytes of each answer
```

**Requests and bytes per visit** (measured 2026-09-25; "plain" is a browser without `document.modelContext`, "WebMCP" one that exposes it):

| page | before: requests / bytes | **after: requests / bytes** | WebMCP browser, after |
|---|---|---|---|
| main site, an item page (`/concepts/concept/`) | 27 / 140.0 KB | **6 / 106.9 KB** | 27 / 141.0 KB |
| pattern node, an item page (`/concepts/autonomy-ladder/`) | 54 / 263.0 KB | **6 / 109.9 KB** | 54 / 264.0 KB |
| 5,000-item Bundle, an item page | one request per published item: 5,014 | **6 / 108.0 KB** | the same 5,014-request read |
| main site, front page | 3 / 28.8 KB | 3 / 28.8 KB | — |
| pattern node, front page | 3 / 13.6 KB | 3 / 13.6 KB | — |

**What changed.** The page tools of an item page (AGSC-09-16) read their corpus — the discovery document, the index and one Markdown view per published item, plus the boards — at page load, whether or not anyone would call a tool. A person reading one page paid for the whole node: 47 item views on the pattern node, 5,000 on a node of that size. The read now starts at once only where a caller is expected — a browser that exposes `document.modelContext`, and the `/compose/` page — and elsewhere on the first tool call; every call before the corpus is in returns a promise of the envelope, as it always did. No answer changed: the same routes, the same bytes, the same toolset (`tests/distribution/page-tools-lazy.test.js` compares the two paths call by call). The two sites' outputs differ in exactly two files, `/compose/agsc-page-tools.js` and `/compose/agsc-compose.js`.

**The search page.** Main site: 4 requests, 32.0 KB, first result painted 245 ms after typing; the page's own script is 3.6 KB. Pattern node: 5 requests, 80.9 KB, 225 ms, script 9.1 KB. The 5,000-item Bundle: 13 requests (the manifest, 11 shards, the script), 1.52 MB, 355 ms, script 8.6 KB. The index is what a search costs, as AGSC-06-21 shards it; nothing was changed here.

**The MCP server, per call** (the 5,000-item Bundle; the reference fixture in brackets):

| tool | answer bytes | before, ms per call | **after, ms per call** |
|---|---|---|---|
| `search` | 1,253,731 (1,057) | 1,527.2 (1.8) | **68.9** (0.9) |
| `read` | 7,888 (2,231) | 0.65 (0.7) | 0.69 (0.7) |
| `links` | 1,149 (741) | 1,690.9 (1.8) | **1.5** (0.7) |
| `compose` | 561 (551) | 6.1 (0.7) | 5.9 (0.7) |
| `ask` | 1,361 (1,073) | 1,447.4 (1.1) | **9.0** (0.6) |
| `propose` | 7,868 (2,201) | 0.81 (1.1) | 0.76 (1.0) |

`search` and `ask` tokenized every item on every call and `links` resolved every edge of the node on every call; a served Bundle is loaded once and never changes, so both derivations are now computed on first use and kept. What remains of the `search` call is the answer itself: on that Bundle the query matched every item and the answer is 1.25 MB, because no rule bounds a tool's answer (recorded as a specification item). Starting the server costs one in-memory build — 1.2 s on the reference fixture, 20.7 s and 967 MB on the 5,000-item Bundle — because the resource catalogue serves the built routes; not changed.

**Hosting, by the host's published limits.** Cloudflare Pages is the reference profile. Its limits page (`https://developers.cloudflare.com/pages/platform/limits/`, read 2026-09-25, "Last updated Sep 5, 2026") says: "Cloudflare Pages sites can contain up to 20,000 files on the Free plan." and "Paid plans (such as Pro, Business, and Enterprise plans) can have up to 100,000 files per site."; "The maximum file size for a single Cloudflare Pages site asset is 25 MiB."; "A `_headers` file can have a maximum of 100 header rules."; "A `_redirects` file can have a maximum of 2,000 static redirects and 100 dynamic redirects, for a combined total of 2,100 redirects." Its Functions pricing page (`https://developers.cloudflare.com/pages/functions/pricing/`, read 2026-09-25) says: "On both free and paid plans, requests to static assets are free and unlimited."

| node | files | bytes | Free plan | cost |
|---|---|---|---|---|
| main site (`www`, 2026-10-02) | 149 | 2.42 MB | fits | **0 USD / month** |
| demonstration node (`www`, 2026-10-02) | 220 | 1.25 MB | fits | **0 USD / month** |
| 5,000-item Bundle | 15,102 (42 header rules, 3 redirects) | 148 MB | fits | 0 USD / month |
| 10,000-item Bundle | 30,162 | 296 MB | **over the 20,000-file limit** | a paid Pages plan (100,000 files; its price was not read in this run), or another hosting profile of `agsc-host` |

A published node costs three files per item (the page, the Markdown view, the JSON-LD view) plus its index pages, so the Free plan holds a node of about **6,600 items**; a static node serves no function and no request is metered, so bandwidth is not a cost at any size. Both reference nodes are hosted for 0 USD a month (the file counts and sizes of the two sites were checked again on 2026-10-02; the rest of this section was measured on 2026-09-25), within the ≤ 10 USD a month the project sets itself for hosting.

**An agent session.** Over WebMCP on the main site, the corpus read is 141 KB once per page (above). Reading the node's files directly, an agent takes `/llms.txt` (3.2 KB, 703 tokens in `o200k_base`, §8), `/llms-full.txt` (12.8 KB), `/chunks.jsonl` (18.4 KB, a median of 263 tokens per item as served), `/search.json` (11.6 KB) or `/graph.jsonld` (20.1 KB); the token counts of §8 are unchanged by this day's work (the tokenizer is installed outside the repository and was not available offline for a second run). Over stdio the node costs the host nothing.

---

## Summary table (numbers only)

Every figure is from this document; nothing is rounded up.

| quantity | value |
|---|---|
| specification version measured | 1.0.0-rc.6 (measured 2026-10-02 unless a row says otherwise) |
| rules declared / active / reserved | 343 / 332 / 11 |
| conformance vectors: total / required / optional / withdrawn | 171 / 170 / 1 / 0 |
| vector run | 171 pass, 0 fail, 0 skipped |
| populated vector areas | 19 |
| active rules with ≥ 1 vector | 130 of 332 (39 %) |
| active rules named by no test, checker, vector or scenario | 10 of 332 (3 %) |
| error codes registered / used | 91 / 91 |
| two clean builds compared | 49 output files, 0 differing |
| builds across time zone and locale compared | 49 output files, 0 differing |
| security floor: seeded faults stopped | 85 of 85, each under its rule's code (21 detected, 61 refused, 3 neutralised; none missed); the published rc.6 package: 85 stopped, 84 under the expected code (§3) |
| security floor: valid controls clean | 13 of 13 |
| security floor: hostile discovery inputs refused | 16 of 16 |
| page-tool / MCP parity, 3 Bundles | 323 calls: 317 equal as values, 6 the one difference AGSC-09-16 requires, 0 other differences; stdio = in-process 323 of 323 |
| unpublished items hidden from the page tools | 3 of 3 calls in the test suite; 474 of 474 on 2026-09-23 on the pattern node's working copy |
| build, 500 items (median of 3) | 4.25 s, 265 MiB peak (2026-09-25: 4.18 s) |
| build, 5,000 items (median of 3) | 36.78 s, 1,018 MiB peak (2026-09-25: 30.17 s) |
| build, 10,000 items (median of 3) | 90.02 s, 1,744 MiB peak, 298.9 MB output in 30,162 files (2026-09-25: 58.52 s) |
| build budget (AGSC-06-21) | ≤ 60 s per 500 items — met at every size measured |
| largest index shard at 10,000 items | 178 KB against a 1 MB budget |
| largest HTML page at 10,000 items | 81.6 KB against a 100 KB budget (a cluster page listing 500 members) |
| `verify`, 5,000 items (2026-09-25) | 40.7 s, 1,224 MiB peak |
| an item page, one visit (main site / pattern node), 2026-09-25 | 6 requests, 106.9 KB / 6 requests, 109.9 KB (was 27 / 140.0 KB and 54 / 263.0 KB) |
| MCP `search`, `links`, `ask` on 5,000 items (median of 20), 2026-09-25 | 68.9 ms, 1.5 ms, 9.0 ms per call (were 1,527 ms, 1,691 ms, 1,447 ms) |
| hosting of both reference nodes on Cloudflare Pages | 0 USD / month (149 and 220 files against a 20,000-file Free-plan limit; static requests unlimited) |
| axe-core violations, 4 builds, 208 pages, both colour schemes, at 1200 × 900 | 0 |
| tokens per item, demonstration node, median (o200k_base) | 49 in llms.txt, 204 of chunk text, 981.5 as served in chunks.jsonl |
| independent implementations passing the vectors | 1 engine; a second (the Python checker distribution) runs 7 of 19 areas: 62 pass and 0 fail, 3 vectors of those areas need a whole build and are not run |
| retrieval smoke run (`bench-v2`), demonstration node, search surface | recall@10 0.917, nDCG@10 0.737, P@1 0.583 (12 intents) |
| npm package | 554 files, 1,011 KB packed, 3.31 MB unpacked; a runtime install holds 135 packages (2026-09-25) |

---

*Generated record: `docs/measurements.json` (`schema: agsc.measurements.v1`). Runner: `bench/measure.js`. Kit: `docs/BENCHMARKS.md`.*
