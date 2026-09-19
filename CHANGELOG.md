# Changelog

All notable changes to the AgenticSystemCore engine. The specification, schemas,
ontology and conformance vectors have their own version (`spec_version`) and are not
covered here; this file records the reference implementation.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — the session-28 deep engine audit (V9-D)

- `src/knowledge/yaml.js` — duplicate keys (`AGSC-E106`, AGSC-02-02) are detected
  in this module with one key set per mapping instead of by the `yaml` package's
  `uniqueKeys` option, which compares every new key against every key already in
  the mapping. AGSC-01-16 admits a 1 MiB frontmatter block, so a single item could
  hold the build for minutes: 20 000 distinct keys took 6.9 s and now takes 0.6 s;
  60 000 keys (817 KB, inside the cap) took about 60 s and now takes 1.7 s. The
  reported code, line, column and message are unchanged (V9D-C1).
- `src/knowledge/markdown.js` — `assignAnchors` remembers the highest suffix it
  has consumed per base, so a body of repeated headings no longer rescans `-2`,
  `-3`, … from the start for each one: 10 000 identical headings took 8.3 s and
  now takes 0.16 s. The emitted anchors are byte-identical to the unmemoised
  search, proven against it over 4 000 generated heading lists (AGSC-03-13,
  V9D-C2).
- `src/boundary/federation.js` — three hostile-input holes in `walk`, the
  anti-corruption layer around the only bytes a stranger chooses: an injected
  fetch that THROWS is now that peer's `AGSC-E907` rather than an exception that
  escapes the context (AGSC-11-10(e)); a `peers` member that is not an array
  carries no links instead of being iterated character by character
  (AGSC-11-10(b)); and the links beyond `fan_out` are recorded with a loop
  instead of `push(...rest)`, which overflowed the call stack on a peer list a
  1 MiB discovery document can hold (V9D-C3/C4/C5).
- `src/application/cli/main.js` — a missing or unknown verb stays `AGSC-E001` and
  exit 2 (AGSC-09-07, AGSC-09-08), but the message no longer reads
  `unknown verb null`, and outside `--json` the shell prints the sixteen verbs and
  the five global flags on stderr, so `agsc` with no arguments answers with a way
  forward. Under `--json` stderr keeps one finding object per line (AGSC-09-10,
  V9D-F1).
- `src/application/cli/verbs/compose.js` — each composition conflict now carries
  its own rule and a sentence a person can act on. Every conflict used to be
  printed as "composition conflict on `<key>`: `<a>` / `<b>` (AGSC-07-06)",
  which cited the wrong rule for three of the four kinds — an absent or retired
  slug is AGSC-07-03 and a superseded hard dependency is AGSC-07-05a, whose
  message form ("required item superseded — select `<superseding>`") the engine
  did not use — and read as though an item were in conflict with itself
  (V9D-F2).

### Changed — the session-28 deep engine audit (V9-D)

- `src/README.md` §11.2 said the two opt-in verbs print their usage-error finding
  on stdout; they print it on stderr, where AGSC-09-10 puts every diagnostic.
  Corrected, and the new usage block documented.

### Fixed — the eleven defects of the session-27 adversarial read (FIX-F27)

- `src/adapters/node-fs.js` — the symlink realpath containment check runs in the
  shared `abs()` helper, so `writeFile`, `mkdirp`, `remove`, `stat`, `readdir`,
  `walk` and `exists` refuse a planted directory symlink with `AGSC-E902`
  instead of only `readFile` doing so (F27-01, AGSC-01-16, AGSC-01-35).
- `src/distribution/mcp-tools.js` — `propose` serialises frontmatter through
  `knowledge/adopt.js#serialize`; the local YAML writer, which emitted
  unparseable bytes for a title containing `: `, is deleted (F27-03, D94,
  AGSC-09-16).
- `src/boundary/federation.js` — `walk` applies AGSC-11-07's scheme rule and
  AGSC-11-08's address rule to every peer value that parses as an absolute URL
  before it is fetched; a refused peer is `AGSC-E905` in `skipped` (F27-04).
- `src/boundary/federation.js` — `checkAddresses` fails closed: an empty or
  absent address list is `AGSC-E905`, not a pass (F27-05, AGSC-11-08).
- `src/application/cli/main.js` — a thrown error carrying a code registered in
  spec/09 §9.4 becomes a Finding in the AGSC-09-11 envelope with the correct
  exit code; `AGSC-E902`, `AGSC-E903` and `AGSC-E904` were previously
  unreachable through the CLI (F27-07, AGSC-09-10, AGSC-09-11).
- `src/distribution/site.js` — AGSC-06-19's Schema.org JSON-LD is emitted on item
  and index pages (`DefinedTerm`, `TechArticle`, `Dataset`), JCS-canonical, with
  `<` escaped so no title can close the script element (F27-08, AGSC-06-05).
- `src/knowledge/frontmatter.js` — all four byte obligations of AGSC-01-14 are
  checked, not two: non-NFC content and a missing or doubled trailing LF are
  reported as `AGSC-E108` (F27-09).
- `src/distribution/mcp-tools.js` — `call` enforces the manifest's
  `inputSchema.required` and returns the AGSC-09-13a error envelope with
  `AGSC-E003` (F27-10).
- `src/boundary/*`, `src/governance/agents.js`, `src/composition/architecture.js`
  and `src/application/bundle.js` — every Finding carries a non-empty `message`
  (F27-11, AGSC-09-11, R64).
- `src/distribution/mcp-tools.js` — the text arguments of the seven tools are
  capped at AGSC-01-16's 1 MiB in UTF-8 bytes and refused with `AGSC-E904`
  before dispatch (F27-12).
- `src/shared/ordering.js` (new) — the shared kernel that holds the AGSC-04-05
  and AGSC-04-12 comparators, removing the `adapters -> knowledge` require edge;
  `knowledge/unicode.js` re-exports both, so no caller changed (F27-13).
- `tests/arch/context-boundaries.test.js` — tightened: an adapter may require no
  bounded context, and the shared kernel may require nothing (F27-13).
- `tests/arch/finding-messages.test.js` (new) — a source-level sweep that fails
  if any module raises a Finding with an empty message (F27-11).


### Added — integration: the sixteen verbs, wired (WP-10-G)

- `src/application/cli/verbs/*.js` — every verb of AGSC-09-07 answers: `init`,
  `lint`, `build`, `verify`, `ci`, `compose`, `propose`, `review`, `refresh`,
  `mcp` and `conform` are wired to their modules; `export`, `import`, `skills`,
  `run` and `trace` return the AGSC-09-11 envelope with exit 1 and one finding
  that names the rule they will implement. The interim `AGSC-PENDING` marker is
  gone from the engine.
- `src/application/bundle.js` — the Bundle loader, moved out of Distribution and
  settled on the port-bag convention `loadBundle(ports, {schemas})`.
- `src/application/conformance.js` — AGSC-09-02/04/05 and AGSC-10-15 in one
  place, called by both `agsc conform` and `tests/conformance/vector-runner.test.js`.
- `src/interchange/README.md` — the reserved Interchange context (WP-12).
- `src/distribution/site.js` — AGSC-06-21 pagination above 500 entries, the `/`,
  `/tags/<tag>/` and `/search/` index routes, `/pages/<slug>.jsonld`
  (AGSC-06-02), and `UNPRODUCED_ROUTES`, which names every AGSC-06-01 route that
  has no producer in the build's `skipped`.
- `tests/application/cli/verbs-sixteen.test.js`, `tests/application/cli/verbs-wired.test.js`,
  `tests/arch/headers-unified.test.js`, `tests/distribution/pagination.test.js`.
- `diff@9.0.0` (BSD-3-Clause, no dependencies) — the unified diff `propose`
  writes for AGSC-08-04.

### Changed — integration (WP-10-G)

- `src/distribution/headers.js` now CALLS `src/boundary/visibility.js` for
  AGSC-11-03 and AGSC-11-05 instead of restating them; byte equality is a test.
- `src/boundary/visibility.js` emits AGSC-11-04's `Link: …; rel="profile"`
  header on the discovery document, which was missing.
- `src/application/cli/main.js` treats `mcp` as a STREAMING verb (AGSC-09-13):
  no diagnostic line and no envelope on stdout. F's interim stream monkey-patch
  in `mcp-stdio.js` is deleted, and the Surface now takes an injected Bundle.
- `src/application/config/load.js` reports AGSC-11-01's ranges as `AGSC-E209`
  over the resolved configuration, with the Boundary check injected;
  `AGSC_FEATURE_LLM_REVIEW` is an environment feature flag (AGSC-08-27), not an
  unknown configuration key.
- `src/knowledge/links.js` — a `clusters[]` entry counts as an inbound reference
  to its cluster (AGSC-03-10), and a body reference resolves with or without the
  `.md` extension (AGSC-03-11).
- `src/governance/agents.js` — a change-free Proposal still has its top-level
  `task` checked (AGSC-08-28(c)), so a dry run naming an undeclared task is
  `AGSC-E509`.
- `src/adapters/node-proc.js` — a child's stderr is captured, never inherited
  (AGSC-09-10).
- `package.json` — `scripts.test` is `node --test 'tests/**/*.test.js'`, the
  form that works on Node 22 and Node 24.
- `tests/conformance/pending.json` is empty.

### Added — composition, the node boundary and the two tool transports (WP-10-F)

- `src/composition/compose.js` — the five steps of AGSC-07-04…07-08 in the
  normative order, the AGSC-07-09 verdict with every ordering by code point, the
  AGSC-07-23 wiring, and AGSC-11-22's "a retired item may not be selected".
- `src/composition/architecture.js` — AGSC-02-97 and AGSC-07-24: the one
  `yaml agsc-selection` block of a `kind: architecture` concept, `compose --from`,
  and the AGSC-E805 stale-digest warning.
- `src/composition/harness.js` — AGSC-07-17 and the two AGSC-07-23 renderings;
  the seven files of AGSC-07-12 are deliberately not written yet.
- `src/composition/conform.js` — AGSC-09-01…09-03, AGSC-04-22 and AGSC-04-24 with
  AGSC-10-15 as the single source of a Level's area set.
- `src/boundary/surfaces.js` — AGSC-11-16…11-19 and AGSC-11-21; the one place the
  engine names an external protocol version (anti-corruption layer).
- `src/boundary/visibility.js` — AGSC-11-01…11-05, AGSC-11-20 and AGSC-11-22.
- `src/boundary/federation.js` — AGSC-11-06…11-15, AGSC-11-23, AGSC-10-12 and
  AGSC-06-35; every fetch is injected and address classification is
  `node:net.BlockList`, never a hand-parsed literal.
- `src/distribution/mcp-tools.js` — the seven tools of AGSC-09-13 over one
  AGSC-08-18 envelope, with AGSC-09-13a, AGSC-09-14a and AGSC-09-14b.
- `src/distribution/mcp-stdio.js` — AGSC-09-13 over stdio JSON-RPC on
  `@modelcontextprotocol/sdk@1.30.0`, advertising the AGSC-11-18 extension id.
- `src/distribution/webmcp.js` — AGSC-09-16: the feature-detected browser
  registration of the same manifest, write tools local-only.
- `src/distribution/bundle.js` — an interim loaded-Bundle record for the tool
  surfaces; belongs in the application layer.
- `tests/conformance/areas/{compose,conform,boundary}.js` and the `cli-0003`/
  `cli-0004` handlers appended to `areas/cli.js`.
- `tests/{composition,boundary,distribution}/*.test.js` and
  `tests/arch/surface-arrows.test.js`.

### Added — reader core (M1)

- `src/knowledge/unicode.js` — NFC, code-point length, the two orderings of
  AGSC-04-05 and AGSC-04-12, the AGSC-04-23 combining bound.
- `src/knowledge/yaml.js` — the AGSC-02-02…04 failsafe subset over the `yaml`
  library, with every rejection carrying its registered code, line and column.
- `src/knowledge/frontmatter.js` — AGSC-02-01 block splitting, the AGSC-01-14
  encoding checks, the AGSC-01-16 size cap and the parsed Item record.
- `src/knowledge/schema.js` — JSON Schema 2020-12 validation over `ajv/dist/2020`
  and `ajv-formats`, with the `oneOf` discrimination §9.4's code precedence needs.
- `src/knowledge/validate.js` — item, Bundle-root, configuration and placement
  validation; AGSC-02-03 type application; AGSC-02-05/05a key classification; the
  §9.4 code-precedence mapping in one place.
- `src/knowledge/slug.js` — the AGSC-01-10 grammar, AGSC-01-11 uniqueness, the
  AGSC-02-91 slugifier and AGSC-01-23 collision suffixes.
- `src/knowledge/jcs.js` — RFC 8785 over `json-canonicalize`, NFC before
  canonicalisation per AGSC-04-21, plus the I-JSON admissibility check.
- `src/knowledge/adopt.js` — AGSC-02-90…93 adoption: total, idempotent and
  byte-preserving, warnings only.
- `src/ports/{filesystem,clock,process-runner,network}.js` — JSDoc interfaces.
- `src/adapters/{node-fs,node-clock,node-proc,node-network-refusing}.js` — the Node
  implementations, including `readSchemas`, the one door the schemas enter by.
- `src/README.md` — the context map, the module map, the derived JSON Schema keyword
  list, how to run the vectors and how a foreign port uses the fixture.
- `tests/conformance/vector-runner.test.js`, `tests/conformance/areas/{frontmatter,slug,jcs,adopt,bundle}.js`
  and `tests/conformance/pending.json` — the conformance runner of AGSC-09-02.
- `tests/fixtures/minimal/` — the smallest conforming Bundle.
- `tests/arch/{core-purity,context-boundaries,pinned-dependencies}.test.js` — the
  architecture fitness functions.
- `tools/validate-vectors` — the vector-format validator of AGSC-09-90, independent
  of `src/` by construction.

### Added — links, the Markdown subset, the lints and the provenance gates (M2 + M3)

- `src/knowledge/markdown.js` — the deterministic Markdown-subset renderer over
  `markdown-it@15.0.2` (AGSC-02-20, GFM tables), the AGSC-03-13 heading-anchor
  algorithm (ours: no library implements it), the preserved fenced info strings of
  AGSC-02-22 and the inline-link inventory AGSC-03-11 resolves.
- `src/knowledge/links.js` — AGSC-03: the fourteen Link keys, computed inverses,
  the two acyclicity checks, the cluster mono-parent and depth bounds, orphans,
  and the body-reference resolution of AGSC-03-11 under the AGSC-01-35 grammar.
- `src/governance/injection.js` — `injection-scan` (AGSC-08-13): agent-directed
  imperatives as literal alternations, hidden text, long blobs, non-http schemes.
- `src/governance/secrets.js` — `no-secrets` (AGSC-08-15) and the tracked `.env`
  of AGSC-01-37; a Finding never carries the value it found.
- `src/governance/pii.js` — `no-pii` (AGSC-08-16), with `prov` and `sources[]`
  exempted structurally rather than by heuristics.
- `src/governance/cleanroom.js` — `clean-room` (AGSC-08-17).
- `src/governance/lint.js` — the lint aggregate: the four N9 lints plus
  AGSC-01-34/01-35/02-21/02-22/02-23/02-96/02-98/04-23, sorted per AGSC-09-10;
  every file fact is injected, so the same records always lint the same way.
  The SVG allow-list parses with `fast-xml-parser@5.11.1`.
- `src/governance/finding.js` — the one place a Governance Finding adds a member
  (`path`, `port`, `agent`, `held`, `max_claims`, `task`, `operator`).
- `src/governance/prov.js` — AGSC-08-01…08-09: `prov` derivation with the
  AGSC-10-02 Level-0 inheritance, the DCO-Plus trailer grammar of AGSC-08-06/07,
  the Gate `level` → `checks[]` compilation, and the claim-and-progress limit of
  AGSC-10-17 (`AGSC-E511`), which calls `governance/agents.js` rather than
  repeating its AGSC-E509 checks.
- `tests/conformance/areas/{links,lint}.js`; `frontmatter-0030`/`frontmatter-0031`
  and `prov-0003` handlers appended to the existing area files.
- `tests/knowledge/{links,markdown}.test.js` and
  `tests/governance/{lint-order,secrets,injection,pii,cleanroom,prov}.test.js`.
- Runtime dependencies `markdown-it@15.0.2` and `fast-xml-parser@5.11.1`, pinned
  exactly; `npm audit` stays at 0 vulnerabilities.

### Added — the graph exports (M5)

- `src/knowledge/nquads.js` — the RDF dataset of a Bundle and its canonical N-Quads
  form: the IRIs of AGSC-05-01…03, the class map of AGSC-05-12, the Source, Review
  and Attachment fragment IRIs of AGSC-05-14/15/29 with their reachability edges,
  the fourteen Link keys and their computed inverses (AGSC-05-16), the
  frontmatter → property table of AGSC-05-26/05-30, the three literal forms of
  AGSC-05-31, the escaping of AGSC-05-32, the sort that IS the canonicalisation
  (AGSC-04-13/15/16) and the optional static fragments of AGSC-06-33.
- `src/knowledge/skos.js` — the SKOS integrity rules: the class map, who is in the
  scheme, cluster membership and cluster nesting as `skos:member` (AGSC-05-18/19),
  and the bar on a Collection in any semantic relation (AGSC-05-20).
- `src/knowledge/turtle.js` — the stable-Turtle profile of AGSC-05-10 (written by
  hand: the profile is pinned byte for byte and matches no library's layout), the
  vocabulary reader that feeds the context file, and the blank-node rule of
  AGSC-05-08 (`AGSC-E605`) checked by a real parse.
- `src/knowledge/jsonld.js` — `graph.jsonld` (AGSC-05-09) built from the same quads
  as `graph.nq`, `/ns/context.jsonld` generated from the vocabulary (AGSC-06-32),
  and the `memory://` alias of AGSC-05-04b with its `AGSC-E309`.
- `src/knowledge/rdfxml.js` — the RDF/XML view. RESERVED at 1.x (AGSC-05-06);
  hand-written because no maintained RDF/JS → RDF/XML serializer exists, and
  checked by re-parsing its own output with `fast-xml-parser`.
- `tests/conformance/areas/graph.js` and `tests/conformance/areas/build.js`
  (created for `build-0010`, with an extension point for the search cases).
- `tests/knowledge/{nquads,turtle,jsonld,jsonld-roundtrip,skos,rdfxml-iso}.test.js`
  and `tests/ontology/property-coverage.test.js`, which holds the ontology and the
  exports to each other in both directions (AGSC-05-28).
- Runtime dependency `n3@2.7.12` (RDF parsing) and development dependency
  `jsonld@9.0.0` (the reference processor, used only to prove the AGSC-06-32 round
  trip and the AGSC-05-06 isomorphism); `npm audit` stays at 0 vulnerabilities.

### Added — the build pipeline and the published surfaces (M4 + M6)

- `src/knowledge/chunks.js` — the agent-retrieval chunk export of AGSC-06-26…31:
  the two cuts, the AGSC-06-28 identifier, the fifteen-member record, the
  exclusions, the attachment and cluster chunks, the shards and the manifest. The
  CommonMark parse and the AGSC-03-13 anchors are `knowledge/markdown.js`'s.
- `src/distribution/search.js` — the AGSC-06-23 tokenizer (normative) and the
  AGSC-06-16 index, with the AGSC-06-21 shard rule.
- `src/distribution/llms.js` — the byte layout of `/llms.txt` and `/llms-full.txt`
  (AGSC-06-13a), a profile of llms.txt v2.
- `src/distribution/discovery.js` — the RFC 9264 link set of AGSC-06-07…12 and
  AGSC-06-35, its Level-0 form, its validator, and the AGSC-10-12 mutual peer check.
- `src/distribution/headers.js` — the `_headers` and `_redirects` of AGSC-06-04/17,
  the CORS set of AGSC-11-03 and the `ETag`/`Cache-Control` rules of AGSC-11-05.
- `src/distribution/now.js` — the AGSC-06-22 NOW state and the AGSC-08-25 monthly
  spend rollup, which is also the meter of the AGSC-01-38 cap.
- `src/distribution/html.js` — the page templates: the `describedby` head link
  (AGSC-06-25), the Content Use Terms line (AGSC-06-18), the machine-view links
  (AGSC-06-02) and the `/about/` Quickstart generated from the verb set (AGSC-06-24).
- `src/distribution/site.js` — `build`, `write` and `verify`: the deterministic file
  map of AGSC-06-01, built twice and compared byte for byte (AGSC-04-02).
- `src/distribution/init.js` — the adoption use case of AGSC-02-94/95 over
  `knowledge/adopt.js`, with the `AGSC-E507` warnings, the asset copies and the
  AGSC-01-37 `.gitignore` / `.env.example`.
- `src/distribution/ci.js` — lint → build → verify with the exit codes of AGSC-09-08.
- `src/governance/ledger.js` — the derived ledger of AGSC-08-20…24: the derivation,
  the production of the git-log file, the hash chain and the truncated-tail check.
  The AGSC-04-10 instant is computed from an integer, with no `Date` and no clock.
- `src/governance/boards.js` — the board exports of AGSC-10-13 with the derived
  `done` and `claimed_by`, and the AGSC-10-17 work-in-progress limit.
- `tests/conformance/areas/{discovery,chunks,boards,ledger}.js`, the search cases in
  the extension point of `areas/build.js`, and `areas/_init-verbs.js` for the
  `init` → `ci` cases of `areas/adopt.js`.
- `tests/distribution/{build-golden,routes,llms,search-index,headers,now-spend,html,init}.test.js`
  and `tests/governance/{ledger,boards}.test.js`, `tests/knowledge/chunks.test.js`.

### Changed

- Runtime dependencies are now permitted, pinned exactly: `yaml@2.9.1`,
  `ajv@8.20.0`, `ajv-formats@3.0.1`, `json-canonicalize@3.0.1`, and
  `fast-check@4.10.1` as a development dependency (owner directive 2026-09-18,
  superseding the earlier zero-dependency rule).
