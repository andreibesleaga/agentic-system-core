# Changelog

All notable changes to the AgenticSystemCore engine. The specification, schemas,
ontology and conformance vectors have their own version (`spec_version`) and are not
covered here; this file records the reference implementation.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — the build instant really comes from the last commit (2026-09-21, session close)

- With no `SOURCE_DATE_EPOCH`, AGSC-04-09 makes the build instant the time of the last commit and only falls to 0 where no git history exists. `createClock` accepted that value and `node-proc.js` named the git read as its one caller, but nothing performed the read, so the real command defaulted to 0 inside every repository. Every gate had run with the variable set, so no test noticed; once the writer refused to derive a `security.txt` expiry from a defaulted instant, a plain `agsc build` in a committed Bundle failed. `src/adapters/node-clock.js#readLastCommitSeconds` now reads `git log -1 --format=%ct` through the ProcessRunner port (no shell, scrubbed environment, skipped when the variable is set, `null` on anything but one clean integer) and `bin/agsc.js` passes it to the clock. Test: `tests/bin/agsc-build-instant-from-git.test.js`.


### Fixed — the findings of the independent verification of session 29 (FIX-29, 2026-09-21)

An independent end-of-session verification re-ran every gate and left eleven
findings reported rather than fixed. Seven of them were engine defects; each was
closed with a failing test first, and no frozen artefact was touched — `spec/`,
`schema/`, `ontology/` and `tests/vectors/` are byte-identical to the `1.0.0-rc.5`
tag.

- **The browser page tools went silent on any node above 500 items.** AGSC-06-21
  makes `/search.json` the manifest `{docs_total, shards[]}` there, and the page read
  `index.docs`, which a manifest does not carry — so `search` returned no hit, `ask`
  returned the fixed no-answer string and `read` answered `AGSC-E301` for an item
  that exists, all with no diagnostic, while the local MCP server answered correctly.
  AGSC-09-16 requires the two transports to agree. The page now follows the manifest
  and merges the shards (postings offset by the running document count), and it
  follows only `/search-<nn>.json` routes of its own origin. A shard that is not
  served, a shard that is not an index, or a document count that disagrees with
  `docs_total` makes the index incomplete, and `search` and `ask` then answer
  `AGSC-E901` naming what is missing rather than an empty result. Proved on a
  generated 520-item Bundle, against the EMITTED scripts, in a fake-browser harness.
- **`import` could overwrite the node's own items, silently.** The taken-slug set was
  seeded from the incoming set alone. A collision with an authored item now writes
  **nothing at all** and reports every collision as `AGSC-E206`; `--dry-run` reports
  the same; and the documented adapter flag `--replace` (AGSC-01-26a) is the only way
  to ask for replacement, each replacement being reported. Writes still go through the
  Bundle's own port, so nothing lands outside the Bundle root or through a link
  (`AGSC-E902`). Both adapters, `old-site` and `okf`. A byte-identical re-import is
  still a no-op, so AGSC-01-23's idempotence is unchanged.
- **`import` wrote a Bundle its own `lint` rejected while reporting `pass`.** A
  foreign single-line value carrying a control character was serialised as the YAML
  escape `"N\0UL"`, which parses back to U+0000 (`AGSC-E204` under AGSC-02-24). Both
  adapters now neutralise every authored single-line string with
  `knowledge/unicode.js#singleLine` and report each substitution as `AGSC-E506`. The
  neutralisation is the identity on every conforming value, so the `export --okf` →
  `import --from okf` round trip does not move a byte.
- **`security.txt` could be published already expired.** With no `SOURCE_DATE_EPOCH`
  and no git history the build instant is 0 (AGSC-04-09), and the derived
  `Expires: 1970-12-31T00:00:00Z` was published with only a warning. The build now
  fails with `AGSC-E204` and a message telling the publisher to commit once or set
  `SOURCE_DATE_EPOCH`; the route is not emitted. The expiry remains a pure function of
  the build instant, so builds stay byte-reproducible. `lint` writes nothing and is
  silent, as vector `cli-0002` requires.
- **Three of the nine validators reported `pass` on a destroyed specification folder**
  and two on a directory that does not exist. All nine were audited for vacuous
  passes; a missing or empty input is now `AGSC-E901` and exit 1, and every one states
  how many input files it read. `tools/validate-vectors` gained `run(argv, io)` and
  `--help` like its siblings.
- **`tools/count-artifacts` crashed from any working directory but one.** It resolves
  its inputs from its own location, takes an optional `[<root>]`, answers `--help`
  before reading anything and exits 2 with a usage finding on a wrong root.
- **The two validators of `SOURCE_DATE_EPOCH` disagreed** (`" 12 "` was accepted by
  the clock adapter and refused by the CLI, `"007"` the other way round) and the two
  fatal paths used different streams under `--json`.
  `adapters/node-clock.js#isMalformedEpoch` is now the one definition, and a fatal
  diagnostic goes to stderr as one JSON object per line.

### Added

- `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` are in `package.json` `files`,
  so an npm consumer of `agentic-system-core` finds a security-reporting address, the
  contribution terms and this file. `npm pack --dry-run`: 278 entries, nothing
  private.
- `import --replace`, documented on both adapters (AGSC-01-26a).

### Changed

- `internet-draft/SUBMISSION-NOTES.md` no longer carries three third parties' e-mail
  addresses. The names, affiliations and RFC links stay; the addresses are in the
  Authors' Addresses sections of RFC 9727 and RFC 9264, which the links resolve to.
  Other people's contact details do not belong in a repository that is to be made
  public.

### Fixed — the two legal-facing surfaces are valid and complete (PUBLIC-STATEMENTS-FIX, 2026-09-21)

Every site this engine built published a `security.txt` that RFC 9116 makes invalid
twice over, and a `/legal/` page carrying one of the four things PRD-019 requires of
it. Both are inputs only a publisher can supply, so the engine now requires them,
derives what it may, and emits nothing it knows to be invalid.

- **`/.well-known/security.txt` carried no `Contact:` field and an `Expires:` set to
  the build instant** — RFC 9116 §2.5.3 ("This field MUST always be present in a
  'security.txt' file") and §2.5.5 ("This field MUST always be present and MUST NOT
  appear more than once"; "It is RECOMMENDED that the value of this field be less
  than a year into the future"), which a build instant never satisfies, being in the
  past the moment it is written. The Bundle root's `.well-known/security.txt` is now
  the authored input, read through the FileSystem port exactly as `LICENSE-CONTENT`
  is; its fields are published verbatim, and the writer derives `Expires` (364 days
  after the build instant), `Canonical` and `Policy` only where the authored file
  states none. A missing file is `AGSC-E901`, a missing `Contact` is `AGSC-E202`, and
  an expiry already past at build time is `AGSC-E204` — each fails `lint` and `build`,
  and the route is then not emitted at all. §9.4 registers no code of its own for
  "a published artefact is invalid against the standard it claims"; the closest rows
  are used and the registration is on the specification items list.
- **`/legal/` carried the Content Use Terms alone**, while PRD-019 asks it for the
  terms, a privacy notice, the operator and a retention statement. The notice (which
  carries the retention statement) is now the Bundle root's authored `PRIVACY.md` and
  the operator line comes from `site.author` and `bundle.operator`. A missing input
  omits its section and warns (`AGSC-E406`); no writer ever invents a privacy notice.
- **A `Contact:` at another origin was read as a dangling internal link.**
  `site.js#internalLinks` now takes the node's own base and treats an absolute URL in
  `robots.txt` or `security.txt` as internal only when it is under that base.
- `distribution/ci.js` tells the build not to repeat the publication findings the
  lint lane has already reported, so one fault is still counted once (AGSC-09-11).
- The npm tarball now ships `LICENSE-CONTENT`: AGSC-06-18 says "a distribution
  without it is incomplete", and the `files` list omitted it.
- Repository hygiene, required by PRD-047 and absent until now: `CONTRIBUTING.md`,
  `SECURITY.md` and `CITATION.cff` (validated against the CFF 1.2.0 schema; DOI,
  version and release date deliberately left for the owner to fill at 1.0.0). No
  `NOTICE` file: the repository carries no third-party attribution notice, and
  Apache-2.0 §4(d) obliges propagation only where the Work includes one.

### Fixed — the vocabulary now reaches the build, and `graph.jsonld` is compact at every Level (NS-FIX, 2026-09-21)

Three wiring defects between `ontology/agsc.ttl` and a real `agsc build`. The context
generator `knowledge/jsonld.js#context` was correct throughout — the required vector
`graph-0011` and `tests/knowledge/jsonld-roundtrip.test.js` prove it — and nothing
exercised the path from the vocabulary file to an emitted site, which is where all
three lived. No frozen artefact was touched and no released vector broke.

- **`/ns/context.jsonld` carried 0 of the 52 `asc:` term definitions** (`AGSC-06-32`).
  `buildOptions` never supplied the vocabulary, so every built context held only the
  seven prefixes and the 24 external definitions. `adapters/node-fs.js#readOntology`
  now reads it and `application/cli/verbs/_helpers.js#ontology()` memoises it exactly
  as the three compiled schemas are memoised; the built context carries all 85 members.
- **`graph.jsonld` wrote every vocabulary IRI in full**, so `AGSC-06-32`'s round-trip
  clause did not hold on a node's own output. `distribution/site.js` now generates ONE
  context object per build and uses it both as the bytes of `/ns/context.jsonld` and as
  the compaction table of every JSON-LD view, so the file a node serves and the
  documents it serves cannot disagree. Expand → re-compact of a built pair is now
  byte-identical, asserted offline against the pinned `jsonld` devDependency for
  `/graph.jsonld` and for every `/pages/<slug>.jsonld`.
- **A Level-0 `graph.jsonld` named no context at all**, contrary to `AGSC-05-09` as
  amended at rc.5, and a conforming processor then dropped every member whose key was a
  term or a compact IRI — 19 of 36 triples surviving on the reference fixture. The
  context reference is now present at every Level: the specification's persistent
  versioned URL below Level 2, the node's own byte-identical copy at Level ≥ 2. The URL
  is derived, never typed — `knowledge/turtle.js#ontologyVersion` reads the
  `owl:versionIRI` version of `AGSC-05-25` and `knowledge/jsonld.js#persistentContextUrl`
  builds it from the namespace. A build given no vocabulary names the missing `@context`
  in `skipped` instead of emitting a lossy document in silence.
- **`tools/gen-ns --check` reported conformant output as wrong.** It resolved the 52
  vocabulary terms **by key name**, and `AGSC-06-32` pins a term's mapping and never its
  name — so it failed on the specification's own site and on a correctly fixed engine,
  which under `AGSC-09-92` would have blocked merges on correct output. It resolves by
  `@id` now, and catches two faults it used to miss: a plain-literal property declared
  `"@type": "@id"`, and two term names mapping to one IRI.

Bytes that move: `/graph.jsonld`, every `/pages/<slug>.jsonld`, `/ns/context.jsonld`
and three digest members of `/.well-known/knowledge-linkset`. Bytes that do not:
`graph.nq`, `graph.ttl`, `search.json`, `chunks.jsonl`, `/llms.txt`, `/llms-full.txt`,
`ledger.jsonl` and every HTML page — asserted, not assumed. The engine's context file
and the one the specification's own site publishes are now byte-identical, from two
implementations that share no code.

### Added — the last three export forms, the three refusing commands, the release lane and the implementers' guide (ENG-5, 2026-09-21)

Every verb of `AGSC-09-07` now does something, and `tests/application/cli/verbs-sixteen.test.js`
holds the "not implemented at this milestone" list at **empty**.

- **`export --markdown` and `export --okf`** (`AGSC-01-26`) — the lint-normalized Bundle
  itself, one `.md` file per published item, lossless over every authored frontmatter key
  including the unknown ones `AGSC-02-05` preserves, with `content/index.md` carrying
  `license` and the export root carrying `LICENSE-CONTENT` (`AGSC-01-29`). `--okf` adds
  `content/index.md`'s `okf_version` and the OKF-reserved `content/log.md`. The
  normalisation is `lint --fix`'s and is not re-derived, so "the lint-normalized Bundle"
  has one definition; `src/interchange/export-bundle.js`.
- **`export --steer [--target <name>[,<name>…]]`** (`AGSC-01-28`) — the closed registry of
  eleven targets, derived only from NOW state and from `concept`, `procedure`, `gate` and
  `lesson` items, never from an Episode, a Proposal or the git log. Identical bytes at every
  target path, the `AGSC-01-29` provenance header and fenced prose, and the `Channel-Auto:`
  withholding derived from the `AGSC-08-20b` git-log file; `src/interchange/steer.js`.
- **`import --from okf`** (`AGSC-01-22`) — the foreign OKF v0.2 reader, so that
  `AGSC-10-09`'s "the reference engine imports it losslessly" is a claim a test can make:
  `export --okf` → `import --from okf` reproduces every item byte for byte
  (`tests/interchange/okf-roundtrip.test.js`). Unknown types become `concept` and are kept
  as `x-okf-type`, unknown keys are preserved, a missing `index.md` and a broken link are
  tolerated, and a frontmatter block outside the failsafe subset is imported rather than
  refused. `--selection` becomes the `old-site` adapter's own flag (`AGSC-01-26a`).
- **`skills`** (spec/07 §7.4) — one published pack per Cluster plus `/skills/index.json`,
  which is also the SHA-256 lockfile of `AGSC-07-20`; `skills install [<target>]` over the
  three targets of `AGSC-07-21`, verifying the lockfile first and showing a diff on update;
  `skills import <file>` mapping a `SKILL.md` back to a `procedure` item (`AGSC-07-22`).
  `build` emits the same bytes at `/skills/`, `/skills/index.json` and
  `/skills/<cluster>/SKILL.md`, so those routes left `site.js#UNPRODUCED_ROUTES`.
- **`run <slug>`** (`AGSC-09-94`) — the configuration gate, the `procedure`-only restriction
  of `AGSC-02-22`, the `{run}`/`{expect}` extraction and pairing, the `run.allow[]`
  allow-list, the refusal of any line only a shell could honour, `--dry-run`'s resolved
  command list, execution through the ProcessRunner port outside the Bundle, and the
  comparison. **It executes only against a runner that declares network isolation**; the
  adapter this distribution ships does not, and says so — see *Not implemented, and why*.
- **`trace <file.json>`** (`AGSC-09-94`) — a pure mapping of a captured agent-run record to
  an Episode through the `AGSC-01-22`/`AGSC-02-14` import path, with `usage` copied member by
  member, every unplaced key preserved under `x-trace-`, and no clock read (`AGSC-04-11`).
- **`tools/release`** — the release lane of `docs/PLAN.md` §7 as a dry-runnable script: one
  version in one place (the engine and its `agsc-cli` alias), the changelog section, the
  `npm pack` contents (no `GABBE/`, no private path, no test-fixture bloat), the provenance
  step, and the checklist the owner runs. It cannot publish: it spawns no process and opens
  no socket, and `--apply` writes only two version strings and one changelog heading.
- **`.github/workflows/release.yml`** — the tag-triggered lane: a three-OS, two-Node gate
  matrix, then `actions/attest-build-provenance` and `npm publish --provenance` over npm
  trusted publishing. No secret, SHA-pinned actions, never `pull_request_target`.
- **`docs/IMPLEMENTERS-GUIDE.md`** — how to write a second implementation from `spec/` and
  `tests/vectors/` alone: reading order, the byte-level pitfalls, how to run the vector set
  and the nine validators against your own output, what is implementation-defined, and how
  to claim a Level. It discharges `AGSC-01-26a`'s obligation to list every adapter with its
  claimed key set.

### Fixed — three items the last fix package recorded (ENG-5, 2026-09-21)

- **A body reference to `content/assets/**` now warns** instead of passing silently.
  `AGSC-03-11` resolves it and `AGSC-06-01` publishes it at no route, so the link works in
  the repository and 404s on the built site; the warning uses the already-registered
  `AGSC-E310` and names the reason. The route itself is a specification item.
- **`lint --self` is gone.** `AGSC-09-09` closes the verb-flag set and names `lint --fix`
  alone, and `--self` was read by no code, so `agsc lint --self` is now the `AGSC-E002` usage
  error the rule requires — with a hint naming the nine validators of `AGSC-09-90` and
  `agsc lint` for a Bundle.
- **A `-->` inside `bundle.license_prose` can no longer close the `AGSC-06-13a` provenance
  comment early.** `knowledge/unicode.js#commentSafe` puts one U+0020 between the hyphens
  and the `>`, and is the identity on every value that does not carry the sequence — so no
  byte that `disc-0006` pins moves. Applied by every writer of that header: `llms.js`,
  `harness.js`, `skills.js`, `steer.js` and the `llm-context` adapter.

### Not implemented, and why (ENG-5, 2026-09-21)

`AGSC-09-94` requires a `run` step to execute "with no network". A Node process cannot deny
a child process the network from inside itself; that needs an OS sandbox on the host. The
ProcessRunner port therefore carries a declaration, `isolated`, the adapter this
distribution ships sets it to `false`, and `agsc run` refuses to execute rather than run a
step under a guarantee the engine cannot make. Everything else the rule pins is implemented
and tested, `run --dry-run` works in full, and no conformance Level requires the verb.


### Added — the seven remaining independent validators (ENG-4, 2026-09-21)

`AGSC-09-90` and `PRD-054` oblige the reference distribution to ship nine `tools/`
command contracts. Two were shipped (`validate-vectors`, `validate-wellknown`); this
package adds the other seven, each **runnable standalone with no import from `src/`**,
each answering `--json` with the `AGSC-09-11` envelope (`verb` = the tool name),
`--quiet` and `--help`, each emitting only codes registered in §9.4 and exiting
0 pass / 1 fail / 2 usage, each deterministic — no clock, no network, sorted output, LF.

- **`tools/validate-spec`** — the "specnits" of `AGSC-09-91`: duplicate and
  unresolved rule ids, the `<n>a` ordering, the MUST/SHOULD grammar, a trace bracket
  on every rule and the PRD/NFR ids it names, error-code closure against the §9.4
  registry, and version literals across `spec/`, `docs/` and `tests/vectors/**` — with
  both carve-outs the rule states at rc.5 (the historical-note word list, the trace
  bracket that follows a table or a fenced block).
- **`tools/validate-schemas`** — meta-validates `schema/*.json` against JSON Schema
  2020-12 with the pinned Ajv, compiles each in strict mode, and holds them to the
  closed keyword subset and the length bounds of `AGSC-02-24`, the slug grammar of
  `AGSC-01-10` and the six item types of `AGSC-00-04`.
- **`tools/validate-ontology`** — parses `ontology/agsc.ttl` with the pinned `n3` and
  checks the OWL 2 RL-safe axiom set (`AGSC-05-22`), blank-node freedom
  (`AGSC-05-08`), the persistent hash namespace (`AGSC-05-02`), the absence of
  `asc:Item` (`AGSC-05-13`), `owl:versionIRI` and deprecation (`AGSC-05-25`),
  `AGSC-05-26a`, and the SKOS integrity conditions S19, S20, S32 and S37.
- **`tools/validate-features`** — parses the Gherkin dialect `features/README.md`
  declares and closes every `@PRD`/`@NFR` tag against `docs/PRD.md`; a disagreement
  with the pack's own coverage table is a warning.
- **`tools/validate-diagrams`** — the Mermaid lexical contract of
  `docs/diagrams/README.md`, a trace id on every file, and the staleness the standing
  sync rule calls a gate failure: every rule id resolved against `spec/`, every
  requirement id against `docs/PRD.md`, and the index table against the directory.
- **`tools/gen-spec-html`** — renders `spec/` into the `/specs/` pages with the pinned
  `markdown-it` (`html:false`), deterministically, with a self-linking anchor on each
  of the 335 rule ids; `--check <dir>` compares a published tree byte for byte.
- **`tools/gen-ns`** — derives `/ns/context.jsonld`, `/ns/agsc.rdf` and the `/ns/`
  index from `ontology/agsc.ttl` (`AGSC-06-32`, `AGSC-06-06`), round-trips the
  generated RDF/XML back to the Turtle's triples with the pinned `fast-xml-parser`,
  and `--check <dir>` audits a built `/ns/` against `AGSC-06-32`.

`tests/tools/` holds one suite per tool plus `standalone.test.js`, the arrow check
that fails on any `require` from `tools/` reaching into `src/` or outside the engine's
pinned libraries. Every new tool is at 100 % line coverage by its own tests.

### Reported, not fixed — two defects `gen-ns` found in the emitted namespace

- `/ns/context.jsonld` carries the `asc` prefix and the 24 external term definitions
  but **none of the 52 `asc:` term definitions** `AGSC-06-32` requires
  (`src/knowledge/jsonld.js#context`).
- Because of that, `graph.jsonld` writes vocabulary IRIs in full rather than compacted,
  so the same rule's round-trip clause does not hold: re-compacting the reference
  build's graph against its own context yields `asc:Bundle` and `asc:specVersion`.

### Added — the seven tools work IN A PAGE (ENG-3, 2026-09-21)

- **`src/distribution/page-tools.js`** implements all seven tools of AGSC-09-13 in the
  browser, against the node's own published routes: `/search.json` for the prebuilt
  index, `/pages/<slug>.md` for each item, and `/.well-known/knowledge-linkset` for the
  node's own base. Until now the emitted `/compose/` page registered seven tools and
  answered one — the other six returned "no page implementation yet". ONE
  implementation serves both hosts: the module emits the SOURCE TEXT of the functions
  Node runs, exactly as `composition/browser.js` does for the algebra (AGSC-07-13),
  and `tests/arch/page-tools-portable.test.js` enforces the contract.
- **Item pages carry the page tools**, which AGSC-09-16 has always required ("the
  `/compose/` page and the item pages"). They reference the three shared files the
  `/compose/` route already serves — `agsc-core.js`, `agsc-page-tools.js` and
  `webmcp.js` — so a page pays three `<script src>` elements against the 100 KB budget
  of AGSC-06-21 and nothing is inlined. Registration stays feature-detected: a browser
  with no `document.modelContext` gets the same page, unchanged, and no console error.
- **`propose` and `remember` in a page write nothing at all** — not over a network and
  not to a file. They return the Proposal payload and stop (AGSC-08-04, AGSC-09-14b),
  and they carry WebMCP's `consequentialHint`; the five reading tools carry
  `readOnlyHint`, and every tool whose answer carries prose carries
  `untrustedContentHint` (AGSC-11-18).
- **A "Propose an edit" link on every item page** when the Bundle configures a
  `contribute[]` entry of mode `pr` (AGSC-11-14). It is a plain `<a>` with
  `rel="noopener"` and an accessible name, pointing at the forge's edit view of that
  item's own source file — no form (AGSC-06-17's policy sets `form-action 'none'`), no
  script, no third-party request. A forge whose edit-view spelling this engine does not
  state is never guessed at: the link is the configured contribution target itself.

### Fixed — four silently unmet MUSTs behind the page tools (ENG-3, 2026-09-21)

- **AGSC-05-07**: `/pages/<slug>.md` is now "a byte-identical copy of the
  lint-normalized source file" — the frontmatter block and the body. It used to be the
  body alone, so the published Markdown view carried neither the item's type nor its
  title nor its provenance, and a page tool could not return what a local `read`
  returns. **Breaking for a consumer of that route**: a reader that expects a bare body
  must strip the leading `---` block; `/compose/` does.
- **`knowledge/adopt.js#serialize`** no longer throws on an item carrying a typed
  scalar (`cluster.order`, `concept.signature`, `episode.usage.tokens_in`, `cost_usd`,
  `estimate`): the failsafe schema has no number and no boolean, so a typed scalar is
  emitted in the written form AGSC-02-04 pins and read back with the types
  `schema/item.schema.json` declares. `propose` on such an item threw a programming
  fault instead of returning a Finding, and the Markdown view could not be emitted.
- **AGSC-11-16/11-19**: `distribution/site.js` derives its surface declaration through
  `boundary/surfaces.js#declare()` instead of hand-building it from two emitted files,
  so the `webmcp` surface a site emits at `/compose/` is declared in the discovery
  document. It was emitted and never declared — the exact condition AGSC-11-19 tells
  the validator to warn about (`AGSC-E211`).
- **The proof runs the artefact.** The conformance handler for `cli-0003` (and
  `cli-0004`) ran the emitted registration script against the FULL local
  implementation, so the vector proved the emitter and said nothing about what the site
  ships. It now builds the reference Bundle's site, loads the three emitted scripts
  into a minimal fake `document.modelContext` harness, assembles the page corpus from
  the build's own published bytes, and compares every answer with the local server's.

### Changed — the engine conforms to the DRAFT `1.0.0-rc.5` (RC5-B, 2026-09-21)

- The spec version the engine states has ONE home:
  `src/application/cli/main.js#SPEC_VERSION`, now `1.0.0-rc.5`. Every envelope,
  report, `llms.txt` provenance header and `/compose/` page takes it from there.
- **`agsc --help` and `agsc <verb> --help`** print the verb set and the flag list to
  stdout and exit 0 (AGSC-09-09 as amended, V9D-02); with a verb, that verb's flags.
  Under `--json` the same facts come back as one canonical JSON object. Until rc.5
  `--help` was `AGSC-E001` and `<verb> --help` was `AGSC-E002`.
- **BREAKING for a tool client: the `ask` envelope is flat.**
  `{body, citations, license, source, trust, type}` — the AGSC-08-18 envelope with
  exactly one added top-level member — where `body` is the answer TEXT with the
  Content Use Terms line in it, and exactly `no answer in this memory` when nothing
  matches. It used to nest `{answer, citations, terms}` inside `body`
  (AGSC-09-14a as amended, V9D-07; vector `cli-0007`). Both transports change
  together, so AGSC-09-16 still holds.
- **BREAKING for an MCP client: the `extensions` capability is a MAP**,
  `{"com.agenticsystemcore/knowledge": {"linkset": "<base>/.well-known/knowledge-linkset"}}`,
  as MCP defines it and as AGSC-11-18 now pins it (SITE1-01, vectors `bnd-0035` and
  `bnd-0036`). It used to be the bare identifier list, and `bnd-0027` — the one vector
  that stated it that way — is withdrawn for it under AGSC-00-16, superseded by
  `bnd-0036` (RC5-C). The conformance handler no longer projects the map to its key
  set for any vector.
- **`schema:license` and `schema:usageInfo` are `xsd:string` literals on the Bundle
  AND on every item**, and the Content Use Terms identifier is the constant of
  AGSC-06-18 rather than a configured IRI. All four RDF views move together
  (AGSC-05-26 as amended, V9A-02; vectors `graph-0015`…`graph-0018`).
- **AGSC-06-21's index budget is one number measured per index DOCUMENT** —
  1 MB (decimal) for `/search.json` and for each `/search-<nn>.json` shard. The
  per-published-item and 500 KB absolute bounds are gone: they were jointly
  unsatisfiable with AGSC-06-23 for any Bundle of more than roughly 200-word items,
  and summing a manifest and its shards measured eleven documents as one (ENG1-01).
- **The compiled diagram is inline in its item's page**, in a `<figure>` whose
  accessible name is `diagram.alt`, at no route of its own, and inside AGSC-02-98's
  allow-list (AGSC-01-07/AGSC-02-13 as amended, ENG1-02). Pages that carried alt text
  and no picture now carry the picture.
- **`/attachments/<slug>/<file>` is emitted**, with the authored bytes AGSC-05-29
  hashed (AGSC-06-01, AR2-23). Every page linking an attachment used to raise
  `AGSC-E901` for a route the build did not produce.
- **The AGSC-11-08 address guard is unconditional on every redirect hop**, closing
  the last fail-open path in the transport rules and the one blocker for 1.0.0
  (`bnd-0005` withdrawn → `bnd-0030`).
- `lint --fix` reports a code per NORMALISATION — `AGSC-E108` for the encoding third,
  `AGSC-E506` for the rest (AGSC-04-19 as amended, ENG2-03). An adapter's own flags
  (`--selection`, `--corrections`, `--attach-diagrams`) are adapter-scoped and are
  `AGSC-E002` under any adapter that does not define them (ENG2-01/ENG1 §3).
- Fixed: the `search` and `ask` tools tokenized the body alone, matching neither a
  title, a description nor a tag on a loaded Bundle (AGSC-06-23); an item whose
  primary cluster was not listed appeared in no `/llms.txt` section at all
  (AGSC-06-14); a malformed `Assisted-by:` line was silently dropped instead of
  making the trailer block `AGSC-E504` (AGSC-08-06).
- `tests/conformance/pending.json` is EMPTY: the vector set runs
  `136 pass, 0 fail, 14 skip (14 withdrawn, 0 pending) of 150` (FIX-28, which added
  `fm-0010`; it was `135 pass … of 149` at RC5-C, and `135 pass … 13 withdrawn … of
  148` before `bnd-0027` was withdrawn and `bnd-0036` added).

### Security — authored single-line strings cannot inject structure (FIX-28 / FV28-01, 2026-09-21)

- **An item `title`, `description`, `alt`, `caption`, reference title or any other
  AUTHORED SINGLE-LINE string may no longer carry a C0 control, `U+007F`, `U+0085`,
  `U+2028` or `U+2029`** (AGSC-02-24 as amended at rc.5). Until now
  `title: "Handoff\n\n## Injected Section\n\n- [Fake](https://evil.example/): pwned"`
  was schema-valid, passed `lint` 0/0 and `build` 0/0, and put a FORGED `## ` heading
  and a forged link entry into `/llms.txt`, and the same block OUTSIDE the
  ```` ```text agsc-content ```` fence of `/llms-full.txt` — breaking that file's own
  AGSC-01-29 promise that item prose is quoted data. Reachable wherever metadata is
  not the operator's keystrokes: an imported Bundle (AGSC-01-22), a channel
  contribution (AGSC-01-30…33), an agent-lane Proposal (AGSC-08-28).
  - **Validation**: `schema/{item,bundle,config}.schema.json` carry the bound as a
    `pattern` on each such member (`#/$defs/single_line` in the item and configuration
    schemas), so the fault is `AGSC-E204` — the code §9.4's precedence paragraph
    already assigns to every pattern violation. No code was minted. The Bundle root's
    `description` is deliberately exempt: AGSC-06-13a(3) emits it with newlines
    replaced by one space. New vector `fm-0010`.
  - **Neutralisation**: every writer of a line-oriented surface — `/llms.txt`,
    `/llms-full.txt`, `/now.md`, `robots.txt`, `/.well-known/security.txt`,
    `_headers`, `_redirects`, the seven Harness files including `SKILL.md`, and the
    additive `llms-ctx.txt` — now passes what it interpolates through
    `knowledge/unicode.js#singleLine` (one `U+0020` per forbidden code point). It is
    the identity on every conforming string, so no emitted byte of a conforming
    Bundle moved. This also closes FV28-05, which was the same hole in
    `interchange/adapters/llm-context.js`.

### Changed — the Content Use Terms text is PINNED (FIX-28 / V9A-24, owner answer to Q-RC5-1)

- `AGSC-06-18` as amended at rc.5 now says which text the identifier
  `LicenseRef-AgenticSystemCore-Content-Use-1.0` names: the `LICENSE-CONTENT` file whose
  SHA-256 is `b2e8da62e6a41886296d2d2358fb4642cc7418e806eb4a29ada12b588ac32857` (2,133 bytes).
  A distribution shipping different text MUST use a different identifier. Until now the
  wording was "an owner decision outside this specification", so the identifier named no
  fixed text and two nodes could carry it over different terms.
- `tests/arch/license-content-pin.test.js` reads the hex and the byte count out of the RULE
  and hashes the file, so the pin fails the suite rather than rotting silently; a second
  test pins the identifier's one spelling across `chunks.js`, `harness.js` and `mcp-tools.js`.
  All three distributions (engine, patterns node, first node) already carry byte-identical
  text, so no emitted byte moved.

### Fixed — AGSC-03-11's asset branch, and the dangling-link guard (FIX-28 / FV28-03, FV28-04)

- **`loadBundle` lists `content/assets/**` into `bundle.assets`** and every caller of
  `links.resolve` passes it, so AGSC-03-11's "an existing asset under
  `content/assets/`" is reachable at last: before this, every body image reference to
  a real asset was `AGSC-E310`, because no caller supplied the set the resolver reads.
  `walk` is declared on the FileSystem port, which three application modules already
  required of every implementation. New fixture `tests/fixtures/with-assets/`.
- **The dangling-link guard resolves RELATIVE hrefs** against the page's own route
  (`site.js#internalLinks`), and **the writer maps a body reference that resolves to a
  published item onto that item's route** (`site.js#bodyHrefResolver`, through the new
  `href` option of `knowledge/markdown.js#render`). The two are one fix: a body
  reference is authored in the Bundle's geometry and served in the route geometry, and
  no authored spelling resolves in both — so the writer had been emitting links to
  nothing and the guard had been blind to exactly that class. Measured on the patterns
  node before the fix: 65 distinct relative targets, 186 occurrences on 52 of 124
  pages, none resolving to an emitted route.
- **`import --from old-site` rewrites an in-set body link to AGSC-03-12's normal form**
  `../concepts/<slug>.md`, and **de-links a link to a card that is not PUBLISHED** —
  not merely not selected. A draft has no route (AGSC-06-30), so a published page
  linking one ships a 404. The published set is decided in a pure pre-pass over the
  selection (`statusOverrideFor`) so that the body rewriting and the status decision
  cannot disagree.
- `/feed.xml`'s build skip message no longer invites `build.feed`, which R-15
  withdrew at rc.5 and which a 1.0 tool rejects with `AGSC-E004` (FV28-11).

### Added — the Harness, the `/compose/` and board pages, `/legal/`, the three silent gaps and the `llm-context` adapter (ENG-2, s28)

- `agsc compose <slugs…>` now WRITES the seven Harness files of AGSC-07-12 into
  `dist/harness/<name>/`, `<name>` being the first sixteen hex characters of the
  selection digest, so a Harness is addressed by its member set;
  `--out <dir>` overrides the directory and changes no emitted byte (AGSC-07-13).
  `harness_emitted` is true only when every file kind the rule names for that member
  set is present and nothing AGSC-07-15 forbids is.
- `src/governance/fix.js` and `agsc lint --fix` — AGSC-04-19's five normalisations and
  no others (line endings, NFC, trailing newline, frontmatter key order in schema
  order, and AGSC-03-12's wikilink rewriting), idempotent, through the one YAML writer
  (`knowledge/adopt.js#serialize`). Under `--json` it is a dry run that reports what
  would change and writes nothing. Four rules obliged this flag and none defined it
  until rc.5 (V9D-01).
- `src/distribution/forge.js` and the `ci` `forge` lane — AGSC-08-12's `enforce[]`
  compilation into `dist/forge/`, deterministic and idempotent, with drift reported as
  `AGSC-E707` and never overwritten. `governance/lint.js#checkEnforce` reports a value
  that cannot be compiled with the same code.
- `agsc export --jsonld`, `--jsonl` and `--to <adapter>` (AGSC-01-26a, AGSC-01-27),
  written under `dist/export/` with each file's SHA-256 printed. The first memory
  adapter is `llm-context` (D98): `chunks-index.toon` in TOON tabular form and
  `llms-ctx.txt`, a skim view that says in its own header that it is not
  provenance-complete. Both live OUTSIDE `build.out` and are declared with a
  `related[]` link, `rel: "alternate"` (AGSC-06-35).
- AGSC-06-21's four numeric budgets are MEASURED: three byte budgets in `site.build`
  and the duration in `site.timeBudget`, which the caller supplies so that no finding
  depends on how busy the machine is. §9.4 registers no code for a budget breach, so
  the closest registered row (`AGSC-E904`) is used and the missing registration is on
  the specification items list.
- `/legal/` is emitted from the Bundle's own `LICENSE-CONTENT` (AGSC-06-18), and every
  site-absolute link a build emits must resolve to a route the same build emits —
  `AGSC-E901` when one does not (`site.internalLinks`, `site.resolvesTo`).

### Fixed — ENG-2

- `verbs/compose.js#flatten` carries the item body. Without it `compose --from <slug>`
  could never find AGSC-02-97's `yaml agsc-selection` fence, and a Harness `SKILL.md`
  was emitted with no prose while the `/compose/` page emitted the real one — an
  AGSC-07-13 byte-identity break.
- `composition/browser.js#itemsFromGraph` reads the graph a Level-2 build actually
  publishes (full IRIs for `asc:` terms, bare terms for the SKOS ones) and no longer
  reads a member of a required module, which threw
  `compose.compareCodePoint is not a function` in every page. `tests/arch/
  composition-portable.test.js` now refuses both shapes.
- The `/compose/` controller takes the build instant from the discovery document's
  `agsc-generated-at` (AGSC-06-08), never from a wall clock.
- `agsc compose` no longer prints a blank diagnostic line for a verdict warning: each
  of AGSC-07-07's and AGSC-07-23's warnings has its own sentence (R64).
- `site.build` moves its entries into the ordered map instead of copying them, and
  `site.verify` retains only digests: peak resident memory at 10 000 items falls from
  1 225 MiB to 1 082 MiB. The supported scale is unchanged.


### Added — `import --from old-site` and the diagram compiler (WP-12, M3)

- `src/knowledge/diagrams.js` — the deterministic `.diagram` → SVG compiler
  (AGSC-01-07, AGSC-02-13, AGSC-02-98): `compile(dslText) -> {svg, findings}`, a
  pure total function with no clock and no randomness, whose output is inside the
  AGSC-02-98 allow-list by construction, carries `<title>`/`<desc>` beside
  `role="img"` (AGSC-06-20) and no colour of its own, so it reads in both colour
  schemes. `check()` is the staleness comparison of AGSC-04-02 and `altFrom()`
  derives the accessible name AGSC-02-13 requires.
- `src/interchange/` — the old-site reader (`oldsite.js`), the field mapping
  (`mapping.js`), the citation mapping (`sources.js`), the status/release/tag
  rules (`status.js`), the deck → cluster derivation (`clusters.js`), the
  mechanical clean-room rewrite (`cleanroom-rewrite.js`), the selection-file
  parser (`selection.js`) and the plan itself (`import.js`). The plan is a pure
  function of its inputs: deterministic, idempotent and total (AGSC-01-22/01-23).
- `agsc import --from old-site --selection <tsv> [--corrections <json>]
  [--attach-diagrams] [--dry-run] <dir>` — the verb that wires them. Which records
  are imported, with which status, and every per-record correction are DATA the
  operator supplies; the engine carries no list of its own. A byte-identical file
  is not rewritten, so a second run changes nothing.
- `tests/fixtures/old-site-10/` — a synthetic corpus in the foreign format,
  exercising every branch of the mapping table.

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
- `tests/application/cli/verbs-wired.test.js` and `tests/boundary/federation.test.js`
  carried five literal U+0000 bytes in their `git ls-files -z` and hostile-IRI
  fixtures, which made `file(1)` classify them as data and GNU `grep` treat them as
  binary — so both were invisible to every source sweep, the third occurrence of the
  defect that hid `src/boundary/federation.js` in session 27. Written as the
  six-character escape instead, and `tests/arch/text-sources.test.js` added as the
  guard: no NUL, no BOM and no CR in any source under `src/`, `tests/`, `bin/`,
  `tools/`, `schema/`, `ontology/` or `spec/`, and the sweep reports how many files
  it read (V9D-G4).

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
