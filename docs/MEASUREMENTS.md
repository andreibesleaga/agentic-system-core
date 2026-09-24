# Measurements

**Who this is for:** anyone checking what has been measured, on what, and with which command. **Read after:** [BENCHMARKS.md](BENCHMARKS.md) (the method). *(Header added 2026-09-24.)*

**Status: COMPLETE for every layer one machine can run, measured 2026-09-23 against `1.0.0-rc.6` (drafted, untagged); the conformance, security and package layers were measured again on 2026-09-24, after the last specification pass of the draft.** Nine layers have been run and are reported below with the command that produced each number. Two things remain open, and each says so where it belongs: the same suite and builds on macOS and Windows (a CI matrix, which one machine cannot run), and the authoritative rule-coverage matrix that replaces the proxy rows of §1 (`tools/rule-coverage`, another package's deliverable).

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

The working tree was shared with other packages' in-flight edits on the day; every layer was measured against the tree as it stood when that layer ran, and the conformance figures are the counter's own output at that moment.

---

## 1. Conformance — the vectors, and how much of the specification they reach

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer conformance --scratch <dir>
node tools/count-artifacts --json
```

**The vector run.** `164 pass, 0 fail, 30 skip (30 withdrawn, 0 pending) of 194`. Of the 194 vectors, 163 are required, 1 is optional and 30 are withdrawn; withdrawn vectors are excluded from the claim, as AGSC-00-13 requires. The 19 populated areas are `adopt boards boundary build bundle chunks cli compose conform discovery frontmatter graph import jcs ledger links lint prov slug`.

**Rule coverage.** The specification declares **343 rules** — 332 active, 11 reserved. Counted over the 332 active rules, a rule being retired exactly when `tools/count-artifacts` says so:

| | rules | share of 332 |
|---|---|---|
| with at least one conformance vector | **129** | 39 % |
| with **no** vector | **203** | 61 % |
| named by at least one test file (a file that contains the id — a proxy; `tools/rule-coverage`, which counts test titles and `// verifies` markers, reports 301) | 319 | 96 % |
| named by at least one checker under `tools/` | 80 | 24 % |
| named by at least one acceptance scenario | 14 | 4 % |
| **named by nothing at all** | **10** | 3 % |

*(Corrected 2026-09-24: the earlier table counted 328 active rules, because the runner took any rule whose first words mentioned "reserved" for a reserved one; it now applies the counter's own test.)*

**Read the last four rows carefully.** "Named by a test" means the rule id appears in a test file. That is a statement of intent, not proof of a machine assertion. Only the first row — a vector that carries the rule id in its `rule` member and is executed by the runner — is verified in the strict sense. **Treat rows 3 to 6 as an upper bound on coverage and row 1 as the lower bound** until `tools/rule-coverage` classifies each rule as verified, prose-only-with-a-reason, or unverified. The 55 rules that nothing names are listed in `docs/measurements.json` under `layers.conformance.rule_coverage.uncovered`, with a per-chapter breakdown beside it.

**Error codes.** 90 registered, 90 used.

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

`agsc verify` exits 0. **What this does not establish:** the cross-implementation byte identity of AGSC-04-24, which needs a second engine — the Python package implements two of the nineteen populated areas (`jcs`, `slug`) and none of the seventeen that carry emitted bytes. **Not run:** the same builds on macOS and Windows (CI matrix).

---

## 3. The security floor, scored

```
SOURCE_DATE_EPOCH=1767225600 node bench/measure.js --layer security --scratch <dir>      # corpus: bench/corpus/security-floor.json
```

A seeded corpus of **104 cases**: **85 faults the rules name**, **13 valid controls** and **6 shapes reported but never scored**. Every case runs through the real code path — a scratch copy of the reference fixture linted or gated (`agsc lint`, `agsc ci`), a hostile foreign corpus handed to `agsc import --from okf`, a hostile discovery document handed to `tools/validate-wellknown`, hostile peer lists walked by the federation walk with an in-memory fetch (no socket is opened), redirect chains through the redirect guard, and forged skill packs and Harness file sets through the AGSC-07-15 checks. Every credential-shaped value in the corpus is fabricated and stored base64-encoded.

An outcome is one of five: **detected** (the rule's code, exit 0), **refused** (the rule's code, non-zero exit), **refused under another code** (stopped, non-zero exit, but with a different registered code from the one the rule names — handled, and still a diagnostic defect), **neutralised** (no finding, but the construct demonstrably reached no output: the scorer searches the output bytes) and **missed** (including any internal error, which is never a verdict).

**Score: 85 of 85 faults stopped** (measured 2026-09-24). 21 detected, 61 refused, 3 neutralised, none refused under another code and none missed. **Controls: 13 of 13 clean.** This is a statement about these 85 shapes and nothing more (AGSC-08-19).

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

**What changed since 2026-09-23.** The two misses of the first run are closed: a file that is not valid UTF-8 is now refused with `AGSC-E108` (AGSC-01-14), and an archive handed to `import` is refused with `AGSC-E903` (AGSC-01-16) instead of ending in an internal error. The two false positives are gone: the encoded-run check uses the 256-character threshold AGSC-08-13 fixed at rc.5. The five faults that were stopped under another code now carry the code their rule names.

**Reported, never scored (6).** Three shapes beyond what AGSC-08-13 enumerates — a full-width-letter imperative, a paraphrased imperative, an imperative split across two lines — are not detected, which is what AGSC-08-19 says to expect. The other three are now caught: a NUL byte in an item **body** is refused with `AGSC-E108` (AGSC-01-14 as amended at rc.6 names every C0 control but TAB and LF), and **`agsc build` run on its own, without `lint`**, refuses an SVG attachment carrying a `<script>` element (`AGSC-E412`) and an attachment path with `..` segments (`AGSC-E902`), as AGSC-02-98 now requires of `build` itself.

---

## 4. Build cost, the cliffs at 500 items, and the HTML page budget

```
node bench/gen-bundle.js --items <n> --out <scratch>/n<n>
node bench/measure.js --layer perf --scratch <dir> --sizes 100,500,501,1000,5000,10000 --runs 3
```

Generated Bundles, each item a pure function of its number, **three runs per size including 10,000**, median reported. The Bundles are generated outside the repository; the generator refuses to write inside it.

| items | build (median of 3) | runs | peak RSS | files | output | largest index shard | index shards | chunks, all shards |
|---|---|---|---|---|---|---|---|---|
| 100 | 1.80 s | 1.80 / 1.82 / 1.71 | 120 MiB | 336 | 3.0 MB | 31.9 KB | 0 | 0.65 MB |
| 500 | 5.04 s | 5.12 / 4.95 / 5.04 | 273 MiB | 1,542 | 14.4 MB | 176.0 KB | 2 | 3.25 MB |
| 501 | 5.03 s | 5.28 / 4.91 / 5.03 | 276 MiB | 1,548 | 14.5 MB | 176.0 KB | 2 | 3.26 MB |
| 1,000 | 8.66 s | 8.83 / 8.66 / 8.29 | 372 MiB | 3,049 | 28.8 MB | 176.3 KB | 3 | 6.50 MB |
| 5,000 | 37.06 s | 37.94 / 37.06 / 36.10 | 934 MiB | 15,105 | 143.9 MB | 177.9 KB | 11 | 32.7 MB |
| 10,000 | 75.00 s | 72.41 / 75.00 / 87.18 | 1,673 MiB | 30,175 | 287.7 MB | 177.9 KB | 21 | 65.3 MB |

**Against the normative budgets of AGSC-06-21.** ≤ 60 s of build per 500 items: at 10,000 items that is a 1,200 s allowance and the build takes 75 s. ≤ 1 MB per index document: the largest shard is 178 KB at every size above 500. Both are met with wide margins.

**≤ 100 KB per HTML page — now measured over `*.html` only.**

| items | HTML pages | largest page | which | median page | over 100 KB |
|---|---|---|---|---|---|
| 100 | 111 | 16.8 KB | `index.html` | 5.1 KB | 0 |
| 500 | 513 | 79.2 KB | `index.html` | 5.2 KB | 0 |
| 501 | 517 | 79.2 KB | `index.html` | 5.2 KB | 0 |
| 1,000 | 1,018 | 79.3 KB | a paginated index page | 5.2 KB | 0 |
| 5,000 | 5,058 | 80.3 KB | a paginated index page | 5.2 KB | 0 |
| 10,000 | 10,108 | 80.4 KB | a paginated index page | 5.2 KB | 0 |

No HTML page exceeds the budget at any size. The largest page is the index that lists items, and pagination caps it near 80 KB — a 20 % margin. The published sites were swept the same way (§7): the largest page of the main site is **95.7 KB**, a 4 % margin, on a specification chapter page that the site's own generator writes.

**What this run found.** The sharding branch fires **at** 500 items, not above it, and the build produces a conforming node at 500, 501, 1,000, 5,000 and 10,000 items. From 1,000 to 10,000 items the build grows 8.7× in time and 4.5× in peak memory for a 10× corpus; nothing measured is super-linear. The third 10,000-item run (87 s) is the slowest of all eighteen and is kept as measured; the median is not affected. An earlier audit's single run (57.9 s, 1,225 MiB) was on an earlier engine and is superseded by this row.

---

## 5. Page-tool / MCP parity, call by call

```
node bench/measure.js --layer parity --scratch <dir> --nodes minimal=<bundle>,patterns=<bundle>,main=<bundle>
```

The call list (`bench/corpus/parity-calls.json`) has 25 fixed calls — every tool of AGSC-09-13, every domain-error path (unknown tool, missing argument, unknown slug, a foreign `memory://` IRI, a 1 MiB + 1 argument), the two local-only writers — and four per-item templates (`read`, `links`, `propose`, `compose`) run once for every published item. Each call is asked of **the real `agsc mcp` process over stdio**, of **the emitted page script** run in a fresh `vm` context over the build's own bytes, of the page-tools module, and of the in-process server, and the answers are compared **as values** after a JSON round trip — the comparison AGSC-09-16 makes at rc.6, never byte-identity across the browser boundary.

| Bundle | items / published | calls | page = server (published projection) | stdio = in-process server | unpublished items hidden from the page (`AGSC-E301`) |
|---|---|---|---|---|---|
| reference fixture | 3 / 3 | 37 | **37 / 37** | 37 / 37 | — |
| pattern node | 173 / 15 | 85 | **85 / 85** | 85 / 85 | **474 / 474** |
| main node | 15 / 15 | 85 | **85 / 85** | 85 / 85 | — |
| **total** | | **207** | **207 / 207** | **207 / 207** | **474 / 474** |

On a Bundle that holds drafts, the stdio server sees every item and a page sees only the published projection; AGSC-09-16 (rc.6) makes that projection the comparison, and requires the page to answer `AGSC-E301` for every unpublished item, which it does for `read`, `links` and `propose` on all 158 of the pattern node's unpublished items.

---

## 6. Retrieval across the published surfaces

```
node bench/measure.js --layer retrieval --scratch <dir> --nodes patterns=<build>,main=<build>
```

**Observed under this configuration**, not proved: the committed set of 20 hand-written intents (12 for the pattern node, 8 for the main node), one gold item each, k = 10, against three model-free surfaces of each node's build by the current engine. No model, no key, no network.

| node | surface | recall@10 | precision@10 | nDCG@10 | P@1 | MRR | queries | documents |
|---|---|---|---|---|---|---|---|---|
| patterns | chunks.jsonl | **1.00** | 0.100 | 0.891 | 0.750 | 0.854 | 12 | 54 |
| patterns | search.json | **1.00** | 0.100 | 0.846 | 0.667 | 0.794 | 12 | 15 |
| patterns | llms.txt | 0.833 | 0.083 | 0.730 | 0.583 | 0.694 | 12 | 10 |
| main | chunks.jsonl | **1.00** | 0.100 | 0.705 | 0.375 | 0.609 | 8 | 17 |
| main | search.json | 0.875 | 0.088 | 0.694 | 0.500 | 0.646 | 8 | 15 |
| main | llms.txt | 0.875 | 0.088 | 0.665 | 0.500 | 0.598 | 8 | 13 |

Twenty intents over thirty published items is a smoke test of the surfaces, not a study: no split, no paraphrases, no second annotator, no intervals, and the intents and items share an author. The study is specified in `docs/BENCHMARKS.md` and is the `bench` verb's job at v1.0.1. The `ask` tool is not scored separately: its ranking is the `search` ranking truncated at three.

---

## 7. Accessibility per page type

```
NODE_PATH=<scratch>/node_modules CHROME_EXE=<chromium> node bench/measure.js --layer a11y --scratch <dir> --nodes <name>=<build>,…
```

axe-core 4.13.0 in headless Chromium through playwright-core 1.62.1 (both installed outside the repository), the WCAG 2.0/2.1/2.2 A and AA tags plus best practices — the tag set of the site repository's own browser lane — over every page, in the light and in the dark colour scheme. Every request to another origin is blocked and counted.

| build | pages | checks (× 2 schemes) | page types | axe violations | third-party requests | largest HTML page |
|---|---|---|---|---|---|---|
| reference fixture (engine) | 12 | 24 | 10 | **0** | 0 | 2.3 KB |
| pattern node (engine) | 42 | 84 | 11 | **0** | 0 | 10.7 KB |
| main node (engine page shell) | 28 | 56 | 13 | **0** | 0 | 6.2 KB |
| main site as published (its own generator) | 61 | 122 | 22 | **0** | 0 | 95.7 KB |

Page types are the templates a route is rendered from: home, each section's index, each section's item or term page, paginated indexes. The per-type counts are in `docs/measurements.json` under `layers.a11y.nodes.<build>.by_type`; every type has zero violations. **axe-core finds on average 57 % of WCAG issues automatically: zero is a floor, not a conformance claim.** The Lighthouse performance category is not measured and is never a gate.

---

## 8. Tokens per item

```
NODE_PATH=<scratch>/node_modules node bench/measure.js --layer tokens --scratch <dir> --nodes <name>=<build>,… --exports <name>=<llm-context dir>,…
```

`gpt-tokenizer` 2.9.0 (MIT, offline, the published BPE tables), two vocabularies: `o200k_base` and `cl100k_base`. **No Claude count**: there is no offline Claude tokenizer, so such a number would be a guess. Median tokens **per item**, `o200k_base` (`cl100k_base` in brackets):

| node | llms.txt index line | chunk text only | chunk records as served (JSON lines) | llm-context skim sections | llm-context TOON index rows |
|---|---|---|---|---|---|
| reference fixture (3 items) | 32 (33.5) | 102 (103) | 945 (958) | 349 (350) | 165 (174) |
| pattern node (15 items) | 44 (44.5) | 390 (390) | 1,359 (1,368) | 641 (638) | 167 (165) |
| main node (15 items) | 40 (40) | 93 (94) | 263 (266) | 140 (139) | 30 (30) |

Whole files, `o200k_base`: `llms.txt` 223 / 627 / 703 tokens; `llms-ctx.txt` 1,012 / 7,154 / 2,881; `chunks-index.toon` 403 / 2,004 / 577 (fixture / patterns / main). The two vocabularies differ by at most 6 % on any median above. The distance between the chunk text and the chunk record as served is the provenance an agent receives with every chunk — digest, IRI, licence, terms, trust and links; the skim view drops it on purpose and says so in its own header.

---

## 9. Package size

```
npm pack --dry-run --json
```

| | |
|---|---|
| files in the tarball | 455 |
| unpacked | 3.41 MB |
| packed | 1,026 KB |

*(Measured again on 2026-09-24, after the manifest was cut to what a consumer runs: the nine checkers of AGSC-09-90, the counter and the benchmark tool with its query set ship; the maintainer's tools, the measurement runners and their corpus stay in the repository.)*

---

## 10. Not run, and why

| layer | why it has no number |
|---|---|
| Three-OS matrix | the same suite and builds on macOS and Windows at Node 22 and 24 cannot be run from one machine; it is a CI measurement |
| Authoritative rule coverage | §1's rows 3 to 6 are proxies until `tools/rule-coverage` classifies every rule |
| COGX import | the engine ships a COGX adapter, but the security corpus does not yet feed it hostile archives; the OKF adapter is the import lane scored in §3 |

---

## Summary table (numbers only)

Every figure is from this document; nothing is rounded up.

| quantity | value |
|---|---|
| specification version measured | 1.0.0-rc.6 (drafted, untagged) |
| rules declared / active / reserved | 343 / 332 / 11 |
| conformance vectors: total / required / optional / withdrawn | 194 / 163 / 1 / 30 |
| vector run | 164 pass, 0 fail, 30 skipped (all withdrawn) |
| populated vector areas | 19 |
| active rules with ≥ 1 vector | 129 of 332 (39 %) |
| active rules named by no test, checker, vector or scenario | 10 of 332 (3 %) |
| error codes registered / used | 90 / 90 |
| two clean builds compared | 49 files, 0 differing |
| builds across time zone and locale compared | 49 files, 0 differing |
| security floor: seeded faults stopped | 85 of 85 (21 detected, 61 refused, 3 neutralised; none missed) |
| security floor: valid controls clean | 13 of 13 |
| security floor: hostile discovery inputs refused | 16 of 16 |
| page-tool / MCP parity: calls equal as values | 207 of 207, over 3 Bundles |
| unpublished items hidden from the page tools | 474 of 474 calls |
| build, 500 items (median of 3) | 5.04 s, 273 MiB peak |
| build, 5,000 items (median of 3) | 37.06 s, 934 MiB peak |
| build, 10,000 items (median of 3) | 75.00 s, 1,673 MiB peak, 287.7 MB output |
| build budget (AGSC-06-21) | ≤ 60 s per 500 items — met at every size measured |
| largest index shard at 10,000 items | 178 KB against a 1 MB budget |
| largest HTML page at 10,000 items | 80.4 KB against a 100 KB budget |
| axe-core violations, 4 builds, 143 pages, both colour schemes | 0 |
| tokens per item, pattern node, median (o200k_base) | 44 in llms.txt, 390 of chunk text, 1,359 as served in chunks.jsonl |
| independent implementations passing the vectors | 1 engine; a second (the Python checker distribution) runs 7 of 19 areas, 60 pass and 0 fail of the 77 vectors in them |
| retrieval smoke run, pattern node, chunks surface | recall@10 1.00, nDCG@10 0.891, P@1 0.750 (12 intents) |
| npm package | 455 files, 1,026 KB packed, 3.41 MB unpacked |

---

*Generated record: `docs/measurements.json` (`schema: agsc.measurements.v1`). Runner: `bench/measure.js`. Kit: `docs/BENCHMARKS.md`.*
