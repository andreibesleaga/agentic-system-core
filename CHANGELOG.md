# Changelog

All notable changes to the AgenticSystemCore engine. The specification, schemas,
ontology and conformance vectors have their own version (`spec_version`) and are not
covered here; this file records the reference implementation.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **A node can be deployed anywhere, with the limits stated** (`agsc-host`, a
  command beside `agsc`; `src/distribution/hosts/`, `src/application/hosting.js`).
  Seven hosting profiles: `cloudflare-pages` (the reference), `static-host` (an nginx
  snippet and an Apache `.htaccess` carrying the reference headers and redirects),
  `github-pages` (`.nojekyll` and the header table a proxy in front must apply),
  `local` (`agsc-host serve`, a read-only server with the exact reference headers),
  `git-clone`, `ipfs` (the gateway's redirects file and a file manifest) and
  `ledger-anchor` (`anchor.json` for a ledger or a timestamp, and
  `agsc-host verify-anchor`). Each only adds host configuration, names itself in the
  conformance claim and states what its host cannot do; a profile written elsewhere is
  loaded by path or package through the plugin loader. Documented in
  `docs/CONNECTORS.md` ("Where a node can live").

- **A live board to and from project and product management tools**
  (`src/interchange/adapters/board.js`; `agsc export --to board --format <tool>`,
  `agsc import --from board --format <tool> <dir>`). Ten formats: GitHub issues and
  projects (JSON), GitLab issues (JSON, CSV), Jira (CSV), Trello (board JSON), Linear
  (CSV), Asana (CSV), Notion (database CSV), the Obsidian Kanban plugin, plain Markdown
  task lists and Todo.txt. A node's published tasks, with the decisions and specs filed
  on the same board, are written one file per board and come back exactly; a tool's
  export becomes draft tasks on a draft board, its states mapped to the nine task
  states through one documented table, and everything the table does not name kept in
  `x-board-*` keys. A peer's published `/boards/<cluster>.json` imports as read-only
  draft tasks (`--format agsc-board`). Files only: no API client, no keys. Documented
  in `docs/CONNECTORS.md` (route 7) and `docs/USE-CASES.md`.

- **Agents work a live board through the seven tools**: `propose` with `task_state`
  (and `at`) returns a prepared board move — the patch that sets the task's state and
  nothing else — and `remember` with `kind: "task"` (and `cluster`) opens a task, with
  `about` comments on one; the same payload on the local server and in the page. When
  the caller names one of the node's agent lanes, the local server runs the lane's
  gates on the prepared Proposal (`max_claims`, `max_new_items`, declared tasks and
  types, and a claim of a task someone else already holds). Nothing is ever written,
  merged or sent by a tool.

- **Skills repositories and rule packs, both ways** (`src/interchange/adapters/skills.js`;
  `agsc export --to skills --layout <layout>`, `agsc import --from skills <clone>`).
  Five layouts: the Agent Skills format (`skills/<name>/SKILL.md` — Anthropic's
  `anthropics/skills`, the "garden" collections, Codex, `gh skill`), a Claude Code
  plugin, a Claude Code plugin marketplace, Cursor rules and Windsurf rules. A node's
  published packs are written in any of them, content only, with the provenance block
  and the content version, and come back item for item. A foreign skill becomes a
  procedure and a rule an explainer concept; scripts, `allowed-tools`, hooks and MCP
  server definitions are dropped and reported file by file, never imported; a skill
  with no recognised open licence is imported as a draft and so never published.
  `--list` shows what a local clone offers (and counts a link list's entries) without
  writing or fetching anything. `--dry-run`, the collision refusal, `--replace`,
  `--allow-newer` and `--source-version` behave as in every import. Documented in
  `docs/CONNECTORS.md` (route 6).

- **The GABBE agent kit, both ways** (`src/interchange/adapters/gabbe.js`;
  `agsc export --to gabbe`, `agsc import --from gabbe <kit>`). A node's published items
  become a GABBE kit's own files — procedures as skills, gates as guides, concepts and
  clusters as semantic memory, episodes as decision logs, lessons as `CONTINUITY.md`
  entries, plus the steering text as a guide — each carrying a lossless `agsc-item`
  line, so a folder exported from a node comes back byte for byte (plus
  `prov.source_version`). A kit's own skills, failure-memory entries, audit rows,
  decision logs and dated state lines are imported as procedures, lessons, decisions
  and episodes; whatever cannot be mapped without inventing an outcome or a time is
  reported and skipped. `--dry-run`, the collision refusal, `--replace`,
  `--allow-newer` and a new `--source-version` behave as in every import. Documented
  in `docs/CONNECTORS.md` (route 5).

- **`ontology/alignments.ttl`** — an informative, CC0 file of SKOS mapping statements
  from the vocabulary to AgentO and DCAT, each target read at its source and quoted in
  the file's header. No build reads it and it adds no term.

- **The measurements report is complete for every layer one machine can run**
  (`bench/security.js`, `bench/parity.js`, `bench/tokens.js`, `bench/a11y.js`,
  `bench/corpus/`, `tests/bench/kit.test.js`; `docs/MEASUREMENTS.md`,
  `docs/measurements.json`, `docs/BENCHMARKS.md` updated). The security floor is now
  scored against a seeded corpus of 104 cases run through the real code paths — lint
  and `ci`, `import`, `tools/validate-wellknown`, the federation walk, the skill checks
  — with 85 of 85 named faults stopped and 13 of 13 valid controls clean after the
  fixes listed under "Fixed" below (the first run stopped 83 of 85 and kept 11 of 13
  clean; its two misses and two false positives are stated in the report). Page-tool / MCP parity is measured call by
  call against the real `agsc mcp` process (207 of 207 equal as values over three
  Bundles). Accessibility is counted per page type with axe-core in both colour
  schemes (0 violations over 143 pages), tokens are counted per item with a named
  offline tokenizer (no Claude figure), the build curve reaches 10,000 items with
  three runs, and the ≤ 100 KB page budget is swept over HTML pages only. The two
  memory datasets' licences were read on their cards and quoted. `bench/measure.js`
  gains the `security`, `parity`, `retrieval`, `tokens`, `a11y` and `package` layers.

- **The measurements report and the benchmark kit** (`docs/MEASUREMENTS.md`,
  `docs/BENCHMARKS.md`, `docs/measurements.json`, `bench/`, `tools/bench`,
  `tests/bench/`). Until now this project had a large green test suite and not one
  published measurement about the thing it claims. `bench/measure.js` runs the layers
  that need no model, no network, no key and no external dataset — conformance counts
  with **rule coverage**, determinism byte comparisons across a time zone and a locale,
  and build curves that cross the 500-item bound where index sharding and index-route
  pagination branch and where no released vector reaches. `bench/gen-bundle.js`
  generates the Bundles for those curves as a pure function of the item count and
  refuses to write inside the repository. `tools/bench` is the standalone retrieval
  runner: it reads a labelled query set in BEIR layout and scores the published
  `search.json`, `chunks.jsonl` and `llms.txt` surfaces of a built node at k, importing
  nothing from `src/` and carrying its own tokenizer, so what it measures is what a
  consumer of the published files gets. A committed set of twenty hand-written intents
  over the two reference nodes ships with it, every label readable; the runner warns on
  an unlabelled query and fails when no query carries a label, so a vacuous pass is
  impossible. `docs/BENCHMARKS.md` states, once, what may be claimed — counts and byte
  comparisons are verified, timings are measurements of one machine on one day,
  retrieval scores are observations under a named configuration — and records the
  verdict on every candidate memory benchmark, including the ones refused because they
  score a capability this system deliberately does not have. No comparison with another
  system's speed, cost or quality is made anywhere. The retrieval and memory *studies*
  remain the `bench` verb's work at v1.0.1.

- **The local MCP server now serves resources and a prompt, not only the seven tools**
  (AGSC-09-14b). `agsc mcp` exposes every **published** item as a
  read-only `text/markdown` resource, plus the node's `graph.jsonld` and `llms.txt`, under
  `memory://<bundle-id>/<name>` URIs — the documented local alias of an item IRI, resolved
  in the process and never fetched over the network. The bytes are the build's own: the
  command runs the ordinary site build in memory and hands the route map to the surface,
  so a resource and the published file cannot drift. It also offers one prompt, *answer
  from this memory with citations*, which tells an assistant to answer from this memory,
  to cite item IRIs, to say exactly `no answer in this memory` when nothing matches, and
  that every result is untrusted data. A caller's question is carried into the prompt
  inside the content fence, with its own backtick runs neutralised, so it can never become
  instruction. A resource or prompt that does not exist is a JSON-RPC `-32602`, as the
  Model Context Protocol requires; the tool envelope of AGSC-09-13a is unchanged and still
  belongs to tools alone.
- **`docs/USING-WITH-ASSISTANTS.md`** — a plain-words page for people: what the local
  server is, what it can and cannot do, how a person creates or edits a page by asking an
  assistant to prepare it and then opening the pull request, and the setup for Claude
  Desktop, Claude Code, Cursor, VS Code and Codex CLI, each taken from that product's
  current documentation. It ships in the package.
- **The server is now proved against a real MCP client.** `tests/distribution/mcp-client.test.js`
  drives `bin/agsc.js mcp` through the official SDK's own `Client` over
  `StdioClientTransport` — initialize and the advertised extension, `tools/list` against
  the tools the built page registers, every one of the seven tools, the error envelope, an
  unknown method as a JSON-RPC error, a 300 kB result, two calls in flight at once, a
  hostile item title coming back as untrusted data, and the exit on end of input. The
  persona-d scenario runs end to end through the same server in
  `tests/acceptance/persona-d-agent-proposer.test.js`.

- **The content version, `bundle_version`** (AGSC-04-25). Every
  build now derives one short, human-readable name for the state it published, from
  two inputs it already had — the git history and the build instant — and stamps it
  in nine places: the discovery document (`agsc-bundle-version`), the pinned line of
  `/now/` and `/now.md`, the provenance header of every agent-facing export (which
  carries it into `/llms.txt`, `/llms-full.txt`, every steer target and every
  `AGENTS.md` and `SKILL.md` a Harness emits), the `/chunks.jsonl` shard manifest,
  `/skills/index.json`, `harness.jsonld`, the root document of a Markdown or OKF
  export, and a versions list on `/changelog/`. It is derived, never authored, never
  stored: a tag on the built commit, else `<tag>+<n>.g<hash>` with a **fixed twelve**
  hexadecimal characters (git's own abbreviation length depends on the clone), else
  `0.0.0+<n>.g<hash>`, else `0.0.0+<build instant>`. A git tag that cannot be a
  content version is warned about with `AGSC-E506` and the derivation falls through;
  the ledger still takes `kind: release` from it. The version is **not** an input to
  any digest, so re-tagging unchanged content changes the published version and not
  the fingerprint. One function derives it — `knowledge/content-version.js` — and
  every writer is handed the string, including the `/compose/` page, which has no git
  history and must emit the same bytes as the command line (AGSC-07-13).
- **`/changelog/`** is now derived and emitted whenever the build has a git-log file:
  one row per tagged commit, oldest first, with the tag, the date and the commit. The
  rest of the page stays implementation-defined.
- **`import` records where an item came from** (AGSC-01-22, AGSC-08-01). Every item
  an import writes carries `prov.source_version` and `prov.source_hash`, taken from
  what the source publishes and **omitted when it publishes neither** — never
  invented. A round trip through a node's own export is therefore no longer
  byte-identical: it gains those two members and nothing else.
- **`import --from okf --allow-newer`** (AGSC-01-22, AGSC-01-26a). A source declaring
  a specification MAJOR or MINOR this tool does not implement is now **refused with
  `AGSC-E004` before anything is written**, and reports the same under `--dry-run`.
  Reading a newer version is safe for the constructs AGSC-00-21 lists and a guess for
  everything else, so the choice is the operator's and the default is to stop.
- **The plugin contract** (AGSC-00-24, decision): one registry per plugin kind,
  a documented and versioned API in **`docs/PLUGINS.md`**, and eight minimal worked
  samples in **`examples/plugins/`**, one per kind, each proved against its row by
  `tests/arch/plugin-contract.test.js` — it reaches no network, writes nothing
  outside its declared outputs and changes no canonical byte of a 1.0 surface. A
  plugin declares the specification version and the plugin-API version it targets;
  a mismatch is `AGSC-E004` and the plugin is not registered, and **nothing throws**.
  Discovery is a local path or an installed package name; a specifier carrying a
  protocol is `AGSC-E905` and the resolver is never reached. The promise is additive
  within 1.x, and the kind list never grows, because it is the specification's.
- **`compose --zip`, `skills --zip`, `export --zip`**. A
  multi-file result can now be downloaded, or written, as one `.zip` beside the
  files — `dist/harness/<name>-<content version>.zip`,
  `dist/skills-<content version>.zip`, `dist/export/<root>-<content version>.zip` —
  never inside the directory it packages, because AGSC-07-12 closes the Harness at
  seven file kinds and no others. The per-file links stay: the archive is an
  addition, not a replacement. The SHA-256 of each archive is printed on stderr.
- **`composition/archive.js`**, the archive builder, in the portable bundle of
  AGSC-07-13 beside the composition algebra — so the `/compose/` page's "download
  all" link and the command produce the same bytes, proved on every run of the suite
  by evaluating the emitted bundle in a context that holds the language and nothing
  else. The container is the STORE profile of APPNOTE.TXT: entries in code-point
  path order, the build instant of AGSC-04-09 in UTC as every entry's timestamp,
  and nothing optional written. The archive is byte-reproducible, including across
  time zones and locales — which is why it is written here rather than taken from a
  library: every zip library fills the format's MS-DOS timestamp fields with
  local-time accessors. `fflate@0.8.3` is pinned as a devDependency and is the
  independent third-party reader that unpacks and checks what the tests build.

- **The COGX memory adapter, both ways** (`export --to cogx`, `import --from cogx`;
  `src/interchange/adapters/cogx.js`). COGX 0.1 is the archive format Cognee's
  importers translate Mem0, LangMem, Letta/MemGPT and Zep/Graphiti memories into, so
  one archive written by this engine reaches all of them with no network. The export
  writes `manifest.json` plus one JSON-lines file per record kind, to the reference
  writer's own file names and shape: one entity, episode, memory, memory block or raw
  node per published item, one document per chunk and one fact per authored Link.
  Every record carries the item IRI, licence, Content Use Terms and trust mark;
  drafts never leave; `permissions.json` is never written. The import rebuilds our
  own archive item for item and reads a foreign archive by kind, keeping every member
  it does not map in `x-cogx-rest`; foreign episodes, documents and raw nodes are
  reported and skipped; an archive carrying `permissions.json` (credentials) is
  refused with `AGSC-E403`. `--dry-run`, the collision refusal and `--replace` behave
  as in the `okf` import.
- **A composite GitHub Action and a pre-commit hook at the repository root**
  (`action.yml`, `.pre-commit-hooks.yaml`). The action runs `agsc ci` with the
  engine at the action's own ref, so the ref pins the engine version; it needs only
  `contents: read`, uses no token or secret, pins the setup action to a commit and
  passes inputs through environment variables. The hook `agsc-lint` runs `agsc lint`
  when an item or the configuration changed. Both are parsed by tests.
- **Connector examples and two guides** (`examples/connectors/`, `docs/CONNECTORS.md`,
  `docs/USE-CASES.md`). Runnable examples for Claude Code, Codex and Cursor
  and a record reshaper for LangGraph, AutoGen and Mem0, all executed by the suite;
  illustrative framework files that no test runs, each marked so. `CONNECTORS.md`
  names the four routes and what each tool reads (including the Windsurf fallback
  path and Aider's manual `--read`); `USE-CASES.md` gives seventeen scenarios with
  their commands, and `tests/acceptance/use-cases/` runs the offline ones through the
  real command line.

- **A real search box on every engine-built node.** `/search/` was an index list with
  the sentence "The index of this node is /search.json"; it is now a search form over
  that index, with the list of every published item beneath it — which is still the
  whole page for a reader without script, so nothing is lost there. The page loads one
  same-origin classic script, `/search/agsc-search.js` (`src/distribution/search-page.js`;
  no inline script or style, AGSC-06-17), which fetches `/search.json` and, above 500
  items, the `/search-<nn>.json` shards it names (AGSC-06-21) — an unreadable shard is
  reported as `AGSC-E901` and answered with no hit, as the rule requires. The script
  searches with **the same tokenizer the index was built with**: as the `/compose/`
  page does for the combiner, it carries the own source text of
  `src/distribution/search.js#tokenize` and `#query`, and
  `tests/distribution/search-page.test.js` proves the two hosts byte-identical and
  runs the page over a build's own bytes. Ranking is one point per distinct query
  token, then slug — the order the `search` page tool gives, so a person at the box
  and an assistant calling the tool see the same order. Title, description and link
  are shown for the first forty hits, the count in a live region; `/search/?q=<words>`
  opens already searched. `tests/distribution/search-page-browser.test.js` walks the
  page in a real browser by keyboard alone under the browser lane (`AGSC_BROWSER=1`).
  The tokenizer is now a self-contained function (no module-scope constant), which
  changed no token.

- **A requirements matrix, generated and enforced** (`tools/requirements-matrix`,
  `docs/REQUIREMENTS-MATRIX.md`, `tests/requirements-matrix.allow.json`,
  `npm run requirements`). For every requirement of `docs/PRD.md` the page lists the
  rules whose trace bracket (or bold citation) carries it, the checks that verify
  those rules, and the tests, live vectors, scenarios and documents that name it. A
  requirement no rule traces to and no test or vector names must have a reason from
  a closed list, and the suite fails otherwise or when the page is stale.
- **`docs/ENGINEERING.md`**: the gates in plain words — what each enforces, how to run
  it, the size limits and why, how to add a module without breaking the dependency
  rule, and how the repositories are checked by their workflows.
- **Workflow files are checked**: a job of `.github/workflows/test.yml` runs
  `actionlint` 1.7.12 (the release binary, its SHA-256 verified before it runs) over
  every workflow of this repository.

### Fixed

- **Security: a forged own-record line no longer passes as this node's own**
  `src/interchange/own-record.js`, used by the `skills`, `gabbe` and `cogx` import lanes).
  A hidden `<!-- agsc-item … -->` line (or a COGX record's `metadata.agsc`) is trusted
  only when it names this node's `site.base` or a declared `peers[]` entry and its
  content version (and fingerprint, when present) agree with the file's provenance
  header. Any other line is reported by file and line and ignored: the file is read as
  foreign, its claimed provenance and status are dropped, `x-…-source` is recorded, and
  with no recognised open licence the item arrives as a draft (never published). Own
  and peer round trips stay byte-identical.

- **`tools/validate-diagrams` on a directory that does not exist** now reports
  `AGSC-E901` with exit 1 and the diagnostics envelope, like the other checkers; it
  exited 2, as if the command had been mistyped.

- **Peer citations reach the graph**: a source under a declared peer's base is now
  `rdfs:seeAlso` + `asc:peerOrigin` in all four graph views (AGSC-11-12); the function
  existed and nothing called it. A reference under a peer base that is no IRI is
  `AGSC-E312`.
- **`cite-as` and the signature link are accepted** by the discovery checker, the
  federation reader and `tools/validate-wellknown` (AGSC-06-10, AGSC-06-35).
- **A lesson made by the `remember` tool is conforming**: it carries `severity: info`
  by default, on the MCP server and in the page script (AGSC-09-14b).
- **`tools/gen-spec-html --check`** finds the numbered chapter routes
  `/specs/<nn>-<name>/`, and `--check <dir> --text` compares a publisher's own pages by
  what they say (every rule's words, every table's rows) rather than by their bytes.
- **`tools/validate-vectors` and `tools/validate-diagrams` refuse a directory that is
  not their input** with `AGSC-E901` instead of judging unrelated files.
- **`agsc build` alone refuses an unsafe attachment** — an SVG with a script, a path
  that leaves its folder, a file over the cap, an archive, a link out of the Bundle —
  as `agsc ci` does, and every one is reported under the code its rule names
  (`AGSC-E412`, `E902`, `E903`, `E904`) instead of a missing-route `AGSC-E901`. The
  lint lane now reports an absent attachment and the attachment cap at all.
- **A file that is not UTF-8 is `AGSC-E108`** instead of being read with replacement
  characters; an oversized `agsc.config.json` is `AGSC-E904`; `import` of an archive
  is `AGSC-E903` instead of an internal error; an oversized import file is `AGSC-E904`.
- **The encoded-text threshold of the injection lint is 256 characters**, as AGSC-08-13
  fixes it (it was 128, so two long-but-legal runs were flagged). The security-floor
  score (`bench/security.js`) is now 85 of 85 named faults stopped, 13 of 13 valid
  controls clean, none under another code.
- **`agsc export --steer` states the node's content version** in its provenance block;
  it stated the build-instant fallback.
- **A node's legal texts follow its own licence and content**, not this project's:
  "All rights reserved" appears only when the prose is under the Content Use Terms
  (otherwise the footer names the prose licence); the machine-readable training
  reservation (`/.well-known/tdmrep.json`, the robots `ai-train=no` signal and the
  per-crawler `Disallow` groups) is published only then too, so a CC BY 4.0 node no
  longer restricts what its licence grants; the AI-assistance sentence appears only
  when an item records AI assistance; and the disclaimer comes from the node's own
  `DISCLAIMER.md` (rendered as its own section of `/legal/`) or is absent. Nodes that
  want the previous footer sentence add a `DISCLAIMER.md` carrying it. The terms
  identifier and the provenance header's assistance line are still emitted everywhere,
  because the current rules require them; the proposed rule change is recorded.

### Changed

- **Seven obligations the rules named on 2026-09-24 are now met by the engine.**
  An item whose `spec_version` carries another MAJOR than the Bundle root's is
  `AGSC-E204` (AGSC-00-17). A compiled `.svg` under `content/diagrams/` is `AGSC-E205`
  at lint (AGSC-01-07). Each unsupported Markdown construct — raw HTML, a footnote
  reference or definition, a task-list marker, strikethrough, an autolink literal —
  outside a code span or a fenced block is one `AGSC-E109` warning (AGSC-02-20,
  `knowledge/markdown.js#constructs`). Two published items of one type whose titles
  are equal after NFC and case folding are the warning `AGSC-E416` (AGSC-05-21). `ci`
  writes the gate verdict to `dist/gate.json`, JCS-canonical — `gate: "ci"` at `L1`
  with no gate item, one object per gate as an array in slug order with several
  (AGSC-08-10; `distribution/ci.js#gateVerdict`, a fifth `gate` lane). `remember` no
  longer writes a `severity` onto an episode, whose schema branch has none
  (AGSC-09-14b). `tools/validate-vectors` checks `superseded_by`: only on a
  withdrawn vector, a vector id, naming a vector of the set (AGSC-09-04).

- **Correction (2026-09-24) to the COGX entry below and to the connector documents.**
  COGX is the format Cognee reads and writes, and the shape into which Cognee
  translates Mem0, LangMem, Letta/MemGPT and Zep/Graphiti memories when they are
  migrated into Cognee (docs.cognee.ai/examples/migrate-memory-systems, read
  2026-09-24). An archive this engine writes is read by Cognee; the other systems do
  not read it. The earlier wording ("one archive … reaches all of them") stands below
  as history and is superseded by this line.

- **The npm package ships what a consumer runs, and nothing else.** `files[]` names
  the nine checkers of AGSC-09-90, `tools/count-artifacts`, `tools/bench` with its
  committed query set, and no maintainer tool: run from the installed package,
  `rule-coverage`, `public-hygiene`, `release`, `publish-set` and `gen-glossary` read
  the test suite, the allow-list or the repository and fail or mislead (2026-09-24).
  The release lane publishes the tarball it attested (one `npm pack`, then the file),
  its checkouts persist no credential, `test.yml` runs on branches only, and the
  composite action pins the same `actions/setup-node` v7.0.0 as the workflows.

- **`agsc init` names the two steps a build still needs**, on stderr — the
  publisher's `.well-known/security.txt` and a build instant — and writes the six
  reference crawler tokens to `site.tdm_crawlers[]`, because the default prose
  licence adopts the Content Use Terms and a reservation naming no crawler fails the
  build (`AGSC-E202`). With no instant the synthesized index description names no
  date instead of 1970 (2026-09-24).

- **The contributor agreement gains an optional assignment** (`CONTRIBUTOR-AGREEMENT`
  Part 3, clause (f); `spec/08-governance.md` AGSC-08-06 re-pinned; 2026-09-23). A
  contributor who wants the maintainer to hold the copyright in one contribution may
  assign it, in a separate signed and dated statement that names the contribution, and
  gets a licence back at once; where the law that applies to them allows no assignment,
  an exclusive licence and then a promise not to assert take its place, and moral
  rights are never touched. A sign-off alone never makes the clause apply, so the
  trailer grammar is unchanged. Parts 1 and 2 are byte-for-byte what they were; the
  file's SHA-256 moved from `9a91081f…b014a0b` (3413 bytes) to `e46c717f…6cbbf`
  (6813 bytes), and the token stays `CA-v1` because no distribution has shipped the
  earlier text. `tests/arch/license-content-pin.test.js` now also proves that Part 1 is
  the Developer Certificate of Origin 1.1 verbatim and that clause (f) says it is
  optional; `CONTRIBUTING.md` explains the choice in plain words.

- **The `codex` steer target now writes `AGENTS.override.md`**, not
  `.codex/instructions.md` (AGSC-01-28 as corrected at rc.6, /). Codex
  never read the old path: OpenAI's own documentation,
  <https://learn.chatgpt.com/docs/agent-configuration/agents-md> (read 2026-09-23), says
  Codex looks for `AGENTS.override.md` first and `AGENTS.md` second at each level, and
  that any other name has to be named by the reader's own `project_doc_fallback_filenames`
  setting. Every node that exported this target was writing a file nothing opened. The row
  takes `AGENTS.override.md` rather than `AGENTS.md` because the `agents` target already
  writes `AGENTS.md` and no target may write another's path. Nothing that passed before
  stops passing: no rule or vector pins a byte of any steer target's output.

- **A value outside a CLOSED operator list is now `AGSC-E203` and exit 1**, not
  `AGSC-E002` and exit 2 (AGSC-00-23). `export --steer --target <unregistered>` and
  `compose --emit <unregistered>` are findings, because the flag is known and only
  its value is not; AGSC-09-08 reserves exit 2 for an unknown verb, an unknown flag,
  a missing argument or invalid configuration. `compose --emit` also gained the
  closed registry AGSC-07-18 states, so the reserved name `executable` is refused by
  name rather than accepted and then ignored.
- **Invalid configuration now exits 2 wherever it is raised.** An `AGSC-E004` — an
  unknown or reserved key in `agsc.config.json`, or a source whose declared version
  an import does not implement — is the usage class of AGSC-09-08 and no longer
  exits 1, which a caller reads as "the content failed a gate". The diagnostic also
  **names the key**: `routing: must NOT have additional properties — that name is
  RESERVED to a later version …` rather than `/: must NOT have additional
  properties`, so a reserved name and a typo can be told apart.
- **A `restricted` node now actually omits what AGSC-11-20 says it must.** The rule
  has required a gated node to withhold `agsc-counts`, `agsc-bundle-hash`,
  `agsc-bundle-version` and `agsc-ledger-head` since rc.5, the checker did not look
  and the writer emitted them anyway; both now do the rule. A restricted document
  carrying one of the four is `AGSC-E210`.
- **`/now.md` is written after the graph views**, because the line AGSC-06-22 pins
  carries the fingerprint of `graph.nq`.
- **`graph.nq` has one form, and the conformance runner no longer chooses between two**
  (EXT-2b, 2026-09-23). The draft now states that every line of `graph.nq` is
  a quad named by the Bundle IRI (AGSC-04-15), which is what the engine's build has
  always written, so no published fingerprint changes. The `graph` area handler used
  to pick the default graph for vectors in the older `input.base` shape and the named
  graph for `input.site.base`; it now always names the graph, the five released
  vectors that stated triples are withdrawn, and `graph-0021`…`graph-0025` restate
  them as quads. `tools/validate-ontology` admits the ontology node's registry
  metadata (`voaf:Vocabulary`, `vann:preferredNamespacePrefix`/`Uri`,
  `dcterms:creator`/`publisher`/`issued`), and `tools/gen-ns` declares the `vann:`
  namespace in the RDF/XML it writes, so the vocabulary file can carry what LOV-style
  registries index (AGSC-05-25) without either tool turning red. The engine's
  discovery writer and `tools/validate-wellknown` do not yet admit the new optional
  relation names `cite-as` and `…/rel#signature`; nothing this project builds emits
  either.

- **`export --to <adapter>` hands every adapter the content version**: the
  provenance header an adapter writes now states the node's real `bundle_version`
  instead of the build-instant fallback. The `llm-context` skim view is the one
  existing adapter this reaches.

- **The engine follows the last rc.6 amendments (2026-09-24).** A node whose prose
  licence is not the Content Use Terms names its own licence wherever the terms
  identifier stood — the footer, the `terms:` line of every provenance header, each
  chunk's `terms` member, `schema:usageInfo`, skill packs, Harness files and every
  export adapter (AGSC-06-18). The `mcp` surface declares the revision its transport
  speaks, `2025-11-25` by default (AGSC-11-16). `remember` refuses `kind: gate`
  (`AGSC-E203`) and an episode with no declared actor (`AGSC-E003`), on the local
  server and in the page alike (AGSC-09-14b). `agsc mcp <path>` serves the Bundle at
  that path (AGSC-09-09). `AGSC-E003` exits 2 wherever it is raised (AGSC-09-08). A
  C0 control other than TAB and LF in a Markdown file is `AGSC-E108` (AGSC-01-14); a
  numbered chapter reference is refused as a pattern (AGSC-08-17). The discovery
  check and `tools/validate-wellknown` report a public Level-2 document without the
  ledger link as `AGSC-E202`; a build that was given no git history does not fault
  its own document for it and lists `/ledger.jsonl` as skipped (AGSC-10-04,
  AGSC-09-93).

### Added — plugins load from the command line, the ledger is published, empty type pages resolve (2026-09-24)

- **Plugins are wired** (AGSC-00-24). `export --to`, `import --from` and
  `compose --emit` take a local path or an installed package name, resolved through
  the registry of the kind the flag selects (`src/application/plugin-loader.js`);
  a specifier that names a protocol is `AGSC-E905` and nothing is resolved. A
  memory adapter answers `exportFiles(items, context)` / `importFiles(files,
  context)`, a composition emitter `emit(harnessFiles, harnessDir)`; the engine
  checks every path before it writes (`AGSC-E902`), and a plugin's import goes
  through the OKF lane's mapping and collision survey. `docs/PLUGINS.md` §4 states
  the contract; the memory-adapter sample implements both hooks.
- **`agsc build` and `ci` publish `/ledger.jsonl` and link it** whenever the Bundle
  has git history: the command line now reads the committed tree of `content/` and
  hands it to the derivation (AGSC-08-20, AGSC-08-20a). The git-log file carries the
  two optional members of AGSC-08-20b — `files[]` (from `--name-only`) and `author`
  (from `Channel-Auto:`, the `Assisted-by:` operator, or the sign-off) — and
  `export --steer` now evaluates the `Channel-Auto:` withholding from it, reporting
  it as not run when the file lists no `files[]` (AGSC-01-28).
- **Empty type index pages resolve** (AGSC-06-02): `/lessons/`, `/episodes/`,
  `/gates/` and the other type indexes are emitted even when empty, and stay out of
  the navigation.
- `agsc <verb> --help` prints a usage line with the verb's positional arguments and,
  for `export` and `import`, the flags each adapter adds.
- `tools/gen-glossary --check` and `--help`; the suite fails when `docs/GLOSSARY.md`
  is not what the sources generate, and trace brackets no longer reach the glossary.
- `tools/public-hygiene` also catches two-digit decision and requirement ids, audit
  and work-package ids of the other shapes, session labels, owner directions and a
  hundred-per-cent claim, while rule ids, error codes, RFC numbers, HTTP codes and
  CSS lengths stay quiet.

### Changed — packaging and the release lane (2026-09-24)

- `require('agentic-system-core')` gives the discovery constants, the package and
  specification versions (read, never typed) and `run()`; the name-reservation stub
  and its deprecated alias are gone.
- The npm package ships the conformance area handlers, the pending list, the graph
  fixture and the minimal Bundle, so `agsc conform` runs from an installed copy;
  `jsonld` is a runtime dependency for that run. A test packs the file list npm
  reports and runs `conform` from it. The package declares `Apache-2.0 AND
  CC0-1.0` and ships the governance, trademark, conduct and conformance-statement
  texts.
- The test scripts quote their glob with double quotes, which `cmd.exe` reads too.
- `tools/release --version` accepts the version the tree already carries (no bump
  steps are printed then); the printed checklist names the tag pair on one commit,
  the trusted-publishing setting, the deprecation check of the new version and the
  PyPI half in a whole sentence.
- `bench/measure.js` counts active rules with the counter's own retired-rule test;
  the conformance, security and package layers were measured again.

### Fixed (2026-09-24)

- `compose` writes nothing — no Harness, no archive — when the run has an error
  finding, and a Harness whose own files break a rule is not written at all.
- The recall hook of the Claude Code example splits `llms-ctx.txt` only at headings
  outside a code fence, so a quoted body stays quoted.
- The clean-room rewrite removes a chapter cited by any number, as the lint finds it
  (AGSC-08-17).
- `remember` publishes the `actor` argument it requires for an episode, on both
  transports (AGSC-09-14b); an authored `content/assets/theme.js` is reported
  when the engine's theme script replaces it.

### Added — tests at every level, and every rule accounted for (2026-09-24)

- **The persona scenarios run.** `tests/acceptance/features.test.js` parses
  `features/*.feature` with the Gherkin reference parser (`@cucumber/gherkin`
  42.0.1 and `@cucumber/messages` 34.2.1, development dependencies at exact pins)
  and runs every scenario against the real command line and the real local tool
  server; a scenario that cannot run offline, or whose text no longer matches the
  command-line contract, is listed with its class and reason in
  `tests/acceptance/pending.json` and counted.
- **The rule-coverage matrix.** `tools/rule-coverage` lists, for every active rule,
  the vectors, tests, executed scenarios and checker headers that verify it, and the
  suite fails when a rule has neither a check nor a stated reason
  (`tests/rule-coverage.allow.json`); rules the engine does not implement yet are
  listed as gaps. The generated page is `docs/RULE-COVERAGE.md`; test files mark the
  rules they verify with a `// verifies AGSC-nn-nn` comment.
- **Tests of the standard itself** (`tests/standard/`): the route set of AGSC-06-01
  against a real build in both directions, the error-code registry against the rules
  and the engine, every schema `$id` and `$ref`, the discovery relations and target
  attributes against AGSC-06-10, every emitted text as NFC with one trailing LF and
  every JSON artefact as JCS, the Internet-Draft's lists against spec/06, the Level
  area sets against spec/10, and one test for each rule no vector pins.
- **End-to-end tests** (`tests/e2e/`): a Level-0 node written without the engine
  passes the shipped checker; with `AGSC_E2E=1`, the patterns node and the main
  site's Bundle go through every verb; with `AGSC_BROWSER=1`, the page tools answer
  through `document.modelContext` in a headless Chromium.
- `.github/workflows/test.yml` runs the suite, the matrix check and every validator
  on Ubuntu, macOS and Windows, Node 22 and 24. `docs/TESTING.md` explains the levels.

### Fixed — what executing the scenarios and the standard's tests found (2026-09-24)

- `init` no longer stops with an internal error when an adopted note links to
  another adopted note: every referenced file is read, as bytes, before any adopted
  file moves (AGSC-02-95).
- `ci` fails wherever `build` fails: the faults only a writing lane raises — the TDM
  reservation without `site.tdm_crawlers` (AGSC-06-18) and a defaulted `Expires`
  (AGSC-06-36) — were reported by neither lane of `ci` (AGSC-09-08).
- `ci` compares its two builds byte for byte: an authored asset or attachment was
  compared by identity, so every Bundle with one failed as non-reproducible
  (`AGSC-E602`, AGSC-04-02); `verify` hashes a byte array as bytes.
- `verify --ledger` compares the recomputation with the ledger and the head the node
  published: a changed line is `AGSC-E702`, and a node with no history re-verifies
  the published file, a truncated tail being `AGSC-E701` (AGSC-08-23).
- An item whose `stale_after` fell earlier on the build's own day is stale
  (AGSC-02-11).
- A `memory://` alias of this node, and its https item IRI, are accepted wherever a
  slug is — `read`, `links`, `propose`, `compose`, `remember` — on both transports
  (AGSC-05-04a, AGSC-05-04b).
- An authored `iri` that is not the computed item IRI is `AGSC-E204` (AGSC-05-05);
  a `tags` array of fewer than two or more than five values is the warning
  `AGSC-E213` (AGSC-01-21); foreign link names are mapped on an OKF import —
  `refines` to `narrower`, `blockedBy` to `blocked-by` and the rest of the table
  (AGSC-03-19, AGSC-03-20).
- Every HTML page ends with one line feed (AGSC-04-07).

### Changed — the persona scenarios run as written (2026-09-24)

- The persona scenarios of `features/` name the command line as `agsc <verb> --help`
  states it at 1.0.0-rc.6 — flags, arguments, output paths and messages — and the
  runner executes them: 36 of 58 run (6 before), none is pending for a mismatch with
  the command line, and 22 stay pending because they need a forge, a model adapter,
  an outside service or a live browser session, or wait on one engine gap (a second
  `init` over a built Bundle, AGSC-02-91).
- A thirteenth feature file covers the port implementer: a Level-0 node written
  without the engine passes the shipped checker, and the Python checker package's
  `run-vectors` agrees with the engine's `conform` on every vector it runs (that
  scenario runs where the package's checkout sits beside the engine).
- Offline steps run under a preload that refuses every network call, so a scenario
  that passes also shows that its lane reached no network and no model service.
- `tools/rule-coverage` states how many rules the executed scenarios name.

### Fixed — every mode works in practice, walked end to end by a person and an agent (2026-09-24)

A walk of the six modes from an empty folder, with only what a public user has, found
places where a mode did less than it promises. Each is fixed test-first, and the walk
itself is now `tests/e2e/modes/` (one file per mode, the real command line, real git
with fixed dates, the official MCP client over stdio, loopback only; the Chromium lane
behind `AGSC_BROWSER=1`).

- **`propose` carries the person's edit.** The patch runs from the committed version of
  the item (`git show HEAD:./<path>`, nothing for a new file) to the canonical working
  bytes; with no history it runs from the working bytes as before. An empty Proposal
  prints no command that would fail, and the commands printed fit the working tree
  (AGSC-08-04).
- **The `/compose/` page builds the same Harness as `agsc compose`.** The page takes the
  content version from the discovery document, the `bundle:` base from its `anchor`
  (never the origin it is served from) and each member's `kind` from the graph; the
  identity test now runs the real command line against the page (AGSC-07-13).
- **The discovery document links only routes the node emits**: `license` when `/legal/`
  is written, `service-doc` when `/specs/` is; a node without them no longer sends
  every agent to a 404 (AGSC-06-08, AGSC-06-10).
- **Who holds a task is derived, and a held task cannot be claimed again.**
  `claimed_by` is the author of the last commit that touched the task's file, as
  AGSC-10-13 says; the page tools read it from the board exports and the tool server
  from its build, so both refuse, for every caller, a claim of a task another
  participant holds, and a lane's work-in-progress limit counts claims merged from its
  own commits (AGSC-10-17).
- **The monthly spend counts episodes by the month they started** (`started`), so NOW
  reports the real spend and the budget cap can trip (AGSC-08-25, AGSC-01-38); a lane's
  row counts `process:<name>` episodes.
- **`llms-ctx.txt` states the content version** `/llms.txt` states (AGSC-04-25).
- **`ruleset.json` requires the one check a CI job reports**, `agsc ci` — the job name
  the action's usage now shows — instead of the gate check names no job reports, which
  would have blocked every merge; `status-checks.json` is unchanged (AGSC-08-12).
- **`skills`, `skills install` and `mcp` refuse outside a Bundle** with `AGSC-E901`, as
  `build` does, instead of exiting 0 having done nothing (AGSC-01-01).
- **`skills install` verifies what is on disk**: the packs `agsc skills` wrote under
  `dist/skills/`, against the lockfile beside them, so an edited pack installs nothing
  (`AGSC-E413`); an update prints the unified diff (AGSC-07-20).
- **`skills import` splits a pack of this format** into its member procedures, filed in
  the pack's Cluster, and reports the other members; it never writes over an item the
  Bundle holds (AGSC-07-22, AGSC-01-23). `import --from skills --cluster <slug>` files
  imported skills in a Cluster, so they reach its pack.
- **`build` checks the configuration and the Bundle root as `lint` does**, so it no
  longer publishes an `http://` peer or a root that `lint` rejects.
- **Adoption resolves links against where files land**: two notes that link to each
  other and move together still resolve; a second `init` over an adopted, built Bundle
  adopts nothing from `www/`, `dist/` or `content/assets/`, and a slug an item holds is
  taken (AGSC-02-91, AGSC-02-95).
- **Item pages show what a person needs**: a task's state, a gate's level and checks,
  and the item's typed Links (published targets only); a board with no lane says so in
  a plain sentence.
- **`refresh --agent <name> --dry-run` proposes the Episode of the run** as a new item
  and prints the commands a person may run (AGSC-08-28(f)).
- **`remember` returns conforming items**: an episode needs `at` (`AGSC-E003`), an actor
  outside AGSC-02-09 is refused (`AGSC-E204`), `usage` is carried onto the episode, and
  the manifest names `usage` and the caller's identity members; `propose` returns the
  item's file with exactly one blank line after the frontmatter.
- **Plain diagnostics name their file**, as the `--json` envelope does.
- **`lint --fix` judges the repaired files**: a fault it repaired is reported once, as
  its warning, and no longer fails the run (AGSC-04-19).
- **A failed `export` writes nothing** (a missing `LICENSE-CONTENT` left a partial
  export behind).
- **An OKF import records the licence**: a record whose licence cannot be established —
  its own `license`, the source's root `index.md`, or a licence file at the source root
  — is written `status: draft` and reported; a document mapped to `concept` gets
  `kind: explainer` (AGSC-01-22). The licence list the skills adapter used is shared
  (`src/interchange/licences.js`).

### Documentation — a way in for every reader (2026-09-24)

- `docs/START-HERE.md` sends each kind of reader down one path; `AGENTS.md` at the
  root orients an agent; `docs/ARCHITECTURE-GUIDE.md`, `docs/CODE-ORIENTATION.md`,
  `docs/SPEC-ORIENTATION.md` and `docs/PROTOCOLS.md` are new. Nine diagrams were added
  to `docs/diagrams/`, and every Mermaid block of the pack is also committed rendered,
  under `docs/diagrams-rendered/`, with its render script.
- A README in every folder a reader opens: `bin/`, `tools/`, `spec/`, `schema/`,
  `ontology/`, `docs/`, `examples/`, `.github/workflows/`, `tests/` and each test area,
  and each folder of `src/` except `ports/` (whose test holds it to its four files).
- `src/README.md` is now a module guide. Its per-module reference moved unchanged to
  `src/REFERENCE.md`, and its engineering log to "Engine notes moved from
  `src/README.md`" at the end of this file.
- The root README says what is different about the specification, what it is best
  for, and how to start. `docs/IMPLEMENTERS-GUIDE.md` gained the ten-step Level-0
  path, the platform mapping table, the two routes to a claim, a SPARQL example over
  two nodes' dumps, and "Where a node can live".

### Changed — the clean-code and architecture gates, and a smaller engine (2026-09-24)

- **Node floor 22.13.0.** `engines.node` is `>=22.13.0` in both packages and the lowest
  entry of the `test.yml` and `release.yml` matrices; `tests/arch/node-floor.test.js`
  keeps the three equal. Node 22.12.0 printed a warning on standard error each time the
  engine required one of its ES-module libraries (`commander` 15), which breaks the MCP
  server's clean-stderr contract; 22.13.0 prints it only on request.
- **Linter and formatter.** `npm run lint` (ESLint 10.11.0 with its recommended rules,
  eslint-stylistic 5.10.0 set to the style the code already had, `import-x/order` for
  the require groups, and complexity and length budgets at the measured maxima) runs
  with zero warnings over `src/`, `bin/`, `tools/`, `tests/`, `bench/`, `examples/` and
  `packages/`; `npm run format` is `eslint --fix`. The one-time formatting pass changed
  layout only (every file's syntax tree is unchanged, except five files whose requires
  were regrouped).
- **The dependency rule by a tool.** `npm run arch` runs dependency-cruiser 18.4.0 over
  `src/`, `bin/` and `index.js` with `.dependency-cruiser.js`: the context map, the Node
  built-ins each context may use, adapters wired only by the application layer,
  Interchange and Distribution apart, no module requiring a sample plugin or a checker,
  no development dependency at run time, no undeclared or unresolvable require, no
  cycle, no orphan module. `npm run duplicates` (jscpd 5.3.2) fails above 2 %
  duplicated lines in `src/`. The linter and `arch` run in `test.yml`.
- **`governance/ledger.js#compare`** — the published ledger against the recomputation
  of its history (`AGSC-E702` at the first differing line, `AGSC-E701` for the head),
  or on its own when there is no history. `verify --ledger` calls it; the `ledger`
  conformance area accepts a vector whose input names `published`. (AGSC-08-23)
- **One definition per helper.** `interchange/records.js` holds the helpers the import
  adapters shared by copy (`isObject`, `plain`, `oneLine`, `itemText`, `yamlString`,
  `lessonText`); `interchange/own-record.js` holds the record codec
  (`encodeRecord`, `decodeRecord`); `knowledge/markdown.js#fenceProse` replaces three
  copies; `boundary/surfaces.js#finding` and `boundary/federation.js#plural` replace
  their copies in the Boundary context; `verbs/_helpers.js#instantOf` replaces two.
- **Host access moved to the edge.** The HTTP server of `agsc-host serve` is the
  adapter `adapters/node-http-server.js` (the `local` profile still decides every
  answer); `application/config/env.js` reads the configuration schema through
  `adapters/node-fs.js#readSchemas`; `distribution/mcp-stdio.js#serve` requires the
  process streams from its caller (`verbs/mcp.js` passes them). A test now holds every
  bounded context, not only the three pure ones, free of `process`, clock and
  randomness.
- **Removed as unused:** 156 exported names no module, test, example or site script
  used (they stay as module-local functions and constants), four dead constants
  (`chunks.js` bounds the schema already enforces, `export-bundle.js#INDEX_KEY_ORDER`,
  `prov.js#ACTOR`), two unused parameters and 63 stale lint-directive comments. Comments
  that told the history of a change now state the behaviour.

### Changed — the last specification items before the tag (2026-09-25)

- A Bundle whose `agsc.config.json` declares a `spec_version` of another MAJOR is
  refused by `lint`, `build` and `ci` with `AGSC-E004` and exit 2; a newer MINOR of
  the engine's own MAJOR is read with the warning `AGSC-E506` (AGSC-00-15). Vector
  `bundle-0008`.
- A `README.md` or `_index.md` inside a type folder is never read as an item: the
  reader skips it with `AGSC-E506`, so a folder note beside the items no longer
  fails `lint`, `build` and `ci` (AGSC-01-05).
- The discovery document links `/boards/index.json` as `…/rel#boards` (type and
  digest) whenever the build emits it; `tools/validate-wellknown` admits the relation
  (AGSC-06-10, AGSC-10-13).
- Forge drift (`AGSC-E707`) is measured against a file the repository tracks at the
  forge's own path (`.github/CODEOWNERS`, `CODEOWNERS`) and never against the
  previous run's `dist/forge/` output, which is regenerated on every run — a changed
  `checks[]` no longer fails every later `ci` (AGSC-08-12).
- `remember` on the local server refuses a call that declares no operator with
  `AGSC-E003`, unless it declares an enabled lane's `agent`, whose entry supplies
  `prov.operator`; the page tools return the item with `prov.operator` absent and the
  warning `AGSC-E506` (AGSC-09-14b).
- `init` and the `adopt` conformance handler write the same starting crawler list;
  `adopt-0004` is withdrawn and superseded by `adopt-0006`, `imp-0003` by `imp-0004`
  (the licence in the input); `ledger-0006` and `ledger-0007` prove the
  published-versus-derived comparison of AGSC-08-23.
- `CONTRIBUTOR-AGREEMENT` clause (e) also licenses a contribution as part of any
  other collection, edition or publication the operator makes from this node's
  items; the hash and byte count are re-pinned in AGSC-08-06 and the token stays
  `CA-v1`, no contribution having been accepted under it.

### Changed — performance and cost, measured (2026-09-25)

Every number below is in `docs/MEASUREMENTS.md` (§4, §9, §11) with the command that produced it, measured before and after on the same machine the same day; every emitted byte is unchanged except the two page scripts named.

- **Writing a build is cheaper** (`src/adapters/node-fs.js`). The FileSystem adapter walked the real path of every file it wrote to keep a planted link from leading a write out of the Bundle root; it now remembers the directories it has proved literal and judges a new entry under one of them by a single `lstat`. A link planted under a trusted directory is still refused in every method (`tests/adapters/node-fs.test.js`). With one map lookup replacing a scan per link target on item pages (`src/distribution/site.js`), a 5,000-item build takes 30.2 s instead of 38.2 s and a 10,000-item build 58.5 s instead of 79.1 s (median of 3); peak memory unchanged; the 5,000-item output byte-identical.
- **An item page no longer downloads the whole node** (`src/distribution/page-tools.js`, `compose-page.js`). The page tools read their corpus — one Markdown view per published item — at page load for every visitor. The read now starts at once only where a caller is expected (a browser exposing `document.modelContext`, the `/compose/` page) and otherwise on the first tool call; the answers are the same on both paths (`tests/distribution/page-tools-lazy.test.js`). An item page of the pattern node costs 6 requests and 110 KB instead of 54 and 263 KB; of the main site 6 and 107 KB instead of 27 and 140 KB.
- **The MCP server answers `search`, `ask` and `links` without re-deriving the node** (`src/distribution/mcp-tools.js`): the per-item token sets and the resolved edges are computed on first use and kept, since a served Bundle is loaded once. On a 5,000-item Bundle a `search` call takes 69 ms instead of 1,527 ms, `links` 1.5 ms instead of 1,691 ms, `ask` 9 ms instead of 1,447 ms; the answers are unchanged.
- **A cluster page lists at most 500 members** (`src/distribution/site.js`, `html.js`) and says how many there are and where the complete membership is (`/search.json`, the graph). A cluster of 1,000 members listed in full measured 158 KB — over the 100 KB page budget of AGSC-06-21, which never paginates an item page — so the build of any Bundle with such a cluster failed. Neither reference node has one; their bytes are unchanged (`tests/distribution/cluster-pages.test.js`).
- `tools/gen-spec-html --check … --text` reads a chapter a publisher serves in parts (`<chapter>/page-2/`, …) as one page, so a chapter split under the page budget is checked for its rule text and table rows as a whole (`tests/tools/gen-spec-html.test.js`).
- `docs/MEASUREMENTS.md` §11 states what a visit, an agent session and a month of hosting cost, and where a node of a given size can be hosted by the host's published limits (Cloudflare Pages: 20,000 files on the Free plan — about 6,600 items; static requests unlimited; both reference nodes 0 USD a month). Supported scale, stated from the numbers: measured to 10,000 published items.

## [1.0.0-rc.6] — the engine follows the draft `1.0.0-rc.6` (2026-09-22)

The first release published to npm as a working package. `0.0.2` reserved the two
names and shipped no runtime; this ships the engine, the command line and the nine
independent checkers, at the specification's own release-candidate number.

### Added

- **`/assets/<path>`** (AGSC-06-01). Every file under `content/assets/`
  that a published item's body references is emitted at its own route, bytes
  unchanged, and the body's reference is rendered as that route. Until now the rule
  admitting such a reference and the route set that carried none were jointly
  unsatisfiable, so a Bundle with an image published a link that 404s; the engine
  warned about it and could do nothing else. The warning is gone with the cause.
- **`/ns/<ontology-version>/context.jsonld`** (AGSC-06-01, AGSC-05-09). A Level ≥ 2
  build serves the versioned copy beside `/ns/context.jsonld`, byte-identical to it,
  so the persistent URL a Level-0 document names resolves to the same bytes.
- **The AI-assistance statement** (AGSC-06-15, of 2026-09-22). One
  constant line, last in the provenance header of `/llms.txt`, `/llms-full.txt`,
  every skill pack, every steer bundle, the `llm-context` skim view and every
  Harness file; and a section of its own on `/legal/`, in the same words. It says
  only what the format has recorded per item and per contribution since rc.2.
- **`site.tdm_crawlers[]`** (AGSC-06-18). The robots dialect gets the input
  it never had: one `User-agent`/`Disallow: /` group per named training crawler, in
  configuration order, before the `User-agent: *` group, and no `Disallow` for any
  other token — so an assistant fetching for a person, and a search crawler, stay
  invited. **A node that publishes a text-and-data-mining reservation — every node
  at 1.x — and names no crawler now fails its build with `AGSC-E202`.** This is the
  one configuration change that makes a previously valid Bundle invalid, and it is
  the point: before it, the rule could not fail for any Bundle that could exist.
- **The footer's copyright line and disclaimer** (owner legal pack, 2026-09-22).
  Neither the name nor the year is hard-coded: the name is `site.author` and the
  year is the year of the build instant, so the footer stays byte-reproducible and
  this engine never stamps one owner's name into somebody else's pages. With no
  author configured, no copyright line is emitted at all.
- **`asc:mentions`** (AGSC-05-27, AGSC-03-11, AGSC-05-16). An inline
  Markdown link between two items of a Bundle emits one triple per ordered pair,
  whatever the number of references; a self-reference emits none; there is no
  computed inverse. Three rules mapped this edge and no engine emitted it. **It moves
  `graph.nq`, `graph.ttl`, `graph.jsonld`, the per-item `.jsonld` and the bundle hash
  of every node that has an inline body link.**
- **`tools/` ships in the npm package**, with `features/` and `docs/diagrams/`, the
  inputs two of the nine checkers read. `npm pack` carried 286 files and none from
  `tools/`, so nobody who installed the package received a single one of the
  independent checkers that AGSC-09-90 requires a reference distribution to include.
- **`CONTRIBUTOR-AGREEMENT`** at the distribution root — the text the sign-off token
  `CA-v1` names (AGSC-08-06) — shipped in the package, pinned by SHA-256 in the rule
  and checked against that pin by an architecture test, as `LICENSE-CONTENT` is.
- **`tools/release` prints the whole release procedure**, including the live checks
  after the workflow is green and the rollback, with npm's own unpublish policy
  quoted. It is printed where whoever runs the check reads it; the long-form runbook
  is the maintainer's and is kept outside this repository.

### Changed

- **`--&gt;` replaces `-- >`** as the neutralisation of a comment-closing sequence in
  an interpolated provenance value (AGSC-06-13a), and `lint` reports the
  authored value.
- **`/ns/context.jsonld` has one derivation of a term's name** (AGSC-06-32).
  `tools/gen-ns` named every `asc:` term `asc:<Term>` while the engine used the bare
  local name, so the file the tool generates and the file the engine builds were not
  the same file — although the rule now makes that file a constant of the
  specification that every node's copy must equal byte for byte. The engine's
  derivation won; the tool follows it, and its `--check` lane now resolves a term by
  its `@id` rather than by the key, which is what made the check pass over nothing
  once the keys changed.
- **`run` and `expect` are the only executable fences** (AGSC-02-22, AGSC-09-94).
  The braced spellings `{run}` and `{expect}` are ordinary rendering hints
  again; the engine accepted both while the two rules disagreed about which one an
  author writes.
- **A trace record has the members the rule names** (AGSC-09-94):
  `started`, and optionally `ended`, `actor`, `title`, `outcome`, `body`, `usage`.
  The older names this engine also accepted — `at`, `start`, `end`, `agent`,
  `status`, `summary`, `output`, `name` — are now preserved under `x-trace-<key>`
  rather than placed, so a record written for this engine imports into another.
- **A repeated value flag is `AGSC-E002`** (AGSC-09-09, AGSC-01-28).
  `--target agents --target claude` silently exported `claude` alone; a list is one
  comma-separated value.
- **The nine checkers FAIL over an absent input** — exit 1, the AGSC-09-11 envelope
  and `AGSC-E901` (AGSC-09-90). Five of them printed a usage block and
  exited 2, so the code was in prose that a caller reading the envelope never saw.
  Each states how many input files it read, so "nothing is wrong" cannot be mistaken
  for "nothing was looked at".
- **Every validator blocks the release workflow.** `validate-spec` was a reporting
  step while the specification items it found were open; they were applied at rc.6.
- **Both packages publish with `--tag latest` written out**, and the alias
  `agsc-cli` now CALLS the engine: it loaded `bin/agsc.js`, whose auto-run is guarded
  by `require.main === module`, and therefore ran nothing at all.
- `CONTRIBUTING.md` no longer says the text of `CA-v1` is unpublished; it is.

### Fixed

- **`tools/validate-spec` and `tools/count-artifacts` read a historical note the
  same way** (AGSC-09-91 carve-out (a)): the word list gains *for, against,
  written, re-verified* and a `YYYY-MM-DD` date test. The merge gate reported
  fourteen errors that were all false in substance.
- **`AGSC-E203` and `AGSC-E602` are no longer borrowed codes** in `run`: the registry
  rows now name the rule that raises them.


### Fixed — the build instant really comes from the last commit (2026-09-21, session close)

- With no `SOURCE_DATE_EPOCH`, AGSC-04-09 makes the build instant the time of the last commit and only falls to 0 where no git history exists. `createClock` accepted that value and `node-proc.js` named the git read as its one caller, but nothing performed the read, so the real command defaulted to 0 inside every repository. Every gate had run with the variable set, so no test noticed; once the writer refused to derive a `security.txt` expiry from a defaulted instant, a plain `agsc build` in a committed Bundle failed. `src/adapters/node-clock.js#readLastCommitSeconds` now reads `git log -1 --format=%ct` through the ProcessRunner port (no shell, scrubbed environment, skipped when the variable is set, `null` on anything but one clean integer) and `bin/agsc.js` passes it to the clock. Test: `tests/bin/agsc-build-instant-from-git.test.js`.


### Fixed — the findings of the independent verification of

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

### Fixed — the two legal-facing surfaces are valid and complete

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
  version and release date deliberately left to be filled at 1.0.0). No
  `NOTICE` file: the repository carries no third-party attribution notice, and
  Apache-2.0 §4(d) obliges propagation only where the Work includes one.

### Fixed — the vocabulary now reaches the build, and `graph.jsonld` is compact at every Level

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

### Added — the last three export forms, the three refusing commands, the release lane and the implementers' guide

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
  step, and the checklist the maintainer runs. It cannot publish: it spawns no process and opens
  no socket, and `--apply` writes only two version strings and one changelog heading.
- **`.github/workflows/release.yml`** — the tag-triggered lane: a three-OS, two-Node gate
  matrix, then `actions/attest-build-provenance` and `npm publish --provenance` over npm
  trusted publishing. No secret, SHA-pinned actions, never `pull_request_target`.
- **`docs/IMPLEMENTERS-GUIDE.md`** — how to write a second implementation from `spec/` and
  `tests/vectors/` alone: reading order, the byte-level pitfalls, how to run the vector set
  and the nine validators against your own output, what is implementation-defined, and how
  to claim a Level. It discharges `AGSC-01-26a`'s obligation to list every adapter with its
  claimed key set.

### Fixed — three items the last fix package recorded

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

### Not implemented, and why

`AGSC-09-94` requires a `run` step to execute "with no network". A Node process cannot deny
a child process the network from inside itself; that needs an OS sandbox on the host. The
ProcessRunner port therefore carries a declaration, `isolated`, the adapter this
distribution ships sets it to `false`, and `agsc run` refuses to execute rather than run a
step under a guarantee the engine cannot make. Everything else the rule pins is implemented
and tested, `run --dry-run` works in full, and no conformance Level requires the verb.


### Added — the seven remaining independent validators

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
pinned libraries. Every new tool is fully line-covered by its own tests.

### Reported, not fixed — two defects `gen-ns` found in the emitted namespace

- `/ns/context.jsonld` carries the `asc` prefix and the 24 external term definitions
  but **none of the 52 `asc:` term definitions** `AGSC-06-32` requires
  (`src/knowledge/jsonld.js#context`).
- Because of that, `graph.jsonld` writes vocabulary IRIs in full rather than compacted,
  so the same rule's round-trip clause does not hold: re-compacting the reference
  build's graph against its own context yields `asc:Bundle` and `asc:specVersion`.

### Added — the seven tools work IN A PAGE

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

### Fixed — four silently unmet MUSTs behind the page tools

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

## [1.0.0-rc.5] — the engine at the `1.0.0-rc.5` tag (2026-09-21)

### Changed — the engine conforms to the DRAFT `1.0.0-rc.5`

- The spec version the engine states has ONE home:
  `src/application/cli/main.js#SPEC_VERSION`, now `1.0.0-rc.5`. Every envelope,
  report, `llms.txt` provenance header and `/compose/` page takes it from there.
- **`agsc --help` and `agsc <verb> --help`** print the verb set and the flag list to
  stdout and exit 0 (AGSC-09-09 as amended); with a verb, that verb's flags.
  Under `--json` the same facts come back as one canonical JSON object. Until rc.5
  `--help` was `AGSC-E001` and `<verb> --help` was `AGSC-E002`.
- **BREAKING for a tool client: the `ask` envelope is flat.**
  `{body, citations, license, source, trust, type}` — the AGSC-08-18 envelope with
  exactly one added top-level member — where `body` is the answer TEXT with the
  Content Use Terms line in it, and exactly `no answer in this memory` when nothing
  matches. It used to nest `{answer, citations, terms}` inside `body`
  (AGSC-09-14a as amended; vector `cli-0007`). Both transports change
  together, so AGSC-09-16 still holds.
- **BREAKING for an MCP client: the `extensions` capability is a MAP**,
  `{"com.agenticsystemcore/knowledge": {"linkset": "<base>/.well-known/knowledge-linkset"}}`,
  as MCP defines it and as AGSC-11-18 now pins it (vectors `bnd-0035` and
  `bnd-0036`). It used to be the bare identifier list, and `bnd-0027` — the one vector
  that stated it that way — is withdrawn for it under AGSC-00-16, superseded by
  `bnd-0036`. The conformance handler no longer projects the map to its key
  set for any vector.
- **`schema:license` and `schema:usageInfo` are `xsd:string` literals on the Bundle
  AND on every item**, and the Content Use Terms identifier is the constant of
  AGSC-06-18 rather than a configured IRI. All four RDF views move together
  (AGSC-05-26 as amended; vectors `graph-0015`…`graph-0018`).
- **AGSC-06-21's index budget is one number measured per index DOCUMENT** —
  1 MB (decimal) for `/search.json` and for each `/search-<nn>.json` shard. The
  per-published-item and 500 KB absolute bounds are gone: they were jointly
  unsatisfiable with AGSC-06-23 for any Bundle of more than roughly 200-word items,
  and summing a manifest and its shards measured eleven documents as one.
- **The compiled diagram is inline in its item's page**, in a `<figure>` whose
  accessible name is `diagram.alt`, at no route of its own, and inside AGSC-02-98's
  allow-list (AGSC-01-07/AGSC-02-13 as amended). Pages that carried alt text
  and no picture now carry the picture.
- **`/attachments/<slug>/<file>` is emitted**, with the authored bytes AGSC-05-29
  hashed (AGSC-06-01). Every page linking an attachment used to raise
  `AGSC-E901` for a route the build did not produce.
- **The AGSC-11-08 address guard is unconditional on every redirect hop**, closing
  the last fail-open path in the transport rules and the one blocker for 1.0.0
  (`bnd-0005` withdrawn → `bnd-0030`).
- `lint --fix` reports a code per NORMALISATION — `AGSC-E108` for the encoding third,
  `AGSC-E506` for the rest (AGSC-04-19 as amended). An adapter's own flags
  (`--selection`, `--corrections`, `--attach-diagrams`) are adapter-scoped and are
  `AGSC-E002` under any adapter that does not define them.
- Fixed: the `search` and `ask` tools tokenized the body alone, matching neither a
  title, a description nor a tag on a loaded Bundle (AGSC-06-23); an item whose
  primary cluster was not listed appeared in no `/llms.txt` section at all
  (AGSC-06-14); a malformed `Assisted-by:` line was silently dropped instead of
  making the trailer block `AGSC-E504` (AGSC-08-06).
- `tests/conformance/pending.json` is EMPTY: the vector set runs
  `136 pass, 0 fail, 14 skip (14 withdrawn, 0 pending) of 150` (which added
  `fm-0010`; it was `135 pass … of 149`, and `135 pass … 13 withdrawn … of
  148` before `bnd-0027` was withdrawn and `bnd-0036` added).

### Security — authored single-line strings cannot inject structure

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
    Bundle moved. This also closes, which was the same hole in
    `interchange/adapters/llm-context.js`.

### Changed — the Content Use Terms text is PINNED

- `AGSC-06-18` as amended at rc.5 now says which text the identifier
  `LicenseRef-AgenticSystemCore-Content-Use-1.0` names: the `LICENSE-CONTENT` file whose
  SHA-256 is `b2e8da62e6a41886296d2d2358fb4642cc7418e806eb4a29ada12b588ac32857` (2,133 bytes).
  A distribution shipping different text MUST use a different identifier. Until now the
  wording was "an outside this specification", so the identifier named no
  fixed text and two nodes could carry it over different terms.
- `tests/arch/license-content-pin.test.js` reads the hex and the byte count out of the RULE
  and hashes the file, so the pin fails the suite rather than rotting silently; a second
  test pins the identifier's one spelling across `chunks.js`, `harness.js` and `mcp-tools.js`.
  All three distributions (engine, patterns node, first node) already carry byte-identical
  text, so no emitted byte moved.

### Fixed — AGSC-03-11's asset branch, and the dangling-link guard

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
  withdrew at rc.5 and which a 1.0 tool rejects with `AGSC-E004`.

### Added — the Harness, the `/compose/` and board pages, `/legal/`, the three silent gaps and the `llm-context` adapter

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
  until rc.5.
- `src/distribution/forge.js` and the `ci` `forge` lane — AGSC-08-12's `enforce[]`
  compilation into `dist/forge/`, deterministic and idempotent, with drift reported as
  `AGSC-E707` and never overwritten. `governance/lint.js#checkEnforce` reports a value
  that cannot be compiled with the same code.
- `agsc export --jsonld`, `--jsonl` and `--to <adapter>` (AGSC-01-26a, AGSC-01-27),
  written under `dist/export/` with each file's SHA-256 printed. The first memory
  adapter is `llm-context`: `chunks-index.toon` in TOON tabular form and
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

### Fixed

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
  of AGSC-07-07's and AGSC-07-23's warnings has its own sentence.
- `site.build` moves its entries into the ordered map instead of copying them, and
  `site.verify` retains only digests: peak resident memory at 10 000 items falls from
  1 225 MiB to 1 082 MiB. The supported scale is unchanged.


### Added — `import --from old-site` and the diagram compiler (M3)

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

### Fixed — the deep engine audit

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
  forward. Under `--json` stderr keeps one finding object per line (AGSC-09-10).
- `src/application/cli/verbs/compose.js` — each composition conflict now carries
  its own rule and a sentence a person can act on. Every conflict used to be
  printed as "composition conflict on `<key>`: `<a>` / `<b>` (AGSC-07-06)",
  which cited the wrong rule for three of the four kinds — an absent or retired
  slug is AGSC-07-03 and a superseded hard dependency is AGSC-07-05a, whose
  message form ("required item superseded — select `<superseding>`") the engine
  did not use — and read as though an item were in conflict with itself.
- `tests/application/cli/verbs-wired.test.js` and `tests/boundary/federation.test.js`
  carried five literal U+0000 bytes in their `git ls-files -z` and hostile-IRI
  fixtures, which made `file(1)` classify them as data and GNU `grep` treat them as
  binary — so both were invisible to every source sweep, the third occurrence of the
  defect that hid `src/boundary/federation.js` in. Written as the
  six-character escape instead, and `tests/arch/text-sources.test.js` added as the
  guard: no NUL, no BOM and no CR in any source under `src/`, `tests/`, `bin/`,
  `tools/`, `schema/`, `ontology/` or `spec/`, and the sweep reports how many files
  it read (V9D-G4).

### Changed — the deep engine audit

- `src/README.md` §11.2 said the two opt-in verbs print their usage-error finding
  on stdout; they print it on stderr, where AGSC-09-10 puts every diagnostic.
  Corrected, and the new usage block documented.

## [1.0.0-rc.4] — the engine at the `1.0.0-rc.4` tag (2026-09-18)

### Fixed — the eleven defects of the adversarial read

- `src/adapters/node-fs.js` — the symlink realpath containment check runs in the
  shared `abs()` helper, so `writeFile`, `mkdirp`, `remove`, `stat`, `readdir`,
  `walk` and `exists` refuse a planted directory symlink with `AGSC-E902`
  instead of only `readFile` doing so (AGSC-01-16, AGSC-01-35).
- `src/distribution/mcp-tools.js` — `propose` serialises frontmatter through
  `knowledge/adopt.js#serialize`; the local YAML writer, which emitted
  unparseable bytes for a title containing `: `, is deleted (AGSC-09-16).
- `src/boundary/federation.js` — `walk` applies AGSC-11-07's scheme rule and
  AGSC-11-08's address rule to every peer value that parses as an absolute URL
  before it is fetched; a refused peer is `AGSC-E905` in `skipped`.
- `src/boundary/federation.js` — `checkAddresses` fails closed: an empty or
  absent address list is `AGSC-E905`, not a pass (AGSC-11-08).
- `src/application/cli/main.js` — a thrown error carrying a code registered in
  spec/09 §9.4 becomes a Finding in the AGSC-09-11 envelope with the correct
  exit code; `AGSC-E902`, `AGSC-E903` and `AGSC-E904` were previously
  unreachable through the CLI (AGSC-09-10, AGSC-09-11).
- `src/distribution/site.js` — AGSC-06-19's Schema.org JSON-LD is emitted on item
  and index pages (`DefinedTerm`, `TechArticle`, `Dataset`), JCS-canonical, with
  `<` escaped so no title can close the script element (AGSC-06-05).
- `src/knowledge/frontmatter.js` — all four byte obligations of AGSC-01-14 are
  checked, not two: non-NFC content and a missing or doubled trailing LF are
  reported as `AGSC-E108`.
- `src/distribution/mcp-tools.js` — `call` enforces the manifest's
  `inputSchema.required` and returns the AGSC-09-13a error envelope with
  `AGSC-E003`.
- `src/boundary/*`, `src/governance/agents.js`, `src/composition/architecture.js`
  and `src/application/bundle.js` — every Finding carries a non-empty `message`
  (AGSC-09-11).
- `src/distribution/mcp-tools.js` — the text arguments of the seven tools are
  capped at AGSC-01-16's 1 MiB in UTF-8 bytes and refused with `AGSC-E904`
  before dispatch.
- `src/shared/ordering.js` (new) — the shared kernel that holds the AGSC-04-05
  and AGSC-04-12 comparators, removing the `adapters -> knowledge` require edge;
  `knowledge/unicode.js` re-exports both, so no caller changed.
- `tests/arch/context-boundaries.test.js` — tightened: an adapter may require no
  bounded context, and the shared kernel may require nothing.
- `tests/arch/finding-messages.test.js` (new) — a source-level sweep that fails
  if any module raises a Finding with an empty message.


### Added — integration: the sixteen verbs, wired

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
- `src/interchange/README.md` — the reserved Interchange context.
- `src/distribution/site.js` — AGSC-06-21 pagination above 500 entries, the `/`,
  `/tags/<tag>/` and `/search/` index routes, `/pages/<slug>.jsonld`
  (AGSC-06-02), and `UNPRODUCED_ROUTES`, which names every AGSC-06-01 route that
  has no producer in the build's `skipped`.
- `tests/application/cli/verbs-sixteen.test.js`, `tests/application/cli/verbs-wired.test.js`,
  `tests/arch/headers-unified.test.js`, `tests/distribution/pagination.test.js`.
- `diff@9.0.0` (BSD-3-Clause, no dependencies) — the unified diff `propose`
  writes for AGSC-08-04.

### Changed — integration

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

### Added — composition, the node boundary and the two tool transports

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
  `fast-check@4.10.1` as a development dependency (decided 2026-09-18,
  superseding the earlier zero-dependency rule).

### Changed — the engine follows the pre-tag specification pass (2026-09-24)

- **One code for an adapter the distribution does not ship.** `export --to <name>`
  and `import --from <name>` with a name no shipped adapter and no installed plugin
  answers report `AGSC-E203` and exit 1 (AGSC-01-26a). Until now one fault had three
  answers: `AGSC-E001` on export, `AGSC-E002` on import, `AGSC-E203` on `--steer`.
- **A stray positional argument is a usage error.** `export --markdown ./out`,
  `build extra`, `propose a b` and the like are `AGSC-E002`, exit 2, and nothing is
  written (AGSC-09-09). `export --markdown ./out` used to write to
  `dist/export/markdown/` and say nothing about the directory it ignored.
- **A disabled `run`/`trace` is a configuration refusal.** With `run.enabled` false
  the two verbs exit 2 with `AGSC-E004`, the code for a configuration the tool
  cannot run against, instead of `AGSC-E001`, the code for an unknown verb
  (AGSC-09-94).
- **`sitemap.xml` lists every HTML page the build emits** — the index pages, tag
  pages, `/now/`, `/compose/`, `/search/`, `/skills/`, `/legal/`, `/changelog/` and
  the board pages among them — never `/404.html` or a machine file (AGSC-06-19 now
  defines "published route"). It listed the home page and the item pages only.
- **A held-back item leaves no trace in `chunks.jsonl` or `/pages/<slug>.md`.** A
  Link target naming an item that is a draft, retired or held back by `releases` is
  dropped from the chunk record's `links` and from the page's frontmatter array, and
  an emptied key is omitted (AGSC-06-29, AGSC-05-07). The HTML page, graph,
  `llms.txt` and `search.json` already applied that exclusion; these two surfaces
  carried the slug out of the node.
- **Eleven conformance vectors added, one withdrawn**, see
  `tests/vectors/README.md` ("rc.6, sixth pass").


## Engine notes moved from `src/README.md` (2026-09-24)

*Added 2026-09-24.* Until this date `src/README.md` carried, after its module map, the
engine's running record of what was found and changed between the `1.0.0-rc.4` tag and
the `1.0.0-rc.6` draft. That record is history, so it moved here unchanged when
`src/README.md` was cut to a module guide. The section numbers (§11.6 to §11.17) are the
ones it had there, so older citations still find their text; the dated sections that
followed §11.17 are kept in their order one heading level lower. Counts and states
inside are those of the day each section was written; `node tools/count-artifacts
--json` gives today's.

### 11.6 Known specification items for 1.0.0

Reported, never worked around in silence. Collected from all seven packages of
this milestone; each is an open question, not a defect of the code.

**Rules that disagree or under-specify**

1. `AGSC-01-35` and `AGSC-03-11` cannot both hold for a relative body reference
   into `content/assets/`; the engine follows AGSC-01-35 and reports `AGSC-E902`.
2. `AGSC-02-21` says `taxonomy` and `explainer` "keep their four headings" and
   never lists them; the engine checks only the kinds the rule enumerates and
   invents no heading.
3. `AGSC-03-10` does not say whether a `clusters[]` entry is an inbound
   reference to the cluster it names; the engine reads it as one (11.3).
4. `AGSC-03-11` does not say whether an extension-less body reference resolves;
   the engine resolves both forms (11.3).
5. `AGSC-05-10` orders predicates by IRI while `graph-0014` shows them in
   prefixed-name order.
6. `AGSC-05-31` cites rows of the `AGSC-05-26` table for `dcterms:created` and
   `dcterms:modified` that the table does not carry; the engine emits
   `xsd:dateTime` at midnight (AGSC-05-14).
7. `AGSC-06-21` says "any index route carrying more than 500 entries" without
   saying which routes of AGSC-06-01 are index routes; the engine paginates `/`,
   `/<type-plural>/`, `/tags/<tag>/` and `/search/`.
8. `AGSC-06-33` states the fragment index as arrays while `build-0010` states it
   as counts; the rule wins.
9. `AGSC-08-13`'s injection patterns are additive to a 28-entry engine default;
   the blob threshold (128 characters) is the engine's choice, and the 1 MiB cap
   does not say whether it counts code points or bytes.
10. `AGSC-08-20b` does not name the extended git-log entry shape the derived
    `claimed_by` of AGSC-10-13 needs; the engine treats it as an extension.
11. `AGSC-10-15` does not fix an order for a Level's area set; `conform-0003` is
    therefore compared set-wise.
12. `AGSC-11-01`'s maxima are stated in three other rules; the engine reads them
    from there and reports `AGSC-E209` for anything outside, but the rule would
    be easier to implement if it restated the bounds.

**The error-code registry (§9.4)**

13. There is no code for "a verb this specification names, recognised but not
    implemented at this Level". The engine uses `AGSC-E001` — the code
    AGSC-09-94 itself prescribes when a named verb is not offered — at exit 1,
    because nothing about the invocation was wrong.
14. There is no code for an internal engine fault (a thrown error whose `code` is
    not one of §9.4's). The shell writes `agsc: internal error: …` to stderr and
    exits 1, emitting **no envelope and nothing at all on stdout**, because an
    envelope with no finding would be a false green. This is the **one
    acknowledged departure** from AGSC-09-10's "exactly one envelope on stdout
    under `--json`": stdout carries zero envelopes, never two, and the
    alternatives are worse — a fabricated code, or a green envelope over a
    crash. A registered code is no longer lost this way; only a
    genuinely unregistered fault takes this path. **Open question:**
    register a code for an internal fault, or state the zero-envelope case in
    AGSC-09-10 itself.

**Routes and artefacts**

15. No rule pins the bytes of `/feed.xml`, so `build.feed` has nothing to switch
    on and the route is named in `skipped`.
16. `/graph.jsonld` at Level 0 carries compact terms (`member`, `prefLabel`,
    `definition`, `source`) with no `@context`, because AGSC-06-32 makes
    `/ns/context.jsonld` a Level-≥2 artefact. A Level-0 document is therefore
    lossy when expanded. Either AGSC-10-02 should ask for an inline `@context`
    at Level 0, or AGSC-05 should pin absolute IRIs there.
17. `AGSC-05-06` reserves `/graph.rdf` and no 1.x route emits it;
    `knowledge/rdfxml.js` exists and is wired into nothing, deliberately.

**Schemas and vectors (report only — frozen artefacts)**

18. `schema/config.schema.json` carries no literal `default` for `build.out`,
    `build.feed`, `i18n.default` or `run.enabled`, which the prose defaults; the
    engine applies them explicitly. It also needs `strictRequired: false` to
    compile, because an `if/then` requires a property declared in a sibling
    subschema.
19. `graph-0010`'s "complete serialization" omits the obligatory `type`,
    `inScheme` and `kind` lines; `graph-0013`/`graph-0014`'s `turtle_lines`
    cannot be matched whole-line and are compared as clauses.
20. `bnd-0012`, `bnd-0014`, `bnd-0020` and `bnd-0025` assume a default base the
    vector does not state.
21. `cli-0002` pins `version: "0.1.0"` in its options while `package.json` is at
    `0.0.2`; the handler passes the vector's value, as the vector intends.

**Further items found by the 2026-09-18 documentation and standards review** (same status:
reported, recorded against the frozen text and to be taken at 1.0.0; written when
`1.0.0-rc.4` was the tag, and unchanged by the `1.0.0-rc.5` tag of 2026-09-21 except
where a numbered item below says so — corrected 2026-09-21)

22. `AGSC-00-20` says a 1.0 tool MUST accept `build.rdfxml`, while `AGSC-01-18` and
    `AGSC-05-06` call `rdfxml` reserved and `schema/config.schema.json` closes `build`
    to `out`/`feed` — so the key is `AGSC-E004`, which the same rule's next clause also
    demands. The engine rejects it with `AGSC-E004`.
23. The board-export member lists of `AGSC-00-20` and `AGSC-10-12`'s §10.6 companion
    omit `done`, which the prose of the same rule then requires.
24. `AGSC-01-26a` requires adapters to be listed in `docs/IMPLEMENTERS-GUIDE.md`; that
    file does not exist, so the obligation cannot be met as written.
25. `AGSC-01-34` reads "an `attachments[]` entry whose file is absent, or is `AGSC-E413`
    at build" — the second limb has no subject. The registry and `AGSC-05-29` show the
    intended fault is a byte/hash mismatch, which is what the engine raises.
26. `AGSC-01-36`'s opening member list omits `max_new_items` and `max_claims`, which the
    same rule then defines and the schema carries, while the rule closes the object.
27. `AGSC-02-24` says the schemas enforce the bounds it names "never with a
    regular-expression quantifier" and names port names ≤64 among them — yet that bound is
    enforced solely by the quantifier `{0,63}` of `AGSC-02-96`.
28. `AGSC-04-24`'s byte-identity claim names "the seven Harness files" as discharged by
    expected-byte vectors, but the `harness/` vector area is declared and empty and the
    compose vectors assert `harness_emitted: false` only. `AGSC-07-12` defines seven file
    *kinds*, two of them one file per selected item, so "seven files" is never literally
    seven.
29. `AGSC-06-01` says a writer MUST emit exactly its route set and that no other route is
    conditional, while `AGSC-09-03` allows `/conformance/` and `AGSC-06-12` contemplates
    `/.well-known/void`. Neither path is in either list.
30. `AGSC-06-16` and `AGSC-06-26` state unconditional MUSTs on the shape of `search.json`
    and `/chunks.jsonl`; above 500 items `AGSC-06-21` and `AGSC-06-31` turn both into
    manifests, and neither shape rule carries the carve-out.
31. `AGSC-06-25` says a writer MAY send the `Link:` response header; `AGSC-11-05` says a
    Level ≥ 2 writer MUST emit it on `/`. `AGSC-11-04` argues for the MAY reading.
32. `AGSC-09-13a` does not say that a tool call omitting a REQUIRED argument is
    `AGSC-E003`; the engine returns that code (§11.7).
33. `AGSC-09-14a` obliges an LLM responder to record spend by emitting
    `remember(kind: episode)` carrying `usage`, but `AGSC-09-14b` fixes the signature with
    no `usage` argument, so `AGSC-08-25`'s cap is unenforceable for responders.
34. `AGSC-09-90` requires the `tools/` validators to import "no engine import beyond
    stdlib", which pre-dates the library decision recorded in §3; the validators import
    nothing from `src/` and that is the durable clause.
35. `AGSC-09-91` makes `validate-spec` fail on any `spec_version` literal in `docs/` that
    differs from the `spec/00` declaration; it will fire on deliberately historical
    release-candidate notes. `tools/count-artifacts` already implements the carve-out —
    a literal preceded on the same line by *at*, *since*, *amended*, *added*, *withdrawn*,
    *before*, *until* or *from* is a historical note — and is the reference behaviour.
36. The §9.4 registry: seven registered codes (`AGSC-E002`, `E003`, `E101`, `E102`,
    `E407`, `E803`, `E901`) are raised by no rule sentence; five rows do not name every
    rule that raises the code; `AGSC-E506` carries three distinct meanings under one
    gloss; and `AGSC-E508` is listed before `AGSC-E507`.
37. `AGSC-10-12` cites "F1–F9" and §11.3 is headed "Federation — nine parts", but no rule
    carries an F3 label anywhere in the repository.
38. `AGSC-10-17` cites `AGSC-02-06` for staleness; `AGSC-02-06` fixes the instant format
    and `AGSC-02-11` defines staleness.
39. `AGSC-07-05`'s trace bracket cites itself; `AGSC-07-17` traces exit code 1 to
    `AGSC-09-06`, which governs vector-file encoding, where `AGSC-09-08` is meant; and
    `AGSC-09-13a`'s "only `code` is asserted (`AGSC-09-06`)" means `AGSC-09-05`.
40. Four rules carry no trailing trace bracket — `AGSC-05-26`, `AGSC-07-12`,
    `AGSC-08-06`, `AGSC-09-11` — which the site build warns about on every run.
41. Schema-local: `diagram.alt` has no `minLength` although `AGSC-02-24` names "`alt` ≥1"
    among the bounds the schemas enforce; `config.schema.json` requires `model` for an
    `llm` lane but never forbids it on a `process` lane, which `AGSC-01-36` does;
    `surfaces[].surface` admits a trailing and a doubled hyphen where every other `x-`
    site uses the `AGSC-02-05a` grammar; and the JSON-Schema keyword subset is declared
    only in a `description` and is nowhere normative.
42. `spec/02` §2.2 describes `lang` as "lowercase BCP 47"; `AGSC-01-13` in fact compares
    case-insensitively and lower-cases only on emission, so the permissive schema pattern
    is right and the table is what misleads.
43. Three version labels read as current although each names a Unicode version or a date
    rather than the specification version: `spec/06-surfaces.md` "(16.0.0 at rc.3)" and
    `spec/11-boundary.md` "(`2026-09-15` at rc.3)" and "— at rc.3: …".
44. `tests/vectors/boundary/bnd-0005` calls `followRedirects` with no resolution map and
    expects the redirect to be followed, so the address guard cannot be made
    unconditional while that vector stands (§11.7, `AGSC-11-08`). It is the one item on
    this list that keeps a fail-open path open.

Every item above is an open question about a frozen artefact, not a defect of this
code: a rule, a schema or a vector is changed by a release, and a vector is withdrawn and
superseded rather than edited in place (`AGSC-00-16`).

---

### 11.7 Behaviour corrected on 2026-09-18

Eleven defects the final adversarial read of recorded were closed here.
Nothing in `spec/`, `schema/`, `ontology/` or `tests/vectors/` changed; every one of
them was the engine failing a rule it already had. Each carries a test that fails
before the change and passes after, and each cites its rule in a code comment.

| finding | what changed | rule |
|---|---|---|
| 1 | the symlink realpath check moved from `readFile` into the shared `abs()` helper of `adapters/node-fs.js`, so `writeFile`, `mkdirp`, `remove`, `stat`, `readdir`, `walk` and `exists` are all contained. A path that does not exist yet is judged by its nearest existing ancestor. | AGSC-01-16, AGSC-01-35 (`AGSC-E902`) |
| 2 | `distribution/mcp-tools.js` lost its hand-written YAML writer and calls `knowledge/adopt.js#serialize`, the one canonical writer. | AGSC-04-19, AGSC-09-16 |
| 3 | `boundary/federation.js#walk` applies the scheme and address rules to every peer value it would fetch. The guard runs **only** on a value that parses as an absolute URL with a scheme, because AGSC-11-10 models a walk over opaque peer keys; a refused peer is recorded in `skipped` with `AGSC-E905` and never fetched. | AGSC-11-07, AGSC-11-08, AGSC-11-10 |
| 4 | `checkAddresses` fails **closed**: an empty or absent address list is `AGSC-E905`, because AGSC-11-08 refuses addresses *before connecting* and an empty list cannot establish that. `followRedirects` consults it whenever a resolution map is supplied. | AGSC-11-08 |
| 5 | a thrown error carrying a code registered in spec/09 §9.4 becomes a Finding in the AGSC-09-11 envelope with the AGSC-09-08 exit code; only an unregistered fault keeps the internal-error path, which still prints nothing on stdout (§11.6 item 14). | AGSC-09-10, AGSC-09-11 |
| 6 | `distribution/site.js` emits AGSC-06-19's Schema.org JSON-LD on item and index pages: a `concept` item is a `DefinedTerm`, every other item a `TechArticle`, an index route a `Dataset` — the three types the rule names and no fourth. Serialised with JCS; `<` is escaped as `<` so no title can close the script element. | AGSC-06-19, AGSC-06-05 |
| 7 | `knowledge/frontmatter.js` checks all four byte obligations, not two: BOM, CRLF, **non-NFC content** and the single trailing LF. NFC and the trailing LF are reported and **not** repaired in memory, because rewriting the body would change the bytes every emitter must reproduce. | AGSC-01-14 (`AGSC-E108`) |
| 8 | `mcp-tools.js#call` enforces `REQUIRED_ARGUMENTS` before dispatch and returns the AGSC-09-13a error envelope with `AGSC-E003`. Both transports go through `call`, so both are covered. An empty string is *supplied*, not missing. | AGSC-09-13a (`AGSC-E003`) |
| 9 | every Finding raised in `boundary/`, `governance/agents.js`, `composition/architecture.js` and `application/bundle.js` now carries a message a reader can act on. `tests/arch/finding-messages.test.js` reads the source, so a reintroduced empty default is caught. | AGSC-09-11 |
| 10 | the text arguments of the seven tools are capped at AGSC-01-16's 1 MiB, **counted in UTF-8 bytes**, and refused with `AGSC-E904` before dispatch. | AGSC-01-16 |
| 11 | the `adapters -> knowledge` edge is gone: the two orderings moved to the shared kernel `src/shared/ordering.js` and `knowledge/unicode.js` re-exports them. `tests/arch/context-boundaries.test.js` now states the rule on its own so it cannot be widened by accident. | the context map of §1 |

Two behaviours a caller may notice: a tool call that omits a required argument is now
an error envelope rather than a total-function answer (`ask`, `search`, `compose`,
`read`, `propose`, `remember`), and item and index pages carry one more `<script
type="application/ld+json">` block, so their bytes differ from a pre-fix build.

### 11.8 Behaviour corrected on 2026-09-19 (the deep engine audit)

| id | what changed, and why | rule |
|---|---|---|
| V9D-C1 | `knowledge/yaml.js` finds duplicate keys itself, with one key set per mapping, instead of asking the `yaml` package for `uniqueKeys`. That option compares each new key against every key already in the mapping, and AGSC-01-16 admits a 1 MiB frontmatter block: 60 000 distinct keys (817 KB, inside the cap) took about a minute and now takes 1.7 s. The code, line, column and message are unchanged, including inside a nested mapping and inside a mapping that is a sequence entry. | AGSC-02-02 (`AGSC-E106`), AGSC-01-16 |
| V9D-C2 | `knowledge/markdown.js#assignAnchors` remembers the highest suffix consumed per base. 10 000 identical headings took 8.3 s and now take 0.16 s; the anchors are byte-identical to the unmemoised search, proven against it over 4 000 generated heading lists, including lists holding a literal `base-2`. | AGSC-03-13 |
| V9D-C3 | `boundary/federation.js#walk` treats an injected fetch that THROWS as that peer's `AGSC-E907` — unreachable, skipped, never retried — instead of letting a stranger's transport failure escape the anti-corruption layer as an exception the shell would report as an internal fault. | AGSC-11-10(e) |
| V9D-C4 | the same function ignores a `peers` member that is not an array. A string used to be iterated character by character, so a one-line document walked ten "peers". | AGSC-11-10(b) |
| V9D-C5 | the links beyond `fan_out` are appended with a loop, not `push(...rest)`: the spread passes one argument per element and overflowed the call stack at about 200 000 peers, a list a 1 MiB discovery document can hold. | AGSC-11-10(b) |
| 1 | a missing or unknown verb is still `AGSC-E001` and exit 2 — `--help` is not a global flag of AGSC-09-09 and not a verb of AGSC-09-07 — but the message says `no verb given` rather than `unknown verb null`, and outside `--json` the verb set and the global flags follow it on stderr (`main.js#usageText`). Under `--json` stderr still carries exactly one finding object per line. | AGSC-09-07, AGSC-09-08, AGSC-09-10 |
| 2 | `compose` gives each conflict kind its own sentence and its own rule id. All four used to print "composition conflict on `<key>`: `<a>` / `<b>` (AGSC-07-06)": an absent or retired slug is AGSC-07-03, a superseded hard dependency is AGSC-07-05a — which fixes the message form "required item superseded — select `<superseding>`" — and only a surviving `excludes` pair is AGSC-07-06. | AGSC-07-03, AGSC-07-05a, AGSC-07-06, AGSC-07-09 |

| V9D-G4 | two test sources carried literal U+0000 bytes in their `git ls-files -z` and hostile-IRI fixtures, so `file(1)` called them data and GNU `grep` treated them as binary and every source sweep skipped them silently — the third occurrence of the defect that hid `boundary/federation.js` in. Written as the six-character escape instead, and `tests/arch/text-sources.test.js` is the guard: no NUL, no BOM and no CR in any source under `src/`, `tests/`, `bin/`, `tools/`, `schema/`, `ontology/` or `spec/`, and the sweep asserts how many files it read. | AGSC-01-14 (the same two byte obligations the engine checks in content) |

**Items this audit adds to §11.6.** Each is a rule obligation the engine does not
meet, named here rather than left silent; none is worked around.

22. **`AGSC-06-21`'s budgets are not enforced.** The rule states four numeric
    budgets and says a build MUST fail when one is exceeded that no sharding rule
    relieves: ≤100 KB per HTML page, ≤1 KB of `search.json` per published item,
    ≤500 KB of `search.json` absolute at or below 500 items, and ≤60 s of build
    per 500 items. `distribution/site.js` implements the sharding and pagination
    half of the rule and measures no size and no duration; the route is not in
    `skipped`, because the routes themselves are produced. Measured for scale:
    100 items build in 1.5 s, 1 000 in 7.1 s, 5 000 in 30.4 s and 10 000 in
    57.9 s, so the time budget is met with room — it is simply not checked.
23. **`lint --fix` does not exist.** Four rules place obligations on it —
    AGSC-03-12 (wikilink normalisation), AGSC-04-14 (authored array order),
    AGSC-04-19 (idempotence and the fixed YAML profile) and AGSC-04-20 (never
    change prose) — and `agsc lint --fix` is `AGSC-E002`, an unknown flag. An
    adopted note keeps its `[[wikilinks]]`, which then render as literal text.
24. **`AGSC-08-12`'s `enforce[]` compilation does not exist.** No module turns
    `status-check`, `hook`, `codeowner` or `ruleset` into a required check, a
    pre-commit hook file, `CODEOWNERS` entries or a forge ruleset, and nothing
    reports drift. A `gate` item validates and its `enforce[]` has no effect.
25. **`AGSC-01-21`'s tag-count warning does not exist.** The rule says the "2–5
    count warning of the §2.2 table still applies"; no code is registered for it
    and none is raised. `schema/item.schema.json` carries no `minItems`/`maxItems`
    on `tags` either.
26. **`AGSC-09-14a`'s `ask` envelope is not the shape the rule describes.** The
    rule asks for the AGSC-08-18 envelope with `body` = the answer and "an added
    `citations[]`"; the tool returns `body` as an object `{answer, citations,
    terms}`, so `body` is not "exactly `no answer in this memory`" when nothing
    matches and `citations[]` is not a member of the envelope. No vector pins the
    shape, so the code chose one the rule does not describe.
27. **Every page links to `/legal/`, which the build does not emit.** AGSC-06-18
    publishes the Content Use Terms text at `/legal/` and calls a distribution
    without it incomplete; `distribution/html.js` puts that link in every page
    footer, `robots.txt` and `security.txt` point at it, and AGSC-06-01's
    `/legal/` route is honestly in `skipped` because no rule pins its bytes. The
    output is therefore internally inconsistent by construction.
28. **The build holds the whole site in memory.** `site.build` returns
    `files: Map<path, bytes>`, which `verify` compares between two builds — so the
    contract is deliberate — but peak resident memory is 773 MiB at 5 000 items
    and 1.2 GiB at 10 000 items (30 118 files, 250 MB), and a 10 000-item build
    fails with a V8 out-of-memory error under a 512 MiB heap cap. AGSC-06-21 says
    "a 5,000-item Bundle conforms", and it does; ten thousand needs a streaming
    emit, which changes `site.build`'s published contract.

### 11.9 Behaviour added on 2026-09-21 (the Harness, the three surfaces, the three silent gaps and the `llm-context` adapter)

| id | what changed, and why | rule |
|---|---|---|
| 1 | `compose` WRITES the seven Harness files. `composition/harness.js#emit` had them and no verb called it; `verbs/compose.js#emitHarness` now writes them into `dist/harness/<name>/` — `<name>` being `harness.harnessName(selectionDigest)`, the first sixteen hex characters of the SHA-256 of the canonical member set, so a Harness is addressed by what is IN it. `--out <dir>` overrides the directory and changes no byte. `harness_emitted` is `true` only when every file kind the rule names for that member set is present and nothing AGSC-07-15 forbids is. | AGSC-07-12, AGSC-07-13, AGSC-07-15, AGSC-07-17 |
| 2 | `verbs/compose.js#flatten` now carries the item BODY. Without it AGSC-02-97's `yaml agsc-selection` fence was invisible, so `compose --from <slug>` always returned an empty selection, and `skills/<slug>/SKILL.md` was emitted with no prose in it — while the `/compose/` page, which fetches `/pages/<slug>.md`, emitted the real one. That is an AGSC-07-13 byte-identity break in the least visible place there is. | AGSC-02-97, AGSC-07-12, AGSC-07-13, AGSC-07-24 |
| 3 | `composition/browser.js#itemsFromGraph` reads the graph a Level-2 build actually publishes. It matched the COMPACT terms (`asc:Concept`, `skos:prefLabel`) while `graph.jsonld` carries full IRIs for `asc:` terms and bare terms for the SKOS ones, so the page recovered **zero items** from every real node; and it read `compose.compareCodePoint`, a member of a required module, which in the emitted bundle is a function and not an object — `itemsFromGraph` threw `compose.compareCodePoint is not a function` on every page. Both are closed: `localOf`/`nodeValues` reduce the three spellings of a term to one local name, and `tests/arch/composition-portable.test.js` now refuses a member read on a required module and runs every page-support function inside the bundle. | AGSC-05-16, AGSC-07-01, AGSC-07-13 |
| 4 | the `/compose/` controller takes the build instant from the discovery document's `agsc-generated-at` (AGSC-06-08) instead of a `dcterms:modified` member `graph.jsonld` does not carry. A page that cannot read the document gets the empty string and never a wall clock. | AGSC-04-11, AGSC-06-08, AGSC-07-13 |
| 5 | `lint --fix` exists (`governance/fix.js`). It applies exactly AGSC-04-19's five normalisations and is idempotent; the frontmatter is re-emitted through the one YAML writer (`knowledge/adopt.js#serialize`) only when its key order is not already the schema order, so a block that already round-trips is never requoted; a wikilink inside a code fence or a code span is an example and is left alone; a target no item answers to is left as authored with a warning rather than rewritten into a link to nothing. Under `--json` it is a DRY RUN. | AGSC-03-12, AGSC-04-14, AGSC-04-19, AGSC-04-20, AGSC-09-09 |
| 6 | `ci` compiles a `gate` item's `enforce[]` into `dist/forge/` (`distribution/forge.js`), once per run, and reports drift as `AGSC-E707` without overwriting; `governance/lint.js#checkEnforce` reports a value it cannot compile with the same code. | AGSC-08-09, AGSC-08-12 |
| 7 | `export` implements `--jsonld`, `--jsonl` and `--to <adapter>`, writing under `dist/export/` and printing each file's SHA-256. The first two take their bytes out of the build that produced them, so AGSC-01-27's byte-identity holds by construction rather than by a second serialiser. `--markdown`, `--okf` and `--steer` each say, per flag, that they are not implemented. *(This table is a RECORD of what did on 2026-09-21 and its last sentence has been false since the same day: all three flags are implemented — see §11.13, which is the present tense. Dated note added 2026-09-21,.)* | AGSC-01-26a, AGSC-01-27, AGSC-09-09 |
| 8 | `compose` gives each verdict WARNING a sentence. `agsc compose supervisor` printed `warn: AGSC-E803 ` — a blank diagnostic line for the commonest outcome there is — because a verdict warning is a domain record with no `message` and the application layer never supplied one. | AGSC-07-07, AGSC-07-23 |
| 9 | `site.build` moves its entries into the ordered map instead of copying them, and `site.verify` retains only the first build's DIGESTS. Peak resident memory at 10 000 items: 1 082 MiB, from 1 225 MiB; at 5 000 items 664 MiB, from 773 MiB. The supported scale is unchanged — a 10 000-item build still exhausts a 512 MiB heap — and `site.build`'s published contract is untouched. | AGSC-04-02, AGSC-06-21 |

**§11.6 items this package closes.** 22 (`AGSC-06-21`'s four budgets are measured — three byte budgets in `site.build`, the duration in `site.timeBudget`, which the CALLER supplies so no finding depends on how busy the machine is), 23 (`lint --fix`), 24 (`AGSC-08-12`'s `enforce[]`) and 27 (`/legal/` is emitted from the Bundle's own `LICENSE-CONTENT`, and no build emits a link to a route it does not produce — `site.internalLinks` + `site.resolvesTo` raise `AGSC-E901` when one does). Item 28 is reduced, not closed: see.

**The two additive surfaces of the `llm-context` adapter, and how a node declares them.** `agsc export --to llm-context` writes `dist/export/llm-context/chunks-index.toon` (TOON tabular form, `@toon-format/toon@4.1.1`, the uniform metadata of every chunk and no body text) and `llms-ctx.txt` (a skim view that states in its own header that it is not provenance-complete). Both are OUTSIDE `build.out`, because AGSC-06-01 closes the route set and an adapter's output is a product of `export`, never of `build` (AGSC-01-26a). A node that wants them discoverable declares each one in `agsc.config.json` under `related[]` (AGSC-06-35, AGSC-01-18) — `{"rel": "alternate", "href": "<base>/chunks-index.toon", "type": "text/toon", "title": "Chunk index (TOON)"}` and `{"rel": "alternate", "href": "<base>/llms-ctx.txt", "type": "text/plain", "title": "Skim context"}` — and the deploy step copies them beside the built site. AGSC-06-35 states that no related-system link affects conformance, any digest, the peer check or the walk, so the declaration is risk-free to every existing vector. The adapter's claimed key set (AGSC-01-26a) is `llm-context.CLAIMED_KEYS`.

### 11.10 `1.0.0-rc.5` — the engine follows the specification

**Summary.** Two specification passes amended 72 rules in the frozen artefacts,
withdrew 10 vectors and added 19. This section is what the engine changed to
follow them, and the readings it had to make. Where a vector and the engine
disagreed, AGSC-00-03 made the rule normative and the engine the defect; every
one of the nineteen is now a passing handler and `tests/conformance/pending.json`
is empty.

**One source of truth for the spec version.** `application/cli/main.js#SPEC_VERSION`
(`'1.0.0-rc.5'`) is the ONE place the engine states which version of the
specification it implements; every envelope, report, `llms.txt` header and
`/compose/` page takes it from there through `ctx.specVersion`, so a release bump
is one edit. A test harness still pins a per-vector value, which is what keeps a
released vector reproducible across an rc bump (AGSC-00-16).

| id | what changed, and why | rule |
|---|---|---|
| 1 | **`knowledge/nquads.js` emits the two configuration licence rows on the Bundle AND on every item, as `xsd:string` literals.** `schema:usageInfo` was an IRI taken from a caller-supplied `usage_info`; the Content Use Terms identifier is a CONSTANT of AGSC-06-18, independent of `bundle.license_prose`, and AGSC-05-31 form (c) makes both literals. They are emitted only when the caller supplies `options.bundle` — the record of the build's configuration — which is what keeps `graph-0001/0002/0004/0006` byte-identical across rc.5. `knowledge/jsonld.js` moved `schema:usageInfo` from `@id` to a plain literal in the context, so all four RDF views changed together. | AGSC-05-26, AGSC-05-31, AGSC-06-18 |
| 2 | **`boundary/federation.js#followRedirects` consults the address guard on EVERY hop, unconditionally.** The guard used to run only when a resolution map was supplied, which left a fail-open branch in the transport rules — the reason `bnd-0005` was withdrawn and the last blocker for 1.0.0. A hop whose host the caller has not resolved has no classified address to connect to and is refused with `AGSC-E905` before it is followed. | AGSC-11-08, AGSC-11-09 |
| 3 | **The `ask` envelope is flat.** `{body, citations, license, source, trust, type}` with `body` the answer TEXT and the Content Use Terms line embedded in it, and exactly `no answer in this memory` when nothing matches. It used to return `{answer, citations, terms}` inside `body` — the reading AGSC-09-14a rejected at rc.5, and the one that makes the fixed no-answer string unreachable. The WebMCP mirror dispatches to the same implementation, so AGSC-09-16's byte-identity holds by construction. | AGSC-09-14a, AGSC-09-16 |
| 4 | **The `search` and `ask` tools tokenize what AGSC-06-23 says they tokenize.** `mcp-tools.js#documentText` passed a loaded Item — whose `title`, `description` and `tags` live under `frontmatter` — to a function that reads a FLAT item, so the tools matched the body alone and silently matched neither a title nor a tag. Found by `cli-0007`. | AGSC-06-23 |
| 5 | **The MCP `extensions` capability is MCP's own MAP of identifier to settings object**, and this node's object carries exactly `linkset`, the absolute URL of its `/.well-known/knowledge-linkset`. `surfaces.checkMcpExtensions` reports `AGSC-E210` for a missing, wrong or additional member. `server/discover` and the per-request capabilities are the same object, there being no initialization handshake in revision `2026-07-28`. *(same day: the conformance handler no longer projects that map to its key set for any vector. `bnd-0027`, the one vector that stated the capability as the identifier array, is withdrawn under AGSC-00-16 and its case is `bnd-0036`, which states the map; `bnd-0031`'s `mcp_extensions` is by its own name the list of identifiers advertised and is unaffected.)* | AGSC-11-18, AGSC-06-07 |
| 6 | **The `webmcp` report date is an input, not a constant.** `surfaces.declare({webmcpVersion})` echoes the `YYYY-MM-DD` date the node targets; any such date conforms, and the constant `WEBMCP_SURFACE_VERSION` is now a default rather than a pin. | AGSC-11-16 |
| 7 | **`--help` exists** (AGSC-09-09 as amended): it prints the verb set and the flag list to stdout and exits 0, with a verb it prints that verb's flags, and it is the one flag that is not a diagnostic. Under `--json` it takes the shape `--version` already takes — one canonical JSON object — rather than a usage block in a machine-readable pipeline. | AGSC-09-09, AGSC-09-10 |
| 8 | **`lint --fix` reports per NORMALISATION**: the encoding third (line endings, BOM, NFC, trailing newline) under `AGSC-E108`, every other normalisation under `AGSC-E506`, both warnings. A file that needed both used to be reported under `AGSC-E506` alone. | AGSC-04-19, AGSC-01-14 |
| 9 | **One index budget, measured per DOCUMENT.** `BUDGET_SEARCH_PER_ITEM_BYTES` and `BUDGET_SEARCH_TOTAL_BYTES` are gone; `BUDGET_INDEX_DOC_BYTES = 1000000` replaces them, and `/search.json` and each `/search-<nn>.json` shard are measured on their own, in code-point route order, one `AGSC-E904` per document that exceeds the bound. Summing a manifest and ten shards into one number was the third error the old code made. This is what unblocks `agsc build` and `agsc ci` on a Bundle of ordinary prose. | AGSC-06-21 |
| 10 | **The compiled diagram is INLINE in the item's page**, in a `<figure>`, at no route of its own. `site.js#readDiagramSource` reads `content/diagrams/<slug>.diagram` through the FileSystem port; `html.js#diagramFigure` compiles it, passes `diagram.alt` through as the accessible name so a `label` statement in the source cannot replace the authored text, renders `diagram.caption` as the `<figcaption>`, and runs the AGSC-02-98 allow-list over the compiled bytes before inlining them — a violation is `AGSC-E412` and NO element. The bytes count towards the 100 KB page budget automatically, because `budgets()` measures the emitted HTML. | AGSC-01-07, AGSC-02-13, AGSC-02-98, AGSC-06-20 |
| 11 | **`/attachments/<slug>/<file>` is produced.** It was in `site.UNPRODUCED_ROUTES` with the reason "reaches `build` through no port", which was never true — `build` holds the port, and `verbs/_helpers.js` already reads the same files through it. AGSC-06-01 lists the route and makes the served bytes the hashed bytes of AGSC-05-29, so the writer emits them; the consequence of not emitting them was an `AGSC-E901` on every page carrying an attachment, because `html.js` links each one as an `<img>`. The file is read as a Buffer, so no re-encoding can move a byte the AGSC-01-34 digest covers. | AGSC-06-01, AGSC-01-34, AGSC-02-98 |
| 12 | **An adapter's flags are adapter-SCOPED.** `--selection`, `--corrections` and `--attach-diagrams` left `VERB_FLAGS.import` for `ADAPTER_FLAGS.import.adapters['old-site']`, so they are legal only while that adapter is the one named and `AGSC-E002` under any other adapter or none — which is what AGSC-09-09's closing sentence obliges, and what a second import adapter would otherwise have inherited for free. | AGSC-09-09, AGSC-01-26a |
| 13 | **`AGSC-08-06`'s ABNF is enforced whole.** A line that announces itself as `Assisted-by:` and does not match the `assisted` production makes the trailer BLOCK malformed (`AGSC-E504`) — an actor that is not `human:<id>`, an upper-case `idchar`. Such a line used to be silently dropped, so a trailer naming an agent as its operator passed. | AGSC-08-06, AGSC-08-08 |
| 14 | **`AGSC-06-14` is satisfied**: `llms.js#sectionBlocks` puts every published item no LISTED cluster section carries under `Other`. An item whose primary cluster was not listed used to appear in no section at all, so the discovery surface lost it silently. | AGSC-06-14 |
| 15 | **`knowledge/validate.js#index` maps the `not: {required: ["type"]}` failure of `bundle.schema.json` to `AGSC-E205`**, one finding, because AGSC-01-04 as amended names that code — a `type` key on the root is a file-placement violation, the root not being an item — and §9.4 reserves `AGSC-E201` for a schema failure no more specific registered code names. | AGSC-01-04, AGSC-09-04 |
| 16 | **`composition/conform.js`'s cross-implementation list is written in the AGSC-06-01 route form**, with the leading slash on every route; the bare spelling is still ACCEPTED in a claim, because a claim is a document a stranger wrote. The seven Harness FILE KINDS carry no slash — they are not routes. | AGSC-04-24, AGSC-06-01 |

**`schema.js` `strictRequired` stays OFF, and the reason changed.** R-18's
restructure removed the old cause — `config.schema.json` and `item.schema.json`
both compile with `strictRequired: true`, verified. It stays off for a second,
permanent reason: `bundle.schema.json` carries `"not": {"required": ["type"]}`
and `type` is deliberately absent from that schema's `properties`, because the
Bundle root is not an item. Ajv's heuristic reads that as "required property not
defined" and refuses to compile. The construct is legal JSON Schema 2020-12 and
is exactly what AGSC-01-04 states, so the heuristic is the thing that is wrong.

**AGSC-08-12's three unpinned forge artefacts, documented here as the
rule now obliges.** Only `status-checks.json` has pinned bytes at 1.0 — the
check names the Bundle's `gate` items imply (AGSC-08-09), as a JCS-canonical
array in code-point order, derived from nothing else. For the other three
AGSC-08-12 names the target path and the determinism obligation and says nothing
about the content, so no conformance claim may assert cross-implementation
byte-identity for them (AGSC-04-24) and **this implementation MUST document its
derivation of each**, which it does here rather than only in a source comment:

* `dist/forge/pre-commit` — runs `agsc lint` and nothing else. It is the one
  executable AGSC-07-15 admits, and it carries no second command, because a hook
  that did more than the engine's own lint would enforce a rule no rule states.
* `dist/forge/CODEOWNERS` — assigns every path to the forge logins of
  `channels[].owner` (AGSC-01-18), falling back to the identifier of
  `bundle.operator` when no channel names one. Every login is written in the
  grammar AGSC-01-16 fixes, and no path is left unowned.
* `dist/forge/ruleset.json` — JCS-canonical; it carries the same check names as
  `status-checks.json` under one active branch rule, so the two cannot drift.

Drift on any of the four is `AGSC-E707` and the file is never overwritten
(AGSC-08-12), so a hand-edit is reported and kept.

**The eleven lines of `src/` this suite does not reach**, all in
`application/cli/main.js`, are fail-closed branches that only a broken
installation can enter: a `require` of `knowledge/jcs.js` or of a verb module
that throws, and a verb module present but without a `run`. Each one writes a
registered code and exits non-zero rather than continuing; none can be reached
from a conforming tree, and none is excluded from the measurement.

### 11.11 The nine independent validators

**Summary.** `AGSC-09-90` obliges the reference 1.0.0 distribution to ship the
`tools/` validators of `PRD-054` — nine command contracts, each **runnable
standalone with no import from `src/`**, each answering `--json` with the
`AGSC-09-11` envelope (`verb` = the tool's own name, `version` = the tool
distribution's own version), each emitting only codes the §9.4 registry holds and
exiting 0 pass / 1 fail / 2 usage. Two shipped earlier; the package added the
other seven. A validator re-derives its expectation from the rule, never from the
engine — which is why `gen-ns` can and does disagree with what the engine emits.

| Tool | What it checks | Rules | Status |
|---|---|---|---|
| `validate-spec` | rule-id uniqueness and resolution; the MUST/SHOULD grammar; a trace bracket on every rule and its PRD/NFR ids; error-code closure against §9.4; version literals in `spec/`, `docs/` and `tests/vectors/**`, with the two carve-outs the rule states | AGSC-09-90, AGSC-09-91 | ships; **20 errors + 2 warnings against the frozen rc.5 text**, each a 1.0.0 item (§11.6, `SPEC-ITEMS-FOR-1.0.0.md`) |
| `validate-schemas` | 2020-12 meta-validation and strict compilation (pinned Ajv); the closed keyword subset and the length bounds of AGSC-02-24; the slug grammar of AGSC-01-10; the six item types of AGSC-00-04; encoding | AGSC-09-90, AGSC-02-24, AGSC-01-10 | ships; **pass**, 0 findings |
| `validate-ontology` | Turtle well-formedness (pinned `n3`); the OWL 2 RL-safe axiom set; blank-node freedom; the persistent hash namespace; `owl:versionIRI` and deprecation; SKOS S19/S20, S32 and S37; AGSC-05-26a | AGSC-09-90, AGSC-05-02/05-08/05-13/05-22/05-25/05-26a | ships; **pass**, 52 terms |
| `validate-vectors` | the vector format of AGSC-09-04/05, every `rule` resolving, JCS member order, encoding, the informational count of declared areas with no file | AGSC-09-90, AGSC-09-04…06 | ships (2026-09-18); **pass** |
| `validate-wellknown` | RFC 9264 link-set shape, profile transport, relation names, every `digest`, the REQUIRED `agsc-*` attributes per Level, and `--peer` for AGSC-10-12 | AGSC-09-93, AGSC-10-12 | ships (2026-09-17); **pass** at `--level 2` on both reference builds |
| `validate-features` | the Gherkin the pack declares it uses; `@PRD`/`@NFR` closure against `docs/PRD.md`; agreement with the coverage table of `features/README.md` (warning) | AGSC-09-90, PRD-054 | ships; **pass**, 12 files, 53 scenarios |
| `validate-diagrams` | the Mermaid lexical contract of `docs/diagrams/README.md`; a trace id on every file; staleness — every rule id against `spec/`, every requirement id against `docs/PRD.md`; the index table against the directory | AGSC-09-90, PRD-054 | ships; **pass**, 18 blocks |
| `gen-spec-html` | renders `spec/` into the `/specs/` pages, deterministically, with a self-linking anchor on every rule id; `--check <dir>` compares a published tree byte for byte | AGSC-09-90, PRD-054, AGSC-04-01 | ships; **pass**, 335 anchors |
| `gen-ns` | derives `/ns/context.jsonld`, `/ns/agsc.rdf` and the `/ns/` index from `ontology/agsc.ttl`, round-trips the RDF/XML back to the Turtle, and `--check <dir>` audits a built `/ns/` against AGSC-06-32 | AGSC-09-90, AGSC-06-32, AGSC-06-06, PRD-054 | ships; derivation **passes**; `--check` **passes on both reference builds** *(updated 2026-09-21,: it failed on both, and on a correct build, for two reasons — the engine emitted no `asc:` term definition, and the check itself resolved terms by key name; both are fixed, §11.14)* |

**The disagreement `gen-ns` found.** `AGSC-06-32` says `/ns/context.jsonld` is
generated from `ontology/agsc.ttl` so that "every `asc:` term becomes a term
definition whose `@id` is its IRI, object properties carry `@type` `@id`, datatype
properties carry the `@type` of their declared range". The context this engine emits
carries the `asc` **prefix** and the 24 external term definitions — which agree with
this tool's independent derivation term for term — and **not one of the 52 `asc:`
term definitions**. Because the context defines no `asc:` terms, `graph.jsonld`
writes vocabulary IRIs in full (`"https://w3id.org/agentic-system-core/ns#Bundle"`),
so the same rule's round-trip clause ("expanding `graph.jsonld` with it and
re-compacting MUST reproduce `graph.jsonld` byte for byte") does not hold either:
re-compacting the reference build's graph with its own context yields `asc:Bundle`
and `asc:specVersion`. Both are engine defects against a frozen rule, reported and
not fixed here (`src/knowledge/jsonld.js#context`, `src/distribution/site.js`).

*(Superseded 2026-09-21. The paragraph above is kept as the record of what
this tool found; the two engine defects it names are FIXED and `gen-ns --check` now
passes on both reference builds and on the specification's own site. The tool was
half right and half wrong: the missing 52 term definitions were real — the cause is
in §11.1 — while the place it looked for them was not. `AGSC-06-32` pins a term's
MAPPING and never its NAME, so resolving the 52 terms **by key name** made the check
report the conformant hand-written site, and a correctly fixed engine, as carrying
"52 … no term definition". Under `AGSC-09-92` — "CI MUST run all validators on every
PR; a validator failure blocks merge" — that would have blocked merges on correct
output. The check now resolves by `@id`, which is what the rule pins, and also
reports two further faults it used to miss: a plain-literal property wrongly
declared `"@type": "@id"`, and two term names mapping to one IRI, which leaves
compaction a choice and so leaves the round trip undetermined. The naming
disagreement itself is a **specification** defect, recorded as a specification item rather than
enforced by a tool: three in-house derivations disagree today, and until the rule
names the convention, `AGSC-04-24`'s cross-implementation byte-identity claim for
`graph.jsonld` cannot be true.)*

**Where the tests live.** `tests/tools/` — one file per tool plus
`standalone.test.js`, the arrow check that reads every file in `tools/` and fails on
any `require` reaching into `src/` or outside the engine's pins. Each new tool is at
**fully line-covered** by its own tests
(`node --test --experimental-test-coverage 'tests/tools/*.test.js'`), whose failing
cases are written into throw-away directories so that a deliberately broken spec,
ontology or feature file never enters the repository.

### 11.12 The seven tools in a page

`AGSC-09-16` has always said that "where a browser exposes `document.modelContext`,
the `/compose/` page **and the item pages** register the same seven tools of
AGSC-09-13, with identical names, identical argument names and results identical to
the local MCP server's for the same input and Bundle". Until rc.5 the built site
registered seven tools and answered ONE: `compose-page.js` implemented `compose` and
returned a registered error code with the message "has no page implementation yet"
for the other six, and no test noticed, because the conformance handler ran the
emitted registration script against the FULL local implementation rather than against
the page the site ships.

**What the page now does.** `src/distribution/page-tools.js` implements all seven
against the routes AGSC-06-01 already publishes, and nothing else:

| Source | Route | What the page takes from it |
|---|---|---|
| the prebuilt index | `/search.json` | the postings `search` and `ask` score against — the page never re-tokenizes a body, so no second tokenizer exists |
| each item | `/pages/<slug>.md` | the lint-normalized SOURCE FILE (AGSC-05-07) — frontmatter block and body, which is what makes `read` and `propose` answerable at all |
| the node itself | `/.well-known/knowledge-linkset` | the anchor, which is the Bundle base every returned IRI is built from |

**One implementation, two hosts.** `page-tools.js` follows AGSC-07-13's portability
contract, the pattern `composition/browser.js` established: every function in
`PORTABLE` is a self-contained top-level declaration, and `bundle()` emits its
`Function.prototype.toString()` source text as `/compose/agsc-page-tools.js`. Node and
the browser therefore run the SAME bytes. `tests/arch/page-tools-portable.test.js`
enforces it three ways — every portable name is emitted, no portable function reads a
module-scope binding, and the emitted script evaluates in a context that holds only
the language.

**The fake-harness proof.** `tests/conformance/areas/cli.js` now builds the reference
Bundle's site with a fixed clock, loads `agsc-core.js`, `agsc-page-tools.js` and
`webmcp.js` into a `node:vm` context whose only DOM is
`{ modelContext: { registerTool } }`, assembles the page corpus from the build's own
published bytes, and compares every registered tool's answer with the local server's.
`fetch`, `XMLHttpRequest` and `sendBeacon` are traps: a page that reached one would
fail the vector. `tests/distribution/compose-page-run.test.js` runs the same three
scripts over a fake DOM and a fake `fetch` served from the build's file map, so the
ASYNCHRONOUS path a real browser takes is proved too, and
`tests/distribution/page-tools.test.js` compares the page tools with the local server
over 26 calls covering all seven tools, both hosts, every item of the fixture.

**The numbers.** Over the reference Bundle, 26 calls × 2 hosts agree with the local
server byte for byte. Over the published pattern node — 73 published items — 225
calls (`read`, `links` and `propose` on every item, plus `search`, `ask`, `compose`
and `remember`) agree with a local server handed the same published set. Coverage of
`page-tools.js` covers every line.

**The one honest boundary.** A page sees the PUBLISHED set (AGSC-06-30 excludes
`draft`, `retired` and anything held back by `releases`), while the local server is
handed the whole Bundle. For a published item the two answer identically; for an
unpublished one the page answers `AGSC-E301`, because a page cannot see what the node
did not publish. That is a property of publication, not of this implementation, and it
is recorded as a specification item for 1.0.0 in this distribution's private records.

**Two readers the page had to carry, and why neither is a second algorithm.** A page
cannot load the `yaml` package or the CommonMark parser, so `page-tools.js` carries a
failsafe-subset frontmatter reader and a heading/inline-link scanner. Neither is a
general implementation: the reader reads exactly the dialect
`knowledge/adopt.js#serialize` emits, and the scanner reads the bodies this engine
publishes. Both are pinned by tests against the Knowledge context's own
implementations — `pageParseFrontmatter` against `knowledge/yaml.js` over every item
of the reference Bundle, `pageAnchors` against `knowledge/markdown.js#anchors`, and
`pageEdges` against `knowledge/links.js#resolve` edge for edge — so a divergence is a
red test, not a wrong answer in a browser. The typed-scalar table is derived from
`schema/item.schema.json` by the test, so the schema stays the source of truth.

**On item pages.** Three `<script src>` elements referencing the shared files the
`/compose/` route already serves; nothing inlined, nothing from another origin,
`defer` so the parse is not interrupted. `webmcp.js` feature-detects, so a browser
without WebMCP registers nothing and logs nothing.

**The contribution affordance.** When `contribute[]` declares a `pr` entry
(AGSC-11-14), every item page carries a plain anchor — `rel="noopener"`, an
`aria-label` naming the item — to the forge's edit view of that item's own source
file. It is not a form: AGSC-06-17's policy sets `form-action 'none'`, so a form could
not submit anywhere. The declaration reaches the discovery document as the
`rel#contribute` link the rule defines, and a malformed entry is `AGSC-E209` from
`boundary/federation.js#checkContribute`, which the lint lane already calls through
`boundary/visibility.js#checkBoundaryConfig`.

**The surface is declared.** `site.js#declaredSurfaces` routes the discovery
document's `rel#surface` links through `boundary/surfaces.js#declare()`, so the
`webmcp` surface a build emits at `/compose/` is declared with its access class
(`consent`) and its version. The version is the WebMCP Draft Community Group Report
date the node targets; `config.schema.json` closes `surfaces[]` against the built-in
surfaces, so it is a `declare()` option with the constant
`surfaces.WEBMCP_SURFACE_VERSION` as its default, and AGSC-11-16 as amended at rc.5
conforms any such date.

### 11.13 The last three export forms, the three refusing commands, and the release lane

**Summary.** Every verb of AGSC-09-07 now does something. The "not implemented at
this milestone" list that §11.2's table carried for `skills`, `run` and `trace` is
**empty**, and `tests/application/cli/verbs-sixteen.test.js` holds it empty by
reading the modules' own source. One obligation of one rule is still not
dischargeable by this package and says so loudly, in §11.13.4 below.

#### 11.13.1 The three export forms (AGSC-01-26, AGSC-01-28)

| module | what it owns |
|---|---|
| `interchange/export-bundle.js` | `export --markdown`, `export --okf` |
| `interchange/steer.js` | `export --steer [--target <name>[,<name>…]]` |
| `interchange/okf.js` | `import --from okf` — the other half of the round trip |

Four readings this package had to make, each recorded as a specification item so the
owner can overrule it:

1. **"The lint-normalized Bundle" has one definition, and it is `governance/fix.js`'s.**
   The export calls `lint --fix`'s own planner rather than re-deriving the
   normalisation, so `export --markdown` on an already-normalised Bundle is a
   byte-identical copy of its `content/` tree and on an un-normalised one emits what
   `lint --fix` would have written. This is what settles the interaction flagged
   between AGSC-01-26's "body bytes unchanged" and AGSC-04-19's wikilink rewriting:
   both clauses can only be true when "unchanged" is read against the lint-normalized
   Bundle, which is the rule's own first clause.
2. **Draft, retired and release-gated items are in no export** (AGSC-06-30). AGSC-01-26
   says "the Bundle itself" and names no exclusion; every other surface of this engine
   emits the published projection, and an export is a copy that leaves the node.
   Item.
3. **Every export form has an export root**, which AGSC-01-26 itself names ("the export
   root carries a `LICENSE-CONTENT` file"). The roots are `dist/export/markdown/`,
   `dist/export/okf/`, `dist/export/steer/` and `dist/export/<adapter>/`, all outside
   `build.out` (AGSC-01-08). A steer bundle is therefore never written over the
   `AGENTS.md` of the repository the command was run in.
4. **`content/index.md` is not re-serialised.** A byte-preserving export keeps the
   authored root document and APPENDS the keys AGSC-01-26 obliges (`license` always,
   `okf_version` under `--okf`) as one line each. Re-emitting it would move bytes the
   export was asked to preserve and would lose the authored quoting of
   `okf_version: "0.2"`, which the failsafe subset reads as a string and a YAML 1.1
   reader reads as a float.

**The round trip is proven, not asserted.** `export --okf` into a directory, then
`import --from okf` that directory into an empty Bundle, and every item file is
byte-identical to the source Bundle's — `tests/interchange/okf-roundtrip.test.js`, over
the real fixture, through the real verbs, over the real filesystem. That is what
AGSC-10-09 claims when it says an export following AGSC-01-26…29 is one "the reference
engine (or any Level-1 reader) imports losslessly". The OKF v0.2 format was read from
its primary source on 2026-09-21 and the module header quotes the four sentences the
reader depends on.

#### 11.13.2 The published skill packs (spec/07 §7.4)

`composition/skills.js` owns the PUBLISHED packs; `composition/harness.js` still owns
the per-Procedure `SKILL.md` files inside a Harness, and §7.4 says in its own words
that the two are different artefacts. One pack per Cluster, plus `/skills/index.json`,
which is also the SHA-256 lockfile AGSC-07-20 requires — AGSC-06-01's closed route set
gives a pack three routes and none of them is a lockfile, so the digests ride in the
index. `agsc skills` writes them into `dist/skills/`, `agsc build` emits
them at `/skills/**`, and both call the same function, so the two can never differ;
`/skills/…` therefore left `site.js#UNPRODUCED_ROUTES`. `skills install` verifies the
lockfile before it writes anything and is idempotent; `skills import` maps a `SKILL.md`
back to a `procedure` item through the same writer every other import uses.

#### 11.13.3 `trace` (AGSC-09-94)

Pure, as the rule says: `interchange/trace.js` maps a captured agent-run record to an
Episode through the AGSC-01-22 tolerance and the AGSC-02-14 `usage` object, copying
`usage` member by member, preserving every key it could not place under the `x-trace-`
vendor namespace (AGSC-02-05a), and reading no clock — a record with no `started`
cannot become a conforming Episode and is reported rather than dated (AGSC-04-11). No
rule pins the record's shape; the aliases this reader accepts are in its header and the
gap is item.

#### 11.13.4 `run`, and the one obligation this package cannot discharge

Implemented and tested: the `run.enabled` gate (which `main.js` already applied), the
restriction to `procedure` items (AGSC-02-22), the extraction and pairing of the
`{run}` and `{expect}` blocks, the `run.allow[]` program allow-list, the refusal of any
line only a shell could honour, `--dry-run`'s resolved command list, execution through
the ProcessRunner port with a scrubbed environment, a timeout, no shell and a working
directory outside the Bundle, and the comparison of each captured result with its
`{expect}` block.

**Not implemented: "it MUST run with no network."** A Node process cannot deny a child
process the network from inside itself — that needs an OS sandbox on the host, and the
engine could not verify it after spawning in any case. The ProcessRunner port therefore
carries one declaration, `isolated`; `adapters/node-proc.js` sets it to `false`,
because it is the git-log reader of AGSC-08-20a and offers no isolation; and `agsc run`
**refuses to execute** against a runner that does not declare it, naming exactly what is
missing. A host that wires an isolated runner gets the whole verb, and the suite
exercises that path with an injected runner, deterministically and offline. No
conformance Level requires the verb (AGSC-09-94).

Two codes are borrowed because §9.4 registers none for `run`'s two outcomes:
`AGSC-E203` for a program outside `run.allow[]` (a closed operator list of exactly the
shape AGSC-01-21 names) and `AGSC-E602` for a captured result that does not reproduce
its `expect` block (the same fault in the same area digit as a build that does not
reproduce). AGSC-09-15 forbids minting a code; item proposes widening the two
rows.

#### 11.13.5 The release lane, and the three small items

`tools/release` is the release procedure of `docs/PLAN.md` §7 as a script. It is
deliberately NOT one of the nine command contracts of AGSC-09-90 — it validates no
normative artefact — so it is named `release` and the `for t in tools/validate-*` gate
does not pick it up; it speaks the same AGSC-09-11 envelope so that one reader reads
every tool. It cannot publish: it requires no `child_process` and no network module,
its default mode is a dry run, and `--apply` writes two version strings and one
changelog heading. `.github/workflows/release.yml` is the lane it checks: a tag the
owner pushes, a three-OS gate matrix, `actions/attest-build-provenance`, and
`npm publish --provenance` over trusted publishing with no secret in the repository.

The three items the last fix package recorded:

* **`content/assets/**` has no emitted route.** `knowledge/links.js` now WARNS under the
  already-registered `AGSC-E310` when a body reference resolves to an asset, naming the
  reason: the link works in the repository and 404s on the built site. The route is a
  rule change and stays the (items 56 /).
* **`lint --self` is removed from the CLI.** AGSC-09-09 as amended at rc.5 closes the
  verb-flag set and names `lint --fix` alone, so a registered flag no code read was the
  non-conforming state; `agsc lint --self` is now `AGSC-E002` with exit 2 and a hint
  naming the nine validators. `docs/PLAN.md` and `docs/PRD.md` carry dated notes
  (items 57 /).
* **A `-->` in the licence prose no longer closes the provenance comment early.**
  `knowledge/unicode.js#commentSafe` inserts one U+0020 between the hyphens and the `>`
  and is the identity on every other value, so no byte `disc-0006` pins moves. Every
  writer of the AGSC-06-15 header calls it, the portable copy in `harness.js` is
  compared against it code point by code point, and an arch test asserts that a module
  writing that header without the defence fails the suite (item 58 /).

### 11.14 The vocabulary reaches the build

**Summary.** Three wiring defects, one tool defect and one site lag, all closed; no
frozen artefact touched, no released vector broken, and the tag `1.0.0-rc.5` not
moved. §11.1 states the divergence and its closure in the words a reader of the
conformance claim needs; this section is the engineering detail.

#### 11.14.1 What was wrong

The context generator `knowledge/jsonld.js#context` was complete and correct
throughout, and the required vector `graph-0011` plus
`tests/knowledge/jsonld-roundtrip.test.js` proved it. Nothing proved the WIRING
from `ontology/agsc.ttl` to a real `agsc build`, and all three defects lived there.

1. **The vocabulary was never supplied.** `distribution/site.js` read
   `options.ontologyTerms` and the only production caller, `buildOptions` in
   `application/cli/verbs/_helpers.js`, returned `{level, specVersion, version}`.
   Every built `/ns/context.jsonld` therefore carried `context([], …)` — the seven
   prefixes and the 24 external definitions, and **0 of 52** `asc:` terms.
2. **The generated context was never handed to the emitter.** Even with (1) fixed,
   `toJsonLd` fell back to `context([], allExternalProperties())` for its compaction
   table, so `graph.jsonld` would still have written every vocabulary IRI in full and
   AGSC-06-32's round trip would still have failed. The two had to be closed together.
3. **A Level-0 emission named no context at all.** `site.js` set `contextUrl` only at
   Level ≥ 2, on the reading that a document must not name a URL its node does not
   serve. AGSC-05-09 as amended at rc.5 overturned that reading — "The URL is a
   constant of this specification, resolvable by every reader at every Level" — and
   the old behaviour was **data loss**: expanded with no context, the reference
   fixture's Level-0 `graph.jsonld` yielded 19 triples where `graph.nq` carries 36.

#### 11.14.2 What the fix is

| file | change |
|---|---|
| `adapters/node-fs.js` | `readOntology(engineRoot)` beside `readSchemas` — the one place vocabulary bytes may enter, since `knowledge/` never reads files |
| `knowledge/turtle.js` | `ontologyVersion(text)` — the `owl:versionIRI` version of AGSC-05-25, read from the document so no module writes `1.0.0-draft.1` down |
| `knowledge/jsonld.js` | `persistentContextUrl(version)` — AGSC-05-09's constant, derived from `nquads.js#NS` and that version |
| `application/cli/verbs/_helpers.js` | `ontology()` reads and memoises the vocabulary exactly as `schemas()` does; `buildOptions` gains `ontologyTerms` and `ontologyVersion` |
| `distribution/site.js` | ONE context object per build: it is both the bytes of `/ns/context.jsonld` and the compaction table every JSON-LD view uses, so the file a node serves and the documents it serves cannot disagree. `contextUrl` is set at every Level — the node's own copy at Level ≥ 2, the persistent versioned URL below it — and a build given no vocabulary names the missing `@context` in `skipped` rather than emitting a lossy document in silence |
| `tools/gen-ns` | `--check` resolves a term by `@id`, not by the key the writer chose (§11.11) |

#### 11.14.3 What it is proved with

`tests/distribution/ns-context.test.js` builds the reference fixture through the
same `buildOptions` the CLI passes and asserts, offline, with the pinned `jsonld`
devDependency and a document loader that refuses every URL but the context:

* the built context carries 85 members — 2 flags, 7 prefixes, 52 `asc:` and 24
  external definitions — none mapped to null, `@version` 1.1, `@protected` true, and
  equals the generator's own output;
* no `.jsonld` route contains the substring `w3id.org/agentic-system-core/ns#`;
* expand → re-compact of the built `/graph.jsonld` against the built
  `/ns/context.jsonld` is **byte-identical**, and so is every `/pages/<slug>.jsonld`;
* a Level-0 and a Level-1 `graph.jsonld` name the persistent versioned URL, a
  Level-2 one names the node's own copy, and all three expand to exactly the triple
  count of `graph.nq`;
* `/graph.nq` and `/graph.ttl` are byte-identical to the pre-fix build, and
  `/graph.jsonld` is not — the fix moves the JSON-LD spelling and no fact.

#### 11.14.4 What moved, and what did not

Six routes of the reference fixture (of 41) and 76 of the pattern node (of 312):
`/graph.jsonld`, `/ns/context.jsonld`, every `/pages/<slug>.jsonld`, and exactly
three digest members of `/.well-known/knowledge-linkset` — the `describedby` digest,
the AGSC-04 bundle hash and the `rel#context` digest. Nothing else moves.

The engine's `/ns/context.jsonld` and the one the specification's own site publishes
are now **byte-identical** (`cmp`), on two independent implementations of
AGSC-06-32 that share no code — which is the strongest evidence available for
AGSC-04-24's cross-implementation claim, and the reason (the unpinned term
names) is worth settling at 1.0.0 rather than left to luck.

### 11.15 The two legal-facing surfaces

`/.well-known/security.txt` and `/legal/` are the two routes whose content is a fact
about the **publisher** rather than about the Bundle, and both were emitted from
nothing. The writer published a `security.txt` with no `Contact:` field and
`Expires:` set to the build instant — invalid under RFC 9116 §2.5.3 and §2.5.5 — and
a `/legal/` page carrying the Content Use Terms alone, where PRD-019 asks for the
terms, a privacy notice, the operator and a retention statement.

Neither input exists in `agsc.config.json`: the configuration is closed
(AGSC-01-18, `additionalProperties: false`) and carries no security contact and no
privacy text, and the `x-<vendor>-<key>` namespace is explicitly one no conforming
tool may interpret. The inputs are therefore **authored files in the Bundle root**,
read through the FileSystem port exactly as `LICENSE-CONTENT` is since rc.5:

| input | route | absent |
|---|---|---|
| `.well-known/security.txt` | `/.well-known/security.txt` | `AGSC-E901`, and the route is not emitted |
| `PRIVACY.md` | the Privacy section of `/legal/` | warning `AGSC-E406`, and the section is omitted |
| `site.author` + `bundle.operator` | the Operator section of `/legal/` | warning `AGSC-E406`, and the section is omitted |

`site.securityTxt` publishes the authored fields verbatim and derives only what the
authored file leaves unstated: `Expires` (364 days after the build instant, so it is
inside RFC 9116's recommended year and cannot go stale between two builds),
`Canonical` and `Policy` (the last only when `/legal/` is emitted). A missing
`Contact` is `AGSC-E202`, an expiry already past at build time is `AGSC-E204`, an
expiry more than a year ahead is the same code as a warning, and any error means the
route is left out rather than published invalid.

`site.publicationFindings` is the one place these checks live; the CLI `lint` lane
calls it so a publisher learns before anything is written, and `distribution/ci.js`
passes `publication: false` to the build so that the fault the lint lane already
reported is counted once (AGSC-09-11).

`site.internalLinks` now takes the node's own base: a `Contact:` is by definition at
another origin (RFC 9116 §2.5.3 — "a web page with contact information"), and the
dangling-link guard read every absolute URL in the two text dialects as a route of
this build. A contact under the node's OWN base that the build does not emit is
still `AGSC-E901`, which is right.

Not fixed here, and recorded for 1.0.0: `spec/` says nothing about either surface
beyond "only `security.txt` is published, at its RFC 9116 location" (AGSC-06-01) —
no rule names the fields, the input or the expiry, and `docs/SPEC.md` §4 nevertheless
claims conformance to RFC 9116 with a "presence + expiry check". §9.4 registers no
code for an artefact that is invalid against a standard it claims.

### 11.16 Seven defects closed after the independent verification

An independent end-of-session verification re-ran every gate and left eleven
findings "reported". This section records what changed in the engine because of them.
Nothing in `spec/`, `schema/`, `ontology/` or `tests/vectors/` was touched, and the
`1.0.0-rc.5` tag did not move.

| # | what was wrong | what is now true |
|---|---|---|
| 1 | **The page tools went silent above 500 items.** AGSC-06-21 turns `/search.json` into the manifest `{docs_total, shards[]}` there, and `page-tools.js` read `index.docs`, which a manifest does not carry. Every tool then answered over an empty corpus — `search` `{hits: []}`, `ask` the fixed no-answer string, `read` `AGSC-E301` for an item that exists — with no diagnostic, while the local server answered correctly: an AGSC-09-16 divergence, and a silent one. | `page-tools.js#pageIndexOf` reads both shapes and MERGES the shards — `docs[]` concatenated in shard order, every posting of shard *k* offset by the documents the earlier shards carried, because posting indices are per shard — so the page holds exactly the index an unsharded writer would have emitted. `API.load` follows the manifest, and only to the `/search-<nn>.json` routes of this origin (`pageShardRoutes`): a manifest naming `https://evil.example/…` or `/../secret.json` is not followed. A shard that is not served, a shard that is not an index, and a document count that disagrees with `docs_total` all make the index `incomplete`, and `search` and `ask` then answer `AGSC-E901` naming what is missing instead of an empty result. `tests/distribution/page-tools-shards.test.js` GENERATES a 520-item Bundle, builds it, and runs the EMITTED `/compose/*.js` in a fake-browser harness (`document.modelContext`, a `fetch` that refuses any URL that is not a path of this origin): 19 calls, including a query whose two hits sit in different shards, all byte-equal to the local server's. |
| 2 | **An import could overwrite the node's own items.** The taken-slug set was seeded from the INCOMING set alone, so a foreign bundle naming a slug the operator had authored replaced that file — silently, exit 0, zero findings, recoverable only from git. | `verbs/import.js#survey` compares the plan with the tree first. A collision with an AUTHORED ITEM (anything under `content/` but `content/index.md`, which the `old-site` adapter seeds by design) means **nothing is written at all** — not the colliding file and not its innocent neighbours — and every collision is reported as `AGSC-E206` naming the file and what to do. `--dry-run` reports exactly the same. `--replace` is the adapter flag of AGSC-01-26a (§9.3's adapter-flag sentence) and is the only way to ask for replacement; each replacement is then reported as a warning. Writes still go through the Bundle's own port, which refuses an absolute path, a path escaping the root and a path that leaves the root through a link (`AGSC-E902`). Both adapters, `old-site` and `okf`. A byte-identical re-import is still a silent no-op, so AGSC-01-23's idempotence is unchanged. |
| 3 | **An import wrote a Bundle its own `lint` rejected, and said `pass`.** A foreign single-line value carrying a control character was serialised back as the YAML escape `"N\0UL"`, which parses to U+0000 — `AGSC-E204` against the AGSC-02-24 pattern on a file the importer had just created. | `interchange/mapping.js#neutraliseSingleLine` applies `knowledge/unicode.js#singleLine` to every string of a mapped frontmatter, and both adapters call it. One U+0020 per forbidden code point: total, idempotent, and the identity on every conforming value, so the `export --okf` → `import --from okf` round trip does not move a byte. Every substitution is reported as `AGSC-E506` naming the member path. |
| 4 | `tools/count-artifacts` resolved the vector re-read of the check against `process.cwd()`, so from any other directory — `--help` included — it threw a nine-frame `ENOENT` and exited 1. | It resolves everything from its own location, takes an optional `[<root>]` like the other nine, answers `--help` before reading anything, and exits 2 with a usage finding on a root that holds no `spec/` or `tests/vectors/`. |
| 5 | **Three checkers reported `pass` on a destroyed specification folder** and two on a directory that does not exist. A gate that passes over nothing protects nothing (AGSC-09-92 makes `validate-spec` a merge gate). | All nine command contracts of AGSC-09-90 were audited for the three vacuous shapes — zero files read, zero rules found, zero vectors found. `validate-spec` (no numbered file, no rule bullet, no `spec_version`), `gen-spec-html` (no rule anchor, no version), `gen-ns` (no `asc:` term), `validate-features` and `validate-diagrams` (no file in the directory) and `validate-vectors` (no vector, no rule to resolve against) now each report `AGSC-E901` and exit 1; `validate-schemas`, `validate-ontology` and `validate-wellknown` already did. **Every one states how many input files it read**, so "nothing is wrong" can be told from "nothing was looked at". `validate-vectors` gained `run(argv, io)` and `--help` like its siblings. |
| 6 | With **no `SOURCE_DATE_EPOCH` and no git history** — AGSC-04-09's drop-in case, and exactly what `agsc init` then `agsc build` gives a new publisher — the build instant is 0 and the writer derived `Expires: 1970-12-31T00:00:00Z`: an already-expired security contact, published with only the generic `AGSC-E606` warning. | `site.securityTxt` refuses to derive an expiry from a defaulted instant: `AGSC-E204`, the route is not emitted, and the message tells the publisher to commit once or set `SOURCE_DATE_EPOCH`. Nothing reads a clock — the test is `now === 0` — so the emitted `Expires` stays a pure function of the build instant and the build stays byte-reproducible. The check belongs to the lane that WRITES: `lint` emits nothing and is silent, which is what vector `cli-0002` requires. |
| 7 | Two validators of `SOURCE_DATE_EPOCH` disagreed — `node-clock` trimmed, so `" 12 "` was accepted there and refused by the CLI's own pre-flight check, and `"007"` the other way round — and the two fatal paths wrote their diagnostic to different streams under `--json`. | `adapters/node-clock.js#isMalformedEpoch` is the one definition and `application/cli/main.js` calls it. Both fatal paths write one JSON object per line to **stderr** under `--json`, because no verb ran and stdout under `--json` carries exactly one envelope and nothing else. |

Also, outside `src/`: `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` are in
`package.json` `files`, so the npm package carries a security-reporting address and
the contribution terms (278 entries in `npm pack --dry-run`); `README.md`
and the record table name the tag and the export flags correctly;
and `internet-draft/SUBMISSION-NOTES.md` no longer carries three third
parties' e-mail addresses — the names, affiliations and RFC links stay, and
the addresses are where they have always been, in the Authors' Addresses sections of
RFC 9727 and RFC 9264.

---

### 11.17 `1.0.0-rc.6` — the engine follows the draft

**Summary.** One specification pass applied 31 items to the frozen artefacts: one new rule, 23
amended in place, one new configuration key, two vectors withdrawn and eight added.
This section is what the engine changed to follow them. Where a vector and the engine
disagreed, AGSC-00-03 made the rule normative and the engine the defect; all eight of
's ids are now passing handlers and were removed from
`tests/conformance/pending.json`.

**One source of truth for the spec version, still.**
`application/cli/main.js#SPEC_VERSION` is `'1.0.0-rc.6'`. The ENGINE version is a
different number and lives in `package.json` — `1.0.0-rc.6` at this release
candidate, because the maintainer publishes the two equal on launch day, and still
read from two different places.

| id | what changed, and why | rule |
|---|---|---|
| 1 | **`/assets/<path>` is emitted.** Every file under `content/assets/` a PUBLISHED body references is a route of its own, bytes unchanged, and `bodyHrefResolver` renders the reference as that route. The rule admitting such a reference and the route set that carried none were jointly unsatisfiable; the engine could only warn, and the warning is gone with its cause. An asset no published body names is emitted at no route, exactly as an unreferenced attachment is. | AGSC-06-01, AGSC-03-11 |
| 2 | **`/ns/<ontology-version>/context.jsonld`** is served beside `/ns/context.jsonld` at Level ≥ 2, byte-identical to it. | AGSC-06-01, AGSC-05-09 |
| 3 | **The AI-assistance line.** `knowledge/provenance-header.js` is the one place the AGSC-06-15 block is built; `distribution/llms.js`, `composition/skills.js`, `interchange/steer.js` and the `llm-context` adapter take it from there, and `composition/harness.js` restates it for its AGSC-07-13 portability contract with a test comparing the two. `/legal/` carries the same constant, quoted rather than restated. | AGSC-06-15, AGSC-06-13a, AGSC-06-18 |
| 4 | **`commentSafe` writes `--&gt;`**, the replacement the rule now names, in `knowledge/unicode.js` and in the Harness's portable copy. | AGSC-06-13a |
| 5 | **`site.tdm_crawlers[]` drives `robots.txt`**: one `User-agent`/`Disallow: /` group per token, in configuration order, before the default group, and no `Disallow` for any other token. A node publishing a reservation with an empty list is `AGSC-E202` **at build** — the lane that writes the file; `lint` emits nothing and stays silent, which is what vector `cli-0002` requires. | AGSC-06-18 |
| 6 | **`asc:mentions` is emitted.** `site.build` derives the pairs from `links.resolve` over the PUBLISHED projection and injects them into the point `nquads.js` has carried since rc.2 and nothing filled. One triple per ordered pair whatever the number of references, none for a self-reference, no computed inverse. **It moves `graph.nq`, `graph.ttl`, `graph.jsonld`, the per-item `.jsonld` and the bundle hash of every node with an inline body link.** | AGSC-05-27, AGSC-03-11, AGSC-05-16 |
| 7 | **One derivation of a context term's name.** `knowledge/jsonld.js#termName` was the conforming one; `tools/gen-ns` followed it, and its `--check` lane now resolves a term by its `@id` instead of by the key — which is what would have made the check pass over nothing once the keys changed. `jsonld.js#contextFrom` is the same derivation over explicit rows, which is what `graph-0019` exercises. | AGSC-06-32 |
| 8 | **`run` and `expect` are the only executable fences**; the braced spellings are rendering hints again. A fence this engine ran and another did not would be a divergence in the worst possible place. | AGSC-02-22, AGSC-09-94 |
| 9 | **A trace record carries the members the rule names.** The older names this engine also accepted are preserved under `x-trace-<key>` rather than placed, so a record written here imports elsewhere. | AGSC-09-94 |
| 10 | **A repeated value flag is `AGSC-E002`.** `--target agents --target claude` silently exported `claude` alone. | AGSC-09-09, AGSC-01-28 |
| 11 | **The nine checkers fail over an absent input** — exit 1, the envelope, `AGSC-E901`. Five printed a usage block and exited 2. Each states how many input files it read. | AGSC-09-90 |
| 12 | **The historical-note carve-out is one definition** in `tools/validate-spec` and `tools/count-artifacts`: the word list gains *for, against, written, re-verified* and a `YYYY-MM-DD` date test. | AGSC-09-91 |
| 13 | **The page footer carries a copyright line and a one-sentence disclaimer.** Neither the name nor the year is hard-coded: the name is `site.author` and the year is the year of the build instant, so the footer is byte-reproducible and this engine never stamps one owner's name into somebody else's pages. No author configured, no copyright line. | AGSC-06-18, owner legal pack B-04 |
| 14 | **`tools/` ships in the npm package**, with `features/` and `docs/diagrams/`, the inputs two of the nine read; `CONTRIBUTOR-AGREEMENT` ships and is pinned by an architecture test as `LICENSE-CONTENT` is; the alias `agsc-cli` now CALLS the engine instead of only loading it. | AGSC-09-90, AGSC-08-06 |

**Conformance statement, measured on 2026-09-22.** This engine implements
`1.0.0-rc.6` and claims **no conformance Level**: AGSC-10-05 admits a claim only
after a green run of the Level's vector set at 1.0.0, and nothing is tagged 1.0.0.
What is measured is this: `tools/count-artifacts` reports 342 rules (331 active + 11
reserved), 90 registered error codes all used, 166 vectors (147 required + 1 optional
+ 18 withdrawn) over 19 populated areas, and 52 ontology terms, with no finding; the
conformance runner passes every live vector and skips the withdrawn ones; and the
eight ids still in `tests/conformance/pending.json` are a parallel package's
('s), not this one's. Unicode is pinned at 16.0.0 (AGSC-06-23) and the
deployment profile is Cloudflare Pages (AGSC-06-17), which is what a claim would have
to state.

### The archive of a multi-file result

| id | what changed | rules |
|---|---|---|
| 1 | **`composition/archive.js`** is a new PURE, PORTABLE module: the STORE-profile ZIP container of APPNOTE.TXT, its entries in code-point path order, its timestamps the AGSC-04-09 build instant in UTC, nothing optional written. It is emitted into the page bundle of AGSC-07-13 beside the two algebras, so the `/compose/` page's "download all" link and `agsc compose --zip` cannot produce different bytes — proved by evaluating the bundle in a context that holds the language and nothing else and comparing the two archives byte for byte. | AGSC-07-13, AGSC-04-02, AGSC-04-09 |
| 2 | **`compose --zip`, `skills --zip`, `export --zip`** write one archive BESIDE the directory they package — `dist/harness/<name>-<version>.zip`, `dist/skills-<version>.zip`, `dist/export/<root>-<version>.zip` — and never inside it, because AGSC-07-12 closes the Harness at seven file kinds "and no others". The SHA-256 of each is printed on stderr (AGSC-09-10). An invalid composition emits no Harness and therefore no archive (AGSC-07-17); `skills --zip` beside `install`/`import`, and `export --zip` with nothing but the two single-file graph exports, are `AGSC-E003`. | AGSC-07-12, AGSC-07-17, AGSC-09-10, |
| 3 | **The archive name carries the content version** of AGSC-04-25, through `knowledge/content-version.js#orFromInstant` and the one derivation `verbs/_helpers.js#buildOptions` makes per invocation; a value outside that rule's grammar becomes `unversioned` rather than a wrong name. | AGSC-04-25, |
| 4 | **`fflate@0.8.3` is pinned as a devDependency** and is the independent third-party READER of every archive the tests build; the encoding and the checksum are measured against `TextEncoder`/`Buffer` and `node:zlib#crc32`; reproducibility is measured by building the same Harness twice under `TZ=UTC LC_ALL=C` and `TZ=Pacific/Kiritimati LC_ALL=tr_TR.UTF-8`. `npm audit --audit-level=low`: 0 vulnerabilities. | AGSC-04-02 |
| 5 | **AGSC-09-09's closed verb-flag list does not name `--zip`.** It is registered in `VERB_FLAGS` exactly as `compose --out` was before it, and the proposed wording is recorded for 1.0.0 as item on the specification items list. No error code was minted: the archive's own refusals take the registered `AGSC-E903` ("archive refused") and `AGSC-E902`. | AGSC-09-09, AGSC-01-16, AGSC-09-15 |

### The content version, the plugin contract and forward compatibility

| id | what changed | rules |
|---|---|---|
| 1 | **One derivation of the content version, in one place.** `knowledge/content-version.js#bundleVersion({gitLog, buildInstant})` is a pure function of the two inputs a build already has: four branches, the twelve-character abbreviation (git's own depends on the clone), the grammar test and the `AGSC-E506` warning for a tag that cannot be a content version. Every writer is HANDED the string — `verbs/_helpers.js#buildOptions` derives it once per invocation — because AGSC-07-13 obliges the `/compose/` page to emit the same bytes as the command line and a page has no git history. It lives in the Knowledge context and not beside the ledger derivation because `spec/04` is Knowledge's and because `composition/` may require `knowledge/` and may not require `governance/`. | AGSC-04-25, AGSC-07-13 |
| 2 | **The git-log file of AGSC-08-20b is now actually read.** `verbs/_helpers.js#gitLog` produces it in ONE process through the ProcessRunner port — committer time in whole seconds, never a rendered local time — and hands it to `governance/ledger.js#produce`, which is the rule's implementation. With no runner, no git, no repository or nothing parseable it is `undefined` and the content version takes branch 4, which is exactly AGSC-04-09's drop-in case. Until this package nothing in the engine produced that file, so the ledger derivation had no input in any real run. | AGSC-08-20b, AGSC-04-09 |
| 3 | **Nine stamping points, and two deliberate absences.** `agsc-bundle-version` on the anchor's `describedby` link; the AGSC-06-22 line on `/now/` and `/now.md`; the `bundle_version:` line of the provenance header (one change in `knowledge/provenance-header.js` reaches `/llms.txt`, `/llms-full.txt`, the skim view, every steer target and every Harness digest, through AGSC-01-29); the `/chunks.jsonl` shard manifest; `/skills/index.json`; `harness.jsonld`; the root document of a Markdown or OKF export; the `/changelog/` versions list. **Nowhere** in `export --jsonld`/`--jsonl`, which AGSC-01-27 makes byte-identical to the graph, and asserted absent by a test so a later change cannot add it by accident. | AGSC-06-08, AGSC-06-13a, AGSC-06-22, AGSC-06-31, AGSC-07-12, AGSC-07-19, AGSC-01-26, AGSC-01-27 |
| 4 | **`/now.md` moved after the graph views**, because the line AGSC-06-22 pins carries the fingerprint of `graph.nq` (AGSC-04-15) and a page cannot state a hash of bytes that do not exist yet. Nothing else about the page changed; the first paragraph is now the pinned line rather than a "Built at …" sentence that said one quarter of the same thing. | AGSC-06-22, AGSC-04-15 |
| 5 | **A `restricted` node now omits what AGSC-11-20 says it must.** The rule has obliged a gated node to withhold `agsc-counts`, `agsc-bundle-hash`, `agsc-bundle-version` and `agsc-ledger-head` since rc.5 (the rule was fixed then); the writer emitted them anyway and `check()` did not look. Both now do the rule, and a restricted document carrying one of the four is `AGSC-E210`. | AGSC-11-20, AGSC-09-93 |
| 6 | **`import` has one limit and one record.** `interchange/okf.js#sourceFacts` reads the source's own bundle-root `index.md`; `#versionRefusal` refuses a MAJOR or MINOR this tool does not implement with `AGSC-E004` **before any file is planned**, so `--dry-run` reports the same thing by construction; the adapter's own `--allow-newer` takes the risk on the operator's word. Every written item carries `prov.source_version` and `prov.source_hash`, each omitted when the source publishes neither. | AGSC-01-22, AGSC-08-01, AGSC-01-26a |
| 7 | **A value outside a CLOSED operator list is `AGSC-E203` at exit 1**, not `AGSC-E002` at exit 2: the flag is known and only its value is not, and AGSC-09-08 reserves exit 2 for an unknown verb, an unknown flag, a missing argument or invalid configuration. `export --steer --target` changed code; `compose --emit` gained the closed registry AGSC-07-18 states, so the reserved name `executable` is refused by name. | AGSC-00-23, AGSC-07-18, AGSC-01-28, AGSC-09-08 |
| 8 | **Invalid configuration exits 2 wherever it is raised**, by code and not by call site: `main.js#USAGE_CLASS_CODES` holds `AGSC-E004` alone. And the diagnostic names the key — `routing: must NOT have additional properties — that name is RESERVED to a later version …` — because a JSON Pointer names the CONTAINER of an `additionalProperties` error and the operator was left to guess which of their keys was wrong, which AGSC-00-25 makes matter. | AGSC-09-08, AGSC-01-18, AGSC-00-25 |
| 9 | **The plugin contract**: `application/plugins.js` holds one registry per kind of AGSC-00-24, each carrying its row as DATA (selector, may read, may emit, may never, owning rules), and the capability check every plugin passes at load. Three guarantees, each with its own test: nothing is auto-loaded from the network (a specifier carrying a protocol is `AGSC-E905` and the resolver is never reached); a mismatch is `AGSC-E004` and the plugin is simply not registered, and nothing throws; the contract is additive within 1.x and the kind list never grows, because it is the specification's. `docs/PLUGINS.md` is its prose and `examples/plugins/` its eight worked samples. | AGSC-00-24, AGSC-04-03, AGSC-08-30 |
| 10 | **The samples are proof, not decoration.** `tests/arch/plugin-contract.test.js` checks every file in `examples/plugins/` against its row: it registers into its own registry and into no other; it reaches no network and spawns no process, checked in its source text AND at run time through the real module loader (each sample requires nothing at all, which is the strongest form a CommonJS module has); every path it names is Bundle-relative and outside `content/`; and building the fixture with all eight loaded and called gives the same bytes, file for file, as building it with none. | AGSC-00-24, AGSC-04-24 |
| 11 | **Forward and backward compatibility, end to end.** `tests/application/compatibility.test.js` drives the real CLI over a real Bundle carrying the reserved 1.1 key `weights` beside a vendor key: `lint` warns once with `AGSC-E207` and says nothing about `x-acme-note`, `build` succeeds, and both members come back byte for byte through `lint --fix`, `export --markdown` and `import --from okf`. Backward: an older `spec_version` of the same MAJOR is read normally; a newer MINOR under `import` is refused before anything is written, under `--dry-run` too, and `--allow-newer` opens it. | AGSC-00-21, AGSC-00-22, AGSC-00-15, AGSC-01-22 |

**The eight vectors parked are eight passing handlers**, and
`tests/conformance/pending.json` is empty again: `build-0014`, `bundle-0006`,
`cli-0009`, `disc-0013`, `disc-0014`, `disc-0015`, `imp-0002`, `lint-0027`.

**Two readings are stated in the handlers rather than hidden, and both are recorded
as items for 1.0.0.** `cli-0009`'s control case states `exit: 0` and `findings: []`
for `compose --emit gabbe`, which is what a distribution that SHIPS that emitter
answers; this one ships none and answers the honest `AGSC-E001` of AGSC-09-94, so the
control is asserted as what the case is about — the registry accepted the name and
raised nothing. `lint-0027`'s fixture item omits the `kind` that
`schema/item.schema.json` requires of a `concept`, so its `exit: 0` / `status: pass`
is asserted over the diagnostics the two KEYS produce; the round trips it pins are
asserted over the whole file with no such reading.

### Connectors for agents: the COGX adapter and the two entry points (2026-09-23)

| id | what changed | rules |
|---|---|---|
| 1 | **`interchange/adapters/cogx.js` — the second memory adapter, both ways.** `export --to cogx` writes a COGX 0.1 archive (the format Cognee reads and writes, and into which it translates Mem0, LangMem, Letta and Zep/Graphiti memories on migration into Cognee — corrected 2026-09-24; an earlier line here said the archive was carried on to those systems) under `dist/export/cogx/`: `manifest.json` plus one JSON-lines file per record kind, only for kinds that have a record, with the reference writer's own file names and its `exclude_none` shape. One primary record per published item (concept → entity, episode → episode, lesson → memory, procedure → memory block, cluster and gate → a BARE raw-node line), one document per chunk and one fact per authored Link between published items. Every record's `metadata.agsc` carries the IRI, licence, Content Use Terms, trust mark and both versions; the primary record also carries the authored frontmatter and body, which is what makes the round trip lossless. `import --from cogx` rebuilds our own archive item for item (plus AGSC-01-22's `prov.source_version`), imports a foreign archive by kind with everything unclaimed kept in `x-cogx-rest`, reports and skips foreign episodes, documents and raw nodes, and refuses an archive carrying `permissions.json` (`AGSC-E403`) or a newer COGX MAJOR or spec version (`AGSC-E004`, unless `--allow-newer`). The verb reuses the `okf` lane's tail, so `--dry-run`, the collision refusal and `--replace` behave identically. | AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30 |
| 2 | **Every `export --to` adapter is handed the content version.** `verbs/export.js#adapterExport` now passes `bundleVersion` (derived once, as the other export forms do), so an adapter's provenance header states the node's real content version instead of the build-instant fallback. | AGSC-04-25, AGSC-06-15 |
| 3 | **The two consumer entry points** at the repository root: `action.yml`, a composite GitHub Action that installs the engine at the action's own ref (`npm ci --omit=dev --ignore-scripts`) and runs `agsc ci`, with the setup action pinned to a commit and every input passed as an environment variable; and `.pre-commit-hooks.yaml`, one hook `agsc-lint`. `tests/connectors/entry-points.test.js` parses both against their documented formats. | AGSC-09-07, AGSC-09-08 |
| 4 | **`examples/connectors/`**: runnable examples for Claude Code (steering, skills checked against the lockfile, a recall hook over `llms-ctx.txt`), Codex and Cursor, and a record reshaper for LangGraph, AutoGen and Mem0 — all executed by `tests/connectors/examples.test.js`; plus illustrative framework files that no test runs. `docs/CONNECTORS.md` and `docs/USE-CASES.md` are the prose; `tests/acceptance/use-cases/` runs the offline scenarios through the real command line. | AGSC-01-26a, AGSC-01-28, AGSC-07-19…21 |

### The open engine items, the GABBE adapter both ways, the alignment file

| id | what changed | rules |
|---|---|---|
| 1 | **Peer citations reach the graph.** `distribution/site.js` now calls `boundary/federation.js#peerCitations` and hands its pairs to `knowledge/nquads.js#dataset` through a new `citations` option (injected like `mentions`), so a `sources[].resource` under a declared peer's base is `rdfs:seeAlso` + `asc:peerOrigin` in `graph.nq`, `graph.ttl`, `graph.jsonld` and the item's `pages/<slug>.jsonld`. A reference under a peer base that is no IRI is `AGSC-E312` and is omitted; with no peer declared nothing changes. `asc:peerOrigin` is no longer the one unemitted property. | AGSC-11-12, AGSC-05-27, AGSC-05-28 |
| 2 | **`cite-as` and `rel#signature` are accepted** by the discovery writer's checker, the federation reader's `related[]` check and `tools/validate-wellknown` (which still requires `type` on `cite-as` and never requires a digest on the signature link). | AGSC-06-08, AGSC-06-10, AGSC-06-35 |
| 3 | **A remembered lesson is conforming**: `remember` gives a lesson the `severity` its schema branch requires (default `info`) on both transports (MCP and the page script). | AGSC-09-14b, AGSC-09-16 |
| 4 | **`gen-spec-html --check`** finds a chapter at `/specs/<name>/` or at the numbered `/specs/<nn>-<name>/`, and `--check <dir> --text` compares what a publisher's own pages say — the words of every rule, found by its anchor, and the table rows — instead of their bytes. The main site's `www-next/specs` passes it. | AGSC-09-90 |
| 5 | **`validate-vectors` and `validate-diagrams` refuse a directory that is not their input** (a published site) with `AGSC-E901`, instead of judging its files. | AGSC-09-90 |
| 6 | **`build` refuses what `lint` refuses about attachments** (`site.js#judgeAttachment`): an SVG outside the allow-list (`AGSC-E412`), a path outside the grammar (`AGSC-E902`) and the FileSystem port's own refusal (`AGSC-E902`/`E903`/`E904`) withhold the bytes and fail the build; under `ci` the lint lane reports the fault once. The lint verb's presence map now carries byte lengths, so the attachment cap and an absent attachment are reported at all. | AGSC-02-98, AGSC-01-16, AGSC-01-34, AGSC-01-35 |
| 7 | **Input refusals carry the rule's code**: a file that is not UTF-8 is `AGSC-E108` (`adapters/node-fs.js` decodes strictly), an oversized `agsc.config.json` is `AGSC-E904`, an archive given to `import` is `AGSC-E903` (it used to die with an internal error), an oversized import file is `AGSC-E904`. | AGSC-01-14, AGSC-01-16 |
| 8 | **The encoded-text threshold is 256**, one unbroken run of `[A-Za-z0-9+/=]` or `[0-9a-fA-F]`, as the rule fixed at rc.5 (it was 128). | AGSC-08-13 |
| 9 | **`export --steer` states the real content version**: `steer.plan` dropped the `bundleVersion` it was handed. | AGSC-04-25, AGSC-06-15 |
| 10 | **`interchange/adapters/gabbe.js` — the GABBE memory adapter both ways.** `export --to gabbe` writes a kit's folder layout (skills, guides, semantic and episodic memory, CONTINUITY entries, a steering guide) from published items, each carrying a lossless `agsc-item` line; `import --from gabbe <kit-dir>` rebuilds our own records exactly (plus `prov.source_version`) and maps a foreign kit's skills, CONTINUITY entries, audit rows, decision logs and dated state lines, reporting whatever it cannot map without inventing an outcome or an instant. `--dry-run`, the collision refusal and `--replace` are the shared import tail; `--source-version` records the kit's version, which a kit does not publish. `export.js#adapterExport` now hands every adapter the NOW state as well. | AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30, AGSC-07-15 |
| 11 | **The engine no longer stamps one owner's legal position on every node** (legal review L2-01): "All rights reserved" only where the prose licence is the Content Use Terms (else the footer names the licence); `tdm-reservation` `1`, the robots `ai-train=no` signal and the per-crawler `Disallow` groups only then too (else `0` and none — CC BY 4.0 §2(a)(5)(B)); the footer AI sentence and the `/legal/` practice paragraph only when a published item records AI assistance; the disclaimer only from an authored `DISCLAIMER.md` (`site.js#readDisclaimer`, its own `/legal/` section). Rule-forced and kept, recorded as: the terms identifier on every prose-carrying export, `schema:usageInfo`, the `assistance:` header line and its `/legal/` quote. | AGSC-06-15, AGSC-06-18 |
| 12 | **`ontology/alignments.ttl`** (informative, CC0, read by no build): SKOS mapping statements from our terms to AgentO and DCAT, every target verified by URL and quote in its header. It adds no term (the counter stays 52). | AGSC-05-28 |

### The skills repositories and rule packs, both ways (2026-09-23)

| id | what changed | rules |
|---|---|---|
| 1 | **`interchange/adapters/skills.js` — the skills memory adapter both ways**, over five layouts: `agentskills` (the Agent Skills format: `skills/<name>/SKILL.md`, used by `anthropics/skills`, the "garden" collections, Codex's `.agents/skills` and `gh skill`), `claude-plugin` (`.claude-plugin/plugin.json` + `skills/`), `marketplace` (`.claude-plugin/marketplace.json`), `cursor` (`.cursor/rules/*.mdc`) and `windsurf` (`.windsurf/rules/*.md`, `.devin/rules/*.md`). `export --to skills --layout <l>` writes the packs `agsc skills` emits (published items only) in that layout under `dist/export/skills/<l>/`, each with the provenance header and content version and one `agsc-item` line per item, so the return import is lossless. `import --from skills [--layout <l>] <clone>` maps a foreign skill to a `procedure` (`when` ← `description`) and a foreign rule to a `concept` of kind `explainer`, with `prov.source_version` from `--source-version`, the plugin's or marketplace's `version` or the skill's `metadata.version`, and `x-skills-*` keys for the source file, layout, licence, dropped files and unclaimed frontmatter. Executable content — `allowed-tools`, `scripts/`, files with an executable extension, a plugin's hooks, `.mcp.json` and scripts — is dropped and reported per file with `AGSC-E407` (warning). The licence check reads the `license` key, a bundled licence file, the plugin's licence or the collection's root licence; a skill with no recognised open licence is imported as `status: draft` and so is never published. `--list` prints the catalogue of a local clone (and counts a link list's entries) without writing or fetching. `--dry-run`, the collision refusal and `--replace` are the shared import tail. | AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30, AGSC-07-15, AGSC-07-19 |
| 2 | **`verbs/export.js#adapterExport` hands an adapter its own flags and, when it declares `NEEDS_SKILL_PACKS`, the packs of `verbs/skills.js#packsOf`** — the same bytes `agsc skills` writes, computed in the application layer because Interchange may not require Composition. `main.js#ADAPTER_FLAGS` gains `import --from skills` `--layout`/`--list` (plus `--replace`, `--allow-newer`, `--source-version`) and `export --to skills` `--layout`. `verbs/import.js` gains `importSkills`, `cloneFiles` (never walks `.git/` or `node_modules/`) and `sourceVersionRefusal`, now shared with the GABBE lane. | AGSC-09-09, AGSC-01-26a |
| 3 | **`tools/validate-diagrams` on a directory that does not exist** answers `AGSC-E901` with exit 1 and the AGSC-09-11 envelope, as every other checker does (it exited 2, the usage class). | AGSC-09-90 |

### A live board to and from project and product management tools (2026-09-23)

| what changed | rules |
|---|---|
| **`interchange/adapters/board.js` and `interchange/board-formats.js` — the `board` adapter both ways**, over ten tool formats: `github` (the REST issues JSON, `gh issue list --json`, `gh project item-list --format json`), `gitlab` (REST JSON and the CSV export), `jira` (CSV), `trello` (the board JSON), `linear` (CSV), `asana` (CSV), `notion` (a database's CSV), `obsidian-kanban` (the plugin's Markdown board), `markdown` (GFM task lists) and `todotxt`. Every format is read into and written from ONE intermediate row table. `export --to board --format <f>` writes one file per board (a cluster holding at least one published task) under `dist/export/board/<f>/`, published items only, deterministic, each row carrying its own-record so the return import rebuilds every task, decision, spec and board exactly. `import --from board --format <f> <dir>` maps a tool's state word to a `task_state` through one fixed table (an unknown word reads as `TASK_STATE_UNSPECIFIED` and is reported), keeps the word, assignee, due date, labels, tool id, unresolved links and every unnamed column in `x-board-*` keys, turns a `Decision`/`Spec` type or label into a concept of that kind, resolves blocking links to `blocked-by`, reduces e-mail addresses and removes telephone numbers (reported), and writes every foreign row as `status: draft` on a draft board — or on the Bundle's existing cluster of that name, which is joined and never rewritten. A forged own-record is ignored by `interchange/own-record.js`. `--dry-run`, the collision refusal, `--replace`, `--allow-newer` and `--source-version` are the shared import tail. No network, no API client: files only. | AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-02-99, AGSC-06-30, AGSC-08-16, AGSC-10-13, AGSC-11-02 |

### Plugins from the command line, the published ledger, packaging (2026-09-24)

| what changed | rules |
|---|---|
| **`application/plugin-loader.js` — the verbs' way to a plugin.** `classify` tells a remote specifier (`AGSC-E905`, nothing resolved), a path (resolved against the Bundle root) and an npm package name (resolved from the Bundle root) apart; `load` hands the module to the registry of `application/plugins.js` for the kind the flag selects and admits only a plugin whose name follows the slug grammar; `call` turns a throwing hook into `AGSC-E901`; `unsafePath` refuses an absolute path, `..`, a backslash or a drive before anything is written (`AGSC-E902`); `detached` gives a plugin a frozen copy. `verbs/export.js` (`exportFiles`), `verbs/import.js` (`importFiles`, then the OKF mapping and the shared tail) and `verbs/compose.js` (`emit`, beside the Harness and never inside it or `content/`) use it; a bare name that is a built-in keeps the built-in, and a bare name no package answers keeps its old refusal. A plugin named by a path may take `--replace` on `import`. | AGSC-00-24, AGSC-01-26a, AGSC-07-18, AGSC-04-03 |
| **`verbs/_helpers.js#contentTree`** reads `git rev-parse --verify --quiet HEAD:./content` through the ProcessRunner port, and `buildOptions` hands it to the build beside the git-log file, so `build`, `ci`, `verify`, `export` and `mcp` derive and publish `/ledger.jsonl` with the `rel#ledger` link whenever the Bundle has history. `gitLog` asks for `--name-only` (with `core.quotepath=off`, `--no-renames` and `--diff-merges=first-parent`) and fills the two optional members of the extended entry shape: `files[]` and `author` (`governance/ledger.js#authorOf`). `produce` copies them only when the reader supplied them, so the vector `ledger-0004` is unchanged. `export --steer` passes the file to `steer.plan`, and the `Channel-Auto:` lane is reported as not run when no element lists `files[]`. | AGSC-08-20, AGSC-08-20a, AGSC-08-20b, AGSC-01-28 |
| **`distribution/site.js`** emits the index page of every one of the six type plurals, empty or not, and keeps the navigation to the non-empty ones; it reports an authored `content/assets/theme.js` that the engine's theme script replaces. | AGSC-06-02, AGSC-06-01 |
| **`verbs/compose.js`** decides the `--emit` target before anything is written and writes nothing — no Harness, no archive — once the run holds an error finding; `emitHarness` writes nothing when the emission reports a violation. | AGSC-07-17, AGSC-07-18 |
| **`application/cli/main.js#VERB_USAGE`** — one usage line per verb with its positional arguments; `--help` prints it and, for `export` and `import`, the adapter flags per adapter (`adapter_flags` under `--json`). | AGSC-09-09 |
| **`interchange/cleanroom-rewrite.js`** removes the span around a match of `cleanroom.NUMBERED_DIVISION` as it removes a refused phrase, and reports one that survives. | AGSC-08-17 |
| **`remember` publishes `actor`** among its arguments on both transports, the argument an episode requires. | AGSC-09-13, AGSC-09-14b |
| **Removed as unused:** `architecture.js#INFO_STRING`, `search.js#UNICODE_VERSION`, `mapping.js#OLD_LINK`, `unicode.js#SINGLE_LINE_PATTERN`, the `env.js#_buildTable` alias, and the fallback ports of `bin/agsc.js`, which no installed copy could reach. | — |

### Where a node can live: the hosting profiles and `agsc-host` (2026-09-24)

| what changed | rules |
|---|---|
| **`distribution/hosts/` — seven hosting profiles, each a plugin of the `deployment-profile` kind.** `rules.js` reads the generated `_headers` and `_redirects` back as data and answers, for one path, what the reference host sends (every matching rule, in order, a repeated name joined with ", "; `*` greedy). `cloudflare-pages.js` is the reference and writes nothing; `static-host.js` writes an nginx snippet (one exact `location` per route whose merged set differs from the site-wide set, `types { }` + `default_type` for the content type, `add_header … always`, `absolute_redirect off`) and an Apache `.htaccess` (one `<If "%{REQUEST_URI} =~ m#…#">` per reference rule, `Header always set` including `Content-Type`, `RedirectMatch`), refusing a `$` or `%` value and a route two rules give one header name; `github-pages.js` writes `.nojekyll` and a per-route header table for the proxy in front; `local.js` is the pure answer to one request (read-only, redirects before files, host configuration never served, a directory without its slash 301, the 404 page as HTML, a quoted SHA-256 `ETag` and 304, 400 for a path that does not decode or climbs); `git-clone.js` writes nothing; `ipfs.js` writes the IPFS web-redirects file and a size/SHA-256 manifest; `ledger-anchor.js` writes a JCS-canonical `anchor.json` of the discovery document's build facts plus its digest, and `verify` reads one back (`AGSC-E210`, `AGSC-E701` for the ledger head). `profile.js#claimSentence` puts the profile in the conformance sentence. | AGSC-00-24, AGSC-06-01, AGSC-06-04, AGSC-06-17, AGSC-11-03, AGSC-11-05, AGSC-06-08, AGSC-04-25 |
| **`application/hosting.js` and `bin/agsc-host.js` — `agsc-host list`, `emit`, `serve`, `verify-anchor`.** A command of its own, because AGSC-09-07 closes the `agsc` verb set at sixteen. The built-in profiles are admitted through `plugins.createRegistry('deployment-profile')`; any other name goes through `plugin-loader.js#load` (`AGSC-E905` for a remote specifier, `AGSC-E901`, `AGSC-E004`, `AGSC-E203` for an unknown name). A profile's answer is checked, not trusted: `site` files may not replace a route (`AGSC-E004`), every path passes `unsafePath` and no write passes through a link (`AGSC-E902`), and a run with an error writes nothing. A plugin offering only the older `headerFile(sets)` hook is honoured. `serve` is `node:http` over `local.respond`, reading the build at request time, binding `localhost` by default and sending no `Date` header. Exit codes as AGSC-09-08. | AGSC-00-24, AGSC-09-08, AGSC-01-16, AGSC-04-03 |

### Tests at every level, and the rule-coverage matrix (2026-09-24)

*Numbers measured on 2026-09-24 by `npm test`, `node tools/rule-coverage` and the coverage run; they update §11's counts and do not replace their history.* The suite runs 2,336 tests: 2,254 pass, 0 fail, 82 are skipped on purpose — the 29 withdrawn vectors, 49 acceptance scenarios pending with a reason, the three optional end-to-end lanes and the online `npm audit` probe — with the same result without `SOURCE_DATE_EPOCH` and under `TZ=Asia/Tokyo LC_ALL=de_DE.UTF-8`. Line coverage of `src/` is 99.97 %. Of the 332 active rules, 308 are verified by a machine check, 14 are prose-only with a stated reason and 10 are gaps the engine does not implement yet (`docs/RULE-COVERAGE.md`). `docs/TESTING.md` explains the levels.

| what changed | rules |
|---|---|
| **`distribution/init.js#run`** reads every copy source, as bytes, before any adopted file moves: an adopted note that linked to another adopted note stopped `init` with an internal error, and a binary asset was decoded as text. | AGSC-02-95 |
| **`distribution/site.js#build`**, when the lint lane already ran the publication checks, still reports the faults only a writing lane raises, so `ci` fails wherever `build` does; **`distribution/ci.js#sameBytes`** compares the two builds byte for byte (byte arrays were compared by identity) over the union of their routes; `site.js#verify` hashes a byte array as bytes. | AGSC-09-08, AGSC-06-18, AGSC-06-36, AGSC-04-02 |
| **`application/cli/verbs/verify.js`** — `--ledger` compares the recomputation with the ledger and the well-known head of the local build output (`AGSC-E702`, `AGSC-E701`), and re-verifies the published file when there is no history. | AGSC-08-23 |
| **`distribution/now.js#staleItems`** compares whole instants, not the date alone. | AGSC-02-11 |
| **`distribution/mcp-tools.js#memoryAliases`** and the page's dispatcher in **`distribution/page-tools.js`** accept a `memory://` alias of this node and its https item IRI wherever a slug is accepted, identically on both transports. | AGSC-05-04a, AGSC-05-04b, AGSC-09-16 |
| **`knowledge/validate.js#itemIri`** (wired in `verbs/lint.js`) — an authored `iri` that is not the computed one is `AGSC-E204`; the `tags` count outside 2–5 is the warning `AGSC-E213`. | AGSC-05-05, AGSC-01-21 |
| **`interchange/okf.js#FOREIGN_LINK_NAMES`** — an OKF import maps the foreign link names to Link keys, with an `AGSC-E506` warning per name. | AGSC-03-19, AGSC-03-20 |
| **`distribution/html.js#page`** ends every page with one line feed. | AGSC-04-07 |
| **`tools/rule-coverage`** (standalone, built-ins only), `tests/rule-coverage.allow.json`, `tests/acceptance/features.test.js` with `steps/` and `pending.json`, `tests/standard/`, `tests/e2e/`, `.github/workflows/test.yml`. | AGSC-09-02, AGSC-09-92 |
| **`docs/DEMOS.md`** and **`examples/demos/`** — a runnable demo of every mode and persona scenario, each executed by `tests/docs/demos.test.js` so the quoted output cannot rot (2026-09-25). | AGSC-06-24 |
