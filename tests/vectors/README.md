# Conformance vectors

These files, together with `spec/00`–`spec/10`, `schema/*.json` and `ontology/agsc.ttl`, are the definition of AgenticSystemCore. A port in any language MUST be able to reach conformance from this directory alone, without reading a line of the reference engine (NFR-02, AGSC-00-01).

## Format

One vector = one JSON file = one case. Object members, in JCS order:

| Member | Required | Meaning |
|---|---|---|
| `area` | yes | directory name: `frontmatter`, `slug`, `links`, `jcs`, `graph`, `lint`, `cli`, `bundle`, `compose`, `discovery`, `build`, `ledger`, `adopt`, and later `prov`, `import`, `export`, `skills` |
| `description` | yes | what the case proves, and why it is not obvious |
| `expected` | yes | the outcome (below) |
| `id` | yes | stable, unique, never reused: `<area-prefix>-<nnnn>` |
| `input` | yes | the case input (below) |
| `level` | yes | `required`, `optional` or `withdrawn`; an optional vector may fail without losing conformance, and a `withdrawn` one (a case superseded by a corrected vector, AGSC-00-16) is never run for a claim |
| `options` | no | run options, always including `spec_version` |
| `rule` | yes | exactly one rule id of the specification, e.g. `AGSC-03-07` |

**Input shapes.** `markdown` — one item file as a string; `items[]` — pre-parsed frontmatter objects (`slug` plus keys under test, and a `body` string where a surface is under test), used where file syntax is not the subject; `slug`/`slugs[]`; `paths[]`; `value` — a JSON value for canonicalisation; `argv[]` (+ optional `bundle`) for CLI cases; `base` — the site base for graph cases; `selection[]` for compose cases; `config` + `files[]` for adoption cases; `ledger` + `wellknown` for ledger verification, `git_log` + `content_tree` + `version` for ledger derivation (AGSC-08-20a), `directory` + `files[]` + `git_user_email` + `verbs[]` for the end-to-end adoption case, `wellknown` for a Level-0 discovery document.

**Expected shapes.** A **positive** vector states the result: `frontmatter`, `edges[]`, `anchors[]`, `output`, `body`, `files[]` (each `{changed, output, path}`), `path`, `idempotent`, `nquads`, `search`, `verdict`, `ledger`, `head`, `config`, `index_frontmatter`, `config_valid`/`index_valid`, `level`, `contains[]`/`excludes[]`, `findings[]`, `valid[]`, `stdout`, `exit`, and `errors: []` where relevant. A **negative** vector states exactly one error *code*, never a message: `{"error": "AGSC-E<nnn>"}`, optionally with `line`, `cycle`, `chain`, `parents` or `severity`. Codes are registered in `spec/09-conformance.md` §9.4 and are permanent.

## Rules the vectors themselves obey

- UTF-8, LF, NFC, I-JSON, members in JCS order (AGSC-09-06), with one deliberate exemption: an `input.value` object under test carries the member order that is *the subject of the case* (`jcs-0001`, `jcs-0002`), since a parser discards order and what the case proves is what the writer emits. They MAY be pretty-printed — AGSC-04-04 governs *emitted* artefacts and no longer lists vectors — while the *values* inside them (for example an `output` string) are byte-exact and MUST NOT be reformatted.
- A vector cites one rule. A rule with no vector and a module with no rule both fail the correspondence check (PLAN §5.3, NFR-03).
- Vector ids are versioned with the spec; released vectors are immutable (AGSC-00-16). A vector that turns out to contradict its rule is never edited in place: the corrected case ships as a new file and the old one is republished with `"level": "withdrawn"`.

## Running them from a foreign port

1. **Choose a class** — reader, writer or full engine (AGSC-00-09…11). It fixes which areas are in scope: reader = `frontmatter`, `slug`, `links`; writer adds `jcs`, `graph`; full engine adds `lint`, `cli` and the remaining areas.
2. **Implement five primitives**: a failsafe-YAML reader, a JCS writer, SHA-256, Unicode NFC, and code-point sorting. Everything else in this specification is expressible on top of them.
3. **Load each file** in your own test harness — they are plain JSON, so `glob` + parse is enough. Dispatch on `area` and on the `input`/`expected` member names present.
4. **Compare bytes, not structures**, wherever `expected` carries a string (`output`, `nquads`, `stdout`). Compare RDF by graph isomorphism only where a vector says so; the canonical N-Quads form is compared byte-for-byte.
5. **For negative vectors**, assert the code, not the wording. Message text is deliberately unspecified so that ports may localise and improve it.
6. **Report** `pass`, `fail` or `skip` per `id`. A `skip` on a `required` vector counts as a failure (AGSC-09-02). An optional `conformance-report.json` may be published as `{impl, version, spec_version, class, results[], summary}`.

A conformance claim MUST name the class, the `spec_version` MAJOR.MINOR and the vector set passed (AGSC-00-12). No claim of full RDFC-1.0 may be made from the `graph/` vectors: they are the blank-node-free subset, where canonicalisation is a sort (AGSC-04-16).

## Present coverage

`frontmatter/` 8 · `links/` 6 · `slug/` 4 · `adopt/` 4 · `graph/` 4 · `lint/` 3 · `ledger/` 3 · `jcs/` 2 · `cli/` 2 · `compose/` 2 · `discovery/` 2 · `build/` 2 · `bundle/` 1 — **43 vectors**. Each of the ten spec sections is cited by at least one of them; the remaining areas listed above are populated as the milestones that need them land.

## Porting notes

- **Slug regex.** The `slug` and `link_target` patterns in `schema/*.json` use the ECMA-262 negative lookahead `(?!.*--)`, which JSON Schema mandates but RE2, Go's `regexp` and Rust's `regex` cannot compile. A port MAY implement the check as *character-class regex* `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` **AND** `not contains "--"`; the two are equivalent, and AGSC-01-10 states the no-`--` rule in prose for exactly this reason.
- **Ordering primitives.** JSON member names (search tokens included) sort by UTF-16 code units; file paths and N-Quads sort by code point, with `/` as the path separator on every platform. A port that reuses one comparator for both will diverge on astral-plane input.
