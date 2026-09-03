# AGSC-04 — Canonicalization and determinism

## 4.1 The determinism obligation

- **AGSC-04-01** Two builds of the same Bundle content with the same `SOURCE_DATE_EPOCH` MUST produce byte-identical output on every operating system and every runtime. [PRD-004 ← R32, Art. XII]
- **AGSC-04-02** Verification is a double build into two directories followed by a recursive byte comparison; any difference is error `AGSC-E602`. [PRD-004]
- **AGSC-04-03** A build MUST NOT read a wall clock, resolve the network, read environment locale, or depend on filesystem enumeration order. [Art. XII, C9]

## 4.2 JSON (JCS, RFC 8785)

- **AGSC-04-04** Every emitted JSON artefact — `graph.jsonld`, per-item `.jsonld`, `search.json`, the well-known file, `dist/gate.json`, `ledger.jsonl` entries — MUST be JCS-canonical and MUST be followed by exactly one LF. Vector files are **not** emitted artefacts: they are governed by AGSC-09-06, which requires JCS member *order* but permits pretty-printing. [research/12 §P rule 19, D48(7)]
- **AGSC-04-05** JCS here means: UTF-8 output; no whitespace between tokens; members sorted by **UTF-16 code units** of the member name; numbers per ECMA-262 §7.1.12.1 (`Number#toString`); input restricted to I-JSON. Locale and Unicode code-point sorting MUST NOT be used: they differ from UTF-16 order for astral-plane keys. [research/12 §P rule 24 as corrected; audit/G §1 RFC 8785 row]
- **AGSC-04-06** A JSON artefact that is not JCS-canonical is error `AGSC-E601`. [PRD-004]

## 4.3 Text

- **AGSC-04-07** All emitted text MUST be UTF-8 without BOM, LF-terminated, NFC-normalized, with exactly one trailing LF. Non-NFC output is `AGSC-E604`. [research/12 §P rule 1, §3]
- **AGSC-04-08** Slugs, keys and IRIs stay ASCII; titles, descriptions and aliases MAY be any Unicode in NFC. [research/12 §P rule 39]

## 4.4 Time

- **AGSC-04-09** The build instant MUST come from `SOURCE_DATE_EPOCH` (integer seconds since the Unix epoch), defaulting to the last commit time. Where no git history exists — the drop-in flow of PRD-053 runs before `git init` — the default MUST be `0` (`1970-01-01T00:00:00Z`) with warning `AGSC-E606`, so the instant is always defined. A malformed value MUST exit 2 (`AGSC-E603`, the configuration class of AGSC-09-08); the variable MUST NOT be unset for child processes. [research/12 §3, §P rule 23; D48(7)]
- **AGSC-04-10** Every embedded timestamp MUST be rendered from that instant as `YYYY-MM-DDTHH:MM:SSZ` — UTC, seconds precision, never milliseconds, never a local offset. [research/12 §P rules 7, 23]
- **AGSC-04-11** Staleness, "last build", NOW counts and feed dates MUST all derive from the same instant. Only the `refresh` verb MAY read a real clock, and a clock it reads MUST NOT reach any emitted artefact: ledger `ts` values derive from the committer times of the git-log file (AGSC-08-20a) and from `SOURCE_DATE_EPOCH` for the single trailing `build` entry, never from a wall clock, so a `refresh` observation can only open an issue. [PRD-015, PRD-017, G17, D48(7)]

## 4.5 Ordering

- **AGSC-04-12** All ordering MUST be code-point comparison of the sort key. Locale collation, case-insensitive collation and `Intl` comparators MUST NOT be used. [research/12 §P rule 24]
- **AGSC-04-13** Explicit sort keys: items by slug; links by `(key, target)`; tags by code point; cluster members by `(order, slug)` with absent `order` sorting last; search tokens as JSON member names per AGSC-04-05 (UTF-16 code units), never by code point; sitemap entries by URL; N-Quads lines by their serialized bytes; RDF subjects, then predicates, then objects by IRI or lexical form; JSON object members by AGSC-04-05. [research/12 §3, §P rule 24]
- **AGSC-04-14** Arrays authored by a human (`tags`, `clusters`, `aliases`, Link arrays) MUST retain author order in the source file and MUST be sorted only in derived artefacts, so that `lint --fix` never reorders meaning-bearing first entries such as the primary cluster. [audit/D §1.2]

## 4.6 Hashes and the canonical RDF form

- **AGSC-04-15** `graph.nq` — canonical N-Quads, code-point ordered, each quad terminated by a single LF — is the hashed form of the graph. `bundle.hash` MUST be the lowercase hex SHA-256 of its bytes. [research/12 §P rule 21]
- **AGSC-04-16** Because exports are blank-node-free (§05), RDFC-1.0 canonicalization degenerates to this sort. An implementation MUST scope any conformance claim to "canonical N-Quads equal to RDFC-1.0 output for blank-node-free datasets" and MUST NOT claim full RDFC-1.0. [D41, audit/G §1 RDFC row]
- **AGSC-04-17** Content hashes elsewhere (per-item Markdown, ontology files, skill packs) MUST be lowercase hex SHA-256 over the canonical bytes. A CIDv1 (`raw`, sha2-256, base32 `b…`) MAY additionally be emitted for `graph.nq`; when emitted it MUST be computed over the same canonical bytes. [research/12 §P rule 25]
- **AGSC-04-18** `search.json`, `sitemap.xml`, `feed.xml` and the well-known file MUST be reproducible from `content/` plus `SOURCE_DATE_EPOCH`, plus — for the well-known file's `integrity.ledger_head` alone — the git-log file of AGSC-08-02/08-20a. No other input exists. [research/12 §P rule 26, V3-05]

## 4.7 Normalization on write

- **AGSC-04-19** `lint --fix` MUST be idempotent: applying it twice MUST produce the same bytes as applying it once. Its normalizations are limited to line endings, NFC, trailing newline, frontmatter key order (**schema order** = the top-level `properties` order of `schema/item.schema.json`, then the matching `oneOf` branch's `properties` order, then unknown keys in code-point order — the order AGSC-02-90 emits, so `lint --fix` never rewrites an adopted file), and wikilink rewriting. [PRD-003, AGSC-03-12]
- **AGSC-04-20** `lint --fix` MUST NOT change prose, reorder authored arrays, or add, remove or infer any key. [D43(1), Art. XIII]
