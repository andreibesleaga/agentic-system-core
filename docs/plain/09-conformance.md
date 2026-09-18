# 09 — Conformance, in plain language

**Classes and claims.** Reader, writer, full engine; a claim names the class, the version and the vectors passed.

**Vectors.** One JSON file per test case under `tests/vectors/<area>/`, with an input, an expected result and the rule it proves. Twenty-five areas exist; a required vector that is skipped counts as a failure. Withdrawn vectors are kept for history and never run.

**The CLI.** Sixteen verbs, a JSON envelope on every result, exit codes with fixed meaning, no stray output on the tool channel. The local tool server exposes exactly seven tools.

**Error codes.** `AGSC-E<nnn>` in blocks by area (0xx CLI, 1xx parse, 2xx schema and boundary configuration, 3xx links, 4xx lint, 5xx provenance and adoption, 6xx canonicalization and determinism, 7xx ledger, 8xx composition, 9xx I/O and federation), registered once each; every code used has a registry row that names the rule that raises it.

**Validators.** A reference distribution ships standalone validators for the spec text, schemas, ontology, vectors, discovery file, features and diagrams, plus two generators — nine command contracts in all (AGSC-09-90) — so that an independent party can check every normative artefact.

Rules: `spec/09-conformance.md`, `AGSC-09-01` … `AGSC-09-94`.
