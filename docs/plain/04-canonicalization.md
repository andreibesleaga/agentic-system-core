# 04 — Canonicalization, in plain language

**The promise.** Build the same Bundle twice, on two machines: every machine artefact is byte-identical, and a conforming tool must match the bytes the vectors expect. HTML pages are identical within one tool. Proved today: the engine passes all 376 current vectors, and the Python checker runs 115 of them (7 of 20 areas) and fails none; no second engine builds a whole node.

**How.** JSON is written in the canonical form of RFC 8785 (members sorted by UTF-16 code unit, no whitespace, `-0` written as `0`). Text is NFC-normalised **before** anything is sorted or hashed. Time is one instant format in UTC, taken from `SOURCE_DATE_EPOCH` or the last commit. Every list has a stated sort order. Hashes are SHA-256, lowercase hex.

**Unicode.** The vectors were generated with Unicode 16.0.0; a tool states the version it uses. A run of more than 256 combining marks after one character is refused, so hostile input cannot exhaust memory.

**Why it matters.** Because outputs are deterministic, a digest in the discovery document is a real integrity check, two nodes can compare notes, and a reader can rebuild a site from its source and check that nothing changed.

Rules: `spec/04-canonicalization.md`, `AGSC-04-01` … `AGSC-04-25`.
