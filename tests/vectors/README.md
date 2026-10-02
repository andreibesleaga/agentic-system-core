# Conformance vectors

These files, together with `spec/00`–`spec/11`, `schema/*.json` and `ontology/agsc.ttl`, are the definition of AgenticSystemCore. A port in any language MUST be able to reach conformance from this directory alone, without reading a line of the reference engine (NFR-02, AGSC-00-01).

In short: every file here is one case that cites one rule; a port loads the JSON, runs the case and compares its result with `expected`. This is the first public vector set, published with `1.0.0-rc.6`, and no vector in it is withdrawn. From now on a vector is never edited in place to change its case: where a vector and its rule disagree, the rule is normative (AGSC-00-03), the corrected case ships as a new vector with a new id, and the old file stays in this directory with `level` `withdrawn`, a `reason` and, where it has a successor, `superseded_by` (AGSC-00-16, AGSC-09-04, AGSC-09-05).

## Format

One vector = one JSON file = one case. Object members, in JCS order:

| Member | Required | Meaning |
|---|---|---|
| `area` | yes | directory name: `frontmatter`, `slug`, `links`, `jcs`, `graph`, `lint`, `cli`, `bundle`, `compose`, `discovery`, `build`, `ledger`, `adopt`, `boundary` (AGSC-11), `chunks`, `boards`, `prov`, `conform`, `import`, and the areas AGSC-09-04 declares for later use, such as `export`, `skills` and `run` (`webmcp` is NOT an area, AGSC-09-16 is proved by `cli/cli-0003`) |
| `description` | yes | what the case proves, and why it is not obvious |
| `expected` | yes | the outcome (below) |
| `id` | yes | stable, unique, never reused: `<area-prefix>-<nnnn>` |
| `input` | yes | the case input (below) |
| `level` | yes | `required`, `optional` or `withdrawn`; an optional vector may fail without losing conformance, and a `withdrawn` one (a case superseded by a corrected vector, AGSC-00-16) is kept in the directory, is never run for a claim, carries `reason`, and has `expected` reduced to `{"withdrawn": true}` |
| `note` | no | editorial provenance of an unreleased vector (AGSC-09-04); never read by a conformance run and never normative |
| `options` | no | run options, always including `spec_version` |
| `reason` | only when `withdrawn` | why the case was withdrawn and which vector supersedes it (AGSC-09-04). Supersession is transitive: when a named successor is itself withdrawn, its own successor supersedes the case |
| `rule` | yes | exactly one rule id of the specification, e.g. `AGSC-03-07` |
| `superseded_by` | no | the id of the vector that supersedes a withdrawn one, so a machine follows the chain without reading prose (AGSC-09-04); carried by every withdrawn vector that has a successor |

**Input shapes.** `markdown` — one item file as a string; `items[]` — pre-parsed frontmatter objects (`slug` plus keys under test, and a `body` string where a surface is under test), used where file syntax is not the subject; `slug`/`slugs[]`; `paths[]`; `value` — a JSON value for canonicalisation; `argv[]` (+ optional `bundle`) for CLI cases; `base` — the site base for graph cases; `selection[]` for compose cases; `config` + `files[]` for adoption cases, with `verbs[]` and `after_init[]` (the files the publisher adds between `init` and `ci`, each `{path, text}`; when present, the verbs run for real, not as a schema check — `adopt-0007`, `adopt-0008`); `ledger` + `wellknown` for ledger verification, `git_log` + `content_tree` + `version` for ledger derivation (AGSC-08-20a), `directory` + `files[]` + `git_user_email` + `verbs[]` for the end-to-end adoption case, `wellknown` for a Level-0 discovery document; `nodes[]` for the two-node federation check (AGSC-10-12); `transports[]` (+ `bundle`) for the two-transport tool-contract check (AGSC-09-16); `frontmatter` — one pre-parsed frontmatter object, which like `items[]` states only the keys under test, so that `valid` and `findings[]` concern the keys it states and a finding about a key it does not state is outside the case (`fm-0009`).

**Expected shapes.** A **positive** vector states the result: `frontmatter`, `edges[]`, `anchors[]`, `output`, `body`, `files[]` (each `{changed, output, path}`), `path`, `idempotent`, `nquads`, `search`, `verdict`, `ledger`, `head`, `config`, `index_frontmatter`, `config_valid`/`index_valid`, `level`, `contains[]`/`excludes[]`, `findings[]` (each entry asserts a **subset** of the AGSC-09-11 finding members — at minimum `code`; unasserted members are not compared), `valid[]`, `stdout`, `exit`, and `errors: []` where relevant. `nquads` is the complete canonical N-Quads serialization of the vector's input, not an excerpt. `relations_allowed` asserts membership — each listed name is admitted and each name the document uses is listed — and never equality, because the relation list of AGSC-06-10 grows by a MINOR. A **negative** vector states exactly one error *code*, never a message: `{"error": "AGSC-E<nnn>"}` — or AGSC-09-11 finding objects under `findings[]`/`results[]` each carrying `code` and `severity` (AGSC-09-05), optionally with `line`, `cycle`, `chain`, `parents` or `severity`. Codes are registered in `spec/09-conformance.md` §9.4 and are permanent.

## Rules the vectors themselves obey

- UTF-8, LF, NFC, I-JSON, members in JCS order (AGSC-09-06), with one deliberate exemption: an `input.value` object under test carries the member order that is *the subject of the case* (`jcs-0001`, `jcs-0002`), since a parser discards order and what the case proves is what the writer emits. They MAY be pretty-printed — AGSC-04-04 governs *emitted* artefacts, not vectors — while the *values* inside them (for example an `output` string) are byte-exact and MUST NOT be reformatted.
- A vector cites one rule. A rule may be proved by a vector, by a `features/` scenario or by a shipped validator; only a *required* vector that a rule names, and is then absent, fails the correspondence check (AGSC-09-90). A declared area with no vector file is an informational count, not a failure.
- The `<area-prefix>` of `import/` is `imp-`; the other areas' prefixes are the ones their files already carry.
- A member of an `expected` object states exactly what its name says and nothing wider. `mcp_extensions` in `bnd-0037` names the extension IDENTIFIERS a node advertises; the per-extension settings object of each is pinned by AGSC-11-18 and asserted by `bnd-0035` and `bnd-0036`. `file_bytes_asserted: false`, `whole_file_asserted: false` and the like say that the case deliberately pins no bytes, because no rule pins them.
- Vector ids are versioned with the spec and never reused; released vectors are immutable (AGSC-00-16). A vector that turns out to contradict its rule is never edited in place: the corrected case ships as a new file, and the old one is kept with `"level": "withdrawn"`, a `reason` and, where it has a successor, `superseded_by`. The only in-place edits AGSC-00-16 admits to a released vector are the specification-version string it carries and the re-pointing of its `rule` to the rule that absorbed a retired one.
- `note` is never read by a conformance run (AGSC-09-04): it carries no normative content, so a port may ignore it.

## Running them from a foreign port

1. **Choose a class** — reader, writer or full engine (AGSC-00-09…11). The Level is the single source of the area set (AGSC-10-15): the areas a claim runs are exactly those AGSC-10-02…05 list for its Level, and no other list exists.
2. **Implement five primitives**: a failsafe-YAML reader, a JCS writer, SHA-256, Unicode NFC, and code-point sorting. Everything else in this specification is expressible on top of them.
3. **Load each file** in your own test harness — they are plain JSON, so `glob` + parse is enough. Dispatch on `area` and on the `input`/`expected` member names present.
4. **Compare bytes, not structures**, wherever `expected` carries a string (`output`, `nquads`, `stdout`). Compare RDF by graph isomorphism only where a vector says so; the canonical N-Quads form is compared byte-for-byte.
5. **For negative vectors**, assert the code, not the wording. Message text is deliberately unspecified so that ports may localise and improve it.
6. **Report** `pass`, `fail` or `skip` per `id`. A `skip` on a `required` vector counts as a failure (AGSC-09-02). An optional `conformance-report.json` may be published as `{impl, version, spec_version, class, results[], summary}`.

A conformance claim MUST name the class, the `spec_version` MAJOR.MINOR and the vector set passed (AGSC-00-12). No claim of RDFC-1.0 may be made from the `graph/` vectors: `graph.nq` is this specification's own canonical form, which holds the same quads as RDFC-1.0 output for a blank-node-free dataset but writes four kinds of term differently (AGSC-04-16).

## Present coverage

**The totals are derived, never typed here** — `node tools/count-artifacts --json` reports `vectors_total`, `vectors_required`, `vectors_optional` and `vectors_withdrawn` for the tree as it stands, and that command is the only statement of them this repository makes. The first public set (`1.0.0-rc.6`) withdraws no vector.

**Coverage status:** derived, never typed — `node tools/count-artifacts --json` reports `rules`, `rules_with_vector` and `rules_without_vector` for `spec/00`–`spec/11`. `nquads` expectations follow AGSC-05-31 (plain literals carry `^^xsd:string` in N-Quads); `severity` is `warn`, never `warning` (AGSC-09-11); a vector carrying `requires_surface` is skipped-as-passed by a node that declares none of the named surfaces (AGSC-09-04).

## Porting notes

- **Slug regex.** No pattern in `schema/*.json` uses a lookahead, a `\u` escape or any other construct outside the RE2 / Go `regexp` / Rust `regex` / PCRE2 common subset (NUL is written `\x00`). The `slug` grammar is `^[a-z0-9]+(?:-[a-z0-9]+)*$` with `minLength: 1` and `maxLength: 64` counted in Unicode code points (AGSC-01-10, AGSC-02-24): a leading, trailing or doubled hyphen is impossible by construction, so no separate `not contains "--"` check is needed. `slug-0006` proves the grammar; a lookahead form such as `(?!.*--)` MUST NOT be introduced.
- **Ordering primitives.** JSON member names (search tokens included) sort by UTF-16 code units; file paths and N-Quads sort by code point, with `/` as the path separator on every platform. A port that reuses one comparator for both will diverge on astral-plane input.
