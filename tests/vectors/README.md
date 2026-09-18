# Conformance vectors

These files, together with `spec/00`–`spec/11`, `schema/*.json` and `ontology/agsc.ttl`, are the definition of AgenticSystemCore. A port in any language MUST be able to reach conformance from this directory alone, without reading a line of the reference engine (NFR-02, AGSC-00-01).

## Format

One vector = one JSON file = one case. Object members, in JCS order:

| Member | Required | Meaning |
|---|---|---|
| `area` | yes | directory name: `frontmatter`, `slug`, `links`, `jcs`, `graph`, `lint`, `cli`, `bundle`, `compose`, `discovery`, `build`, `ledger`, `adopt`, `boundary` (rc.3, AGSC-11), `chunks` and `boards` (rc.3), `prov` and `conform` (rc.4), and later `import`, `export`, `skills`, `run` (AGSC-09-04; `webmcp` is NOT an area, AGSC-09-16 is proved by `cli/cli-0003`) |
| `description` | yes | what the case proves, and why it is not obvious |
| `expected` | yes | the outcome (below) |
| `id` | yes | stable, unique, never reused: `<area-prefix>-<nnnn>` |
| `input` | yes | the case input (below) |
| `level` | yes | `required`, `optional` or `withdrawn`; an optional vector may fail without losing conformance, and a `withdrawn` one (a case superseded by a corrected vector, AGSC-00-16) is never run for a claim, carries `reason`, and has `expected` reduced to `{"withdrawn": true}` |
| `note` | no | editorial provenance of an unreleased vector (AGSC-09-04); never read by a conformance run |
| `options` | no | run options, always including `spec_version` |
| `reason` | only when `withdrawn` | why the case was withdrawn and which vector supersedes it (AGSC-09-04) |
| `rule` | yes | exactly one rule id of the specification, e.g. `AGSC-03-07` |

**Input shapes.** `markdown` — one item file as a string; `items[]` — pre-parsed frontmatter objects (`slug` plus keys under test, and a `body` string where a surface is under test), used where file syntax is not the subject; `slug`/`slugs[]`; `paths[]`; `value` — a JSON value for canonicalisation; `argv[]` (+ optional `bundle`) for CLI cases; `base` — the site base for graph cases; `selection[]` for compose cases; `config` + `files[]` for adoption cases; `ledger` + `wellknown` for ledger verification, `git_log` + `content_tree` + `version` for ledger derivation (AGSC-08-20a), `directory` + `files[]` + `git_user_email` + `verbs[]` for the end-to-end adoption case, `wellknown` for a Level-0 discovery document; `nodes[]` for the two-node federation check (AGSC-10-12); `transports[]` (+ `bundle`) for the two-transport tool-contract check (AGSC-09-16).

**Expected shapes.** A **positive** vector states the result: `frontmatter`, `edges[]`, `anchors[]`, `output`, `body`, `files[]` (each `{changed, output, path}`), `path`, `idempotent`, `nquads`, `search`, `verdict`, `ledger`, `head`, `config`, `index_frontmatter`, `config_valid`/`index_valid`, `level`, `contains[]`/`excludes[]`, `findings[]` (each entry asserts a **subset** of the AGSC-09-11 finding members — at minimum `code`; unasserted members are not compared), `valid[]`, `stdout`, `exit`, and `errors: []` where relevant. `nquads` is the complete canonical N-Quads serialization of the vector's input, not an excerpt. A **negative** vector states exactly one error *code*, never a message: `{"error": "AGSC-E<nnn>"}` — or, since rc.3, AGSC-09-11 finding objects under `findings[]`/`results[]` each carrying `code` and `severity` (AGSC-09-05 as amended), optionally with `line`, `cycle`, `chain`, `parents` or `severity`. Codes are registered in `spec/09-conformance.md` §9.4 and are permanent.

## Rules the vectors themselves obey

- UTF-8, LF, NFC, I-JSON, members in JCS order (AGSC-09-06), with one deliberate exemption: an `input.value` object under test carries the member order that is *the subject of the case* (`jcs-0001`, `jcs-0002`), since a parser discards order and what the case proves is what the writer emits. They MAY be pretty-printed — AGSC-04-04 governs *emitted* artefacts and no longer lists vectors — while the *values* inside them (for example an `output` string) are byte-exact and MUST NOT be reformatted.
- A vector cites one rule. A rule may be proved by a vector, by a `features/` scenario or by a shipped validator; only a *required* vector that a rule names, and is then absent, fails the correspondence check (AGSC-09-90). A declared area with no vector file is an informational count, not a failure.
- Vector ids are versioned with the spec; released vectors are immutable (AGSC-00-16). A vector that turns out to contradict its rule is never edited in place: the corrected case ships as a new file and the old one is republished with `"level": "withdrawn"`.

## Running them from a foreign port

1. **Choose a class** — reader, writer or full engine (AGSC-00-09…11). The Level is the single source of the area set (AGSC-10-15): the areas a claim runs are exactly those AGSC-10-02…05 list for its Level, and no other list exists.
2. **Implement five primitives**: a failsafe-YAML reader, a JCS writer, SHA-256, Unicode NFC, and code-point sorting. Everything else in this specification is expressible on top of them.
3. **Load each file** in your own test harness — they are plain JSON, so `glob` + parse is enough. Dispatch on `area` and on the `input`/`expected` member names present.
4. **Compare bytes, not structures**, wherever `expected` carries a string (`output`, `nquads`, `stdout`). Compare RDF by graph isomorphism only where a vector says so; the canonical N-Quads form is compared byte-for-byte.
5. **For negative vectors**, assert the code, not the wording. Message text is deliberately unspecified so that ports may localise and improve it.
6. **Report** `pass`, `fail` or `skip` per `id`. A `skip` on a `required` vector counts as a failure (AGSC-09-02). An optional `conformance-report.json` may be published as `{impl, version, spec_version, class, results[], summary}`.

A conformance claim MUST name the class, the `spec_version` MAJOR.MINOR and the vector set passed (AGSC-00-12). No claim of full RDFC-1.0 may be made from the `graph/` vectors: they are the blank-node-free subset, where canonicalisation is a sort (AGSC-04-16).

## Present coverage

**129 vectors — 125 required, 1 optional, 3 withdrawn** (`1.0.0-rc.4`, 2026-09-18; per-area counts and the total are derived by `node tools/count-artifacts --json`, never typed by hand). Three are `withdrawn` at `1.0.0-rc.2` and are never run for a claim: `disc-0001` and `disc-0002` (superseded by `disc-0003`/`disc-0004` when D55 replaced the two-member discovery document with a conformant RFC 9264 link set) and `cli-0001` (superseded by `cli-0005` when AGSC-09-07 grew from thirteen verbs to sixteen). Each of the twelve spec sections is cited by at least one of them; the remaining areas listed above are populated as the milestones that need them land.

**Coverage status:** derived, never typed — `node tools/count-artifacts --json` reports `rules`, `rules_with_vector` and `rules_without_vector` for `spec/00`–`spec/11`; the `1.0.0-rc.4` tag of 2026-09-18 has 129 vectors, every MUST that DS-4 had listed as deferred now has one (DS-5, 2026-09-17), and nothing is deferred. `nquads` expectations follow AGSC-05-31 (plain literals carry `^^xsd:string` in N-Quads); `severity` is `warn`, never `warning` (AGSC-09-11); a vector carrying `requires_surface` is skipped-as-passed by a node that declares none of the named surfaces (AGSC-09-04).

## Porting notes

- **Slug regex.** Since the rc.3 draft (DS-3, 2026-09-16) no pattern in `schema/*.json` uses a lookahead, a `\u` escape or any other construct outside the RE2 / Go `regexp` / Rust `regex` / PCRE2 common subset (NUL is written `\x00`, V7-02). The `slug` grammar is `^[a-z0-9]+(?:-[a-z0-9]+)*$` with `minLength: 1` and `maxLength: 64` counted in Unicode code points (AGSC-01-10, AGSC-02-24): a leading, trailing or doubled hyphen is impossible by construction, so no separate `not contains "--"` check is needed. `slug-0006` proves the grammar; the earlier lookahead form `(?!.*--)` is historical and MUST NOT be reintroduced (V6-B, blocker B4).
- **Ordering primitives.** JSON member names (search tokens included) sort by UTF-16 code units; file paths and N-Quads sort by code point, with `/` as the path separator on every platform. A port that reuses one comparator for both will diverge on astral-plane input.
