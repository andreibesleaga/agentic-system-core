# Conformance vectors

These files, together with `spec/00`–`spec/11`, `schema/*.json` and `ontology/agsc.ttl`, are the definition of AgenticSystemCore. A port in any language MUST be able to reach conformance from this directory and the fixture Bundle `tests/fixtures/minimal/` (the Bundle a case names as `"bundle": "fixtures/minimal"`) alone, without reading a line of the reference engine (NFR-02, AGSC-00-01).

In short: every file here is one case that cites one rule; a port loads the JSON, runs the case and compares its result with `expected`. The set is versioned with the specification and ships with each of its releases. A released vector is never edited in place to change its case: where a vector and its rule disagree, the rule is normative (AGSC-00-03), the corrected case ships as a new vector with a new id, and the old file stays in this directory with `level` `withdrawn`, a `reason` and, where it has a successor, `superseded_by` (AGSC-00-16, AGSC-09-04, AGSC-09-05).

## Format

One vector = one JSON file = one case. Object members, in JCS order:

| Member | Required | Meaning |
|---|---|---|
| `area` | yes | directory name: `frontmatter`, `slug`, `links`, `jcs`, `graph`, `lint`, `cli`, `bundle`, `compose`, `discovery`, `build`, `ledger`, `adopt`, `boundary` (AGSC-11), `chunks`, `boards`, `prov`, `conform`, `import`, `export`, and the areas AGSC-09-04 declares for later use, such as `skills` and `run` (`webmcp` is NOT an area, AGSC-09-16 is proved by `cli/cli-0003`) |
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

**Input shapes.** `markdown` — one item file as a string; `items[]` — pre-parsed frontmatter objects (`slug` plus keys under test, and a `body` string where a surface is under test), used where file syntax is not the subject; `slug`/`slugs[]`; `texts[]` — file stems for the slugifier of AGSC-02-91, with `expected.slugs[]` in the same order (`slug-0007`); `paths[]`; `value` — a JSON value for canonicalisation; `argv[]` (+ optional `bundle`) for CLI cases; `base` — the site base for graph cases; `selection[]` for compose cases; `config` + `files[]` for adoption cases, with `verbs[]` and `after_init[]` (the files the publisher adds between `init` and `ci`, each `{path, text}`; when present, the verbs run for real, not as a schema check — `adopt-0007`, `adopt-0008`); `ledger` + `wellknown` for ledger verification, `git_log` + `content_tree` + `version` for ledger derivation (AGSC-08-20a), `config` + `git_log` for the history check of a channel set to `auto` (AGSC-08-26(g); `prov-0006` to `prov-0008`), whose expected `findings[]` is the complete list of findings in the order of the git-log file, `directory` + `files[]` + `git_user_email` + `verbs[]` for the end-to-end adoption case, `wellknown` for a Level-0 discovery document; `nodes[]` for the two-node federation check (AGSC-10-12); `transports[]` (+ `bundle`) for the two-transport tool-contract check (AGSC-09-16); `frontmatter` — one pre-parsed frontmatter object, which like `items[]` states only the keys under test, so that `valid` and `findings[]` concern the keys it states and a finding about a key it does not state is outside the case (`fm-0009`). `bundle` + `add_files` — a fixture Bundle named under `tests/` (`fixtures/minimal`) with files added or replaced, each `{"<path>": "<text>"}`, over which the real verbs run (`bundle-0007`, `bundle-0009`, `bundle-0010`, and the `lint` cases that read a whole Bundle); beside `add_files`, `add_sized_files` gives a file a JSON string cannot carry for its size, `{"<path>": {"bytes": <n>, "fill": "<c>"}}`, a file of exactly n bytes that are each the one ASCII character c, and `add_links` a symbolic link, `{"<path>": "<target>"}`, whose target is read from the folder that holds the link (`lint-0037`). The same shape serves the `build` and `cli` cases that run a whole `build`, `ci` or tool server over the fixture (`build-0020` to `build-0027`, `cli-0023` to `cli-0025`); there a `cases[]` entry may carry its own `add_files`, written over the case's, its own `argv` (`ci --json` in `cli-0024` and `cli-0025`; `build --json` where none is given) and its own `environment`, the environment values the command line sees beside the case's `SOURCE_DATE_EPOCH` (`build-0021`). `frames[]` — the JSON-RPC messages a client sends to the stdio tool server of AGSC-09-13 in one write, in order, the server exiting at the end of its input; `tools_list_id` names the `id` of the `tools/list` request among them whose result the case reads (`cli-0018`, `cli-0019`). `git_history` — `false` runs the case where no git history exists, with no `SOURCE_DATE_EPOCH` unless `environment` states one (`cli-0020`, `cli-0022`), or, in the `build` cases and `cli-0024` and `cli-0025`, with the `SOURCE_DATE_EPOCH` of the case's `options.source_date_epoch`; `environment` — on a whole case or on one `cases[]` entry, the exact environment the command line sees (`cli-0006`, `cli-0020` to `cli-0022`); `add_files` serves the `cli` cases too (`cli-0020`, `cli-0022`). `cases[]` — several sub-cases of one rule in one file: each entry of `input.cases[]` carries a `name`, and the entry of `expected.cases[]` with the same `name` states its outcome, in the members this section and the next one describe. A `discovery` sub-case that carries `document` and `level` and no `reader_version` is one discovery document that the discovery checker of AGSC-09-93 judges at that Level; its expected `valid` and `findings[]` are that checker's verdict, `findings[]` being the complete list of errors (`disc-0022`). `flags[]` — the flags of one `export` run over a fixture Bundle with files added, run as `export <flags> --json`; the paths its outcome names are relative to the export root, the folder AGSC-01-26 calls that, wherever an implementation writes it (`export-0001`, `export-0002`). `argv[]` with `bundle` and `add_files` in the `prov` area runs one verb of the command line over the fixture with files added (`prov-0012`, `prov-0013`). `trailers[]` — DCO-Plus trailer blocks, each `{block, name}` and, where AGSC-08-07 reads the change it signs, its `prov` (`prov-0005`, `prov-0010`).

**Expected shapes.** A **positive** vector states the result: `frontmatter`, `edges[]`, `anchors[]`, `output`, `body`, `files[]` (each `{changed, output, path}`), `path`, `idempotent`, `nquads`, `search`, `verdict`, `harness_emitted` (a compose case: whether the Harness is written, true exactly when the verdict is valid, AGSC-07-17), `ledger`, `head`, `config`, `index_frontmatter`, `config_valid`/`index_valid`, `level`, `contains[]`/`excludes[]`, `findings[]` (each entry asserts a **subset** of the AGSC-09-11 finding members — at minimum `code`; unasserted members are not compared), `valid[]`, `stdout`, `exit`, and `errors: []` where relevant. `nquads` is the complete canonical N-Quads serialization of the vector's input, not an excerpt. `relations_allowed` asserts membership — each listed name is admitted and each name the document uses is listed — and never equality, because the relation list of AGSC-06-10 grows by a MINOR. A **negative** vector states exactly one error *code*, never a message: `{"error": "AGSC-E<nnn>"}` — or AGSC-09-11 finding objects under `findings[]`/`results[]` each carrying `code` and `severity` (AGSC-09-05), optionally with `line`, `cycle`, `chain`, `parents` or `severity`. A frontmatter case's `error` is the first error a reader reports, and its `line` that error's line (`fm-0005`, `fm-0011` to `fm-0018`, `fm-0020`); every other error-severity finding a conforming reader reports for the file is absent by construction. `lint` — the outcome of the real `lint` over a fixture Bundle with files added: `{exit, findings[]}`, where `findings[]` is the WHOLE list, each entry a subset of one finding's members and no finding beyond them (`bundle-0009`, `bundle-0010`, `lint-0034` to `lint-0037`, `lint-0044`, whose entries also assert `line`), or `{error, slug}`, a finding that must be among them (`bundle-0007`). `responses[]` — tool-server responses, each a subset of the response with the same `id` (`cli-0018`); `tools[]` — the result of `tools/list` reduced to each tool's `name`, its sorted argument names (`arguments`) and its sorted `required` names, in name order, compared whole (`cli-0019`). In a sub-case of the command line: `envelope` — the AGSC-09-11 envelope standard output carries, stated as its `verb`, its `status` and the `codes` of its findings in order, with standard output exactly that one JCS-canonical envelope; `stderr_codes` — the codes of the finding objects standard error carries, one per line, in order (`cli-0017`); `exit_one_of` — the exit codes any one of which conforms, where the rule admits more than one outcome; `error_codes_allowed` — the only codes an error-severity finding may carry; `codes_absent` — codes that must not be reported at all, a guard against the plausible wrong answer (`cli-0011`, `cli-0016`; at the top level of `build-0017`, over the findings of its build). `content_security_policy` — `{admits_inline_script, contains[], route, whole_string_asserted}`: the policy served on `route` contains each listed directive with its sources and lets no inline script run (`build-0018`); `shards[]` — each `{docs_count, first_slug, last_slug, output?, path}`, in manifest order, where `output` is the whole bytes of that file (`build-0019`); `findings_in_order[]` — entries, each a subset of one finding, that appear in this relative order; `finding_members[]` — the members every finding carries; `ordered_by[]` — the sort key every adjacent pair of findings respects; `stderr_lines_match_findings` — the finding lines on standard error equal the envelope's findings, in order (`cli-0020`); `files_contain` — `{"<route>": ["<text>"]}`, each text found in the file served at that route (`cli-0022`); in a sub-case, `not_a_finding` — a code that is not among the findings of the standard-output envelope (`cli-0021`). `warnings[]` in the `links` area — the WHOLE list of warnings the Link checks report, each `{code, slug}`, in slug order (`links-0009`). In a command-line run of the `prov` area, `exit` and `findings[]` are the outcome of the run, `findings[]` being the WHOLE list of the `--json` envelope, each entry a subset of one finding; `files_unchanged` — paths the case added whose bytes the run must not change; `files_present` — paths that exist after the run; `nothing_written` — the run adds, changes and removes no file (`prov-0012`, `prov-0013`). `results[]` of `prov-0010` — each `{codes, name}`, `codes` being the whole list of codes the check reports for that trailer block. In the `export` area: `files` — the WHOLE list of files the export writes, relative to its root, in code-point order; `file_bytes` — `{"<path>": "<bytes>"}`, the whole bytes of each named file; `files_contain` — `{"<path>": ["<text>"]}`, each text found in that file; `byte_preserving` — paths whose exported bytes equal the bytes of the same path in the Bundle (`export-0001`); `lines_from_pages` — the slugs, in order, whose `pages/<slug>.jsonld` of the same build each line of the export equals with its one trailing LF removed, the file being those lines each followed by one LF and nothing else (`export-0002`). Over the files a whole build writes into `build.out` (`build-0020` to `build-0028`), where a route ending in `/` is served as its `index.html`: `routes_present[]` and `routes_absent[]` — routes that are and are not emitted; `carried_by` and `not_carried_by` — `{"<route>": ["<text>"]}`, each text found, or not found, in the bytes served at that route, which must exist; `in_no_file[]` — texts that no emitted file carries in its route or its bytes; `route_bytes` — `{"<route>": "<bytes>"}`, the whole bytes served at the route; `no_error_finding` — the build exits 0 with no error-severity finding; `routes` — the whole route set, compared exactly once the page assets are set aside, with `page_assets_required[]`, the presentation and script files the specification names, and `other_files_are_page_assets`, that every other file the build writes is a `.js` or `.css` file an emitted page loads by a script `src` or a stylesheet `href` (`build-0024`); `packs_count`, `lock_members[]`, `lock_is_sha256_of_skill_md` and `no_lock_route` — the packs of `/skills/index.json`, the member names of each `lock`, whether each lock is the SHA-256 of the bytes served at the pack's `path`, and that no other route carries a lock (`build-0026`). In a sub-case of those cases: `nothing_written` — the run adds no file anywhere in the Bundle, and `written_only_under` — every file it adds is under this folder (`build-0021`); `jcs_with_one_lf` — the file is JCS-canonical JSON followed by exactly one LF; `members[]`, `pack_members[]` — the member names of `/skills/index.json` and of each pack entry, compared as sets, with `bundle_version`, `license`, `spec_version`, `terms` and `packs[]` (each entry without its `lock`) compared by value (`build-0025`); `reservation_for_paths` — `{"<path>": <0 or 1>}`, the `tdm-reservation` of the first rule of `/.well-known/tdmrep.json` whose location pattern matches the path, and `robots_disallow_all_groups[]` — the user agents of the `robots.txt` groups that carry `Disallow: /`, in file order (`build-0027`). The tool server and the gate files: `stdio[]` — for each named `tools/call` frame (`id`), whether its envelope is an item (`ok`) or an error and with which code, and `page[]` — the same for each entry of `input.calls` on the page tools, loaded exactly as the emitted loader loads them (`cli-0023`); in a sub-case of `cli-0024`, `verdicts[]` — `gate`, `level` and `status` of each verdict object in file order, `verdict_is_array`, and `verdict_members[]` and `check_members[]`, the member names of each verdict and of each check, compared as sets; in a sub-case of `cli-0025`, `output` — the whole bytes of `dist/forge/status-checks.json`, `null` where the file is not written, `not_in_build_out` — nothing the compilation writes is under `build.out`, `idempotent` — a second run writes the same bytes, and `unchanged` — `{"<path>": "<bytes>"}`, a file of the Bundle whose bytes after the run are exactly these, so the run did not overwrite it. A boolean member is asserted at the value the case states, in either polarity; a case that states the other value fails. Codes are registered in `spec/09-conformance.md` §9.4 and are permanent.

## Rules the vectors themselves obey

- UTF-8, LF, NFC, I-JSON, members in JCS order (AGSC-09-06), with one deliberate exemption: an `input.value` object under test carries the member order that is *the subject of the case* (`jcs-0001`, `jcs-0002`), since a parser discards order and what the case proves is what the writer emits. They MAY be pretty-printed — AGSC-04-04 governs *emitted* artefacts, not vectors — while the *values* inside them (for example an `output` string) are byte-exact and MUST NOT be reformatted.
- A vector cites one rule. A rule may be proved by a vector, by a `features/` scenario or by a shipped validator; only a *required* vector that a rule names, and is then absent, fails the correspondence check (AGSC-09-90). A declared area with no vector file is an informational count, not a failure.
- The `<area-prefix>` of `import/` is `imp-`; the other areas' prefixes are the ones their files already carry.
- A member of an `expected` object states exactly what its name says and nothing wider. `mcp_extensions` in `bnd-0037` names the extension IDENTIFIERS a node advertises; the per-extension settings object of each is pinned by AGSC-11-18 and asserted by `bnd-0042` and `bnd-0036`. `file_bytes_asserted: false`, `whole_file_asserted: false` and the like say that the case deliberately pins no bytes, because no rule pins them. In `boundary`, `input.resolved[]` gives the addresses each `host` resolves to, `input.dev` says whether the invocation carries `--dev`, and `expected.results[]` gives each host's `code`, `null` when the host is allowed (`bnd-0004`, `bnd-0040`, `bnd-0041`, `bnd-0043`). `bnd-0042` and `bnd-0036` are run against the capabilities object a real tool server reports under the revision its transport speaks (AGSC-11-18), which under 2025-11-25 is the `initialize` result: the key `server/discover` of `bnd-0036` names where revision 2026-07-28 carries that object; `input.mcp_revision` of `bnd-0042` is the revision its client asks for, `input.sessions` the number of sessions it opens, each with another client, and `every_session_reports_the_same_object` asks that all of them report the same object.
- Vector ids are versioned with the spec and never reused; released vectors are immutable (AGSC-00-16). A vector that turns out to contradict its rule is never edited in place: the corrected case ships as a new file, and the old one is kept with `"level": "withdrawn"`, a `reason` and, where it has a successor, `superseded_by`. The only in-place edits AGSC-00-16 admits to a released vector are the specification-version string it carries and the re-pointing of its `rule` to the rule that absorbed a retired one.
- `note` is never read by a conformance run (AGSC-09-04): it carries no normative content, so a port may ignore it.

## Running them from a foreign port

1. **Choose a Level** — 0 (publisher), 1 (reader), 2 (writer) or 3 (full engine) (AGSC-10-01…05). The Level is the single source of the area set (AGSC-10-15): the areas a claim runs are exactly those AGSC-10-02…05 list for its Level, and no other list exists.
2. **Implement five primitives**: a failsafe-YAML reader, a JCS writer, SHA-256, Unicode NFC, and code-point sorting. Everything else in this specification is expressible on top of them.
3. **Load each file** in your own test harness — they are plain JSON, so `glob` + parse is enough. Dispatch on `area` and on the `input`/`expected` member names present.
4. **Compare bytes, not structures**, wherever `expected` carries a string (`output`, `nquads`, `stdout`). Compare RDF by graph isomorphism only where a vector says so; the canonical N-Quads form is compared byte-for-byte.
5. **For negative vectors**, assert the code, not the wording. Message text is deliberately unspecified so that ports may localise and improve it.
6. **Report** `pass`, `fail` or `skip` per `id`. A `skip` on a `required` vector counts as a failure (AGSC-09-02). An optional `conformance-report.json` may be published as `{impl, version, spec_version, class, results[], summary}`.

What a conformance claim states is listed once, in AGSC-09-01: among it the Level, the full `spec_version`, the areas run and the cases passed. No claim of RDFC-1.0 may be made from the `graph/` vectors: `graph.nq` is this specification's own canonical form, which holds the same quads as RDFC-1.0 output for a blank-node-free dataset but writes four kinds of term differently (AGSC-04-16).

## Present coverage

**The totals are derived, never typed here** — `node tools/count-artifacts --json` reports `vectors_total`, `vectors_required`, `vectors_optional` and `vectors_withdrawn` for the tree as it stands, and that command is the only statement of them this repository makes. A withdrawn vector stays in the set, so `vectors_withdrawn` counts every case withdrawn so far.

**Coverage status:** derived, never typed — `node tools/count-artifacts --json` reports `rules`, `rules_with_vector` and `rules_without_vector` for `spec/00`–`spec/11`. `nquads` expectations follow AGSC-05-31 (plain literals carry `^^xsd:string` in N-Quads); `severity` is `warn`, never `warning` (AGSC-09-11); a vector carrying `requires_surface` is skipped-as-passed by a node that declares none of the named surfaces (AGSC-09-04).

## Porting notes

- **Slug regex.** No pattern in `schema/*.json` uses a lookahead, a `\u` escape or any other construct outside the RE2 / Go `regexp` / Rust `regex` / PCRE2 common subset (NUL is written `\x00`). The `slug` grammar is `^[a-z0-9]+(?:-[a-z0-9]+)*$` with `minLength: 1` and `maxLength: 64` counted in Unicode code points (AGSC-01-10, AGSC-02-24): a leading, trailing or doubled hyphen is impossible by construction, so no separate `not contains "--"` check is needed. `slug-0006` proves the grammar; a lookahead form such as `(?!.*--)` MUST NOT be introduced.
- **Ordering primitives.** JSON member names (search tokens included) sort by UTF-16 code units; file paths and N-Quads sort by code point, with `/` as the path separator on every platform. A port that reuses one comparator for both will diverge on astral-plane input.

## Member index

Every member a case uses, by area: the members of its `input` and `expected` objects and of the entries of their `cases[]` arrays. The shared members are described in "Input shapes" and "Expected shapes" above. Every other member is particular to the cases that use it, and it states exactly what its name says (see "Rules the vectors themselves obey"): read it together with the `description` of the case that carries it, which derives its value from the rule the case cites. `tests/conformance/vectors-readme.test.js` fails when a case uses a member that this index does not name, so a new member is added here with its case.

### `adopt`

- **input:** `after_init`, `config`, `directory`, `files`, `git_user_email`, `markdown`, `verbs`
- **expected:** `assets_copied`, `body`, `body_bytes_unchanged`, `errors`, `exit`, `files`, `findings`, `frontmatter`, `idempotent`, `init_findings`, `init_not_reported`, `no_errors`, `output`, `path`, `valid`, `withdrawn`

### `boards`

- **input:** `SOURCE_DATE_EPOCH`, `bundle`, `items`, `site`
- **expected:** `board_done_done`, `board_oct_tasks`, `board_open_done`, `claimed_by_present`, `index`, `no_tasks_emits_nothing`

### `boundary`

- **input:** `access`, `agsc-access`, `agsc-contribute-mode`, `agsc-surface`, `agsc-visibility`, `artefacts`, `attempt_direct_copy`, `base`, `boards`, `cases`, `channels`, `client_supports`, `config`, `contribute`, `declared`, `dev`, `dumps`, `emitted`, `emitted_undeclared`, `federation`, `generated_at`, `graph`, `invalid_config`, `items`, `ledger_head`, `level`, `local_hits`, `mcp_revision`, `mcp_served`, `nodes`, `observed`, `paths`, `peer`, `peer_hits`, `peers`, `pinning_vectors`, `resolved`, `resolves`, `responder_declared`, `responses`, `routes`, `sessions`, `site`, `static_boards_present`, `static_served`, `surfaces`, `unreachable`, `visibility`, `webmcp_report_date`
- **input `cases[]` entries:** `name`, `peer`, `redirects`, `resolved`
- **expected:** `accepted`, `access_read_as`, `additional_member_is`, `address_guard_unconditional`, `affects`, `agsc-visibility`, `alternate_is_same_node`, `anchor_attributes`, `boards_kept`, `both_resolve`, `bytes_checked_by_validator`, `cases`, `client_union_quads`, `closure_edges_added`, `code`, `compose_selection_of_old`, `contribute_read_as`, `copy_path`, `declaration_accepted`, `digest_targets`, `direct_copy_refused`, `effective`, `emitted`, `error`, `every_session_reports_the_same_object`, `expanded_blocked_by`, `extensions`, `fetch_attempts_for_b`, `fetches_during_build`, `findings`, `forbidden_headers`, `graph_has`, `headers`, `ignored_by_fan_out`, `immutable_emitted`, `in_chunks`, `in_llms`, `in_search`, `invalid_config_error`, `ledger_link`, `links`, `links_without_digest`, `mcp`, `mcp_extensions`, `mcp_version_echoes_input`, `mcp_version_pattern`, `mutual`, `not_descended_by_hop_limit`, `nquads`, `page_kept`, `partial`, `peer_base_derived_from`, `peer_links`, `preserved_keys`, `profile_recognised`, `propose_uses`, `reader_consumes`, `reencoded`, `related`, `renamed`, `requests`, `results`, `same_result_without_header_access`, `served_at_1_0`, `server_side_query_endpoint`, `settings_members`, `skipped`, `surface_read_as`, `tasks_kept`, `tombstoned`, `unknown_link_ignored`, `visibility_read_as`, `visited`, `walk_descends_into_b`, `webmcp`, `webmcp_annotations`, `webmcp_version_echoes_input`, `webmcp_version_pattern`, `wellknown_public`, `wellknown_wildcard`, `wildcard_allowed`, `withdrawn`
- **expected `cases[]` entries:** `declared_peer_unchanged`, `error`, `followed`, `name`

### `build`

- **input:** `add_files`, `base`, `build_instant`, `bundle`, `cases`, `deployment_profile`, `files`, `generated_at`, `git_history`, `items`, `nquads`, `routes`
- **input `cases[]` entries:** `add_files`, `authored`, `bundle_hash`, `bundle_version`, `environment`, `generated_at`, `git_log`, `instant`, `legal`, `name`, `source_date_epoch`, `spec_version`
- **expected:** `byte_identical`, `carried_by`, `cases`, `codes_absent`, `content_security_policy`, `every_text_file_ends_with_exactly_one_lf`, `file_bytes_asserted`, `files_contain`, `header_fallback_admitted`, `headers`, `html_pages_end_with`, `in_no_file`, `includes_routes`, `index`, `lock_is_sha256_of_skill_md`, `lock_members`, `no_byte_order_mark`, `no_error_finding`, `no_lock_route`, `not_carried_by`, `object_files`, `other_files_are_page_assets`, `output`, `packs_count`, `page_assets_required`, `route_bytes`, `routes`, `routes_absent`, `routes_present`, `search`, `shards`, `stale`, `withdrawn`, `wrong_if_code_point_sorted`
- **expected `cases[]` entries:** `bundle_version`, `codes_absent`, `contains`, `exit`, `exit_one_of`, `findings`, `jcs_with_one_lf`, `ledger_kind_of_built_commit`, `license`, `members`, `name`, `nothing_written`, `pack_members`, `packs`, `reservation_for_paths`, `robots_disallow_all_groups`, `routes_absent`, `spec_version`, `terms`, `text`, `written_only_under`

### `bundle`

- **input:** `add_files`, `bundle`, `cases`, `config`, `markdown`
- **input `cases[]` entries:** `config`, `name`
- **expected:** `accepted`, `build`, `cases`, `error`, `findings`, `lint`, `preserved`
- **expected `cases[]` entries:** `accepted`, `exit`, `findings`, `name`, `preserved`

### `chunks`

- **input:** `attachment_bytes`, `bundle_version`, `chunks`, `item_count`, `item_template`, `items`, `site`, `slugs_are`
- **expected:** `attachment_chunk`, `byte_lengths`, `chunks`, `citation_anchor_for_line_1`, `cluster_chunk_text`, `ends_with_single_lf`, `first_slug_in_shard_02`, `heading_repeated`, `items_absent`, `items_present`, `last_slug_in_shard_01`, `lexical_order_is_wrong`, `line_count`, `lines`, `manifest`, `ordinals`, `output`, `overlap`, `sections`, `shard_line_counts`, `vendor_member_permitted`

### `cli`

- **input:** `add_files`, `argv`, `base`, `bundle`, `calls`, `cases`, `config`, `env_file`, `environment`, `frames`, `git_history`, `items`, `reference`, `remove_config_keys`, `tool`, `tools_list_id`, `transports`
- **input `cases[]` entries:** `add_files`, `argv`, `environment`, `name`
- **expected:** `body_is_text`, `cases`, `citations_is_top_level_member`, `envelope_members`, `error`, `exit`, `files_contain`, `finding_members`, `findings`, `findings_in_order`, `ignored`, `jsonrpc_error`, `manifests_identical`, `ordered_by`, `overrides_in_effect`, `page`, `resolved`, `responses`, `results`, `results_byte_identical`, `stderr_lines_match_findings`, `stdio`, `stdout`, `stdout_must_not_contain`, `tools`, `transports_byte_identical`, `values_equal_for_published`, `webmcp_write_tools_local_only`, `withdrawn`, `without_model_context`
- **expected `cases[]` entries:** `body`, `check_members`, `codes_absent`, `envelope`, `equals_reference`, `error`, `error_codes_allowed`, `error_count`, `exit`, `exit_one_of`, `findings`, `idempotent`, `jcs_with_one_lf`, `name`, `not_a_finding`, `not_in_build_out`, `output`, `registry_accepts`, `stderr_codes`, `stdout`, `type`, `unchanged`, `verdict_is_array`, `verdict_members`, `verdicts`

### `compose`

- **input:** `archive_name_stem`, `bundle_version`, `bundle_version_outside_the_grammar`, `files`, `instant`, `items`, `selection`
- **expected:** `added`, `archive_name`, `archive_name_when_version_is_outside_the_grammar`, `base64`, `block_rendered_as_prose`, `central_directory_at`, `central_directory_bytes`, `dsl_relationships`, `entries`, `entry_order`, `exit`, `extracted_selection`, `fields`, `findings`, `harness_dir`, `harness_emitted`, `rendered_as_prose`, `same_verdict_as_explicit`, `selection`, `selection_digest`, `selection_read`, `sha256`, `total_bytes`, `valid`, `verdict`, `verdict_steps_1_to_4_unchanged`, `violations`, `warnings_added`, `wiring`, `wrong_path_if_depth_first_or_per_item_union`, `wrong_path_if_least_slug_sequence`

### `conform`

- **input:** `claim`, `divergences`
- **expected:** `accepted`, `areas`, `claim_complete`, `divergence_verdicts`, `reason`, `rejected`, `route_form`, `second_list_consulted`, `source`

### `discovery`

- **input:** `base`, `build_instant`, `bundle`, `bundle_version`, `cases`, `clusters`, `generated_at`, `items`, `ledger_head`, `level`, `listed_clusters`, `nodes`, `published_routes`, `site`, `spec_version`, `wellknown`
- **input `cases[]` entries:** `access`, `base`, `bundle_version`, `contribute`, `counts`, `document`, `files`, `generated_at`, `ledger_head`, `level`, `name`, `peers`, `reader_version`, `routes`, `spec_version`, `successor`, `surfaces`, `tdm_crawlers`, `tdm_reservation`, `visibility`, `wellknown`
- **expected:** `anchor_link_attributes`, `attribute_values_are_arrays`, `attributes_omitted`, `both_appears_once_under`, `both_resolve`, `bundle_hash_equals_graph_nq_link_digest`, `bundle_hash_equals_sha256_of_graph_nq`, `bundle_hash_values`, `cases`, `draft_excluded`, `each_names_the_other`, `jsonld_types_closed_set`, `lastmod`, `lastmod_is_build_instant`, `ledger_link_attributes`, `level`, `llms_full_reachability_identical`, `llms_full_txt`, `llms_txt`, `media_type`, `mutual`, `not_published`, `now_md_shows_the_same_hex`, `output`, `path`, `peer_relation`, `profile`, `reachable`, `relations_allowed`, `relations_forbidden`, `sections`, `top_level_members`, `unreachable`, `urls`, `valid`, `xml_bytes_asserted`
- **expected `cases[]` entries:** `attributes_omitted`, `bundle_version`, `describedby_attribute_order`, `document`, `file_bytes_asserted`, `findings`, `groups`, `name`, `presence_would_be`, `valid`

### `export`

- **input:** `add_files`, `bundle`, `flags`
- **expected:** `byte_preserving`, `exit`, `file_bytes`, `files`, `files_contain`, `lines_from_pages`

### `frontmatter`

- **input:** `config`, `files`, `foreign_board_state`, `frontmatter`, `items`, `markdown`, `own_items`
- **expected:** `error`, `errors`, `findings`, `foreign_read_as`, `frontmatter`, `idempotent`, `line`, `output`, `path`, `preserved`, `results`, `valid`, `warnings`

### `graph`

- **input:** `attachment_bytes`, `base`, `bundle`, `bundle_id`, `context_url`, `external_properties`, `external_properties_used`, `item`, `items`, `lang_literal`, `literal`, `markdown`, `ontology_terms`, `site`, `typed_literal`, `value`
- **expected:** `blank_nodes`, `contains`, `context`, `emitted_as_rdf_subject`, `excludes`, `forbidden`, `forbidden_forms`, `foreign_bundle`, `graph_blank_nodes`, `graph_jsonld`, `graph_never_contains`, `inverse_materialised`, `lint`, `mentions_lines`, `never_reported`, `nquads`, `nquads_lang`, `nquads_literal`, `nquads_typed`, `per_item`, `prefix_block_is_constant`, `resolved`, `roundtrip_byte_identical`, `term_names`, `turtle`, `turtle_literal_has_explicit_xsd_string`, `turtle_never_contains`, `verdict_digest_exported`, `whole_file_asserted`, `withdrawn`

### `import`

- **input:** `cases`, `frontmatter`, `path`
- **input `cases[]` entries:** `allow_newer`, `existing`, `incoming`, `name`, `source`, `tool_spec_version`
- **expected:** `cases`, `error_count`, `findings`, `frontmatter_has`, `keys_absent`
- **expected `cases[]` entries:** `dry_run_reports_the_same`, `exit`, `findings`, `name`, `prov`, `prov_members_absent`, `unchanged`, `written`

### `jcs`

- **input:** `value`
- **expected:** `order`, `output`, `wrong_if_sorted_before_nfc`, `wrong_order_if_sorted_by_code_point`

### `ledger`

- **input:** `commits`, `content_tree`, `git_log`, `ledger`, `published`, `side_branch`, `version`, `wellknown`
- **expected:** `error`, `git_log`, `head`, `ledger`, `line`, `side_branch_excluded`

### `links`

- **input:** `items`, `markdown`
- **expected:** `anchors`, `chain`, `cycle`, `edges`, `error`, `errors`, `parents`, `resolved`, `skipped_external`, `unresolved`, `warnings`

### `lint`

- **input:** `add_files`, `add_links`, `add_sized_files`, `attachment_bytes`, `bundle`, `bytes`, `cases`, `check`, `config`, `file`, `files`, `files_present`, `items`, `markdown`, `paths`, `strings`, `svgs`
- **input `cases[]` entries:** `frontmatter`, `name`, `path`, `tags`
- **expected:** `cases`, `clean`, `error`, `findings`, `idempotent`, `lint`, `matched`, `output`, `severity`, `twice`
- **expected `cases[]` entries:** `code`, `error`, `exit`, `findings`, `idempotent`, `name`, `no_finding_for`, `output`, `status`, `valid`

### `prov`

- **input:** `add_files`, `argv`, `board`, `bundle`, `config`, `git_log`, `proposal`, `proposals`, `trailers`
- **expected:** `accepted`, `error`, `exit`, `files_present`, `files_unchanged`, `findings`, `lint`, `nothing_written`, `results`

### `slug`

- **input:** `candidates`, `paths`, `slug`, `slugs`, `texts`
- **expected:** `engine_features_used`, `error`, `invalid`, `lookahead`, `pattern`, `slugs`, `valid`
