# Changelog

All notable changes to AgenticSystemCore: the specification, its schemas, ontology
and conformance vectors, and the reference engine that implements them. The
specification carries its own version (`spec_version`); from this release on, a rule
changed by a later version also carries a dated amendment note in `spec/`
(AGSC-00-16).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `bench/measure.js --assemble` merges, as its help text already said: a layer measured into the scratch
  directory replaces the layer of that name in the record at `--out`, and every other layer of that
  record is kept (before, the record was rebuilt from the partials alone and lost every layer not
  re-run). The record gains `measured`, the layers the last assembly measured (PRD-067). A repository
  tool of the benchmark kit; no emitted byte changes.
- `bench/measure.js --layer package` reads `npm pack --json` after the lines the `prepack` script prints
  (`check:ts`), which made the layer fail on the 1.1 tree.
- `docs/MEASUREMENTS.md`: the 1.1 install and cold-start paragraph now quotes the record's `install`
  layer (86 packages; the module trace), between `measured` markers that `tools/lint-claims --record`
  holds to the record; the 1.0.0 install and cold-start lines keep their figures with a dated note; six
  sentences no longer use the word "first", so the whole page passes the claims check. Two of them say
  again what they measured: "the earliest result painted 322 ms after typing" (a time to the first
  result, not to the whole list) and "computed on their initial use".
- `docs/MEASUREMENTS.md`, the 1.1 install paragraph: the ten largest packages are the record's ten, in its
  order (`@tpluscode/rdf-ns-builders`, `@types/node` and `@traqula/chevrotain` were left out, `ajv` was in);
  why `@types/node` is in a production install (`@rdfjs/types`, under `rdf-validate-shacl`, lists it); the
  1.1 run-time packages listed in full (`oxigraph`, `rdf-validate-shacl` and `@traqula/parser-sparql-1-1`
  were missing); the package count's method beside the 1.0.0 one (`npm ls --parseable` prints the
  install root too); byte sizes describe the tree when it was measured. `tests/docs/quoted-counts.test.js`
  now binds every figure of the paragraph to its member of the record, the ten largest in order, since
  the claims check only proves that a number is somewhere in the record.
- `docs/BENCHMARKS.md`: the measurements half and the layer list say that only the install layer reaches
  a network; what the one-command run needs (GNU `time`, Node 22.15 or later for the install layer, whose
  `module.registerHooks` Node added in 22.15.0); which figures can differ between machines; three outside
  libraries and a Chromium binary (it said two, then four); parity reads Bundles; the layer-by-layer
  `--assemble` line writes a scratch record; the 21 main-node rows of the gold index come from the 1.0.1
  build of that site; `simple-statistics` draws its permutations from `Math.random` by default; the ACM
  row "Artifacts Available" names the software's Zenodo concept DOI 10.5281/zenodo.23233817 (the DOI it
  named, 10.5281/zenodo.23052709, is the specification archive and the paper).
- `bench/measure.js`: the argument reading moved out of `run` (`parseArgs`), under the complexity budget.
- The persona-h step on `dist/export/closure.nt` says what it checks (not empty, no triple of
  `www/graph.nq`, a `skos:Concept` typing); the rules' entailments are checked rule by rule in
  `tests/knowledge/closure.test.js`. `tests/README.md` links `tests/shapes/README.md` by its repository
  URL, as it does `tests/standard/`, because the package does not ship that folder.

- `bench/parity.js` hands the in-process tool servers the site vocabulary, as `agsc mcp` does, and on a
  node with the domain layer runs the page tools through the page's own `install` and the page-tools
  module with the domain facts the page script carries, so the call list compares the domain parts of
  `search`, `read` and `brief` too (AGSC-09-13, AGSC-09-16, AGSC-07-25; test in `tests/bench/kit.test.js`).
  No emitted byte changes.
- `tools/lint-claims` holds a results row to the results-row contract (below) on two members it read
  loosely: `date` must be a string (a list holding one date passed), and `system`, when present, must be
  a string. A results file the 1.0 tool passed with such a row now fails with `AGSC-E202`; the tool is a
  repository check of the benchmark kit, not a format rule.
- `tools/build-ts` compiles a benchmark runner `src-ts/bench/<name>.ts` to `bench/runners/<name>.js`
  (every other source still to `src/<context>/<name>.js`) and names a compiled runner whose source is gone;
  `eslint.config.js`, `tsconfig.json` and `tests/arch/typescript-parts.test.js` follow the mapping.
- `docs/MEASUREMENTS.md` §9 gains a dated paragraph with the install and the cold start measured again on
  the 1.1 tree (87 packages; `agsc --version`, `lint` and `build` load no MCP or A2A module); the 1.0.0
  figures stay as they were.

- The local tool server speaks MCP revision 2026-07-28 beside 2025-11-25 (AGSC-09-19; vectors
  `cli-0032` to `cli-0035`): a request that carries its revision in `_meta` is served statelessly, with
  no `initialize` and no `Mcp-Session-Id`; `server/discover` answers `supportedVersions`
  `["2026-07-28", "2025-11-25"]`, the capabilities of AGSC-11-18 and the server's name; every result
  carries `resultType: "complete"`, and the results of `server/discover`, `tools/list`, `prompts/list`,
  `resources/list`, `resources/templates/list` (new: an empty list, the server holds no templates) and
  `resources/read` carry `ttlMs` 0 and `cacheScope` `"private"`; a request of any other revision is
  -32022 naming both; `subscriptions/listen` is an unknown method; a missing resource is -32602 under
  2026-07-28 and stays -32002 under 2025-11-25. A client that opens with `initialize` is served as 1.0
  served it. No Tasks, no elicitation.
- Behaviour change, by AGSC-09-13a as amended for 1.1.0 (a named exception of AGSC-00-14), under both
  revisions: the result of a tool call carries MCP's `isError` (`true` beside an error envelope,
  `false` otherwise), and a tool name the server does not serve is the JSON-RPC error -32602 instead
  of the envelope with `AGSC-E001`. The envelope of every other call, its text and its
  `structuredContent` keep their bytes (property test in `tests/distribution/mcp-core.test.js`). The
  page tools are unchanged.
- `tools/list` (AGSC-09-19 (6), both revisions): every tool's `annotations` gain `openWorldHint: false`,
  and `propose` and `remember` gain `destructiveHint: false`; the WebMCP hints stay, and the list stays
  in code-point order of `name` (unchanged order; the core now sorts it itself). The page tools keep
  their annotations, so no page byte moves.
- `MCP_PROTOCOL_VERSION` of `src/boundary/surfaces.js` is `2026-07-28`, the newest revision the server
  speaks, and the `mcp` surface of a node that serves the tool server declares that one value
  (AGSC-09-19, AGSC-11-16; `cli-0035`); `MCP_LEGACY_VERSION` (`2025-11-25`) and `MCP_STDIO_REVISIONS`
  are new. No reference node declares the `mcp` surface, so no emitted byte changes (G-REF empty).
- Dependency: `@modelcontextprotocol/sdk` 1.32.2 (MIT) is replaced by the official MCP TypeScript
  SDK v2, `@modelcontextprotocol/server` 2.4.0 (Apache-2.0; it brings `@modelcontextprotocol/core`
  2.4.0 and `zod` 4), because the 1.x line stops at revision 2025-11-25 and v2 speaks 2026-07-28 and
  2025-11-25 from one server; the engine writes no protocol layer where the official library has one. The run-time packages of the lockfile drop from 161 to 78 (the SDK's `express`, `hono`,
  `cors` and the rest go). The tests' MCP client moves to `@modelcontextprotocol/client` 2.4.0, a
  development dependency (Apache-2.0). `npm audit`: 0.
- The TypeScript fitness test (`tests/arch/typescript-parts.test.js`) counts every official MCP
  package (`@modelcontextprotocol/sdk`, `server`, `core`, `node`, `client`) as a protocol mark, and a
  compiled TypeScript module that bears a mark must require one of them, so a protocol module builds
  on the official SDK and never on a JSON-RPC layer of its own; `src/distribution/mcp-stdio.js`
  leaves the list of marked plain modules (it requires the core now).
- The parity runner of the benchmark kit (`bench/parity.js`) takes the JSON-RPC error -32602 as the
  tool server's answer to a tool name it does not serve (AGSC-09-13a, AGSC-09-19), where the module
  and the page answer the envelope with `AGSC-E001`; every other call is still compared as values.
- `agsc mcp` takes `--http <port>` and `--bind <address>` (AGSC-09-09, AGSC-09-18; `cli-0036`:
  `mcp --help` names both): a port that is not one decimal number from 0 to 65535, a `--bind` that is
  not in `127.0.0.0/8` or `::1`, and `--bind` without `--http` are `AGSC-E003` with exit 2 and start
  nothing. A usage fault of the streaming verb now exits 2 as AGSC-09-08 says (it exited 1); no 1.0
  invocation reaches it, since a 1.0 engine rejected both flags with `AGSC-E002`. `bin/agsc.js` no
  longer reads the value of `--http` or `--bind` as the Bundle path of `mcp [<path>]`.
- `src/distribution/mcp-core.js` (from `src-ts/distribution/mcp-core.ts`): `serverFactory` makes
  servers that share one toolset and one catalogue, so the HTTP transport, which serves each request
  with a server of its own, builds the Bundle's tools once; `createServer` is that factory called once.
  No answer changes.
- `src/adapters/node-http-server.js`: `listenWith(handler, {port, bind})`, the socket of a handler the
  application layer wires (`agsc mcp --http`); `listen` of `agsc-host serve` is built on it and keeps
  its answers.
- Dependency: `@modelcontextprotocol/node` 2.1.2 (Apache-2.0), the official Node adapter of the MCP
  TypeScript SDK, is new at an exact pin, for the Streamable HTTP transport of AGSC-09-18: it turns a
  Node request into the web request of the SDK's `createMcpHandler` and gives the `Host` and `Origin`
  guards against DNS rebinding, so the engine writes no HTTP protocol handling of its own. It brings
  `hono` 4.13.16 and `@hono/node-server` 2.1.6 (both MIT). `npm audit`: 0.
- The vectors `cli-0030` and `cli-0031` gain the cases the B2 review asked for (they were unreleased):
  `cli-0030` a request with no `Mcp-Method` (400, -32020) and two whose `_meta` lacks the revision or
  the client capabilities (400, -32602), as AGSC-09-18 (4) words it; `cli-0031` a server started with
  `--bind 127.0.0.2` that admits the `Host` `127.0.0.2` and refuses `127.0.0.3`, and a `Host` compared
  without ASCII case (AGSC-09-18 (3)). `tests/vectors/README.md` names the members `http[]` and `bind`.
- The Dataset block of the home page `/` (AGSC-06-41, AGSC-06-19; `disc-0027`, `disc-0032`) carries,
  besides `name`, `description` and `url`: `license` (the licence URL of AGSC-06-44), `creator` (a
  `Person` from `bundle.creator`, else `site.author` with `site.author_orcid`, its ORCID iD as `sameAs`),
  `isAccessibleForFree` and one `DataDownload` per machine file the node serves (`graph.jsonld`,
  `graph.ttl`, `graph.nq`, `chunks.jsonl`, the discovery document); its `@context` names the PROV-O
  prefix, and `prov:generatedAtTime` (the build instant) and `prov:wasAttributedTo` (the creator)
  appear in this block and in no other file (decision D-4). A `restricted` node's block names no
  download and claims no free access. No other index page changes. Bytes: `index.html` of every
  node (fixture-minimal `a12ae8be…3420` → `5d6d1801…e2ac`; the other reference nodes in the G-REF
  record of B08-WP3). A description shorter than 50 characters is the new warning `AGSC-E202`
  (exit codes unchanged); the sentence `init` writes without a build date (AGSC-02-94 (b), 43
  characters) gets it, so the expected warning counts of the guides `mode-0`, `mode-2`, `mode-3`
  and `publish` grow by one, and `mode-0` says how to write your own description.
- The `Link` header of `/` (AGSC-06-40; `disc-0026`) carries the FAIR Signposting links of a landing
  page after the 1.0 `describedby` value, in the one `Link` field of the one `_headers` block of `/`
  (AGSC-06-17): `cite-as` (the first `related[]` cite-as, else the Bundle IRI), two `type` links,
  `describedby` for `/graph.jsonld`, `item` for `graph.nq`, `graph.ttl` and `chunks.jsonl` (none on a
  `restricted` node), `license` (when the node has a licence URL) and `linkset`. A node that writes
  no home page (Level 0) keeps the one value of 1.0. Bytes: `_headers` of every node
  (fixture-minimal `cf2a4bf9…3097` → `03c0b66c…ca16`).
- `tools/validate-wellknown`, given a URL, reads the `Link` header of the node's home page and warns
  `AGSC-E202` when it carries no `describedby` link to the discovery document (AGSC-06-40 with
  AGSC-06-25, a SHOULD; I-104). A run over a URL makes one more request; a file run is unchanged.
- `src/distribution/well-known.js` writes the well-known files in order (the card, the discovery
  document, the catalogue files); `declaredSurfaces` moved there from `site.js` (`site.declaredSurfaces`
  still answers). No byte changes from the move.
- The vector `disc-0026` (unreleased) writes the severity of its validator finding `warn`, the literal
  of AGSC-09-11, instead of `warning`.
- A chunk line (AGSC-06-29; `chk-0009`, `chk-0015`) carries `abstract`, the item's own `description`
  copied unchanged, on every chunk of an item that has one (a cluster's chunk included), and
  `license_url`, the licence URL of AGSC-06-44 (`bundle.license_url`, else the absolute URL of `/legal/`
  when the node writes it), on every chunk of a node that has one; with `chunks.content_digest: true`
  also `content_digest`, the same SHA-256 as `digest` written `sha-256=:<base64>:` (RFC 9530). A reader
  of 1.0 ignores the three (AGSC-00-21; `tests/knowledge/chunks-1-1.test.js`). Bytes: `chunks.jsonl`
  of every node whose items have descriptions (fixture-minimal `2f14b661…9d02` → `653411dc…5f4d`;
  agsc-demo-node `f898be9d…7819` → `362e8bdd…3448`; every node in `reference-1.0.1/README.md`
  § B08-WP4).
- Behaviour change, by the new rule AGSC-06-45 (`chk-0016`, decision D-14): no chunk text begins with
  a blank line (empty, or only spaces and tabs; U+00A0 is not blank). Chunk 0 of a body that begins
  with blank lines starts at its first other line, so its `text` and `digest` differ from 1.0's and its
  `id` does not; a piece that Cut 2 starts on a blank line starts after it, and a piece of blank lines
  alone is no chunk. A body that begins with a cut heading or a non-blank line gives the chunks of 1.0;
  on the reference nodes no chunk-0 text moves. The 1.0 vectors that pinned chunk-0 digests
  (`chk-0001`, `chk-0006`, `chk-0008`, `conform-0004`) were withdrawn with successors in block 2.
- The chunks surface link of the discovery document (AGSC-06-44; `chk-0014`) carries `digest` (over
  `/chunks.jsonl`, the manifest when sharded), `agsc-chunk-count` and `agsc-chunk-set` (the SHA-256 over
  every chunk `id` and one LF, in file order), at Level 2 and above on a node that is not `restricted`
  (AGSC-11-20 (d)); the ledger link carries `agsc-ledger-length`, the number of ledger entries (a MAY
  of AGSC-06-44 this writer states). Bytes: `.well-known/knowledge-linkset` of every Level-2 node
  (fixture-minimal `198b7f5d…c03d` → `c4dccf93…af02`).
- `tools/validate-wellknown` at `--level 2` (AGSC-09-93 (b), (c); `disc-0033`): on a document of 1.1.0 or
  later whose chunks surface is not declared `credential`, the three attributes of the chunks link are
  required (`AGSC-E202`) and the count and the commitment are recomputed over the fetched lines, the
  shards in manifest order when the file is the manifest (`AGSC-E201` on a difference); the `digest`
  is recomputed like every other; an `agsc-ledger-length` must equal the fetched ledger's entries
  (`AGSC-E201`). A 1.0 document is accepted without them. The checks run from a URL and from a build
  output on disk alike, as the digest checks do. A run reads up to two more files (the guides' and
  demos' expected read counts move: `mode-1` and the distributed-memory demo 22 → 26, `publish` 11 → 13).
- The digest value `sha-256=:<base64>:` of the discovery document and of the export manifest's
  `content_digest` (AGSC-06-08, AGSC-09-17 (a)) is written by one function, `knowledge/digest-field.js`,
  as an RFC 9651 Dictionary through the `structured-headers` library instead of a template string;
  same bytes (G-REF of B08-WP4; `export-0003`, `export-0004` stay green). `_headers` carries no
  `Content-Digest` and no static `Repr-Digest` (AGSC-09-17 (b), AGSC-06-17), now asserted by
  `tests/arch/headers-unified.test.js` and `tests/distribution/chunk-surface.test.js`.
- `interchange/adapters/llm-context.js` writes its `chunks-index.toon` with `knowledge/chunks-index.js`,
  the writer of the node's `/chunks-index.toon`; same bytes.
- The vectors `chk-0010` and `chk-0016` (unreleased) gain the cases of B2 request F-6: `chk-0010` a title
  that begins with a space and holds `,`, `:`, `"` and `\`, and the title `true`, each written quoted as
  AGSC-06-37 and TOON 4.1 say; `chk-0016` a body whose first line holds only U+00A0, which is not blank.
- `docs/guides/mode-0.md`: the build writes one more file (`chunks-index.toon`), 58 → 59 and 59 → 60.

- The `/compose/` page and its scripts (AGSC-07-25, AGSC-07-29, AGSC-06-01 page assets; the hash of
  each file in `fixture-minimal`, old to new; on the eight reference nodes these four files and
  `compose/webmcp.js` of the ten tools are the only bytes that change against 2327f33):
  `compose/index.html` carries the workspace block, the cluster and tag filters and the places of the
  verdict in words, the brief and its downloads, fc897c8832959ee7 to ad46a800b69dc85e;
  `compose/agsc-compose.js` fills them, and says why there is no brief above the engine's bound on
  `derived`, 1dbf68b3fe7d51b2 to daa1f7668dfcb4b8; `compose/agsc-core.js`
  carries the blueprint of AGSC-07-29 beside the brief, and the one function that writes the four
  comment lines `diagram.mmd`, `brief.mmd` and each C4 file open with (AGSC-07-12, AGSC-07-25,
  AGSC-07-29; the lines keep their bytes), the bound on `derived` and the Mermaid label of the
  architecture's title, d59bd12ec7050763 to 26f6df7a27da280f;
  `compose/agsc-page-tools.js` keeps the published pages it read as `API.corpus`, so the page writes
  the brief over the items the page tool `brief` reads, and carries the two faults of `brief`,
  b41e50f5e2a3eeda to 2a3bcc23c35eb55f. The
  seven Harness files and the Harness archive keep their bytes.
- Every item an import writes from a source this node does not own is written `status: draft`,
  whatever its licence and whatever status the source gave it, and reported once as `AGSC-E506`
  (AGSC-01-22, I-021; `imp-0005`, `imp-0009` and `imp-0010` replace `imp-0002` and `imp-0004`). A
  source is this node's own when its root document carries this Bundle's `base`; for such a source
  (an export imported back into the node that wrote it) the 1.0 rule stays, so the round trip of
  AGSC-10-09 is unchanged. Before 1.1 an OKF record or a skill with an open licence was published at
  once; now it waits for a person to change the status. This is a more cautious outcome of an
  existing MUST (AGSC-00-14), not a new refusal, so no exit code changes. The OKF reader
  (`interchange/okf.js`) and the skills adapter (`interchange/adapters/skills.js`) change; the COGX,
  GABBE and board adapters already wrote every foreign item as a draft. The `old-site` lane is not
  changed: it imports a site its operator wrote, and each record's status comes from the selection
  file a person wrote. The skills `--list` line ends
  `-> draft (open licence; published when a person changes the status)` or `-> draft (never published
  until its licence is settled)`, and the import totals count `draft_licensed` beside
  `draft_unlicensed`.
- A pack of `agsc skills` and of `build` that lists a member carrying `x-skills-license` ends with a
  "Notices" section: one fenced line for each such member with its title, address, the licence the
  source stated, the source file and the version (AGSC-01-22, AGSC-07-20, I-173). A pack with no such
  member is byte for byte what it was, so no 1.0 node changes; the foreign layouts of `export --to
  skills` carry the section with the pack.
- `/llms.txt` and `/llms-full.txt` (AGSC-06-13a, AGSC-06-15; I-115 keeps the AI-assistance
  line byte for byte): the summary blockquote follows the H1 and the provenance comment
  follows the summary, so a llms.txt v2 parser reads the summary; the backslash, `[`, `]` and
  `(` of a title and of a description are escaped in a link line; a `restricted` node leaves the
  `bundle_version:` line out of the header (AGSC-11-20, I-151). Bytes change for every node
  (`disc-0024`, `disc-0025`, `disc-0034` replace `disc-0013` and `disc-0014`); the digest of
  `/llms.txt` in the discovery document follows.
- `/now/` and `/now.md` of a `restricted` node state only `built at <instant>, specification
  <spec_version>` (AGSC-06-22, AGSC-11-20, I-151; `build-0036`).
- A `restricted` node declares the `chunks` surface with `agsc-access` `credential`
  (AGSC-11-20, AGSC-11-16, I-114; `bnd-0044`; `validate-wellknown` no longer tries to fetch a
  gated `chunks` target), and its `_headers` detaches the wildcard origin that the host adds by
  default with `! Access-Control-Allow-Origin` (AGSC-06-17, AGSC-11-20; `bnd-0045`).
- `_headers` sends `Cache-Control: public, max-age=31536000, immutable` for the version
  directories under `/ns/<major>.<minor>.<patch>/` that the build emits, and for no other address
  (AGSC-06-06, I-095; `build-0034`). `hosts/rules.js` reads a `! Name` detach line.
- `security.txt` derives `Policy` from `site.security_policy` when the authored file states none,
  else from `/legal/` as before (AGSC-06-36; `build-0035`).
- `dist/forge/ruleset.json` is a GitHub repository ruleset in the shape its import takes, with a
  pull-request review rule and the one status check `agsc ci` (AGSC-08-12, I-147; the bytes of
  this file are the implementation's, AGSC-04-24).
- `SKILL.md` frontmatter of the Harness and of the skill packs: `name` and `description` are
  written as a double-quoted scalar when the plain text would not parse to the same string
  (`true`, `123`, `a: b`, a leading `[`, an empty text, a text with leading or trailing white space);
  every other text keeps its bytes, so the seven Harness files of `compose-0027` are unchanged
  (the file is an Agent Skills file, AGSC-07-19, AGSC-07-22; I-164). The lint and conform check that
  a pack parses as YAML, the other half of I-164, is not in 1.1. Bytes: on `agsc-demo-node`, the
  three `SKILL.md` files whose `description` holds `: ` (`foundational`, `operations-reliability`,
  `sdlc`) and their three `lock` values in `skills/index.json` (and so the `rel#skills` digest);
  no other reference node changes.
- Page scripts and the tool list for the ten tools (AGSC-09-13, AGSC-09-16; the hash of each file in
  `fixture-minimal`, old to new; these three files are the only bytes that change on the eight
  reference nodes): `compose/agsc-core.js` carries the brief of AGSC-07-25 (`bundle({ brief: true })`),
  d62ccb51c8c560ee to d59bd12ec7050763; `compose/agsc-page-tools.js` gains the three tools, the bound,
  the citation records, the functions of `tool-answers.js`, `API.LICENSE_PROSE` and the route
  `/chunks.jsonl` with its shards, 3e00fdfcc916c610 to b41e50f5e2a3eeda; `compose/webmcp.js`, whose
  manifest is the tool list, registers ten tools, 1f2e1c165ef67c3d to dd78843b71f2837a. The
  descriptions of the seven tools of 1.0 are unchanged. `agsc mcp`'s line in `agsc --help` reads
  "serves the ten tools"; the tool server reads the build instant, the content version and the chunk
  lines from the route map of the build the verb already makes in memory (AGSC-09-14b).
- The TypeScript fitness test (`tests/arch/typescript-parts.test.js`, docs/ENGINEERING.md §8) also
  fails a new plain JavaScript module anywhere in `src/` or `bench/` that requires
  `@modelcontextprotocol/sdk` or names `jsonrpc`, `registerTool` or `MCP-Protocol-Version`; the
  five modules that did at 12c243a are listed and the list never grows. It used to match file
  names only, so a plain `src/distribution/streamable-http.js` passed.
- The parity call list of the benchmark kit (`bench/corpus/parity-calls.json`) is version 2: nine
  calls and three per-item templates for `brief`, `explain` and `check` are added, so it still covers
  every tool of AGSC-09-13 (`docs/MEASUREMENTS.md` gives the figures of version 1).
- Page scripts (AGSC-09-16, I-098; the hash of each file in `fixture-minimal`, old to new):
  `compose/agsc-page-tools.js` 0d81c92d16d92e59 to 3e00fdfcc916c610, `compose/webmcp.js`
  ef8ca64219f2bfe4 to 1f2e1c165ef67c3d, `compose/agsc-compose.js` 06ac8df63efc43a6 to
  1dbf68b3fe7d51b2, `compose/agsc-core.js` (the Harness gains `yamlScalar`) 5436b8d267076a15 to
  d62ccb51c8c560ee (it also quotes a text with leading or trailing white space). The page reads a long run of slashes, blanks or brackets in linear time
  (`pageBaseIri`, `pageHeadingText`, `pageInlineTargets`, the base of the compose page); a
  front-matter key `__proto__` stays a key in the page reader and in the `compose` copy of both
  transports (FR-101); `registerTool` that throws or rejects is recorded in
  `AGSC_WEBMCP.rejected` and no longer ends the registration; the review labels and dated notes
  inside the emitted functions are gone.
- `remember` (AGSC-09-14b, AGSC-09-16, I-084), on both transports at once: the slug of a title is
  the AGSC-02-91 slug (punctuation and letters outside ASCII become `-`; the page used the anchor
  algorithm); an unknown `kind` or a Gate is reported before an episode's missing `actor` or `at`
  and before a malformed `actor`; a call without `origin: human` that leaves out `agent` or
  `model` gets one `AGSC-E202` in `findings` for each (the item is still returned); a `sources[]`
  entry whose `id` is not a line of 1 to 200 code points is dropped with `AGSC-E506`. The
  `compose` tool copies front matter with own properties on both transports.

- CI: `test.yml` runs pushes on `main` and `release/` branches only, and a newer push to a
  pull request cancels the run it supersedes. A push to a pull request's branch had run
  all nine legs twice, once for the push and once for the pull request. Every pull
  request, every merge and the weekly run still cover the three operating systems and
  three Node lines; the required check names are unchanged.
- Tests only, no emitted byte (AGSC-00-14): the conformance handlers register `compose-0027`
  (the Harness pin, AGSC-07-12), `bnd-0050` and `disc-0023`; the tests that pinned the
  1.0 wording or counts of AGSC-00-20, AGSC-01-04, AGSC-01-10, AGSC-02-02 (E105),
  AGSC-05-25 (ten annotation properties, 312 triples) and AGSC-09-91 (105 codes) pin the
  1.1 text; `tests/rule-coverage.allow.json` states why AGSC-10-19 is prose-only and
  rewords the entry of AGSC-05-24; the codes registered by 1.1 and not yet raised are
  named in the consistency test.
- `federation.walk` fails closed (AGSC-11-08, AGSC-11-10; I-152): a host the caller gave no
  resolution for is no longer handed to the fetch, so a walk with no `resolved` map fetches
  only IP literals. `validate-wellknown` counts every request against a budget (AGSC-11-10(c);
  default 500, `--max-requests <1..2000>`, `AGSC-E906` when spent) and accepts `--allow-network`,
  noting once in the human form that a URL without it will need the flag from 2.0 (I-083).
- A tracked `.env.<name>` (`.env.local`, `.env.production`) is the warning `AGSC-E403`; the
  template names `.env.example`, `.env.sample` and `.env.template` are not reported (AGSC-01-37; I-082).
- `lint`, `build` and `ci` warn when `content/index.md` and `agsc.config.json` declare different
  `spec_version` values (`AGSC-E506`, AGSC-00-17; I-102) or when the root `base` differs from
  `site.base` (`AGSC-E204`, AGSC-01-04; I-116). No exit code and no emitted byte changes.
- `init` names each root note it leaves where it is because it already carries a frontmatter
  block, as the warning `AGSC-E506` (AGSC-02-91; I-103).
- `lint` warns about a gate whose `checks[]` differ from its level (`AGSC-E203`, AGSC-02-18; I-148),
  a cycle in `blocked-by` (`AGSC-E302`, AGSC-03-07) and a `clusters[]` entry that names no cluster
  (`AGSC-E301`, AGSC-02-19; I-154). The shipped `examples/demos/mode-2-project` gate lists the
  full Level 2 set; its built gate page, graph and chunk files change accordingly (AGSC-02-18).
- `build` reports a typed-link target that does not exist as the warning `AGSC-E301` (AGSC-03-02;
  I-153); `lint` and `ci` keep the error.
- An empty `SOURCE_DATE_EPOCH` is still read as unset and now also reported as the warning
  `AGSC-E603` (AGSC-04-09; I-122).
- `trace` writes the three Episode sections, "What happened", "Outcome" and "Next" (AGSC-02-21;
  I-155): a traced Episode's body changes from a bare title and text to those sections.
- `agsc-host serve` reports `http://localhost:<port>/` when it was asked for `localhost`, the
  default, as the one plain-http `site.base` the configuration admits (AGSC-01-18; I-121).
- `hosts/rules.js` matches a route with several `*` splats in linear time (I-119), and the
  repository tools' patterns that read their own files no longer rescan from every position
  (`tools/release`, `validate-features`, `validate-spec`, `requirements-matrix`, `gen-glossary`,
  `validate-diagrams`, `gen-spec-html`, `public-hygiene`, `bench`; I-117). The e-mail pattern of
  `public-hygiene` now bounds the local part at 64 and a label at 63 characters.

- Ledger (AGSC-08-20a, AGSC-08-20b, AGSC-08-23; I-076, I-077): the trailing `build` entry of
  `/ledger.jsonl` names the fixed `process:agsc` and no longer `process:agsc/<version>`, so every
  conforming writer derives one ledger, one `agsc-ledger-head` and one `digest` of the ledger link from
  one history. Byte change, only in a node built from git history: the last line of `ledger.jsonl`,
  `agsc-ledger-head` and the ledger link's `digest` in `.well-known/knowledge-linkset`. A ledger
  written under 1.0 still verifies. `ledger.actors` maps a commit author's address to an actor when
  the commit has no sign-off; the address is read in a second `git log` only when the map is
  configured and reaches no output byte (a node without the map is unchanged).
- `conform` reports a failed or skipped required case as `AGSC-E005` and no longer as `AGSC-E001`
  (AGSC-09-02); a Level lists its areas in the fixed order of AGSC-09-04 and
  `HIGHER_LEVEL_CASES` holds every row of the table of AGSC-10-15.
- `lint`, `build` and `ci` warn `AGSC-E423` for a Windows device name, a case-only collision under
  `content/assets/` or `content/attachments/`, a path over 200 code points, a trailing space or period or
  a reserved character in a name (AGSC-01-40), and for a Unicode noncharacter in authored text
  (AGSC-04-05); and `AGSC-E108` for a byte-order mark or non-NFC text in `.env`, `security.txt`,
  `LICENSE-CONTENT` and an SVG attachment (AGSC-01-14). Warnings only; no exit code and no byte moves.
- A frontmatter nested deeper than 64 levels is the warning `AGSC-E105` (AGSC-02-02) and is read as
  authored; a typed `peers[]` entry of `translation-layer` with no `crosswalk` is now reported as
  `AGSC-E202` (AGSC-11-24, AGSC-01-18) where the schema check had returned an invalid result with no
  error, and an invalid `oneOf` instance never returns without an error. For every `if/then` of the
  configuration schema the diagnostics change with this: a duplicate `if` error no longer appears,
  and a failed `oneOf` always carries an error. `lint` prints a stderr line `lane: portable names`.
- `contribute[].repository` and `branch` are read for the edit link (AGSC-11-14): an entry with
  neither keeps the link unchanged, and a `branch` without a `repository` is ignored by the link; a
  malformed `repository` or `branch` is `AGSC-E209`, and the schema asks only that `branch` is a
  non-empty string, so the engine alone judges it as `git check-ref-format` does. A key of
  `ledger.actors` with an upper-case ASCII letter is refused by the schema (AGSC-01-18), because
  a commit's address is lower-cased before the look-up. The case-collision check of AGSC-01-40(b)
  uses simple folding, so `Straße.png` and `STRASSE.png` are not a collision.
- The 60 s build-time budget of AGSC-06-21 is advisory (AGSC-04-03): the unused `timeBudget` helper and
  its constant are removed.
- Tests: the round trip of AGSC-06-32 puts `@graph` back for a graph of one node; `help` stays the flag
  `--help` (`cli-0036` handler; its flag names come with the packages that add the flags).
- `import --from skills` with no `--layout` reads the first detected layout that would import
  something, not simply the first (I-174; implementation behaviour, no rule pins it): a marketplace file whose plugins all name a
  source outside the clone no longer hides a `SKILL.md` that sits beside it. The bytes of an item
  imported under a given layout are unchanged; `--layout` is obeyed as before.
- `agsc skills import <file>` for a path outside the Bundle says so and names `import --from skills`
  (AGSC-07-22, I-175; it also fires for an absolute path, which the port cannot read); the mapping of the two import routes is unchanged, because the scenario of
  Mode 3 and AGSC-07-22 pin `description` and `x-skill-license`.
- The Markdown board reader keeps `- [/]` (state In Progress) and `- [-]` (Canceled) cards instead of
  skipping them without a message (I-176; implementation behaviour, claimed in `docs/CONNECTORS.md`, no
  rule pins it); `[ ]`, `[x]` and `[X]` read as before, and the Obsidian Kanban reader is unchanged.
- `package.json` `exports` (I-087): `.`, `./bin/agsc.js` (the alias package requires it),
  `./package.json`, and the data trees `schema/`, `ontology/`, `spec/` and `tests/vectors/`. `src/`
  and the tools are no longer importable by a deep path (a 1.0 consumer that did
  `require('agentic-system-core/src/...')` now gets `ERR_PACKAGE_PATH_NOT_EXPORTED`; nothing else is refused); nothing in the repository or the alias
  package does that. The commands (`bin`) are unchanged.
- `agsc-host static-host`: a restricted node's `! Access-Control-Allow-Origin` detach line is written
  as `Header always unset Access-Control-Allow-Origin` in `.htaccess` and is absent from `nginx.conf`
  (AGSC-06-17, AGSC-11-20); the profile had refused such a node. `tools/validate-wellknown` admits
  `immutable` under `/ns/<x.y.z>/` (AGSC-06-06, AGSC-11-05) and reports a request budget spent on a
  `rel#surface` target as `AGSC-E906`. A tracked `.env.<name>` is warned for every such file, a
  template suffix (`.example`, `.sample`, `.template`, `.dist`) excepted (AGSC-01-37).
- `trace` finds an existing Outcome or Next section at any heading level (AGSC-02-21) before it adds
  one. The added sections of a traced Episode (I-155) are implementation behaviour; no rule names them.
- Messages that name a type or a format at run time say "an episode", not "a episode" (lint
  `AGSC-E406`, `AGSC-E408`, `AGSC-E205`, `AGSC-E506`; I-129). Message text only; no output byte.
- The guides discard the `stderr` of `agsc init`, `build` and `skills` steps with `> /dev/null 2>&1`
  (I-129).
- The relation table of AGSC-03-01 lives in one file, `src/knowledge/relations.js` (key,
  inverse, symmetric, RDF property, combiner, transitive reading, self-link, expected target
  kinds, plain meaning; I-006, I-007). `interchange/okf.js` (foreign spellings to keys) and `governance/boards.js` (task fields) were examined and stay: neither is a copy of the table. `links.js`, `chunks.js`, `nquads.js`,
  `boundary/visibility.js` and `boundary/federation.js` read it instead of keeping their own
  copies. Pure refactor under AGSC-03-01 and AGSC-05-16: no output byte changes (the fixture and
  the four example Bundles rebuild byte-identical). The page-script copies (`pageLinkKeys`,
  `pageInverseKeys`, `linkKeys`, `graphPredicates`) must stay literal, because they are emitted
  as their own source text and have to be self-contained; they are now checked against the
  table by `tests/knowledge/relations.test.js`, and `composition/compose.js` reads `CORE_KEYS`
  from the table (I-006, I-007). No hash pin of a page script moves: `compose/agsc-core.js`,
  `agsc-compose.js` and `agsc-page-tools.js` are byte-identical to the tree before this change.
- `lint` and `ci` report four new warnings from the relation table (I-009, I-010, I-015; new
  warnings only, so a node that passed with no error still exits 0): `AGSC-E313` an item lists
  itself under a key other than `requires`, `broader`, `narrower`, once per key (AGSC-03-23);
  `AGSC-E314` a pair holds `requires` with `excludes`, `supersedes` or `contradicts`, or `uses`
  with `excludes` (AGSC-03-24); `AGSC-E315` a target is not of the kind the key expects
  (AGSC-03-25); `AGSC-E316` a `supersedes` target is still `stable` (AGSC-03-26). A self-link is
  also judged for E315 and E316. No output byte of a build changes.
- `src/knowledge/questions.js` (AGSC-05-34, AGSC-02-11): question 9 compares `stale_after` and the
  instant as instants (a date is its midnight in UTC; an offset counts), not as text; a `sources`
  entry without a resource and a missing selection are tolerated. No output byte changes.
- The Mode 2 guide, `examples/demos/mode-2-project` and `docs/DEMOS.md` state that a
  specification is `decided-by` its decision, not `implements` it: a decision is not the kind of
  target `implements` expects, and the new `AGSC-E315` flagged the old text (AGSC-03-25). The
  example's graph, chunks, linkset, `now` and the pages of `login-spec` and `decide-the-login`
  change as a result; no other example moves.
- Overlapping labels (`AGSC-E416`) compare the `title` and the `aliases` of two published items
  of one type, not the titles alone; a node whose items overlap only by alias gains warnings
  (AGSC-05-21; `lint-0045`).
- `graph.jsonld` names the context version `1.0.0` (`jsonld.js#CONTEXT_VERSION`), never the
  ontology version, and a Level 2 build serves the versioned copy at `/ns/1.0.0/context.jsonld`;
  the ontology is `1.0.0` today, so no byte moves, and raising it to `1.1.0` will not move any
  `graph.jsonld` (AGSC-05-09; `graph-0043`). `persistentContextUrl()` takes no argument.
- Docs: `TESTING.md` names the public export for the real-bundles lane.
- Development dependencies: `package.json` pins `minimatch` to 11.0.4 through `overrides`, so `npm audit`
  (the audit gate of `docs/ENGINEERING.md`) is clean again after GHSA-g3hv-75wg-m249 (moderate, `minimatch`
  below 11.0.1, reached only through eslint and `eslint-plugin-import-x`). Lint and the whole suite pass
  with it; nothing the package ships changes.
- Every generated HTML page carries in its `<head>`, after the discovery document's `describedby` link
  (AGSC-06-25), `<link rel="describedby" href="/llms.txt" type="text/plain">`, and every item page also
  `<link rel="alternate" href="/pages/<slug>.md" type="text/markdown">`: the two page-level relations of
  llms.txt v2 (modified 2026-08-10; llmstxt.org fetched directly on 7 November 2026), AGSC-06-46,
  `build-0033`. `/llms.txt` and `/llms-full.txt` do not change (their v2 layout and escapes came with
  AGSC-06-13a in block 3). The writer stays the engine's own: no llms.txt package on npm is the
  convention's, and none writes the provenance comment or escapes exactly `\`, `[`, `]` and `(`.
  Bytes, by AGSC-06-46: every `.html` page of every node (fixture-minimal `index.html`
  `5d6d1801…e2ac` → `1f5cdaf6…8e3a`; agsc-demo-node `index.html` `5cd22c6d…c09e` → `47d31eef…b1e6`; every
  node in `reference-1.0.1/README.md` § B08-WP5).
- The discovery document declares the WebMCP Draft Community Group Report of 27 October 2026 by default:
  `agsc-surface-version` of the `webmcp` surface `2026-09-15` → `2026-10-27`, the reference default
  AGSC-11-16 names (`surfaces.WEBMCP_SURFACE_VERSION`; any `YYYY-MM-DD` stays conforming, and
  `document.modelContext` registration is unchanged; the report of 2 November 2026, read on 7 November
  2026, has the same `registerTool` dictionary). Bytes, by AGSC-11-16: `.well-known/knowledge-linkset`
  of every node that serves `/compose/` (fixture-minimal `c4dccf93…af02` → `bf5425b4…e87f`;
  agsc-demo-node `c2fb8f14…178e` → `de534b45…b614`).
- Every `SKILL.md` is checked against the Agent Skills format before it is written (AGSC-07-22): the six
  fields; `name` 1 to 64 characters of the slug grammar and equal to its directory, `description` 1 to
  1024 characters, `compatibility` at most 500 (`AGSC-E204`), a missing `license` `AGSC-E202`, a
  `metadata` that is not a map of strings `AGSC-E201`, `allowed-tools` `AGSC-E407`, any other key
  `AGSC-E207`. A published pack that fails is not written; in a Harness skill file a bound fault is the
  warning `AGSC-E204` and the file is written as authored (AGSC-00-14), checked by `compose` after the
  emission so the `/compose/` page's script does not change. Own code (`src/composition/skill-format.js`,
  on the engine's frontmatter and `yaml` readers): the format's reference validator, `skills-ref`, is
  Python, and the npm ports answer messages, not the five codes. No byte changes (the packs and the
  Harness skill files already pass).
- Dependencies: `http-link-header` 1.1.4 (MIT, no dependencies) moves from the development to the
  run-time dependencies, same exact pin: the conformance handler of `disc-0026`, which the package ships
  so that `agsc conform` runs every vector (AGSC-09-02), reads the `Link` field of `/` with it, and the
  packed package answered every `discovery` vector "no handler" without it
  (`tests/arch/pack-and-conform.test.js`). `npm audit` 0.

### Added

- `node bench/measure.js --all --scratch <dir>`, the one-command run of the benchmark kit (I-096;
  PRD-067): conformance, determinism, the security floor, the build curves, the package and the install,
  every layer whose inputs the repository holds, with no key, model, judge or dataset, assembled into
  `<dir>/measurements.json` for a reader to compare with `docs/measurements.json`.
- The `install` layer of `bench/measure.js` (new `bench/runners/install.js`, compiled from strict
  TypeScript `src-ts/bench/install.ts` like the other benchmark runner; shipped with `bench/runners/`,
  requires only Node built-ins): `npm pack`, `npm install --omit=dev`
  of the tarball into an empty folder, the package folders and their sizes, five timed runs each of
  `node -e ""`, `agsc --version`, `lint` and `build` on the reference fixture, the load time of
  `@modelcontextprotocol/server`, `@modelcontextprotocol/node` and `@a2a-js/sdk`, and a module trace
  (`module.registerHooks`, Node's own resolve hook; no library needed) showing that `--version`, `lint`
  and `build` load no MCP or A2A package while `agsc mcp` loads the MCP ones. Measured into
  `docs/measurements.json` by that command on 7 November 2026; the nine layers of the 1.0.0 run are kept.
  It checks the machine before it runs (GNU `time` at `/usr/bin/time`, `module.registerHooks`), gives the
  install ten minutes, and turns a failed run into an error with its standard error: a failed traced run
  no longer reads the trace of the verb before it, and a failed package load is no longer recorded as
  0 ms. `measure.js` hands it its two timers, so these checks are tested with stand-in timers.
- `node bench/measure.js --all --offline` leaves out the install layer, the one layer that needs the npm
  registry (PRD-067); `--all` takes its measurer from the caller (`runAll`), so the command is tested
  end to end with stand-in layers, and a persona-n scenario runs it.
- `tools/lint-claims --record <file>` (PRD-068): every number written in digits inside a measured region
  (`<!-- measured:start -->` … `<!-- measured:end -->`, apart from the claims regions so that marking one
  never narrows the wording check) must be a number of the measurement record, at its written precision
  and unit, unless its line says "to be measured"; otherwise `AGSC-E202`, exit 1. Own code: no library
  checks prose numbers against a JSON record.
- `docs/BENCHMARKS.md`: "Run it yourself: one command"; the six studies E1 to E6 and the twelve
  statements they test, each "to be measured" (the model runs are planned for January 2027); and a table
  of the kit against the five ACM artifact badges (Artifacts Available, Artifacts Evaluated – Functional
  and – Reusable, Results Reproduced, Results Replicated): what the kit offers and what it lacks. The
  badge names and criteria come from a secondary source; the table marks them as paraphrases not yet
  checked against the policy page.
- Tests `tests/bench/measure.test.js` (the merge, the module trace and the record's trace claim) and the
  `--record` cases of `tests/tools/lint-claims.test.js`; the persona-n scenario "A researcher holds the
  numbers of a results page to the measurement record before publishing it"; `tests/docs/quoted-counts.test.js`
  holds the 1.1 install paragraph to the record.

- The kit of the agent-side study under `bench/queries/` (AGSC-00-20, the benchmark kit of 1.1;
  PRD-066): `agent-study/` with the question template and gold labels in the BEIR layout (one example
  row), `gold-index.tsv` (the 149 chunks of `agenticsystemcore.com` and `patterns.agenticsystemcore.com`;
  the chunk-text column left empty, because that text is node prose under the Content Use Terms), the
  datasheet to fill in at freeze and the rules for writing the set; and `results-row.schema.json`, the
  results-row contract as a JSON Schema of draft 2020-12 (model, date, n, metric, value, interval; both
  configurations for a cross-system row; `cited_unit_ids` and `gold_unit_ids`).
- `tools/bench --dry-run` checks the kit, scoring nothing: the contract accepts its own examples; a set's
  gold index parses (`AGSC-E201` per malformed row) and names every gold label (`AGSC-E301`); with
  `--node`, every gold row of a node the build publishes names a chunk of that build (`AGSC-E301`, exit 1)
  with the same digest prefix (warning `AGSC-E210`), a row of another node counted as a fixture id. The
  envelope gains `kit` with the counts; two runs over the same inputs give the same bytes.
- `bench/runners/kit.js`, the kit's runner, in strict TypeScript (`src-ts/bench/kit.ts`, compiled by
  `tools/build-ts`; shipped, because `tools/bench` calls it): the checks above, validated through the pinned
  `ajv` 8.20.0 and `ajv-formats` 3.0.1 (no new dependency), and `node bench/runners/kit.js gold-index
  [--without-excerpts] <node>=<built output>…`, which writes the gold index from builds (it writes the
  committed copy again byte for byte). Own code where no library applies: the tab-separated reading
  (IANA `text/tab-separated-values`: a field holds no tab and no line break, so a split reads it) and
  the statistics, which stay in `bench/metrics.js`.
- `tests/docs/claims.test.js` runs `tools/lint-claims --record docs/measurements.json docs/BENCHMARKS.md
  docs/MEASUREMENTS.md` on the committed pages and the wording check on the kit's READMEs, so an edit
  that breaks the claims check fails the suite (PRD-068).
- The dry-run report gains `kit.index`, the gold rows read and the gold labels checked, with or without
  `--node`; with `--node`, the warning `AGSC-E210` when no gold row names a node the build publishes, so
  a run against an unrelated build no longer passes having checked nothing (PRD-066).
- The dependency rule `bench-runners-standalone` (`npm run arch`) and the fitness test
  `tests/arch/bench-runners.test.js`: a benchmark runner and `tools/bench` require nothing of `src/`, and
  every runner `tools/bench` requires ships.
- Tests `tests/bench/agent-kit.test.js` (with two fast-check properties: every results row
  `tools/lint-claims` accepts, the schema accepts; on the members the lint alone checks, they agree) and
  the persona-n scenario "A researcher writes the gold index of a built node and checks the agent-study
  kit against it before any scored run"; `docs/PRD.md` row PRD-066, `docs/BENCHMARKS.md` "The agent-side
  study: its kit".

- `/chunks-index.toon` (AGSC-06-37; `chk-0010`, `build-0037`): at Level 2 and above, when the published
  set holds at most 500 items, the tabular index of `/chunks.jsonl` in TOON 4.1 — the header
  `chunks[<n>]{id,item,kind,section,ordinal,title,digest}:` and one row per chunk line in the same
  order, `id` and `digest` cut to 16 hex characters — written by the pinned `@toon-format/toon` encoder
  (new `src/knowledge/chunks-index.js`); above 500 items the build names it among the routes it skipped.
  Served with the cross-origin pair (AGSC-11-03) and `Content-Type: text/toon; charset=utf-8`, the TOON
  specification's provisional media type, in one `_headers` block that exists only where the file is
  written. Bytes: the new file on every Level-2 node and `_headers` (fixture-minimal `03c0b66c…ca16` →
  `27ba75bf…ed25`).
- `knowledge/chunks.js#commitment` (the count and set commitment of AGSC-06-44) and `#fromFirstLine`
  (AGSC-06-45); `records()` takes `licenseUrl` and `contentDigest`.
- Dependency: `structured-headers` 2.1.1 (MIT, no dependencies; the RFC 9651 / RFC 8941 implementation),
  at an exact pin, because the RFC 9530 digest value is an RFC 9651 Dictionary and the engine writes no
  serializer where a maintained library writes the format (new `src/knowledge/digest-field.js`). The
  standalone `tools/validate-wellknown` keeps its own two lines (AGSC-09-90: no dependency). `npm audit`: 0.
- Tests: `tests/knowledge/{chunks-1-1,chunks-index,digest-field}.test.js` (fast-check: no text begins
  with a line feed and the chunks are deterministic; the commitment finds a dropped, an added or a moved
  line; the index rows decode back to the records' members; the digest value equals Node's base64 and
  parses back with the library), `tests/distribution/chunk-surface.test.js`,
  `tests/tools/validate-wellknown-chunks.test.js`, handlers for `chk-0010`, `chk-0014`, `chk-0015`,
  `chk-0016`, `build-0037`, `disc-0033`; a fitness test that each file written on a condition gets the
  cross-origin headers the boundary gives it, and that no digest field reaches `_headers`.
- An acceptance scenario (persona-h): an agent fetches `/chunks.jsonl`, `/chunks-index.toon` and the
  discovery document over loopback, recomputes the digest, the count and the commitment the chunks link
  states, reads the index with the TOON decoder, and finds that a dropped line no longer matches.
- `docs/CITING-A-CHUNK.md` § "From 1.1": the four additions, the commitment check in one command, the
  chunk-0 change and the index; `docs/plain/06-surfaces.md` one paragraph; `docs/PROTOCOLS.md` rows for
  RFC 9530 from 1.1, RFC 9651 and TOON 4.1.
- `/.well-known/agent-card.json` (AGSC-06-34 with AGSC-06-07; `disc-0030`, `disc-0031`), the A2A 1.0
  agent card, for a node that declares both the `a2a-card` and a `responder` surface in `surfaces[]`:
  every member A2A 1.0 requires and no other (`skills` one per skill pack, with the tags
  `knowledge` and `skill-pack`; one interface per responder, `protocolBinding` from the entry's
  `binding`, default `JSONRPC`), JCS with one LF, served with the cross-origin pair. `a2a-card`
  without a `responder` is `AGSC-E210` and no card is written; a local MCP tool server makes no node
  eligible. New strict-TypeScript module `src-ts/distribution/a2a-card.ts` (compiled to
  `src/distribution/a2a-card.js`), loaded only by a node that declares a card.
- `/.well-known/ard.json` and `/.well-known/ai-catalog.json` (AGSC-06-42; `disc-0028`, `disc-0029`),
  only when `discovery.ai_catalog` is `true` (both formats are proposals): one entry for the
  discovery document and, when there is a card, one for it, each with the SHA-256 of the bytes it
  points at (`digest` in `ai-catalog.json`, `metadata.digest` in `ard.json`), served with
  `application/ai-catalog+json` and `application/json`. A `site.base` host that is not a domain name
  is `AGSC-E209` and no `bundle.id` is `AGSC-E202`; then neither file is written. Without the switch
  the build says why it wrote neither. New module `src/distribution/ai-catalog.js` (no library writes
  either format; the npm package `ai-catalog` 0.1.2, a 0.x validator of one maintainer, reads the
  vector's file as valid).
- `knowledge/chunks.js#licenseUrl` (AGSC-06-44): the licence URL of a node, shared by the Dataset
  block and the `license` link of `/`.
- Dependency: `@a2a-js/sdk` 1.3.0 (Apache-2.0, the official A2A JavaScript SDK; brings `jose` 6, MIT),
  at an exact pin, for the agent card: the card is typed as the SDK's `AgentCard` and written by its
  codec, so the engine writes no A2A message shape of its own. No NOTICE file in either package.
  `npm audit`: 0.
- Development dependency: `http-link-header` 1.1.4 (MIT), the RFC 8288 parser the tests read the
  emitted `Link` header with. The writer stays `distribution/headers.js`: vector `bnd-0033` pins the
  quoted form `rel="describedby"` of the 1.0 value, which the library's writer does not produce.
- Tests: `tests/distribution/{a2a-card,ai-catalog,dataset-block,signposting,well-known}.test.js`,
  `tests/knowledge/license-url.test.js` (fast-check properties for order independence and
  determinism; the Dataset block expanded by `jsonld` against the official schema.org context, no
  member lost; the card read back by the A2A SDK), the conformance handlers of `disc-0026` to
  `disc-0032` (`tests/conformance/areas/_discovery-web.js`), and two acceptance scenarios (persona-n:
  a dataset harvester reads `/`; persona-c: an A2A client and a catalogue crawler).

- `src-ts/distribution/mcp-core.ts`, compiled to `src/distribution/mcp-core.js`: the MCP core of the
  tool server, a thin strict-TypeScript adapter on `@modelcontextprotocol/server` (AGSC-09-19,
  AGSC-09-13, AGSC-09-13a, AGSC-09-14b, AGSC-11-18). `createServer` builds one official server over a
  loaded Bundle with the ten tools of `mcp-tools.js`, the resources and the prompt of
  `mcp-resources.js` (both stay JavaScript); `serveStdio` serves it through the SDK's `serveStdio`,
  which picks the revision from how a client opens. Own code only where SDK 2.4.0 answers otherwise
  than the rule, in `StdioRevisionGate`: `server/discover` and -32022 name both revisions (the SDK
  names 2026-07-28 only, and serves a later request of an unknown revision), `subscriptions/listen` is
  an unknown method (the SDK serves it), and a missing resource is -32002 under 2025-11-25 (the SDK
  always sends -32602). `src/distribution/mcp-stdio.js` is the verb's entry on it.
- A licence policy for the run-time dependencies (`tests/arch/dependency-licences.test.js`): every
  package an install without development dependencies brings carries a permissive licence of a fixed
  list (Apache-2.0, MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, PSF-2.0, `MIT OR Apache-2.0`).
- An acceptance scenario (persona-c): an agent of revision 2026-07-28 discovers the server and is
  answered with no handshake, and its missing resource is -32602.
- `docs/USING-WITH-ASSISTANTS.md` §6: the one-line check of revision 2026-07-28 (`server/discover`).
- `agsc mcp --http <port>` serves the ten tools over the Streamable HTTP transport of MCP revision
  2026-07-28 on a loopback address (AGSC-09-18; vectors `cli-0029` to `cli-0031`): the same Bundle,
  tools and envelopes as standard input and output, read-only (`propose` and `remember` return their
  payload, `dist/proposal/` is never written), one endpoint `/mcp` for POST only (GET and DELETE 405,
  another path 404), a `Host` or `Origin` naming any host but `127.0.0.1`, `localhost`, `[::1]` and
  the `--bind` address refused with 403 before a tool runs, the headers `MCP-Protocol-Version`,
  `Mcp-Method` and `Mcp-Name` checked against the body (-32020), revision 2025-11-25 refused (-32022,
  `supported` `["2026-07-28"]`), an unknown method 404 with -32601, a notification 202, one JSON object
  per answer and no session. The address it listens on is reported on standard error; standard output
  stays empty. New strict-TypeScript module `src-ts/distribution/mcp-http.ts`, compiled to
  `src/distribution/mcp-http.js`: wiring of the SDK's `createMcpHandler` (`legacy: 'reject'`) and of
  `@modelcontextprotocol/node`; own code only for the path `/mcp` and for `subscriptions/listen`,
  which the SDK's handler serves from a router of its own and AGSC-09-19 (3) answers as an unknown
  method (404, -32601). The HTTP socket is the application layer's, through the HTTP server adapter.
- Tests: `tests/distribution/mcp-http.test.js` (the allowed hosts, the two own-code points, a property
  that a foreign `Host` or `Origin` is 403 and runs no tool, transport parity — the same result bytes
  over standard input and output and over HTTP for seventeen fixed requests of revision 2026-07-28, and
  the same tool results under 2025-11-25 on stdio, which HTTP refuses —, and the official client
  `@modelcontextprotocol/client` over `StreamableHTTPClientTransport` pinned, in `auto` mode and, refused,
  in `legacy` mode), `tests/application/cli/mcp-http-verb.test.js` (the flags, the address on standard
  error, a port in use), and the handlers of `cli-0029` to `cli-0031`
  (`tests/conformance/areas/_cli-mcp-http.js`, one child process per exchange; on a host without the
  loopback address 127.0.0.2, a default macOS, the `--bind 127.0.0.2` cases run with that one socket
  moved to 127.0.0.1 and the server still told `--bind 127.0.0.2`).
- An acceptance scenario (persona-c): an agent on the same machine reaches the tool server over
  Streamable HTTP with the official client and gets the envelope the stdio form gives, and a request
  from a page of another site is refused with 403.
- `docs/USING-WITH-ASSISTANTS.md` §5 "Over HTTP on your own machine" and the `curl` check of §6;
  `SECURITY.md`, `docs/PROTOCOLS.md`, `docs/CONNECTORS.md` and `docs/guides/mode-1.md` name the HTTP
  form.

- The domain layer on item pages (AGSC-06-38, last sentences; `build-0031`): on a node that uses the
  layer (a site vocabulary file is present, AGSC-01-41), the page of an item that has a domain part
  shows its domain type, role, context and warrant in a definition list right under the relations
  table, each with its label: the class's `rdfs:label` in the site vocabulary, the role in words, the
  title of the context's cluster (linked to its page; a context that is a cluster not listed, such as
  a draft, is neither drawn nor named) and the warrant's kind and source; the page of a retired item gets no domain part,
  as it gets no relations section. Where a row's item has a domain type or a context, the relations
  table gains the columns "Domain type" and "Domain context". The new pure module `src/distribution/domain-view.js` writes both, through the column list
  and a new `after` option of `graph-view.js#itemSection`. Bytes: only on a node with a site
  vocabulary, only the `index.html` pages of the items that state a domain key or that are joined to
  such an item by a relation in either direction; every other node keeps its bytes (G-REF of 093be5b:
  eight reference inputs, empty diff).
- The domain paragraph of the brief (AGSC-07-25; `compose-0034`): when a member states a key of
  AGSC-02-25, each `items` entry of a member that has a domain part gains `domain` (`context`, `role`, `type`, `warrant`,
  the parts it has; the context as AGSC-08-32 defines it, never a cluster that is not listed),
  `BRIEF.md` gains `## Domain` after
  `## Members`, and each section of `context.md` gains its `domain_type`, `domain_role`,
  `domain_context` and `warrant` lines, cut at the same 65,408-byte bound. `compose --brief` and
  `compose.brief` write it; with no domain key the four files keep their bytes. The functions are the
  new portable list `DOMAIN_PORTABLE` of `src/composition/brief.js` (`briefDomainFiles`,
  `briefDomainOf`, `domainOf` and their parts), each built on the function of `PORTABLE` it extends.
  A domain link (AGSC-03-27) appears in `relations` like any other key, with the inverse or symmetric
  edge the site vocabulary declares (origin `inverse` or `symmetric`), and so in `## Relations` of
  `BRIEF.md` and, authored inside the selection, in `brief.mmd`; it changes no dependency order,
  reading, gap or checklist entry (AGSC-03-18, AGSC-07-10). The host reads the links against the
  site vocabulary with the new `src/knowledge/links.js#domainEdges` (the reader `resolve` uses) and
  hands them in as `options.domainEdges`; `compose --brief` and the local server's `brief` (new option
  `domain` of `mcp-tools.js#tools`, the vocabulary the `mcp` verb loads as `lint` does) do so. Bytes:
  on a node whose listed items state a domain link, `brief.json`, `BRIEF.md` and `brief.mmd` of a
  selection that touches one. The blueprint of AGSC-07-29 names no domain part and is unchanged.
- The domain parts of the tool answers (AGSC-09-13, AGSC-09-16; `cli-0037`): for an item that states a
  key of AGSC-02-25, a `search` hit and the `read` body carry `domain`, among their members in
  code-point order, and the `items` of `brief` carry it as the brief does; an item that states none
  keeps the bytes of its answer. Both transports apply the one portable function
  `src/distribution/tool-answers.js#toolDomainAnswer` (new list `DOMAIN_PORTABLE`), so the local
  server and the page tools give equal answers.
- `/compose/agsc-core.js` and `/compose/agsc-page-tools.js` carry the domain parts (AGSC-07-25,
  AGSC-09-13, AGSC-07-13) only on a node whose listed items state a key of AGSC-02-25 or a domain
  link: the core's `briefOf` and `briefFiles` are then the domain paragraph's, given the node's
  declared contexts that are listed and its domain links between listed items (one `DOMAIN` object in
  the script), and the page tools add the parts to `search` and `read` over the same contexts
  (`API.DOMAIN_CONTEXTS`). The context of a listed item whose context is a cluster not listed is left
  out of the `domain` member on both transports and out of the brief's four files
  (`composition/brief.js#domainWithheld`; the page is handed that list of listed items as
  `DOMAIN.withheld` and `API.DOMAIN_WITHHELD`, AGSC-09-16), so no page script names an item that is
  not listed. The item's own front matter, in its source copy `/pages/<slug>.md` (AGSC-06-02) and in
  the `frontmatter` member of `read`, still says what it states, as in 1.0.
  Bytes: only on such a node, in these two files; on every other node both keep their pinned hashes
  (fixture: `agsc-core.js` 26f6df7a27da280f, `agsc-page-tools.js` 2a3bcc23c35eb55f), so a Bundle
  none of whose listed items states a key of AGSC-02-25 or a domain link emits what it emitted before
  (AGSC-01-41).
- A browser test of the domain parts (`tests/distribution/domain-browser.test.js`, AGSC-06-38,
  AGSC-06-20): a node with a site vocabulary and a declared context is served with its own policy, its
  item page shows the two columns and the list under the table, nothing loads from another origin, and
  axe-core finds no violation in the light and the dark colour scheme. The `browser` job of `test.yml`
  runs it (none of its files may skip). A persona scenario of `persona-i-maintainer.feature` shows the
  page, the page tool `read` run from the published scripts and the brief of a note with a domain type,
  a role, a warrant and a domain link, the link and its inverse under `## Relations`. A parity test
  (`tests/distribution/domain-parity.test.js`) runs `compose --brief`, the local server and the page
  tools over one node and finds the same brief on the three, and a draft context cluster named in no
  page script, no `domain` member of a page answer and no brief file; it also starts the real
  `agsc mcp` child over standard input and output and finds the domain link and its inverse in the
  brief, so the `mcp` verb's handover of the site vocabulary to the stdio server is tested.
- The blueprint outputs of a saved architecture (AGSC-07-29; vectors `compose-0028` to
  `compose-0030`): `compose --from <slug> --brief` (or `compose.brief: true`), for an item of
  `kind: architecture`, also writes `c4-context.mmd`, `c4-containers.mmd` and `c4-components.mmd`
  (the first three levels of the C4 model as Mermaid flowcharts), `decisions/NNNN-<slug>.md` (one
  MADR record for each distinct `decided-by` target of a member, numbered by the target's slug) and
  `build-plan.md` (one step per member in dependency order, with what it needs, what verifies it and
  what blocks it) into `blueprint/` of the directory beside the Harness, never into the Harness
  directory or its `--zip` archive, whose bytes are those of the same composition without them
  (`compose-0015`, `compose-0016`, `compose-0027` unchanged). No other invocation writes them. JSON
  Schema, OpenAPI and test scaffolds are not blueprint outputs at 1.1. New
  `src/composition/blueprint.js`, portable: it reads the brief's own parts, so it names listed items
  only (AGSC-00-05); the page bundle carries it with the brief, and the blueprint the page computes
  is the bytes the command line writes (`tests/composition/browser.test.js`,
  `tests/distribution/compose-page-run.test.js`). The fitness test `tests/arch/brief.test.js` also
  holds that the Harness writer never reaches the blueprint and that only the `compose` verb and the
  page bundle require it.
- The brief on the page of a saved architecture (AGSC-07-25, AGSC-07-24): the item page of a
  `kind: architecture` item shows the summary, the dependency order, the gaps and the checklist of
  its composition, written by the build over the listed items (each list at most 50 entries, then a
  sentence that says where the whole brief is), and links `/compose/?from=<slug>`. New
  `src/distribution/architecture-brief.js`. No other page changes, and none of the eight reference
  nodes has such an item.
- The rest of the `/compose/` page (I-031, I-033; AGSC-07-25, AGSC-07-29, AGSC-06-20): filters by
  cluster and by tag beside the text box; the verdict in words (the summary sentence of the brief);
  the brief of the selection shown inline (dependency order, gaps, checklist) once the page tools
  have read the published pages, offered as its four files, with the blueprint outputs while the
  selection is the one `?from=<architecture>` saves, one link per file and "Download the brief
  (.zip)"; "Download the skills (.zip)" beside "Download all (.zip)" for the skill files of the
  Harness. Each archive is its own and none enters the Harness archive (AGSC-07-13a). No element
  inside `<main>` moves while the page loads, and the footer moves as the page grows: the form, the
  list and the panels sit in one block shown in the step that hides the loading paragraph (measured in `tests/distribution/compose-browser.test.js`, which
  the browser job of `.github/workflows/test.yml` now runs with axe-core in both colour schemes;
  on the mode-4 demonstration the cumulative layout shift was 0.041 at 1280 px and 0.064 at 390 px,
  and is 0.039 and 0.090, the footer moving as the page grows, under the 0.1 bound of the Core Web
  Vitals). No new dependency.
- The composition brief (AGSC-07-25, AGSC-07-26, AGSC-07-27; vectors `compose-0024` to
  `compose-0026`): `compose --brief`, or `compose.brief: true` in `agsc.config.json` (AGSC-01-18,
  default `false`), also writes `brief.json` (JCS and one LF), `BRIEF.md`, `context.md` (item prose
  fenced as data, at most 65,536 bytes, a truncation line when members are left out) and `brief.mmd`
  in the companion directory `<harness dir>.companion/`, beside the Harness and never in it or in the
  `--zip` archive: why each member is there, the relations with the items one step outside, the
  dependency order (`requires`, `broader` and `derived-from` first, then code-point order), the
  readings of AGSC-05-33 inside the selection, the gaps and the checklist. It names listed items only
  (AGSC-00-05), and an invalid composition gets its brief and no Harness (exit 1); `agsc compose
  --help` names `--brief` for a selection and for `--from <slug>` (AGSC-09-09). New
  `src/composition/brief.js`, portable: `composition/browser.js` carries it in the page bundle when
  asked (`bundle({ brief: true })`), and the brief computed in that bundle is the bytes the command
  line writes (`tests/composition/browser.test.js`); this entry alone changes no published byte (the
  `/compose/` scripts change in the entries for the tools and for the rest of `/compose/`). Fitness test `tests/arch/brief.test.js`: the Harness writer never reaches the brief, and
  the brief requires only the two portable algebras. The seven Harness file kinds keep their bytes
  (`compose-0027`, `compose-0015`, `compose-0016` unchanged). No new dependency; G-REF at this entry's
  commit: no byte of the eight reference nodes changed.
- The tools `brief`, `explain` and `check` (AGSC-09-13, AGSC-09-16, AGSC-11-18; vectors `cli-0026`,
  which replaces the withdrawn `cli-0003`, `cli-0038`, which replaces `cli-0019`, and `bnd-0050`), so
  the local tool server and the page tools serve ten tools, listed by name in code-point order.
  `brief` returns the content of `brief.json` (AGSC-07-25) for a selection, composed over the listed
  set with the build instant and content version of the node's discovery document, and writes
  nothing; `explain` says whether one edge holds and why — `authored`, or the steps of a reading of
  AGSC-05-33 (`inverse`, `symmetric`, `transitive`, `closure`) — and answers `holds: false` with no
  step for a relation that does not hold, a key outside the fourteen and their inverse names being
  `AGSC-E203`; `check` returns the Link warnings `AGSC-E313` to `AGSC-E316` (AGSC-03-23…03-26) of a
  selection, or of every listed item, as findings without a position or a message, ordered by item,
  code, key and target. A page tool answers the three over the listed set (AGSC-09-16); the local
  server composes `brief` over the listed set too and answers `explain` and `check` from the Bundle on
  disk, drafts included, as AGSC-09-13 says of the local server (with no selection, `check` checks
  every listed item, the tool table of AGSC-09-13). The three are
  `readOnlyHint: true`, and only `brief` carries `untrustedContentHint: true`. `source` and `target`
  accept the `memory://` and item-IRI forms of AGSC-05-04b. New portable module
  `src/distribution/tool-answers.js`: the local server calls it and `/compose/agsc-page-tools.js`
  carries its source text after the page tools' own, so the two transports run one implementation;
  `tests/arch/page-tools-portable.test.js` holds both modules to the portability rule. The page tool
  `brief` hashes the selection with the page's Web Crypto, so it answers a promise; the local server
  hashes with Node's `crypto`, and the values are equal (`tests/distribution/tool-parity.test.js`).
  The agents demonstration's `examples/demos/agents/page-tools.js` gives its context the Web Crypto
  a browser has, so the page tool `brief` answers there as well (`docs/DEMOS.md` runs it and compares
  it with the tool server's).
- The bound on `search` and `ask` (AGSC-09-13, I-030; vector `cli-0027`): a `search` answer carries
  at most 100 hits, in the order of the ranking, and the member `total` only when more than 100
  items match; an answer under the bound has the bytes of 1.0 (`cli-0007`, `cli-0008` unchanged).
  `ask` already cites at most three items. The same on both transports.
- The citation record of a chunk (AGSC-09-13, AGSC-06-44, I-094; vector `cli-0028`): the body of
  `read` gains `chunks`, one record per chunk of the item in the order of AGSC-06-29, with exactly
  `algorithm` (`sha-256`), `bundle_version`, `coverage` (`text`), `digest`, `id`, `iri`, `item`,
  `license`, `license_url` (only where the chunk line has one), `ordinal`, `section` and `terms`, and
  `[]` for an item with no chunk (a draft, a retired item). The values are those of the chunk lines
  the build published (`knowledge/chunks.js#citationRecord`): the local server reads them from the
  route map of the build the `mcp` verb makes, the page from `/chunks.jsonl` and the shards its
  manifest names, which the page-tool loader now fetches; a shard the page could not read makes
  `read` answer `AGSC-E901`, never an empty list.
- `compose --narrate <agent>` (AGSC-07-28, AGSC-09-09): without `--brief` it is `AGSC-E003`, exit 2;
  with it, this distribution, which ships no model adapter for an agent lane, answers `AGSC-E001` at
  exit 1, writes no `narration.md` and still writes the brief and the Harness. No file of a brief and
  no vector holds model-written text.
- TypeScript toolchain for the agent-facing protocol modules (docs/ENGINEERING.md §8): sources under
  `src-ts/<context>/`, compiled by the new maintainer tool `tools/build-ts` to CommonJS at the same
  path under `src/` and committed there, each file headed `generated from src-ts/<path> by tsc
  <version>; do not edit`, so no install and no run needs TypeScript. `npm run build:ts` writes,
  `npm run check:ts` verifies, `npm run typecheck` is `tsc --noEmit`, and `prepack` runs the last
  two. `tsconfig.json` is strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `isolatedModules`), `module` `node20` (CommonJS for this package), `target`
  ES2024 for the Node floor 22.13, no maps or declarations; a bare `tsc` writes nothing. The first
  module, `src/shared/version-line.js` from `src-ts/shared/version-line.ts`, gives the line `agsc
  --version` prints (AGSC-09-09), and the command line prints that line through it with the bytes
  of 1.0, so no emitted byte changes. The
  dependency rule (`npm run arch`) reads `src-ts/` with the same map; the linter applies
  typescript-eslint's strict rules, the house style and the size budgets to it; the test lane
  runs `check:ts` and `typecheck` on every leg. New fitness test `tests/arch/typescript-parts.test.js`:
  the committed output equals the sources, the options stay strict, TypeScript is a development
  dependency only, and a new agent-facing protocol module (`src/distribution/mcp-*.js` other than
  the three of 1.0, `src/distribution/a2a*.js`, `src/application/hosting-http*.js`,
  `bench/runners/`) must be compiled from TypeScript. The architecture scans of `tests/arch/` read
  `require` with either quote, as the compiled files write it.
- Development dependencies, exact pins, for the TypeScript toolchain: `typescript` 6.0.3 (the last
  line with the JavaScript compiler interface that `typescript-eslint` and `dependency-cruiser` read;
  7.0 is the native compiler without it, and `typescript-eslint` 8.72.1 accepts TypeScript below
  6.1), `@types/node` 22.20.5 (the latest release of the Node floor's major line) and
  `typescript-eslint` 8.72.1 (so the linter covers `src-ts/`). The lockfile now resolves the
  `@types/node` that `@rdfjs/types` (under `rdf-validate-shacl`) asks for with any version to the
  same 22.20.5, and `@typescript-eslint/types` under the linter's plugins from 8.70.1 to 8.72.1.
  `npm audit` reports 0 vulnerabilities.
- Graph view on item and cluster pages (AGSC-06-38, I-022, I-023): an item page that has a typed
  Link to or from another published item shows, under the `#links` anchor that held the 1.0 list of
  Links, a **Relations** section — an inline SVG figure of its neighbourhood and a relations table,
  one row per relation with the key, its direction (outgoing, or incoming: the backlinks), the other
  item linked to its page and the meaning of the key from the table of AGSC-03-01. The figure draws
  the first 24 rows and the table lists the same rows; a sentence says how many more exist. A
  cluster page also shows a map of its members and the links among them (at most 24 links and 24
  members, the linked ones first) with a table of the same links. Drafts, retired items and items
  held back by the `releases` switchboard are neither drawn nor named, nor are Links to them
  (AGSC-06-30); a retired item's own page has no Relations section, so its Links are no longer
  listed there, and a Link to a retired item is no longer listed on the page that writes it; a
  retired cluster's page draws no map of its members. A symmetric key (`related`, `excludes`,
  `contradicts`) that both items state of each other is one relation (AGSC-03-01, AGSC-06-38: "one
  row for each relation key"): one row on each page, one arc in a cluster map, one count in the
  overview of `/clusters/`. The
  figures are written in the diagram language and compiled by `knowledge/diagrams.js` through the
  same allow-list check as an author's diagram (AGSC-02-13, AGSC-01-07); their ids are
  `links_<slug>-…` and `members_<slug>-…`, and the cluster map's heading is `member_links` (an
  underscore is in no heading anchor, AGSC-03-13), so no page repeats an id; where the body has a
  heading of its own whose anchor is `links`, that heading keeps it and the Relations heading has no
  id (on a page with Links and such a heading, 1.0 wrote the id twice). Bytes: the visible part of the
  `index.html` pages of items with Links and of clusters whose members link each other changes, as
  views added by AGSC-06-38 (HTML pages are not byte-pinned, AGSC-04-24); the Dataset JSON-LD block,
  the stylesheet and every machine file keep their bytes. `build-0032` passes. The code is
  `src/distribution/graph-view.js`; the Links between published items, a cluster's members and the
  title an item is drawn with moved from the `mermaid` export adapter to `src/knowledge/link-graph.js`,
  which both read (the export keeps its bytes).
- `/clusters/` carries, below its list, the overview of all clusters, the legend of the fourteen keys and
  an explorer of the published graph (AGSC-06-38, I-022, I-165, I-166 in part: no `/graph/` route, and
  the one-width page of the theme comes with the site's theme). The overview is a figure and a
  table that count the Links from the members of one cluster to the members of another, by key (at most
  24 rows, the figure drawing the same rows; a sentence when no Link crosses two clusters). Radio buttons
  above the table filter it by relation with no script ("a relation filter needs no script"). The legend
  lists the fourteen keys in the order of AGSC-03-01 with the key each reads by backwards and its meaning.
  The explorer draws every listed item and cluster and the Links among them from `/graph.jsonld` of the
  same origin — not a retired item, which that file keeps with `asc:retiredAt` (AGSC-11-22), and not a
  class or property of the specification or of a site vocabulary (AGSC-05-38), which it also carries —
  with a list of the items, a find box, a detail panel naming each relation with its meaning,
  zoom and pan, and a tooltip that opens on the side of a node where it covers the fewest other nodes; it
  is operable from the keyboard alone (AGSC-06-20: the arrow keys, Home and End move through the list,
  Enter selects, Escape closes the tooltip and then clears the selection). Its section starts hidden and
  only its script shows it. No route is added (AGSC-06-01): the page loads two same-origin files of its
  own, `/clusters/agsc-explorer.js` (the source text of the explorer's portable functions, so the page
  runs what the tests test) and `/clusters/agsc-explorer.css` (the explorer's look in both colour
  schemes and the filter's rules). Both keep AGSC-06-17 (no inline script or style, no other host) and
  AGSC-06-05 (the script reads `/graph.jsonld` and nothing else, and stores nothing). The explorer depends
  on no library; it draws at most 400 items and says so above that. The theme's stylesheet is unchanged,
  so it stays the main site's own copy. Bytes: `/clusters/index.html` changes and both files are added
  for every node that serves `/graph.jsonld` (views added by AGSC-06-38; HTML pages are not byte-pinned,
  AGSC-04-24); a node that does not serve it gets the overview, the legend and the stylesheet only. No
  machine file changes. The key terms the script reads are found by the graph writer's own functions
  (`knowledge/jsonld.js#compactionTable`, `#compactName`). The code is
  `src/distribution/clusters-page.js`, `src/distribution/explorer/` and the overview and legend of
  `src/distribution/graph-view.js`. No `/graph/` route is emitted: the specification's route set has
  none (the query page of AGSC-06-39 is where a graph is asked questions). Tests: `tests/distribution/explorer/`,
  `tests/distribution/clusters-page.test.js`, `tests/arch/explorer-portable.test.js` (each explorer
  function self-contained, no dependency) and `tests/distribution/explorer-browser.test.js` in the browser
  lane, where `axe-core` 4.13.0 is now fetched by exact version and checked against its SHA-256 like
  `playwright-core`.
- The query page `/query/` (AGSC-06-39, N-01): a visitor writes a query in SPARQL 1.1 and runs it
  against the node's own `/graph.nq`, in the browser, with no server. The page answers `SELECT`, `ASK`,
  `CONSTRUCT` and `DESCRIBE` over the union of the node's graphs (or over the dataset a query names with
  `FROM`); it refuses an update and a `SERVICE` clause before anything runs, with its own small
  tokenizer, because the engine lets `SERVICE SILENT` through and names no update in its own refusal,
  which stays the second line. The result is a table (the first 200 rows; the downloads hold all), and a
  `CONSTRUCT`, `DESCRIBE` or three-column result is also drawn as a picture with the explorer's own
  layout and scene writer (no second layout engine). Two links of the page offer the result as CSV and
  as JSON in the W3C formats ("SPARQL 1.1 Query Results CSV and TSV Formats", "… JSON Format", 21 March
  2013), written by the engine's own result writers; an `ASK` answer is JSON only, since no CSV form
  exists for it; a graph result is given as subject, predicate and object rows, its blank nodes named
  `b0`, `b1`, … so the same query gives the same bytes. "Link to this query" puts the query in the
  fragment (`#query=…`), which no request carries; opening such a link fills the editor and runs nothing.
  The ten questions of the graph (AGSC-05-34) are offered as examples with the queries that define them
  (from `docs/ontology-questions.json`, now shipped in the package), and a vocabulary explorer lists the
  classes and the fourteen relation keys with their property and meaning (AGSC-03-01). The editor is a
  text area with a coloured copy behind it; Ctrl+Enter runs; Stop ends a long query, which runs in a
  module worker. The page stores nothing and sends nothing (AGSC-06-05) and has no axe-core finding in
  either colour scheme (AGSC-06-20). Its HTML keeps the 100 KB budget; the engine is outside it
  (AGSC-06-21). The code is `src/distribution/query-page.js` and `src/distribution/query/`, with no
  dependency of its own. Tests: `tests/distribution/query/` (with fast-check properties over the result
  formats and the tokenizer), `tests/distribution/query-page.test.js`, `tests/arch/query-portable.test.js`,
  `tests/distribution/query-browser.test.js` in the browser lane, the persona scenario "Reader asks the
  published graph a question on the query page", and the cases `build-0029` and `build-0030`, which pass.
- The query engine of `/query/` is vendored (AGSC-06-39: "the files of one release of an engine whose
  licence allows their redistribution"): Oxigraph 0.5.13, licence `MIT OR Apache-2.0`, the WebAssembly
  build of the npm package `oxigraph@0.5.13`, which is already the engine's exact-pinned dependency, so no
  dependency is added. `src/distribution/vendor/oxigraph-0.5.13/web.js` (50,946 bytes, SHA-256
  `210c42fbba2915f668386f3285d28218db5865267e95b5403b82150431931f7c`) and `web_bg.wasm` (4,324,920 bytes,
  SHA-256 `75e3f0f4de67921e88e3f6d587b2a8e7aa822abbe3a3b79873f2b97f20d52c24`), with `LICENSE-MIT` and
  `LICENSE-APACHE` from the Oxigraph repository at tag `v0.5.13` and `THIRD-PARTY.txt`, the crates that
  may be compiled into the WebAssembly file with their licences. Each file is served under
  `/query/vendor/oxigraph-0.5.13/`; `tests/arch/query-engine-pin.test.js` pins their SHA-256 and keeps
  them equal to the pinned dependency. `REUSE.toml`, `LICENSES/MIT.txt`, `NOTICE` and the licence table of
  `README.md` name the engine's licence.
- `_headers` gains one block, `/query/*`, on a node that emits the page (AGSC-06-17, AGSC-06-39): it
  detaches the site-wide `Content-Security-Policy` and sets the same policy with `'wasm-unsafe-eval'`
  added to `script-src`, which the engine, compiled to WebAssembly, needs and AGSC-06-39 allows; no other
  source is added and no other address changes. `/query/` and every file under it are served exactly one
  policy (the reference host joins two rules that set the same header, and two policies are both
  enforced). Whether the host matches `/query/` itself with that block is to be checked on a live
  deployment before the release; the engine runs in a worker whose own response carries the block, so it
  starts either way.
- Bytes (AGSC-06-39): a Bundle of 1.0 built with the default gains `/query/` and its files, a
  `<loc>…/query/</loc>` line in `/sitemap.xml` (AGSC-06-19), a "Query" link at the end of the navigation
  of every generated page, and the `/query/*` block of `_headers`; no other file changes. With
  `site.query_page` set to `false` (AGSC-01-18) the build writes no `/query/`, no file under it and no
  link to it, and every other file is byte-identical to the same build by the engine just before the
  query page was added (checked on ten inputs); the build's skipped list says why.
- `agsc-host serve` (the `local` deployment profile) serves a `.wasm` file as `application/wasm`, so the
  engine of `/query/` compiles as a stream (AGSC-06-39).
- The browser job of `.github/workflows/test.yml` also runs `tests/distribution/query-browser.test.js`.
- The ten examples of `/query/` are filled in from the node (AGSC-06-39 (b), AGSC-05-34, N-01, I-011):
  the defining text of each question names its subject `?x`, a selection `<S...>` and an instant `"T"`,
  and as published question 4 does not parse and question 9 answers nothing. The page now puts in, for
  each question, the first item in code-point order of its slug that the question has something to say
  about (an item with a link of the question's key, a cluster with something under it, an item with
  consumed names or with sources), else the node's first item; for question 4 up to three other items
  that produce what it consumes; for question 9 the first four items that are deprecated, draft, retired
  or stale at the build's instant, the first item that is none of these, and that instant. A sentence
  under each query says what was put in, and says so when no item fits and the answer is empty. Each
  filled query, run by the engine the page ships, answers what the question's own function answers
  (`src/knowledge/questions.js`), checked in Node over the shared fixture of `graph-0030` to `graph-0039`
  and over fast-check graphs, in the browser over the rich fixture, and on the demonstration node, the
  main site's Bundle and the patterns node in the new optional lane `tests/e2e/query-sites.test.js`
  (`AGSC_E2E=1` with the browser lane), which also runs axe-core in both colour schemes. The code is
  `src/distribution/query-examples.js`, pure. Bytes: `/query/index.html` only (the examples and their
  sentences); the page script, the worker and the stylesheet keep their pinned bytes.
- `/query/` shows a node's own domain layer (AGSC-06-39 (b), (f)): on a node that declares competency
  questions (AGSC-05-41) they follow the ten examples, as its file states them, with a sentence that the
  page runs them over `/graph.nq` alone while `verify` checks them with the closure; on a node with a site
  vocabulary (AGSC-05-38) its classes and relations follow the fourteen, each with its label, what it is
  a kind of, its inverse and its meaning (`skos:definition`, else `rdfs:comment`). The questions file is
  read for its shape only, so the build still never reaches the SPARQL parser or engine
  (`tests/arch/sparql-library.test.js`). Bytes: only for a node with a domain layer, only in
  `/query/index.html`.
- The query page's browser test also runs the ten examples from the keyboard alone (focus a button,
  Enter, Ctrl+Enter), checks the Tab order of the controls and their visible focus, and checks that
  nothing on the page moves, with and without a request for reduced motion (AGSC-06-20); its axe-core
  pass uses the tags of `bench/a11y.js`. The persona scenario "Reader runs one of the ten questions of the
  graph on the query page with the keyboard alone" is new. Measured on the 5,000-item Bundle of
  `bench/gen-bundle.js` (13.4 MB `graph.nq`, 75,012 statements; Brotli 191,711 bytes): `/query/` is
  20,291 bytes and the engine is ready with the graph loaded in 2.0 s (median of five) at 20 Mbit/s and
  40 ms in chrome-headless-shell 156, 1.5 s on loopback.
- `/query/` refuses a `SERVICE` clause or an update that the text hid from its tokenizer (AGSC-06-39
  (a)); each of these let `SERVICE SILENT` through to the engine: (1) the `<` of `FILTER(1<2)SERVICE#>`
  was read as the start of an IRI running to the `>` of a comment; the tokenizer now keeps the brackets
  it is inside and reads a `<` after a value inside an expression as "less than", as the engine does
  (an IRI in a triple, a collection, a `VALUES` row or an argument stays an IRI); (2) a comment or a
  short string ran past a carriage return, where SPARQL ends the line; (3) `ex:.SERVICE` was read as one
  name (a local name cannot start with a full stop), and a word glued to the token before it
  (`a1SERVICE`, which the engine reads as `a`, `1`, `SERVICE`) hid it: a bare word that holds a refused
  word now refuses (no SPARQL function name, boolean or language tag holds one). A fast-check property
  in `tests/distribution/query/engine.test.js` checks the page against the engine itself: no text that
  the engine reads a `SERVICE` clause in gets through. Bytes: `/query/agsc-query.js` and
  `/query/agsc-query-worker.js`.
- The `/query/*` block of `_headers` is written only where the build emits the page AND a WebAssembly
  file of its engine under `/query/` (AGSC-06-39 admits `'wasm-unsafe-eval'` for such an engine only, and
  AGSC-06-17 keeps every other address on the site-wide policy); the engine's description no longer
  carries a flag that nothing read. No byte changes for a build with the shipped engine.
- `/query/` says which store answers as it does (AGSC-06-39): every statement of `/graph.nq` is in the
  node's named graph, and the page runs a query over the union of the graphs unless it names `FROM`,
  so the sentence for a reader without script and the two failure lines now name a store "that reads
  the union of its graphs as the default graph" instead of "any SPARQL 1.1 store", and "Ask the graph"
  says what a query runs over. A last line names the engine (Oxigraph 0.5.13, MIT or Apache-2.0) and
  links the two licence texts and the crate list served beside it. The picture of a graph result no
  longer classes its lines by relation key (no style read the classes; the table names each
  predicate), and its caption says "1 link" and "1 node" in the singular. The vocabulary tables write a
  prefixed name by the result table's own rule (`query/view.js#queryShortName`). Bytes:
  `/query/index.html` and `/query/agsc-query.js`.
- `docs/ONTOLOGY-QUESTIONS.md` (generated by `tools/gen-ontology-questions`) says the same of a store,
  and names the questions a cycle affects as 3, 6 and 7 (it said 1, 3, 6 and 8; the links of 1 and 8
  cannot form a cycle, AGSC-E302, AGSC-E303). `docs/guides/troubleshooting.md` has a row for the two
  failure lines of `/query/`; `docs/guides/mode-0.md` says the guide's own examples answer empty.
- `REUSE.toml` annotates `src/distribution/explorer/page.js` by override like the other files that quote
  an SPDX line as data (`reuse lint` 6.3.0 failed on it), and `tests/arch/reuse-layout.test.js` now
  fails on any file of `src/`, `tests/`, `tools/` or `bin/` that quotes one and is not listed. `NOTICE`
  and the folder tables say the engine's folder holds its two licence texts and a list of the crates
  that may be compiled into it, each with its licence expression (not those crates' licence texts,
  which the release lane adds).
- The case `build-0030` now also checks that the policy of each address under `/query/` is the
  site-wide one with nothing changed but `'wasm-unsafe-eval'` added to `script-src` (AGSC-06-39 forbids
  any other loosening); the two persona scenarios of the query page name AGSC-06-39, AGSC-05-34 and
  AGSC-06-20 in their steps.
- `/query/` refuses a `SERVICE` clause that an escape or the engine's own reading of a name hid from
  its tokenizer (AGSC-06-39 (a); found by the audit of the page, each let `SERVICE SILENT` through to
  the engine, which has no service handler, so nothing left the origin): (1) a local name may hold the
  escapes of SPARQL 1.1 `PN_LOCAL_ESC`, at its first position too (`ex:a\#`, `ex:a\'`, `ex:\#`), and
  the tokenizer ended the name at the backslash and read the `#` as a comment or the `'` as a string;
  (2) an IRI may hold a code point escape (`<x:a\u0041#>`, `UCHAR`), and the tokenizer did not read
  it as an IRI; (3) Oxigraph 0.5.13 ends a local name at its second run of bare full stops
  (`ex:a.b.SERVICE` is `ex:a.b`, `.`, `SERVICE`), and the tokenizer read the longer name SPARQL 1.1
  allows; (4) a variable's name holds no hyphen (`?a-1SERVICE` is `?a`, `-1`, `SERVICE`). The header of
  `query/tokens.js` names the terminals it models; a second differential property aimed at escapes is
  added, and `AGSC_QUERY_FUZZ=1` runs both long (30,000 runs on six seeds), the close gate of a change to
  the tokenizer or of a move to another engine release (step 6 of the engine folder's README). Bytes:
  `/query/agsc-query.js` and `/query/agsc-query-worker.js`.
- A `SELECT` that calls `RAND`, `NOW`, `UUID`, `STRUUID` or `BNODE` runs once on `/query/` (AGSC-06-39
  (c), (d)): its CSV file is read back from its JSON file through the engine's own CSV writer
  (`query/engine.js#querySelectCsv`), so the table, the CSV file and the JSON file hold the same values;
  before, the query ran once per format and the CSV file held other values. Any other `SELECT` still
  runs once per format, since two runs give the same rows in the same order and the read-back costs
  more than a second run. The caption of the picture says "the downloads hold every row" (the table
  shows the first 200), and the page says that the CSV file holds each value as the query gave it, so
  a spreadsheet may run a value that starts with `=`, `+`, `-` or `@` as a formula (the W3C format
  writes it so; the bytes of the file do not change). Bytes: `/query/index.html`,
  `/query/agsc-query.js` and `/query/agsc-query-worker.js`. The persona scenario "Reader asks the
  published graph a question on the query page" gains the step for both.
- Size (AGSC-06-39, measured by the audit of the page against the engine before the page): a node built
  with the default grows by about 4.46 MB, almost all of it the vendored engine under
  `/query/vendor/oxigraph-0.5.13/` (the demonstration node 1.33 MB to 5.79 MB, the minimal fixture
  0.27 MB to 4.73 MB); the package grows from 1.62 MB to 3.21 MB packed (5.72 MB to 10.24 MB unpacked,
  837 to 852 files). `site.query_page: false` keeps the size of 1.0.
- The diagram language takes the token `rel=KEY` on `arrow`, `line` and `text` (AGSC-01-42, I-024):
  KEY is one of the fourteen Link keys of AGSC-03-01, and the element gets the class `agsc-rel-KEY`,
  which carries no colour; on an accented element the class attribute holds both classes, the accent
  first. A `rel=` value that is no Link key is `AGSC-E412`, so nothing but a known key reaches the page;
  every `rel=` token of a statement is checked, and of two known keys the first is the class.
  The arrows of the graph-view figure on item pages now carry the class of their relation, the hook a
  stylesheet can use (AGSC-06-38). Bytes: a 1.0 diagram source compiles to the same bytes as before (the
  token did not exist), except an `arrow`, `line` or `text` with a quoted argument that begins with
  `rel=`: like a flag, the token is looked for among all the tokens of the statement (AGSC-01-42), so
  such a text now names a relation or is refused (no source in the examples or fixtures has one); the figure on item pages with Links gains one class per arrow (a view added by
  AGSC-06-38; HTML pages are not byte-pinned, AGSC-04-24). The cases `bundle-0018` and `bundle-0019`
  pass. Code: `src/knowledge/diagrams.js`, `src/distribution/graph-view.js`.
- Docs for the graph view and the diagram grammar (AGSC-06-38, AGSC-01-42): `docs/guides/mode-0.md` gains
  step 6, which adds a typed link and a diagram of one's own and checks the Relations rows, the backlink
  and the relation class on the built pages; `docs/guides/troubleshooting.md` gains the row of
  `AGSC-E412`; `docs/IMPLEMENTERS-GUIDE.md` no longer says that no rule pins the compiled SVG.
- The overview figure of `/clusters/` says how many clusters it left out, as the cluster map says of its
  members (AGSC-06-38: "the overview of all clusters", and "the table says how many more there are"): on a node with more than 24 clusters the note under the
  table reads "The figure draws 24 of the N clusters; the list of clusters names every one." Bytes:
  `/clusters/index.html` of such a node only (a view added by AGSC-06-38; HTML pages are not byte-pinned,
  AGSC-04-24). `graph-view.js` no longer exports `clusterFigureSource`, which nothing outside it used.

- `import <file.ttl> --from skos` (AGSC-01-39, AGSC-01-26a, I-018): a SKOS thesaurus in Turtle becomes
  draft items. The file is read with the pinned `n3` (`knowledge/turtle.js#parse`); the mapping is
  `src/interchange/adapters/skos.js` (concept to `concept` of kind `term`, preferred label to `title`,
  alternative and SKOS-XL labels to `aliases`, the first definition to `description` when it has 40 to 200
  code points and otherwise to the first body paragraph, `broader` / `narrower` / `related` to Links,
  schemes and collections to clusters, `dcterms:source` to `sources`, the IRI to `x-skos-iri`). Every
  statement it cannot carry is one `AGSC-E506` warning naming its subject and predicate, and a second run
  over the same file changes nothing. `imp-0006`, `imp-0007` and `imp-0008` pass. The adapter's own flag is
  `--replace`. No dependency is added; `tests/arch/rdf-reader.test.js` keeps `knowledge/turtle.js` the one
  module of `src/` that requires `n3`.
- `export --manifest` (AGSC-09-17 (a), I-142): adds `export-manifest.json` to the root of each export of the
  run: the `Content-Digest` value of RFC 9530 for every other file, the item count, the SHA-256 of the item
  addresses, the bundle hash, the content version and the specification version. `import` of a folder that
  holds a manifest recomputes the file digests, the count and the items digest and reports each difference as
  an `AGSC-E506` warning, then imports as before. A run without the flag writes the files of 1.0.
  `export-0003` and `export-0004` pass. The code is `src/interchange/export-manifest.js`.
- `export --skos` (AGSC-05-36, AGSC-01-26a, I-017): writes `dist/export/skos.ttl`, the SKOS view of the
  `graph.nq` of the same build. It copies the label, definition, scheme, hierarchy, relation and
  membership triples whose ends are concepts, lessons or clusters, and adds the scheme record
  (`dcterms:title`, `description`, `creator`, `license` from `site.title`, `site.tagline`, `site.author`
  and the licence, and `skos:prefLabel` with the title again, because SKOS tools label a scheme by
  it — skosify 2.3.0 warned of a scheme with no label; 31 Oct), `a skos:ConceptScheme`, `a skos:Concept` and `a skos:Collection`, and
  `hasTopConcept` / `topConceptOf`, in a Turtle file with its own two-line prefix block. Episodes,
  procedures and gates are left out. `graph-0040` passes. The code is `src/knowledge/skos-export.js`
  (it reads N-Quads with the pinned `n3`) and `turtle.serialize` takes an optional prefix table; the
  four graph files and every other output keep their bytes. A build with no `graph.nq` (Level 0) gives
  `AGSC-E001` and no file.
- `lint --suggest` (AGSC-05-35, AGSC-09-09, I-012): proposes Links from the content and writes only
  `dist/suggestions.json` (JCS, one LF; `bundle_version` and a sorted `suggestions` list, each entry with
  its evidence). Five generators: an inline link (G1), two or more shared sources (G2), a title or alias
  found as a whole phrase (G3), a lesson with no `derived-from` (G4), a term named in a body (G5);
  evidence from an `ai-generated` item is ignored. `content/` is never written (a test compares the
  content tree hash before and after). `lint-0046` to `lint-0050` pass. The code is
  `src/knowledge/suggest.js`; `knowledge/unicode.js` gains `foldCase` (the folding of AGSC-05-21, now
  shared) and `knowledge/markdown.js` gains `proseText`. A run without the flag writes nothing, as in 1.0.
- `AGSC-E417` and `lint.min_sources` (AGSC-08-31, I-013; `lint-0051`): where the key is greater than 0,
  a published pattern, taxonomy, explainer or principle concept with fewer than N counted sources is a
  warning; a source that is the address of an `ai-generated` item does not count. Default 0: a 1.0 Bundle
  is unchanged. `AGSC-E416` already compares aliases since B04 (AGSC-05-21, `lint-0045`).
- `export --closure` (AGSC-05-37, AGSC-05-23, I-005): writes `dist/export/closure.nt`, the triples the
  OWL 2 RL subset (`prp-dom`, `prp-rng`, `prp-spo1`, `prp-symp`, `prp-inv1`, `prp-inv2`, `prp-trp`,
  `cax-sco`; `prp-irp` as the warning `AGSC-E313`) entails from the `graph.nq` of the same build, the
  engine's ontology and the node's `domain.vocabulary`, minus what `graph.nq` already holds, in the
  Bundle's named graph, sorted by bytes. Derived data: never a route, never in `build.out`, the four
  graph files unchanged; two runs give the same bytes. `graph-0041` passes, and `graph-0042` with
  the site vocabulary in the graph. No new dependency: the rules are data, run by the `Reasoner` of the
  already pinned `n3` 2.7.12 (`src/knowledge/closure.js`; the architecture test that allowed one
  `n3` reader now allows this one second module, for the `Store` and `Reasoner` only).
- The site vocabulary of the domain layer (AGSC-05-38, AGSC-01-41; `lint-0052` to `lint-0055`):
  `domain.vocabulary` names a Turtle file of the node's own classes and relations. `lint` and `build`
  check it against the rules (a) to (g) of AGSC-05-38 (one ontology, terms in the site namespace or a
  context namespace, the predicates and types of OWL 2 RL that `tools/validate-ontology` admits, a
  label for every term, each class under exactly one of the six item classes, each property an
  `owl:ObjectProperty` under one of the fourteen link properties, no domain and no range); each fault
  is the error `AGSC-E420`, and `build` writes nothing while one remains. New module
  `src/knowledge/domain.js`. Only a node with a `domain` object is checked, so a 1.0 Bundle lints and
  builds with the same findings and exit codes.
- `tools/validate-ontology <file.ttl>` checks a site vocabulary when the file is not named `agsc.ttl`
  (AGSC-05-38: the violations are reported "by `lint` and by `tools/validate-ontology` run on the
  file"), with the context namespaces of the `agsc.config.json` that names the file. The tool stays
  standalone (AGSC-09-90); `tests/tools/validate-ontology-parity.test.js` checks that it and the
  engine give the same findings on every shared fixture.
- The domain triples in the graph (AGSC-05-38, AGSC-05-39; `graph-0044`): for a node that uses the
  domain layer, `graph.nq`, `graph.ttl` and `graph.jsonld` carry every triple of the site vocabulary in
  the Bundle's named graph (in `graph.ttl` the OWL terms as full IRIs, the prefix block unchanged), and
  an item adds a second `rdf:type` for `domain_type`, `schema:additionalType` for `domain_role`,
  `dcterms:isPartOf` for `domain_context` and its `domain_links` with the inverse or symmetric edge the
  vocabulary declares, in `graph.*` and in its own `pages/<slug>.jsonld`; the vocabulary's own triples
  are in no per-item view. With the graph files, `/.well-known/knowledge-linkset`, `/now.md` and `/now/`
  change, since they carry the digests and the fingerprint of the graph files; AGSC-05-39 names all
  of them (amended 2026-11-02, it named the graph files and the per-item views only). A node without a
  vocabulary file writes every byte as 1.0 does (G-REF: 0 differing files on the fixture, the four
  example Bundles and the two content nodes). In `graph.jsonld`
  a node with two classes lists them in code-point order of their IRIs, and a literal under a term that
  selects IRIs is written as a value object; neither case occurs in a 1.0 graph.
- The `domain` object of the configuration (AGSC-01-41, AGSC-08-32; `bundle-0020`): a named file that is
  absent is `AGSC-E901`, a context for a slug that is no cluster item is `AGSC-E301`, a path under
  `content/`, `dist/` or `build.out` is `AGSC-E204`, and a repeated cluster or namespace, a namespace
  outside the form or the vocabulary namespace of AGSC-05-02 is `AGSC-E209`. `export --closure`
  reports an absent `domain.vocabulary` once, as this `AGSC-E901`, where it said `AGSC-E001`.
- The domain keys of an item are known keys (AGSC-02-25, AGSC-00-21; `fm-0022` to `fm-0027`): `domain_type`,
  `domain_role`, `domain_context`, `warrant` and `domain_links` no longer warn `AGSC-E207`. A
  `domain_role` outside its five values is `AGSC-E203`; a `warrant` without a `source` or a `type`, or
  with a type other than `literary`, `user` and `organisational`, is `AGSC-E512` (it was `AGSC-E202` or
  `AGSC-E203`; `lint-0056` passes). `schema/item.schema.json` gains `domain_links`, an object of Link
  arrays whose member names follow the grammar of `domain_type`: AGSC-03-27 names the key and the schema
  of 29 Oct did not carry it (the keyword subset of AGSC-02-24 has no `propertyNames`, so a member name
  outside the grammar is `AGSC-E201`).
- Domain types and contexts are checked (AGSC-02-25; `lint-0061` reports its `AGSC-E418`): `lint`, `ci` and
  `build` refuse, as `AGSC-E418`, a `domain_type` that names no class of the site vocabulary in the
  namespace of the item's context, a `domain_type` on a node that names no vocabulary file, and a
  `domain_context` that no entry of `domain.contexts` declares. Raised only on an item that states the
  key, so a 1.0 Bundle lints and builds with the same findings and exit codes. `domain.js#itemFindings`.
- Domain links (AGSC-03-27; `links-0018`, `links-0019`): on a node with a site vocabulary,
  `links.resolve(items, {domain})` reads `domain_links`. Each member is an edge keyed by its name, with
  the inverse or symmetric edge the vocabulary declares computed back; the edges count as inbound
  references for the orphan warning (AGSC-03-10) and are never read by the checks of AGSC-03-23 to
  AGSC-03-26 or the cycle checks. A member that names no object property of the vocabulary, that is the
  computed side of an `owl:inverseOf` pair (the object as the file writes it, or the greater IRI where
  the file states both directions), or that specialises `skos:related`, `skos:broader` or
  `skos:narrower` where the item or the target is a cluster is the error `AGSC-E317`, in `lint`, `ci`
  and `build`; an unresolved target is `AGSC-E301`. The model of `domain.js#load` says which side of a
  pair is computed (`computed`, `inverseName`). No byte of a node without a vocabulary changes; the
  edges are not yet shown on pages or in tool answers.
- Warrants in the graph (AGSC-05-40, the AGSC-05-26 table; `graph-0045`): an item with a valid `warrant`
  adds `dcterms:source` with the source and `asc:warrant` with the kind (`literary`, `user` or
  `organisational`, the three warrants of ANSI/NISO Z39.19-2005 (R2010)), both `xsd:string`, to
  `graph.nq`, `graph.ttl`, `graph.jsonld` and its own `pages/<slug>.jsonld`, on any node: a warrant
  needs no vocabulary file. A warrant is not a Source node and changes no entry of `sources[]`; one
  that breaks the rule adds nothing (the lint reports it, `AGSC-E512`). The files that change are
  those of AGSC-05-39 and only for a node whose items state the key; no reference node or example does
  (G-REF: 0 differing files). New `src/knowledge/warrants.js` (`warrantOf`, `TYPES`) is the one reader
  of the key, for the graph now and for the pages, tool answers and brief later. `asc:warrant` is not
  yet a term of `ontology/agsc.ttl`: the pass that sets the 1.1.0 vocabulary version adds it
  (AGSC-05-25), and the context file of the context version never defines it (AGSC-05-09, AGSC-06-32),
  so `graph.jsonld` writes the member as `asc:warrant`.
- `graph.jsonld` survives the round trip of AGSC-06-32 when the graph holds an IRI the context has no
  term for (`asc:warrant`, AGSC-05-40; `schema:additionalType`, `dcterms:isPartOf`, `rdfs:subClassOf`
  and the declared terms of a site vocabulary, AGSC-05-38/05-39): such a member name, class, datatype
  or node is written as the compact IRI that a JSON-LD processor writes with the context's prefixes,
  and stays a full IRI where no prefix covers it (the site namespace, OWL). The domain-layer graphs of
  this release wrote the full IRI, which re-compaction does not reproduce. Every IRI of a 1.0 graph
  built by the command line has a term, so no byte of a 1.0 node changes (G-REF: 0 differing files).
  A program that calls the build without the vocabulary gets a context of prefixes only, and its
  `graph.jsonld` now names the `asc:` members as compact IRIs (`asc:uses`) and so round-trips with
  that context.
- The SHACL Core evaluator of a node's own invariants (AGSC-05-41; the fixtures of `tests/shapes/core/`):
  new `src/knowledge/shacl-core.js`, `check(text)` and `evaluate(text, quads)`. A shapes file outside the
  subset the rule names (another term of `sh:`, a node shape named by a blank node, a property shape
  without exactly one path that is a predicate or `sh:inversePath` of one, a parameter value of the wrong
  kind or stated twice where SHACL allows one) is the error `AGSC-E420` and is not evaluated; otherwise the
  results come as records (component, focus node, message, path, severity, source shape, value) ordered by
  focus node, source shape and path by code point. `owl:imports` is never followed. One positive and one
  negative fixture for each of the twelve constraint components and 22 refused shapes files; pySHACL
  0.40.2 gives the same results on every fixture (`tests/knowledge/shacl-core-lane.test.js`, skipped
  without `AGSC_SHACL_PYTHON`). `verify` and `ci` run it (AGSC-09-20, the entry on the site's
  invariants below), and the build never does (AGSC-05-23, `tests/arch/shacl-library.test.js`). No byte of
  any node changes.
- Dependency `rdf-validate-shacl` 0.6.5 (Zazuko, MIT), pinned exactly, used only by
  `src/knowledge/shacl-core.js`. Reason: AGSC-05-41 needs a SHACL processor, and this maintained one
  validates SHACL Core on the RDF/JS terms the pinned `n3` already produces, offline, and agrees with
  pySHACL on the shared fixtures, so the engine writes no evaluator of its own. It adds 21 packages to
  the production install (20 MIT, one BSD-3-Clause; about 11 MB) and no advisory to `npm audit`. It is an ES module,
  loaded with `require()` on the supported Node versions (22.13.0 and later).
- A node's own invariants and competency questions are checked by `agsc verify` and `agsc ci`
  (AGSC-09-20, AGSC-05-41; vectors `lint-0057`, `lint-0058`, `lint-0059`, `graph-0046`). Where
  `agsc.config.json` names `domain.shapes` or `domain.questions`, both files are evaluated over one
  data graph, `graph.nq` with its closure (AGSC-05-37): each result of the shapes is `AGSC-E421`, an
  error for `sh:Violation` (exit 1, and the `verify` check of `dist/gate.json` fails) and a warning for
  `sh:Warning` and `sh:Info`, naming the focus item; each question whose answer differs from its
  `expected` is the error `AGSC-E422` naming its `id`; a shapes file, a questions file or a query
  outside the subset of AGSC-05-41 is `AGSC-E420`, and then that file is not evaluated. `lint` and
  `build` never run the check, `ci --level` 0 to 2 does not (it belongs to Level 3, AGSC-10-19), and
  a node with neither key loads no new library and exits as 1.0 does (G-REF: no byte of the eight
  reference nodes changes). New `src/knowledge/competency.js` (the questions: their file, the SPARQL
  subset as data, the answers in N-Triples cells), `src/knowledge/site-checks.js` (the data graph and
  the findings) and `src/application/cli/verbs/_site-checks.js` (the wiring); the Bundle loader keeps
  the texts of the two files (AGSC-01-41). `docs/guides/mode-1.md` shows a question in a runnable step,
  `docs/guides/troubleshooting.md` gains the rows of `AGSC-E421` and `AGSC-E422`.
- Bounded contexts in the label check (AGSC-08-32, AGSC-05-21; vectors `lint-0060`, `lint-0061`): on a
  node whose `domain.contexts` declares contexts, the items of one context are compared with each other
  only, the items in no context form one group, and items of two groups are never compared, so one term
  may mean two things in two contexts. Inside a context two published items with equal titles after NFC
  and case folding are the warning `AGSC-E419` whatever their types, on the later path, in place of
  `AGSC-E416`; an alias still overlaps as `AGSC-E416` inside its group. The context of an item is its
  `domain_context` when that names a declared context, else its primary cluster when that is declared,
  else none. A node that declares no context is checked exactly as before (property test). New
  `src/knowledge/contexts.js` is the one reader of the declared contexts, of the context of an item
  (now also used by `domain.js`) and of the address of a `peers[]` entry.
- Context maps between nodes (AGSC-11-24; vectors `bnd-0046`, `bnd-0047`, `bnd-0048`): a typed
  `peers[]` entry `{url, relationship, crosswalk}` is read. `boundary/federation.js` reads the
  crosswalk with the pinned `n3` (`readCrosswalk`: only `skos:exactMatch`, `closeMatch`, `broadMatch`
  and `narrowMatch` from a `concept` or `lesson` item, or a term under a context's namespace, to an IRI
  of the peer; anything else is `AGSC-E209`), refuses a peer that cannot be applied before any fetch
  (`peerFaults`: `AGSC-E203`, `AGSC-E202`, `AGSC-E901`, `AGSC-E209`) and marks the results a client
  derived from that peer with the `relationship` and, where the crosswalk names a result, `crosswalk`
  (`contextMapResults`); every result stays `untrusted` with its `origin`. `lint`, `ci` and `build`
  report an absent crosswalk file (`AGSC-E901`, from the Bundle loader) and a refused statement
  (`AGSC-E209`); a build applies no crosswalk (fitness test `tests/arch/context-map.test.js`). The
  discovery document, the page footer, the peer citations of the graph and the import identity name a
  typed peer by its `url` alone, so its site is byte for byte that of the plain peer; before this a
  typed peer, which the 1.1 schema already admitted, reached the discovery document as
  `"[object Object]"`.
- The context map of a composition (AGSC-07-30; vectors `compose-0032`, `compose-0033`): for a node
  that declares contexts, `compose` also writes `context-map.json` (JCS and one LF: the contexts with
  their members, the authored Links inside the selection that cross two contexts, the members in no
  context, the peers' relationships and crosswalk statements, and the members `harness.jsonld` shares)
  in the companion directory `<harness dir>.companion/`, beside the Harness and never in it; a typed
  peer that cannot be applied stops the run before anything is written. A node that declares no
  context writes no extra file and creates no companion directory, and the seven Harness file kinds
  are the same bytes with and without contexts (`compose-0027`, `compose-0015`, `compose-0016`
  unchanged). New `src/composition/context-map.js`; `docs/guides/mode-1.md` and
  `docs/guides/troubleshooting.md` (`AGSC-E419`) document it. No new dependency; G-REF: no byte of the
  eight reference nodes changes.
- Dependencies `@traqula/parser-sparql-1-1` 1.4.0 (Comunica, MIT) and `oxigraph` 0.5.13 (MIT OR
  Apache-2.0), pinned exactly, used only by `src/knowledge/competency.js`
  (`tests/arch/sparql-library.test.js`). Reason: AGSC-05-41 asks the engine to run SPARQL 1.1 queries
  and to refuse those outside a subset; Traqula parses SPARQL 1.1 into a tree the subset check walks
  (it replaces SPARQL.js, which its author deprecated in its favour, and which npm marks unsupported),
  and Oxigraph evaluates the query, offline and synchronously, as the engine of the SPARQL development
  lane already does (pyoxigraph 0.5.13), so the engine writes no parser and no evaluator. The subset
  is checked before the engine runs a query, so no query reads a clock, a random number or the
  network. They add 5 packages to the production install (156 to 161; four MIT and `@traqula/chevrotain`
  Apache-2.0; about 14 MB, 8.5 MB of it Oxigraph's WebAssembly for Node and the browser) and no advisory
  to `npm audit`.
- `tools/gen-shapes` and `schema/item-shapes.ttl` (AGSC-05-24, AGSC-03-25, AGSC-03-23, AGSC-05-17 to
  AGSC-05-21, AGSC-09-90, I-016): SHACL 1.0 shapes of the RDF graph (`graph.nq`, `graph.ttl`, `skos.ttl`),
  generated from `schema/item.schema.json` and the table of AGSC-05-26 (datatype, one value, the closed
  lists, the keys a type requires), from the relation table of AGSC-03-01 (the Expected target kinds
  column as a warning, the Self-link column as a warning or a cycle error) and from the SKOS integrity
  rules; informative, never run at build, so no dependency is added and `npm audit` is unchanged. The
  shapes run in a development lane with pySHACL 0.40.2 in a scratch environment
  (`tests/tools/gen-shapes-lane.test.js`, skipped without `AGSC_SHACL_PYTHON`): 0 violations over the
  three views of six Bundles, and one negative graph for each of the 49 shapes that can report
  (`tests/shapes/negative/`). The tool ships, imports nothing from `src/`, and shares the table readers
  and the command line with `tools/gen-dc-profile`. `docs/SHACL-SHAPES.md` is the one page that says
  what the lane has run. The file is `schema/item-shapes.ttl` as AGSC-05-24 says, not
  `docs/shapes/agsc-shapes.ttl` as the work plan had it.
- `tools/gen-dc-profile` and `schema/dctap.csv` (AGSC-05-26, AGSC-09-90, I-019): the Dublin Core
  Tabular Application Profile of the AGSC-05-26 table, generated from that table and
  `schema/item.schema.json` (a closed list of the schema is a picklist); `--check` fails when the file
  is stale. The tool ships in the package and imports nothing from `src/`. No dependency is added.
- `src/knowledge/derive.js` (AGSC-05-33, I-015 checker side): `readings(edges)` gives the inverse,
  symmetric, transitive and closure readings of the Link graph, each with its `because` steps
  `{rule, from}`, in code-point order, computed and never written to a graph file. The CLI surface
  that prints them is a later package.
- `src/knowledge/questions.js` (AGSC-05-34, I-011): the ten questions of the graph as pure functions
  of the published projection (`mustTake`, `neverWith`, `replacedBy`, `missingPorts`, `verification`,
  `blockers`, `lineage`, `underCluster`, `unhealthy`, `sourcesAndSharers`, and `answer(number, items,
  {subject, selection, at})`), each list sorted by code point, without repeats and without the
  subject; `graph-0030` to `graph-0039` pass. The SPARQL text of the same questions is the data file
  `docs/ontology-questions.json`, and `docs/ONTOLOGY-QUESTIONS.md` is generated from it by
  `node tools/gen-ontology-questions`. A development-lane test (`AGSC_SPARQL_PYTHON`) runs each text
  over `graph.nq` in Oxigraph and compares the rows with the function. No output byte changes.
- The REUSE layout (I-042): `REUSE.toml` and `LICENSES/` (`Apache-2.0`, `CC0-1.0`, `CC-BY-4.0`) at
  the root, one annotation per licence area of the README table; both ship in the package.
  `reuse lint` reports REUSE 3.3 compliance. No source file, vector or built output changes.
- `bench/metrics.js`: the statistics of the agent-side study — citation precision and
  recall on unit ids, a percentile bootstrap interval, a paired permutation test (exact
  up to 16 pairs), Holm's correction and Cliff's delta. The resampling draws from a
  seeded generator, so the same seed gives the same bytes; probabilities are returned
  unrounded, and a list holding a missing value (`null`, `undefined`, `NaN`) is
  refused rather than read as a number.
- `tools/lint-claims` (kept in the repository): fails ranking words in a results text and
  results rows that do not name their model, calendar date, sample size, metric, value
  and confidence interval, or that compare with another system without both
  configurations (docs/BENCHMARKS.md, "What this project will never claim").
- `docs/DUBLIN-CORE-PROFILE.md`: the user page of `schema/dctap.csv` and `tools/gen-dc-profile` (AGSC-05-26).
- SKOS import, fixes before the release (AGSC-01-39): the file is read as RDF 1.1 Turtle only, so a TriG
  file is `AGSC-E003` and not merged; a `skos:broader` or `skos:narrower` of a concept to itself, or one that
  would close a cycle of the file's hierarchy (AGSC-03-08), is not written as a Link and is reported as
  dropped, so the Bundle the import writes passes `agsc lint`; of several `dcterms:license` statements of a
  scheme only the one written is carried and the others are reported; the warning for the `skos:memberList`
  of an ordered collection says the order is dropped, not the membership.
- `agsc import` usage line and the agent skill table name `--from skos` (a `<file.ttl>`), `export --skos`,
  `--closure`, `--manifest` and `lint --suggest`; `docs/guides/troubleshooting.md` gains the row of `AGSC-E416`
  and `docs/guides/mode-1.md` shows `lint.min_sources`.
- `docs/guides/publish.md` § "What a page and `robots.txt` tell an agent": the head links of a page
  (AGSC-06-46) and the default group of `robots.txt` with its `Content-Signal` line, both run by
  `tests/docs/guides.test.js`; the IETF aipref `Content-Usage` field (`draft-ietf-aipref-vocab-08`,
  `draft-ietf-aipref-attach-05`, re-read 7 November 2026) shown for comparison as a draft the engine
  does not write (AGSC-06-18). `docs/PROTOCOLS.md` gains the AI Preferences row; the llms.txt, WebMCP
  and Agent Skills rows say what 1.1 does.
- Tests: `tests/distribution/page-links.test.js`, `tests/composition/skill-format.test.js` (fast-check:
  the link of any slug, the check independent of the key order), the `build-0033` handler
  (`tests/conformance/areas/_build-page-links.js`), the persona-c scenario "An agent that lands on any
  page finds the node's llms.txt and the page's Markdown copy by their link relations" and a persona-f
  step that runs the Agent Skills check over every installed pack.

### Fixed

- `tools/bench --dry-run --node` and `kit.js gold-index` no longer stop on an uncaught exception when a
  line of the chunk export is not JSON or lacks `id`, `digest`, `iri`, `item`, `ordinal` or `text`: each
  such line is `AGSC-E201` with its file and line. A sharded export (AGSC-06-31) is read through the
  shards its `chunks.jsonl` manifest lists, a shard path outside the export refused; before, the manifest
  line was read as a chunk. Gold-label findings name their line of `qrels/test.tsv`, not line 1.
  Repository and kit tools; no emitted byte changes.
- `/.well-known/agent-card.json` is written only when every `responder` of `surfaces[]` is an
  Agent2Agent one (its version `a2a:<version>`) and the `a2a-card` version is a bare A2A version such
  as `1.0`; otherwise no card is written and the build warns `AGSC-E210`. The card lists every
  responder as an A2A interface and copies the `a2a-card` version into each, so a node with an MCP
  responder (`mcp:2026-07-28`) published that endpoint as an A2A JSON-RPC interface, and an
  `a2a-card` version of `a2a:1.0` gave every interface the `protocolVersion` `a2a:1.0` (AGSC-06-34,
  AGSC-11-21; the emission is optional, so writing none conforms; a warning, not an error, because
  1.0 accepted the declaration, D-15). No reference node declares a card: no byte changes.
- The tool server checks a `subscriptions/listen` request like any other before it answers it as an
  unknown method (AGSC-09-19 (3)): over HTTP a listen request whose `MCP-Protocol-Version` names
  another revision is `-32022`, one with no envelope `-32602`, one that is not `application/json`
  415, and one whose header and body disagree `-32020` (AGSC-09-18 (4)), decided by the SDK's own
  classifier (`classifyInboundRequest` of `@modelcontextprotocol/server` 2.4.0); over standard input
  and output a listen request of another revision is `-32022` naming both revisions and one whose
  `_meta` lacks `clientCapabilities` the SDK's `-32602`. Each used to be `-32601`.
- Over standard input and output the first request fixes the revision of the process, as the SDK
  pins one era per process and MCP 2026-07-28 (basic/versioning, re-read 2026-11-07) scopes legacy
  semantics to the stdio process: after `initialize`, a request of 2026-07-28 is `-32022` naming
  `2025-11-25`, where it used to be served with the members of 2025-11-25 (no `resultType`); after
  a request of 2026-07-28 the SDK already answered `initialize` with `-32022` naming `2026-07-28`
  (AGSC-09-19). Documented in `docs/USING-WITH-ASSISTANTS.md` and `src/REFERENCE.md`.
- Over standard input and output, once `initialize` has fixed revision 2025-11-25, a request of an
  unknown revision is `-32022` naming `2025-11-25` alone, the one revision the process still serves;
  it named both, so a client that retried with 2026-07-28, as MCP basic/versioning suggests, was
  refused again (AGSC-09-19; block 8 audit). Before the first request, and in a process of
  2026-07-28, the error still names both revisions, as vector `cli-0034` pins.
- The warning `AGSC-E210` for an agent card left out now says that the discovery document still
  declares `a2a-card` at its target, which the node does not serve, and `tools/validate-wellknown`
  resolves an `a2a-card` target on the node's own origin at every Level and warns `AGSC-E210` when no
  card is served there (AGSC-11-16: a target that does not resolve is `AGSC-E210` from
  `validate-wellknown`; until now only the `llms-txt` and `chunks` targets were resolved). A warning,
  not an error, because a 1.0 node declared the surface and served no card (D-15); a card on another
  origin is not fetched (AGSC-11-17, declaration-only). The declaration itself stays: dropping it
  would change the discovery document of every node that declares it, a specification decision
  (block 8 audit). No emitted byte changes.
- Documentation of block 8 made true to the code: `docs/USING-WITH-ASSISTANTS.md` says which
  headers every HTTP request carries (`MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` for a
  call, a read or a prompt; AGSC-09-18 (4)) with a tool-call example; `docs/CONNECTORS.md` says the
  2025-11-25 handshake is served over standard input and output only; the mode-0 guide's licence
  example sets `license_prose` beside `license_url`, so a chunk no longer names the Content Use
  Terms beside a CC BY address; `docs/PROTOCOLS.md` names TOON 4.4 (Working Draft of 8 October
  2026) and `@toon-format/toon` 4.4.0, and the type of the card's catalogue entry; the module map of
  `docs/PLAN.md`, the container and scenario diagrams and the agent skill (both copies) show the
  HTTP transport; `src-ts/README.md` and `docs/ENGINEERING.md` no longer list an A2A responder as
  written (it is planned for 2.0); the MCP core tests name AGSC-09-13a.
- A brief whose `derived` member (AGSC-07-25) would hold more than 1,000,000 steps in the paths of
  its readings is refused with `AGSC-E904`, the code of a size cap: `compose --brief` and
  `compose.brief: true` report it at exit 1 and write nothing, the Harness included; the `brief`
  tool of both transports answers it in the error envelope of AGSC-09-13a; `/compose/` says why
  there is no brief; an architecture's page says so in its brief section and the build goes on. The
  rule sets no bound and the member grows with the cube of a chain's length: a chain of 400
  `requires` Links made `compose --brief` crash after 29 s ("Invalid string length"), and the tool
  server answered JSON-RPC `-32603`. The bound is the engine's (`composition/brief.js#derivedBound`);
  a chain of 144 items (994,994 steps, about 31 MB of `brief.json`) is still written whole, one of
  145 is refused. No 1.0 input changes: the brief is new in 1.1.
- The `brief` tool answers `AGSC-E901` when the server or the page has no build instant, because the
  discovery document of a build (AGSC-06-08) is absent or unreadable (AGSC-07-25, AGSC-09-13a). It
  used to answer `bundle_version: "0.0.0+19700101T000000Z"` beside `generated_at: ""`, a content
  version the build never had.
- The architecture's title in `blueprint/c4-context.mmd` and `blueprint/c4-containers.mmd`
  (AGSC-07-29) is written as a Mermaid label: a double quote is `#quot;` and a backslash is itself.
  It went through the escape of `workspace.dsl`, so a title such as `The "Agent Team" architecture`,
  which lint accepts, made both files fail to parse in Mermaid 11. A title with neither character
  keeps its bytes, and so does every vector.

- A diagram `line` that carries both `acc` and `thick` is refused with `AGSC-E412` (AGSC-01-42). It used
  to compile to a `<path>` with `stroke-width` written twice, which is not well-formed XML. The finding
  names the line.
- A `text` statement's `size=N` is written with the number rule of AGSC-01-42 (rounded to a tenth, a
  trailing `.0` dropped), like every other number in a compiled diagram; it used to be copied as given,
  so `size=13.04` wrote `font-size="13.04"`. A whole or one-decimal size, which every 1.0 source in the
  examples and fixtures uses, keeps its bytes.
- A diagram `arrow` whose `via=` holds a waypoint of three or more numbers, such as `via=100,90,5`, is
  refused with `AGSC-E412` (AGSC-01-42: "a `via` that is not a list of number pairs"). It used to take
  the first two numbers and drop the rest.
- The diagram refusals that are found after reading the whole source name the line that breaks the
  rule (AGSC-01-42: "each `AGSC-E412` naming the line"): a second `acc`, the later of two overlapping
  shapes and a shape inside the band of a `note`. They used to name line 1.
- `agsc import` keeps a typed `peers[]` entry whole when it rewrites `agsc.config.json`; it used to keep
  the address only and drop the relationship and the crosswalk (AGSC-11-24). The entries are ordered by
  their address, so a node with plain peers gets the same bytes as before.
- `agsc verify` reports a `domain.vocabulary`, `domain.shapes` or `domain.questions` path outside the
  path grammar (such as `./shapes.ttl`) as the error `AGSC-E204`; it used to skip the file it could not
  read and pass (AGSC-09-20, AGSC-01-35). `lint` and `ci` already reported it.
- `domain_links` on a node that names no site vocabulary is the warning `AGSC-E207`, as a 1.0 reader
  gives it; it used to be dropped without a word (AGSC-03-27, AGSC-02-05; the registry raises `AGSC-E317`
  only on a node with a vocabulary).
- A crosswalk statement whose subject is a context's namespace itself, or a class or property the site
  vocabulary types, is `AGSC-E209` in `lint`, `build` and `compose`: neither is a `skos:Concept`
  (AGSC-11-24). The site vocabulary is read once per command for this and the other domain checks.
- A shapes file whose shape is also a class (`rdfs:Class` or `owl:Class`) is `AGSC-E420`: it would give
  the shape the implicit class target of SHACL section 2.1.3.3, which the subset of AGSC-05-41 does not
  name.
- A `warrant` that is not an object (a string, a list) is `AGSC-E512`, the code of a warrant without a
  `source` or a `type`, in place of the generic `AGSC-E201` (AGSC-02-25, AGSC-05-40).
- The check of AGSC-09-20 blames the site vocabulary only when the vocabulary is the fault; a caller
  that passes no `graph.nq` gets an error that says so, not an `AGSC-E420` on an empty file name.
- `agsc --help` says that `verify` and `ci` also check the node's own shapes and questions
  (AGSC-09-20). The Mode 1 guide's vocabulary, front matter and shapes examples now run as one
  walk-through and agree with each other (AGSC-05-38, AGSC-03-27, AGSC-05-41); it names the rule for
  terms inside a context (AGSC-02-25) and says where a typed peer's relationship and crosswalk are
  written (AGSC-11-24). The troubleshooting page gains the `AGSC-E207` row and a cause of `AGSC-E418`;
  `docs/SHACL-SHAPES.md`, `docs/PLAN.md`, `docs/IMPLEMENTERS-GUIDE.md`, `src/README.md` and the item
  model diagram name the 1.1 parts.
- A site vocabulary whose `owl:inverseOf` names, on either side, anything but an object property the
  file defines (such as `rdf:type`, `asc:uses` or a literal) is `AGSC-E420` in `lint` and in
  `tools/validate-ontology`, and the build computes no inverse edge for such a pair; it used to write
  the named predicate into `graph.nq`, `graph.ttl` and `graph.jsonld`, so a domain link could type one
  item by another (AGSC-05-38 (f), amended 2026-11-03; AGSC-03-27).
- A shapes file with a long `sh:in` list (tens of thousands of members, inside the 1 MiB input bound)
  is read and evaluated; `verify` used to stop with an internal error, because the list was checked
  by recursion (AGSC-05-41).
- A crosswalk subject that is the address of an item is judged by the item's type even where a context
  namespace covers that address, so a cluster, a procedure or a gate is `AGSC-E209` there too
  (AGSC-11-24).
- A competency question whose `SELECT` has an `ORDER BY` that leaves out a projected variable, or has
  `LIMIT` without such an `ORDER BY`, is `AGSC-E420`: the rows SPARQL leaves tied or unordered depend on
  the engine and on the order of the data, so the `expected` answer could not be fixed
  (AGSC-05-41, amended 2026-11-03).

## [1.0.1] - 2026-10-21

A patch of the packages. **Specification `1.0.0` is unchanged**: no rule, schema,
vocabulary term or conformance vector changes. Only the package tag `v1.0.1` exists for
this release; there is no specification tag, because the specification did not move
(README, "Versions").

What a node built with 1.0.1 may see, measured on the engine's determinism corpus (49
files) and on both public nodes: the same bytes as with 1.0.0, except the build record
in `/ledger.jsonl`, which names the engine that built it (`"actor":
"process:agsc/1.0.1"`, the trailing `build` entry of AGSC-08-20a), and so the ledger head
and digest the discovery document carries. The Markdown parser's update below also
makes two rare CommonMark edge cases stricter; neither occurs on either public node.

### Security

- `markdown-it` 15.0.2 → 15.0.3, the Markdown parser every item is rendered with:
  [GHSA-gfr2-rv44-r23c](https://github.com/advisories/GHSA-gfr2-rv44-r23c)
  (quadratic-time rendering of a multi-line link reference definition, high) and
  [GHSA-vfgh-jcmw-g37q](https://github.com/advisories/GHSA-vfgh-jcmw-g37q)
  (quadratic-time inline HTML parsing, low). The second needs `html: true`; the engine
  renders with `html: false`, so only the first could reach a Bundle. 15.0.3 also
  follows CommonMark more strictly in two edge cases: a reference-definition label
  longer than 999 characters is no longer a definition, and a reference title on the
  next line needs whitespace before it. `argparse`, the parser's own dependency, moves
  with it (3.0.2 → 3.0.3).
- `hono` 4.13.8 → 4.13.13 in the lockfile, a dependency of `@modelcontextprotocol/sdk`
  (the tool server's library):
  [GHSA-5r4p-p66f-jhc7](https://github.com/advisories/GHSA-5r4p-p66f-jhc7)
  (`serveStatic` decodes a request path twice, moderate). The engine serves no static
  file through it — `agsc mcp` speaks stdio — so nothing the engine does was exposed;
  the pin moves so that `npm audit` is clean for every installer.

### Fixed

- `tools/validate-wellknown` now asks a restricted node for everything AGSC-11-20
  already requires of it: the `…/rel#access` link carries `agsc-access` `credential`
  (missing is `AGSC-E202`, another value `AGSC-E210`), and `agsc-generated-at` and
  `agsc-spec-version` are present at Levels 0 and 1 (missing is `AGSC-E202`; Level 2
  and above already reported them).
- The build's own discovery check finds the node's anchor link by its `/graph.jsonld`
  target rather than by its position, so a related `describedby` link that sorts first
  no longer breaks a restricted build. The Python checker makes the same checks with the
  same codes and words.
- A restricted node built at Level 0 or 1 now carries `agsc-generated-at` and
  `agsc-spec-version`, as AGSC-11-20 requires at every Level, and the build's own check
  accepts them there. A public node's output is unchanged.
- `bench/measure.js` records, for every layer it runs, the complete command, with
  `SOURCE_DATE_EPOCH` and `--scratch <dir>`, from one table; `docs/measurements.json`
  and `docs/MEASUREMENTS.md` print those lines, so each runs as printed (at 1.0.0 four
  of the six lines the site prints exited 2 as recorded). The measured figures are
  unchanged (the run of 2026-10-12).

### Changed

- The package version and the specification version are stated apart: the packages are
  `1.0.1`, the specification they implement is `1.0.0`, and the conformance claim reads
  "agentic-system-core 1.0.1 conforms to AgenticSystemCore 1.0.0, Level 3"
  (README, "Versions"). `tools/release` prints the package tag alone for such a patch,
  and the version test checks each version where it is stated.
- The pull-request template asks what changed, why, and how it was proved.

## [1.0.0] - 2026-10-14

### Upgrading from 1.0.0-rc.7

`1.0.0` adds one section, §0.7, which lists the documents the rules already cite
normatively, and adds, renumbers and removes no rule. Every change below is
a defect fix against a rule that already stood, a clarification, a test case that a
conforming implementation already passes, documentation, or a change to the test and
release process. A Bundle that conforms to
`1.0.0-rc.7` conforms to `1.0.0`, except where it breaks one of the rules listed under
"What `lint`, `build`, `ci` and `verify` may now report"; a Bundle that still declares
`spec_version: 1.0.0-rc.7` keeps building, because a reader accepts any Bundle of the same
MAJOR (AGSC-00-15).

**What changes in the files a build writes:**

- the specification version stamped in the built files is `1.0.0`: the three graph files,
  `/pages/*.jsonld`, `/llms.txt`, `/llms-full.txt`, `/now.md`, the skill packs, the compose and
  search scripts, and the build entry `process:agsc/1.0.0` of `/ledger.jsonl`; the digests,
  the bundle hash and the ledger head of the discovery document follow (AGSC-06-08);
- the vocabulary address: the vocabulary's version is `1.0.0`, so the versioned vocabulary
  route `/ns/<version>/context.jsonld` moves from `/ns/1.0.0-draft.1/` to `/ns/1.0.0/`, and
  so does the `@context` of `graph.jsonld` on a Level 0 or 1 node, which names that
  versioned address (AGSC-05-09, AGSC-05-25); the namespace document site keeps serving the
  pre-release copy, byte for byte;
- the default stylesheet (`/assets/site.css`): prose is held to a readable measure (34rem,
  about 70 characters), while figures, tables and code blocks keep the wider column; a table
  cell breaks only between words, and only code and links inside a cell may break anywhere;
- item pages: every chunk that begins at a heading is an in-page anchor, an empty
  `<span id="chunk-<id>">` opening that heading, so a cited chunk can be reached on its page
  (AGSC-06-28);
- `/compose/`: the page says that it needs JavaScript before it loads the graph, and
  `/compose/agsc-core.js` leaves a retired item out of a composition: a selected or required
  retired item is reported as the conflict `AGSC-E802` and is not in `selection[]`
  (AGSC-07-03, AGSC-11-22);
- the configuration layers of AGSC-01-37 (`.env`, the process environment, a flag) now reach
  what `build`, `verify`, `ci`, `export` and `mcp` produce, as AGSC-04-18 names them among the
  build inputs; a build with no override writes the same bytes as before.

**What `lint`, `build`, `ci` and `verify` may now report** (each was already outside a rule;
the engine now says so):

- an `ai-assisted` or `ai-generated` item without `prov.agent` or `prov.model`: `AGSC-E202`
  from `lint` (AGSC-08-01). Add the two values.
- an item whose `release` key the switchboard `releases` does not set to `true` is held back
  from every surface (AGSC-01-20); an undeclared key no longer publishes the item.
- an explicit YAML key (`? key`) in front matter: `AGSC-E105`.
- a language-variant file with no primary (`name.fr.md` without `name.md`): `AGSC-E204`; it
  was published under the primary's slug (AGSC-01-10, AGSC-01-11, AGSC-01-13).
- an `index.md` inside a type folder is a note about that folder and no longer an item
  (AGSC-01-05); it failed `lint` before.
- a node with `visibility: "restricted"` names its credential page in the new configuration
  key `access`, an absolute `https:` URL; without it `lint` reports `AGSC-E202` and `build` and
  `ci` write nothing (AGSC-01-18, AGSC-11-20). The build emits exactly one access link, and
  both discovery checkers require exactly one (`AGSC-E202` for none, `AGSC-E210` for more).
- a configuration with a channel of `publish: "auto"`: `verify` and `ci` report `AGSC-E706` for
  each commit of the content branch's first-parent chain after the root that is not a merge
  commit, or that carries none of `Signed-off-by`, `Proposal` or `Channel-Auto`
  (AGSC-08-26 (g)). Nothing is reported for a configuration with no automatic channel.
- a configuration error from any layer (the project file, `.env` or the process environment)
  now stops every verb that writes before it writes anything; `lint` and `verify` still
  report every other finding beside it.
- `PRIVACY.md` and the `.md` pages under `site/` are checked against AGSC-01-14
  (`AGSC-E108`).
- `AGSC-E109`, `AGSC-E310`, `AGSC-E415`, `AGSC-E902` and the findings of `run` name the line
  of the file, not the line counted from the start of the body.
- `Assisted-by:` is optional (AGSC-08-07): `AGSC-E505` is reported only when such a line is
  present and none of them names `prov.operator`.

**What changes on the command line and in the tools:**

- `agsc --help` gives each of the sixteen verbs a line with its purpose; an unknown verb's
  message says how to get help.
- `propose` writes its patch in the form `lint --fix` writes, so the applied patch gives the
  committed file; before the first commit it says to commit once.
- `refresh --agent <name> --dry-run` stops before it writes when a budget is reached (the
  warning `AGSC-E510`, exit 0), when nothing can be claimed (exit 0), or when there is no
  build instant (`AGSC-E204`, exit 1); the NOW page shows "Budget reached".
- `agsc-host emit` and `serve` check `build.out` through every configuration layer
  (`AGSC-E204`, `AGSC-E902`) and write nothing outside the Bundle; `serve` answers `421` to a
  request whose `Host` names neither the loopback nor the bound address, `400` to a missing
  `Host`, and `404` to a path with a dot segment other than `.well-known`.
- on a Node.js older than 22.13 every entry point prints one line and exits 2.
- the local tool server answers a missing resource with `-32002`, the code of the MCP
  revision it speaks (2025-11-25).
- the address classifier refuses the whole of `::/96` and `::ffff:0:0/96`, as both checkers
  already did (AGSC-11-08).
- slugs lower-case the ASCII letters only, after NFC (AGSC-02-91).
- `tools/validate-wellknown` and the Python checker require the media type
  `application/linkset+json` in every case, with the profile as a parameter or a `Link`
  header (AGSC-06-07, AGSC-09-93).
- `tools/validate-ontology` reports a datatype outside OWL 2 RL and a class or annotation
  property used without a declaration (AGSC-05-22).
- `tools/validate-spec` reads the declared version from the `spec_version` line, not from the
  first release-candidate version the overview quotes as history.
- the slow patterns found in the ledger's trailer reading, `lint --fix`, `init`, the old-site
  import, the board formats, `/llms.txt` and `/llms-full.txt`, and every trailing-slash and
  trailing line-feed trim are linear scans that give the same result.

**What to do.** Install `1.0.0`; run `agsc ci` in each Bundle and fix what it reports (most
often the two provenance values of an AI-assisted item); set `spec_version: "1.0.0"` in
`agsc.config.json` and `content/index.md` when you want the Bundle to state the release;
rebuild and deploy, because the digests in the discovery document change with the bytes;
then check the deployed node with
`node node_modules/agentic-system-core/tools/validate-wellknown https://<your-node>/.well-known/knowledge-linkset --level 2`.

### Added

- Conformance cases, each passed by the engine and cross-checked by the Python checker where
  it runs the case: `bnd-0040` to `bnd-0043`, `build-0018` to `build-0028`, `bundle-0009`,
  `bundle-0010`, `cli-0020` to `cli-0025`, `compose-0018` to `compose-0023`, `disc-0022`,
  `export-0001` and `export-0002` (a new `export` area), `fm-0011` to `fm-0020`, `links-0008`,
  `links-0009`, `lint-0034` to `lint-0044`, `prov-0006` to `prov-0014` and `slug-0007`.
  `build-0012` is withdrawn and replaced by `build-0018`, and `bnd-0035`, whose members
  described MCP revision 2026-07-28, which the reference tool server does not speak, is
  withdrawn and replaced by `bnd-0042`, which states the same settings object for revision
  2025-11-25.
- The vocabulary file is inside OWL 2 RL and OWL 2 DL: the classes and annotation properties
  it uses from other vocabularies are declared. Its version is `1.0.0`
  (`owl:versionIRI …/ns/1.0.0`), `dcterms:issued` is 2026-09-29, the day of the `1.0.0-rc.6`
  tag, `dcterms:modified` is the date of this release (AGSC-05-25), and nine comments are
  corrected.
- The specification's normative references (§0.7) and the definitions of the terms the rules
  used without one (§0.2).
- Continuous integration: a coverage gate inside the required Node 24 leg (lines 99.9 %,
  functions 99 %, branches 93 %); every leg packs both packages and installs them together;
  Node 26 legs; a weekly run; a browser job, which fails when a scenario that needs the
  browser is skipped; Dependabot for the pinned actions and npm.
- The release lane publishes a pre-release under `next` and a final release under `latest`,
  and refuses a tag whose commit is not on `main`.
- `CITATION.cff` names this version, its release date and the paper's concept DOI
  (`10.5281/zenodo.23052709`) as the preferred citation.
- Acceptance scenarios for the review lane (`agsc review`: a label, a comment, every finding
  with its file, line and column, and no model or network call, also with
  `AGSC_FEATURE_LLM_REVIEW=1`) and for a retired item that keeps its slug and its page while
  its old address redirects to its successor, with a second item under the same slug refused
  (`AGSC-E206`). `tools/validate-features --strict-matrix` fails when a verb of AGSC-09-07 is
  run by no scenario.
- The conformance runner guards every area against a vacuous pass: a pass that leaves a member
  of a case's `expected` unread is a fail.
- The security corpus (`security-floor-v3`) adds five long-line cases: the skills, old-site and
  GABBE imports, `skills import`, and `init` on heading lines ending in a carriage return and
  in U+2028. Each must finish inside the kill bound.
- A new guard test reads every regular expression in the engine's source and refuses the
  shapes known to take quadratic time on one long line. Its allow-list states why each listed
  exception is linear.

### Changed (specification)

Every rule below carries a dated amendment note in `spec/`; the text after each id is that
note. The list also names the rules amended before `1.0.0-rc.7` whose notes its change log
did not list. Notes changed only in form (one form for every amendment note, AGSC-00-16) are
not listed.

#### §0 Overview

- AGSC-00-01: The sentence no longer counts the test cases that name the fixture Bundle;
  the count it gave was out of date.
- AGSC-00-05: The lists of what a retired item keeps and leaves did not name the tool
  server's resources, `/llms-full.txt` or the page tools, and the local tool server, which
  reads drafts, was not set apart from the published surfaces.
- AGSC-00-06: The terms that the rules use without a definition were defined here — the six
  modes and the Mode-2 Links, persona, forge, content branch, namespace document site,
  launch pipeline and `refs[]` — and the two unregistered private names were stated as such.
- AGSC-00-17: The rule did not say which value governs when the two differ; the item check
  compares with the configuration's value, which "the MAJOR the Bundle root fixes" did not
  say.
- AGSC-00-18: The example content, type folders and workflow were said to be in no version's
  scope; they are planned for 1.1. The sentence on PRD-008 said that both documents carry a
  matching MAJOR, which no check compares; it now names the comparison AGSC-00-17 makes.
- AGSC-00-20: The capabilities of the reference distribution that earlier wording placed in
  no version, or did not name, are listed as planned for 1.1; the items already decided for
  1.1 are named; "an unknown key" is limited to the configuration. A clarification: no tool
  behaviour and no emitted byte changes. Six items decided for 1.1 while 1.0.0 was prepared
  are named among the changes of behaviour or of emitted bytes that 1.0 does not make — the
  AI-assistance statement reworded, the root base check, the general board-slug case, a
  one-node graph's round trip, an HTML block counted once and fenced prose in a skill pack.
  A clarification: no tool behaviour and no emitted byte changes. The 1.1 list attributed
  `isError` and the unknown-tool error to MCP revision 2026-07-28, where revision 2025-11-25,
  the one 1.0 speaks, already defines both and the 1.0 transport answers them with the
  AGSC-09-13a envelope; the `remember` refusal and the nesting bound are added to the list.
  No behaviour changes.
- AGSC-00-21: Five rows added — the gate verdict, the description file of a Harness, the
  conformance report, the agent card, and an `AGSC_` environment name that addresses no key.

#### §1 Bundle

- AGSC-01-04: A 1.0 writer forms every IRI from site.base; reporting a root base that
  differs from site.base as AGSC-E204 is planned for 1.1 (AGSC-00-20).
- AGSC-01-05: An `index.md` inside a type folder, which the first sentence permits, was read
  as an item and failed lint for want of `type` and `prov`; it is now a folder note like the
  other two names, and the comparison of the names is stated.
- AGSC-01-10: What the grammar settles on case-insensitive and length-limited file systems,
  and what it leaves open, is stated.
- AGSC-01-13: A variant file whose primary is absent was read silently as its primary's
  slug, and the language of an item with no `lang` key was stated only for the 1.1 primary;
  both are now stated for 1.0.
- AGSC-01-14: The text files outside the four suffixes were not named.
- AGSC-01-17: The codes that report a configuration fault were not named.
- AGSC-01-18: `access`, the key that names a restricted node's credential page for
  AGSC-11-20, was missing from this list and from the configuration schema.
- AGSC-01-26: No surface now reads no published surface, and the local tool server, which
  reads drafts as the required case `cli-0008` pins, is named as no published surface;
  nothing a node emits changes.
- AGSC-01-29: The failure named no code.
- AGSC-01-30: The rejection named no code.
- AGSC-01-35: The prohibition on a leading `/` is written with the key word in capitals.

#### §2 Items

- AGSC-02-09: The third form was missing, so this grammar and the actor pattern of
  `schema/item.schema.json` refused the actor that the ledger's trailing entry of
  AGSC-08-20a carries; the form is added to both, and no emitted byte changes.
- AGSC-02-13: The rule did not say whose slug `diagram.file` names.
- AGSC-02-20: The rule did not say which finding, if any, an unescaped `{` or `<` gives.
- AGSC-02-21: The rule did not say whether the three lists after the pattern list are under
  the same warning.
- AGSC-02-23: The rule did not say how a lint that reads one file sees a transition.
- AGSC-02-24: The subset was said to bind "the three item-facing schemas", which counted the
  configuration schema that the same rule lets use more keywords.

#### §3 Links

- AGSC-03-01: The rule said that all of the core nine carry composition semantics, while
  AGSC-03-18 says that four of them never change a composition.
- AGSC-03-02: The table's Lint column read as if four keys could keep an unresolved target.
- AGSC-03-08: The rule did not say whether the bounds count authored values or computed
  edges.
- AGSC-03-10: The rule did not say whether computed inverse and symmetric edges count as
  inbound.
- AGSC-03-12: The rule did not say which embeds become images, what text an alias-less
  wikilink takes, or what happens to a wikilink naming no item.
- AGSC-03-18: The combiner `advisory` was used and never defined.

#### §4 Canonical forms

- AGSC-04-04: Whether the six named artefacts were the whole list was not said.
- AGSC-04-05: The string serialisation, the difference between producing and re-serialising,
  the trailing line feed and the treatment of noncharacters were not stated.
- AGSC-04-09: The reference engine read an empty `SOURCE_DATE_EPOCH` as unset and no sentence
  said so. No behaviour changes.
- AGSC-04-13: The members' key named the cluster's own `order` first, which no member
  carries, so members always sorted by slug alone; the text now says so.
- AGSC-04-18: The rule counted `content/`, `agsc.config.json`, the instant and the git-log
  file as the only inputs, leaving out the other files of the Bundle root, the environment
  overrides and the two facts of the trailing ledger entry.
- AGSC-04-25: What happens to an unusable tag on an earlier element, and to a branch-2
  result longer than 64 characters, was not stated; the reference engine returned such a
  result outside the grammar.

#### §5 Graph and vocabulary

- AGSC-05-04a: A word that is not a key word is written in lower case.
- AGSC-05-05: The requirement on `id` stood only in the key table of §2.2, without a rule
  id.
- AGSC-05-09: `"@version"` and `"@protected"` were asked of `graph.jsonld`, which only a
  context file can carry; the bare form of an `xsd:string` literal is limited to a term with
  no `@type`, which is what JSON-LD 1.1 reads back as a string; the sentence on compaction
  is added. No emitted byte changes.
- AGSC-05-22: The rule named "lint" without saying which check rejects the file or with
  which code.
- AGSC-05-23: The rule asked for every inverse to be materialized without saying that
  `derivation-of` has no property.
- AGSC-05-25: `issued` is the date of the first published tagged release, and `modified`
  that of the release that first ships the version of the file; a changed annotation is
  stated to take a new vocabulary version; the annotation properties and the classes of
  other vocabularies the file uses are declared in it, which an OWL 2 profile checker needs
  to find the file inside OWL 2 RL.
- AGSC-05-31: The default language tag is `i18n.default`, else `en`, as AGSC-01-13 and the
  reference engine already had it.

#### §6 Surfaces

- AGSC-06-08: "no other top-level member may be present" written as a prohibition with its
  key word, and the trace bracket moved from the middle of the rule to its end. The
  `rel#access` row said the link is present when a restricted node "names one", which read
  as optional against AGSC-11-20's "exactly one"; the row now says exactly one, to the page
  the configuration's `access` key names.
- AGSC-06-10: The rule denied that any registry of target attributes exists; RFC 9423
  created one, scoped to CoRE, which holds neither name.
- AGSC-06-13: The file was described as following llms.txt v2 as a whole; it follows v2's H1
  only, and the rule now says that a v2 parser reads no summary.
- AGSC-06-13a: "No other line may appear" written as a prohibition with its key word. The
  layout was described as following llms.txt v2 as a whole; block (1) now says that it
  follows v2's H1 only.
- AGSC-06-14: The rule said "every published item", a set that includes the retired items
  AGSC-06-13a leaves out.
- AGSC-06-15: The rule said that AGSC-02-07 and AGSC-08-07 make the statement true; the
  line of AGSC-08-07 is optional, so the rule now says what each clause rests on, and that
  the constant is kept byte for byte at 1.x; rewording the constant is planned for 1.1
  (AGSC-00-20). No emitted byte changes.
- AGSC-06-17: The redirect was a MUST bounded by a condition no one can test, which named a
  version line older than this one; that clause is removed, the redirect is a SHOULD, and
  the rule says that the legacy name will not be registered. The reference engine still
  writes the redirect, so no emitted byte changes.
- AGSC-06-18: `robots.txt` was credited with signals about the use of content by AI that RFC
  9309 does not define; the `Content-Signal` line every reference `robots.txt` carries was
  named nowhere; and the two build failures named no code.
- AGSC-06-24: The rule also bound the security considerations of another document, which
  this specification cannot bind, and did not say which words the statement is.
- AGSC-06-32: The word "typed" is dropped; not every external term definition carries an
  `@type`.

#### §7 Composition

- AGSC-07-03: The rule did not give the verdict entry for a slug not present in the graph. A
  selected retired item stayed in `selection[]`, and a retired item reached through
  `requires` was added with no conflict, against AGSC-11-22.
- AGSC-07-05: The rule did not say whether a hidden item still hides what it supersedes.
- AGSC-07-05a: The rule did not say which superseding item is named when several supersede
  the hidden target, and the answer depended on input order, against AGSC-07-09.
- AGSC-07-07: The rule did not say whether a symmetric `contradicts` pair yields one warning
  or two.
- AGSC-07-12: The numbering of a decision record for an item the closure added, which has no
  input position, was not given. The two requirements of this paragraph are those of
  AGSC-07-13 and are stated without key words.
- AGSC-07-13a: Code-point order was called this specification's only ordering, beside the
  UTF-16 member-name order of AGSC-04-05.
- AGSC-07-15: The prohibition on a published skill pack is written as its own key word.
- AGSC-07-16: The rule did not say which files state the two facts or how.
- AGSC-07-19: The shape of `/skills/index.json` was not given, although it is a JSON
  artefact with a digest.
- AGSC-07-20: The rule required the lockfile to be verified without naming the code of a
  failed verification.

#### §8 Governance

- AGSC-08-02: The rule did not say where the two derived members are emitted; no 1.0
  artefact emits them.
- AGSC-08-06: The rule did not say who contributes; the maintainer's own commits are not
  contributions. The sentence named every commit of the content branch, while
  AGSC-08-26(g) exempts the root commit and checks the first-parent chain; it now names the
  commits that clause checks. No behaviour changes.
- AGSC-08-07: The line was mandatory; it is optional, and a line that is present is still
  checked against `prov.operator`.
- AGSC-08-20b: The rule did not say whether the "not run" report carries a code; it carries
  none.
- AGSC-08-24: The rule did not say what "attested at release" asks for.
- AGSC-08-25: The rule asked the NOW page for a count that includes records a build cannot
  read; it now says which verb counts what.
- AGSC-08-26: Clause (g) could not be met, since the root commit is never a merge commit; it
  now exempts the root commit, reads the first-parent chain of the git-log file, applies
  only where a channel publishes `auto`, as the rule already said, and says which parts
  `verify` and `ci` check from that file and which the forge's CI checks.
- AGSC-08-27: "the build" is the implementation's own build, and the failure carries no
  finding code.
- AGSC-08-28: (e) said that the run records the skipped run in the NOW page, which a run
  does not write; the run reports it, and the NOW page shows the reached budget. (b) did not
  say which model a lane of kind process names; it names its kind, as the reference engine
  writes it. No behaviour changes.

#### §9 Conformance

- AGSC-09-03: Marked (reference distribution) for the obligation on the reference
  distribution to publish a rule-coverage matrix.
- AGSC-09-08: The rule did not say which configuration faults are invalid configuration;
  they are the faults of `AGSC-E004`, a configuration file that is not a JSON object and
  `run` and `trace` while `run.enabled` is `false` among them, and the malformed
  `SOURCE_DATE_EPOCH` of `AGSC-E603`; a configuration value that breaks its key's schema is
  a finding with exit 1, as the registry and the reference engine already have it. No
  behaviour changes.
- AGSC-09-09: An absolute or escaping `compose --out` or `conform --to` is refused with
  `AGSC-E902`; the reference engine already refused it, and this rule did not say so.
- AGSC-09-10: A malformed `SOURCE_DATE_EPOCH` is named among the faults answered before a
  verb is resolved; the reference engine already answered it so, and the case `cli-0021`
  pins its exit and code.
- AGSC-09-11: Which members every finding carries, which it carries only when they apply,
  and where a finding with no file sorts were not said.
- AGSC-09-13: The `read` cell said one published item, while the required case `cli-0008`
  and the reference engine have the local server answer a draft; the cell reads one item of
  the Bundle, and the local server's item set is said; nothing a node emits changes.
- AGSC-09-14a: "the stop words the tokenizer drops" contradicted AGSC-06-23, which has no
  stop-word list; the empty `citations[]` of the no-answer result, which `cli-0007` pins,
  was not said, and "every answer" read as including it. The responder was said to use only
  the published exports, while the local tool server and the required case `cli-0008` answer
  from the author's own Bundle, drafts included; the two places it answers from are said;
  nothing a node emits changes.
- AGSC-09-14b: The signature named fewer arguments than the AGSC-09-13 table, without
  `agent`, `model`, `operator` and `origin`; the safe-integer bound both transports apply to
  `usage` was unstated; a failing `sources[]` entry was given two codes, and the sentence
  said its other members were truncated and normalised, where both transports keep
  `resource` and `id` only. The resources were every item, and then only a published item
  named with AGSC-06-30, which AGSC-00-05 reads as the listed set, while the reference
  engine exposes every published item, a retired one included; the set and the bytes of an
  item's resource are said; nothing a node emits changes. The item this rule promises
  conforms to the schema, and the `agent`/`model` condition of AGSC-08-01 is a lint check the
  schema cannot express, so a call with an operator alone under the default origin returned
  an item that `lint` refused; the sentence now says so. No behaviour changes; reporting it
  in the call is listed for 1.1 in AGSC-00-20.
- AGSC-09-15: The second requirement stood in the precedence paragraph of §9.4, without a
  rule id.
- AGSC-09-16: The page's item set was called the published projection, which AGSC-00-05
  reads as the listed set; it is named the listed set, the local server's answer for an item
  a page cannot see is said, and so is where the equality of the two transports holds;
  nothing a node emits changes. The requirement to report one code moved into AGSC-09-15.
  Rows that now name the rules of chapters 01, 03, 05 and 07 citing their codes, each a
  clarification that changes no code and no severity: `AGSC-E202` names AGSC-01-29;
  `AGSC-E203` names AGSC-01-30 and AGSC-05-22; `AGSC-E204` names a file whose stem holds a
  dot and names no primary (AGSC-01-13); `AGSC-E208` says which code a 1.0 tool reports
  instead; `AGSC-E413`, `AGSC-E901` and `AGSC-E506` name the skill-pack uses of AGSC-07-20,
  and `AGSC-E506` names AGSC-03-12 and a folder `index.md` as a folder note. The `remember`
  use added; both transports already reported it. A restricted configuration with no access
  page, and a restricted node's discovery document with no access link, were added, with
  their rule. The extension-surface use named; `bnd-0021` already expected it. The checker's
  use on a restricted node was added; it already reported the four content facts and now
  also a second access link. The parenthesis restates AGSC-11-12 and carries no key word.
  First amended 2026-10-07, see AGSC-10-02; now marked reserved, as no rule raises it. Who
  raises the code at 1.0 was not said. The two flags added; the reference engine already
  refused them. The codes that no case asserts are named, each with its reason; no code and
  no severity changes. The `AGSC-E105` row names, beside a flow mapping or a complex key, a
  frontmatter nested deeper than the engine can read or write back, until a version states a
  bound: `build`, `ci`, `lint --fix` and `import` stopped with an internal error on such a
  frontmatter where `lint` had passed it; every verb now reports this code, the one the
  reader already gave the same input.
- AGSC-09-90: Marked (reference distribution) for the obligation on the reference
  distribution to ship the validators.
- AGSC-09-91: Four faults were added to the list — a table row or a paragraph outside every
  rule that only cites a rule id, a malformed key word, a key word the key-words sentence
  does not list, and a dated note not in the one form.
- AGSC-09-92: Whose CI was not said; the validators check the specification's own artefacts,
  which the reference distribution holds.
- AGSC-09-93: The media type is required in every case, as AGSC-06-07 says; the `Link`
  header replaces only the `profile` parameter, and the sentence had accepted either the
  media type or the header. The check of a restricted node's one access link, which
  AGSC-11-20 requires and the checker did not make, is stated.
- AGSC-09-94: The timeout's value and the vendor name of a kept trace member were not said.

#### §10 Implementation profiles

- AGSC-10-02: The rule listed the Bundle's files among what a Level-0 node serves; it now
  names the routes the node serves and says that the content files are the Bundle the
  Level-0 cases read.
- AGSC-10-08: "publish" read as if a route served the id; the configuration is not a route,
  so the rule says "declare" and names what carries the id.
- AGSC-10-10: Marked (reference distribution) for the obligation on the 1.0.0 distribution
  to ship the implementers' guide.
- AGSC-10-11: Marked (reference distribution) for the obligation on the reference
  distribution's own end-to-end run.
- AGSC-10-13: The expansion of a board slug named only the origin, and an item IRI also
  holds the type folder.
- AGSC-10-15: The rows `bundle-0009` and `bundle-0010` added with their new cases.

#### §11 Boundary

- AGSC-11-04: The sentence said that conformance as a whole MUST NOT differ, which read
  wider than the profile carrier it is about.
- AGSC-11-05: The `no-cache` directive cites RFC 9111. "It MUST send an `ETag`" bound the
  writer for what the host that serves the node does; the rationale for the SHOULD no longer
  leans on the wider reading of AGSC-11-04.
- AGSC-11-08: The IPv4-compatible and IPv4-mapped ranges were "checked as the embedded
  IPv4", which admitted two readings for a mapped public address; both checkers refuse the
  whole ranges, and the rule now says so. "A well-tested library" and "MUST NOT hand-parse"
  could not be tested and are replaced by the result every textual form must give. The
  NAT64, Teredo and 6to4 prefixes were also "checked as the embedded IPv4"; every checker
  refuses each of them whole, an address that embeds a globally reachable IPv4 address
  included, and the rule now says so. No behaviour changes.
- AGSC-11-10: The members of a walk result beyond `partial` were not said.
- AGSC-11-14: The code of an `auto` contribute channel, which `bnd-0011` expects, was not
  named.
- AGSC-11-17: On what terms an extension surface, which AGSC-11-16 admits, may be declared
  was not said.
- AGSC-11-18: The two cases pinned the map "as it is carried in the `server/discover`
  result", a method a transport speaking `2025-11-25` does not serve; they pin it as
  reported under the revision spoken, and the `initialize` branch cites SEP-2133.
  `bnd-0042` replaces the withdrawn `bnd-0035`, whose members for revision `2026-07-28` no
  session under `2025-11-25` can show.
- AGSC-11-20: A restricted node asserts conformance at Level 0, where AGSC-06-08a omits the
  two attributes this rule keeps; which rule wins was not said. The rule asked for exactly
  one access link but named no configuration key for its target, and the configuration
  schema refused one as an unknown key, so no restricted node could carry the link; the
  `access` key, the finding for a restricted configuration without it, and the `agsc-access`
  attribute the link already carried are stated.

#### Amended before `1.0.0-rc.7` and missing from its notes

- AGSC-01-26a: The opening cross-reference named two of the three rules that define the five
  flags.
- AGSC-03-01: The sentence pointed to a document outside the specification for that
  registry.
- AGSC-03-13: The grammar is named as the item schema's, which AGSC-03-02 applies; the
  sentence had pointed at AGSC-03-02 alone.
- AGSC-07-05: The trace bracket named AGSC-03-17, a reserved id with no rule.
- AGSC-08-23: The recomputation writes the verifier's own trailing entry, AGSC-08-20a, so
  another implementation or version reported a correct file as `AGSC-E702`.
- AGSC-08-26: The limit was stated only in a planning document outside the specification.
- AGSC-08-29: "T9" is named as the threat row of the security considerations document; the
  rule had cited it bare.
- AGSC-11-07: The mutual check is run by `tools/validate-wellknown --peer` (AGSC-09-93); the
  sentence had named a `verify --peer` flag the verb table does not define.

### Fixed

- Importing from a skills repository (`import --from skills`), an old site
  (`import --from old-site`) or a GABBE kit (`import --from gabbe`), and `skills import` of a
  skill pack, now read each frontmatter line, entry heading and dated state line in linear
  time. Before, one long line that ended in a carriage return, U+2028 or U+2029 could stall
  the import for minutes. The imported result is unchanged.
- `init` reads an adopted note's title in linear time; a long heading line ending in a
  carriage return or U+2028 no longer stalls it. The titles are unchanged.
- The Harness check that no file carries an `allowed-tools` key (AGSC-07-15) runs in linear
  time, in the command line and on the compose page. A long run of line feeds no longer
  stalls it.
- `run` reads a fence opener's info string in linear time.
- The archive name of `--zip` and of the compose page's "download all" link drops a
  folder's trailing slashes in linear time. The name is unchanged.
- `build`, `ci`, `lint --fix` and `import` stopped with an internal error on a frontmatter
  nested deeper than the writer could hold, where `lint` had passed it; every verb now
  reports `AGSC-E105`, the code the reader already gives the same input. No limit is added:
  an input that passed before passes unchanged.
- The conformance runner: the cases whose boolean members were asserted in one polarity
  only are asserted in both, so a case that states the other value fails. The shipped
  cases keep their statuses.
- Documentation corrected against the rules: the assistant guide (§4) and the Mode 1 guide
  say that `remember` needs `agent` and `model` too, unless the call says `"origin": "human"`,
  or the saved item fails `agsc lint` with `AGSC-E202` (AGSC-08-01); the publishing guide
  (§6) says how a node served on the author's own machine is checked at Level 2
  (`http://localhost:8080/` in `site.base` and on the command line, with `--dev`), and the
  Mode 0 guide points to it; the troubleshooting page gains a row for `AGSC-E603`, where an
  empty `SOURCE_DATE_EPOCH` counts as unset; `NOTICE` and the README's licence table name
  the agent skill under `skills/` and `plugins/` and the plugin marketplace files under
  `.claude-plugin/` as CC0-1.0.

### Security

- `agsc-host` can no longer be pointed outside the Bundle through `build.out`, from any
  configuration layer, and `serve` refuses a request for a foreign `Host` (a page that
  rebinds a name to the loopback address).
- The ledger's `Signed-off-by` reading and the other slow patterns listed above took
  quadratic or worse time on hostile input (one commit with 100 KB of `<` made `build` take
  close to a minute); each is now a linear scan, and the security corpus covers them.
- The address classifier refuses the IPv4-compatible and IPv4-mapped IPv6 ranges whole.
- The security corpus (`security-floor-v4`) gains two seeded cases for deep frontmatter nesting (`build`,
  `import --from okf`); each finishes under `AGSC-E105` or passes, never with an internal
  error.

## [1.0.0-rc.7] - 2026-10-08

### Upgrading from 1.0.0-rc.6

Nothing here asks a node operator to change content that conforms: every change below
is a defect fix against a rule that already stood, a clarification, or documentation.
A Bundle that declares `spec_version: 1.0.0-rc.6` keeps building, because a reader
accepts any Bundle of the same MAJOR (AGSC-00-15).

**What `lint`, `build` and `ci` may now refuse or warn about** (each was already
outside the rules; the engine now says so):

- `build.out` naming `content/`, `dist/` or a path under either: `AGSC-E204`
  (AGSC-01-19) — whether it is set in `agsc.config.json`, through `AGSC_BUILD_OUT` or in
  a `.env` file in the Bundle folder; an environment value is also held to the key's
  grammar, as the project file already was.
- `site.base` or a peer address carrying a path: `AGSC-E204` from the configuration
  schema; at 1.0 a node occupies a whole origin (AGSC-01-19, AGSC-06-07).
- the development placeholder `site.base` (`http://localhost…`): the warning
  `AGSC-E506` on every run until it is replaced (AGSC-01-19).
- a folder with `agsc.config.json` and no `content/index.md`: `AGSC-E901`.
- a frontmatter or configuration string that is not well-formed Unicode (a lone
  surrogate written as an escape): `AGSC-E108` from `lint` too, with its file and key.
- a frontmatter key named `__proto__`: `AGSC-E204`, and a `prov` it used to hide is
  reported missing (`AGSC-E501`); the same name in the configuration: `AGSC-E004`.
- `--level` other than `0`, `1`, `2` or `3` on `build`, `ci` and `conform` (`02` and
  `2.0` included): `AGSC-E003`, exit 2.
- a value outside the bound table of AGSC-11-01: one `AGSC-E209` each; the chunk
  maximum was not checked before, and `attachments`, `budget` and the federation
  parameters were refused under other codes.
- a `trace` record whose Episode fails the item schema: `trace` writes nothing.
- the `remember` tool, local or in the page: arguments outside the item schema (a
  title shorter than 3 or longer than 120 characters, an `at` that is not an instant,
  an unknown `outcome` or `severity`) are refused with their code; a `kind` outside
  `concept`, `episode`, `lesson`, `procedure` and `task` is `AGSC-E203` (it was filed as
  a concept), and an `about` that names no item is `AGSC-E301` (AGSC-09-14b).
- the `compose` tool, local or in the page: a `selection` that is not an array is
  `AGSC-E201` (it was read as the empty selection and answered `valid: true`,
  AGSC-09-13a); `agsc compose` with no slug and no `--from` is `AGSC-E003`, exit 2, and
  writes nothing (it wrote an empty Harness).
- an authored `.well-known/security.txt` whose `Contact:` value is not an RFC 9116 contact
  URI (a bare e-mail address or telephone number, an `http:` address): `AGSC-E204`, and
  `/.well-known/security.txt` is not emitted (AGSC-06-36). Write `mailto:`, `tel:` or
  `https://`.
- `tools/validate-wellknown`: a document whose anchor is on another origin than the one
  it was fetched from, a fetched response over its byte cap and a response that does not
  complete within the deadline are `AGSC-E907`; the Python checker does the same.
- `tools/validate-wellknown` given a URL now reads the response headers of the discovery
  document and of every same-origin public file it fetches, and checks the cross-origin
  rule (AGSC-11-03) and the caching rule (AGSC-11-05): a missing header or value is
  `AGSC-E202` and a forbidden one `AGSC-E201`, errors at Level 2 and above and warnings
  below (AGSC-09-93). The Python checker mirrors the check. A node built with rc.6 on the
  reference host fails it at Level 2 (no `Access-Control-Expose-Headers` on the discovery
  document and the other machine files) until it is rebuilt with this version.

**What changes in the files a build writes:**

- a retired item keeps its page, `/pages/<slug>.md`, `/pages/<slug>.jsonld` and its
  place in the three graph views with `asc:retiredAt`; it stays out of the search index,
  `/llms.txt`, the chunks, the skill packs and the index pages (AGSC-00-05);
- `_headers` holds one block per address pattern, carrying every header of that address
  (AGSC-06-17): rc.6 wrote fourteen addresses in two blocks each, and the reference host
  served only one of them, so the discovery document and thirteen other machine files went
  out without `Access-Control-Expose-Headers`;
- the page-tool script carries the argument check of the `remember` tool and the
  refusals of the two tools above; the `ask` tool's description says that it returns the
  descriptions of the best-matching items and calls no model;
- the default stylesheet (`/assets/site.css`) draws a diagram at least 42rem wide on a
  narrow screen (no label under 12 px at 390 px), gives the search field, its button and
  the theme switch a border of 3:1 contrast, lets table cells wrap, no longer shrinks an
  error-code reference twice, colours the engine's diagram accent, prints dark on white
  with wrapped code, and gives rule chips and source addresses 24 px targets; every
  diagram figure carries `tabindex="0"`, so the keyboard reaches its scrolling box;
- the specification version stamped in the built files is the new version's.

**Expected differences in the built files.** Three Bundles as they stood at `1.0.0-rc.6`
(the reference fixture `tests/fixtures/minimal`, the demo `examples/demos/mode-2-project` and
the demonstration node `agsc-demo-node`) were built with `1.0.0-rc.6` and with this version at
one `SOURCE_DATE_EPOCH`. Every file present in one build is present in the other, and every
difference is one of these:

| File | What changes | Why |
|---|---|---|
| `graph.nq`, `graph.ttl`, `graph.jsonld`, `/pages/*.jsonld`, `/llms.txt`, `/llms-full.txt`, `/now.md`, `/skills/*/SKILL.md`, `/compose/agsc-core.js`, `/compose/agsc-compose.js`, `/search/agsc-search.js` | the specification version, `1.0.0-rc.7` | the version stamp (AGSC-04-25, AGSC-06-15) |
| `/.well-known/knowledge-linkset` | `agsc-spec-version`, and the `digest`, bundle hash and ledger head of the files that changed | derived from the files above (AGSC-06-08) |
| `/now.md`, `/now/` | the fingerprint | derived from the graph |
| `/skills/index.json` | the digest of each `SKILL.md` | derived from the packs |
| `/ledger.jsonl` (a Bundle with git history) | the build entry's actor `process:agsc/1.0.0-rc.7` and its hash | the version stamp (AGSC-08-20a) |
| `_headers` | one block per address pattern; the same headers on the same addresses | AGSC-06-17 |
| `/assets/site.css` | the stylesheet changes listed above | the accessibility fixes |
| an item page that holds a diagram | `<figure class="diagram" tabindex="0">` | the keyboard reaches the diagram's scrolling box |
| `/compose/agsc-page-tools.js` | the argument checks of `remember` and `compose` | AGSC-09-13a, AGSC-09-14b |
| `/compose/webmcp.js` | the description of the `ask` tool | the description says what `ask` returns |

**What changes on the command line:** `compose --emit` with a registered target this
distribution does not ship is `AGSC-E203`, exit 1 (it was `AGSC-E001`); `run` and `trace`
refused because `run.enabled` is false print their envelope under `--json`; under
`--json` standard error carries findings only; `verify --ledger` without a git-log
file exits 2; the two wrapper commands print registered codes as `agsc` does. `init`
says "before you publish" when `LICENSE-CONTENT` is missing, and names each note outside
`content/` that it left as it is because the note already has a frontmatter block.

**What to do.** Install the new version; run `agsc ci` in each Bundle and fix what it
reports; rebuild and deploy, because the digests in the discovery document change with
the bytes; then check the deployed node with
`node node_modules/agentic-system-core/tools/validate-wellknown https://<your-node>/.well-known/knowledge-linkset --level 2`.
At `1.0.0` itself, the vocabulary version moves from `1.0.0-draft.1` to `1.0.0`, so the
`@context` address in `graph.jsonld` and the versioned `/ns/` route change once more
(AGSC-05-09, AGSC-05-25); the pre-release vocabulary copy stays served.

### Added

- The Internet-Draft `draft-besleaga-agentic-knowledge-wellknown-00` was posted to the IETF
  Datatracker on 2026-09-30 as an individual Internet-Draft.
- `bench/queries/bench-v2`, the committed retrieval query set: twelve new intents for the
  demonstration node, each answered by an item that node publishes, and the eight intents
  for the main node unchanged. It replaces `bench-v1`, whose intents for the demonstration
  node named items that node no longer publishes; the two sets are not comparable.
- The agent skill `skills/agentic-system-core/` (`SKILL.md` and two reference files, CC0-1.0):
  it teaches a coding agent to use the engine in all six modes, and what it never does on its
  own. The same files ship as a Claude Code plugin in `plugins/agentic-system-core/`, listed by
  `.claude-plugin/marketplace.json`; `tests/docs/agent-skill.test.js` keeps both copies equal and
  every verb they name real. Neither is part of the npm package.
- `package.json`: `mcpName` (`io.github.andreibesleaga/agentic-system-core`, the name under which
  the tool server can be listed in the MCP Registry once a version carrying it is published) and
  seven search keywords.
- `server.json`, the entry for the MCP Registry (schema `2025-12-11`): the npm package
  `agentic-system-core` run as `agentic-system-core mcp <bundle_path>` over stdio, under the
  name `mcpName` gives and at the npm version. It is published to the registry by the
  maintainer and is not part of the npm package; `tools/release` reports a `server.json`
  whose name or version differs from `package.json` and writes its version under `--apply`.
- Six short guides, one per mode, in `docs/guides/` (and on the main site under
  `/docs/guides/`): who each mode is for, what you get, the complete files you write and
  the commands with the lines they print; `tests/docs/guides.test.js` runs every guide
  on every change. The npm package now ships `docs/guides/`.
- Three test cases that the engine already passed: `cli-0018` (the tool server's resource
  list, one resource read, an unknown resource and the one prompt, AGSC-09-14b),
  `cli-0019` (the seven tools with exactly the arguments of the table of AGSC-09-13) and
  `disc-0021` (the Level-2 discovery document with and without the boards link,
  AGSC-06-08; Level 2 in the table of AGSC-10-15). The Python checker runs `disc-0021` too.
- `tests/arch/context-fitness.test.js`: no bounded context loads a module by a computed
  name, reaches the network, the random generator, the locale, the clock, a timer or the
  global object — seven rules of the architecture documents that no test enforced.

### Changed (specification, for 1.0.0)

- **AGSC-04-16 amended.** `graph.nq` is this specification's own canonical form, not the
  canonical N-Quads of RDFC-1.0: for a blank-node-free dataset the two hold the same quads
  and differ in four ways of writing a term (the explicit `xsd:string` of a plain literal,
  lowercase hex in `\u` escapes, `\u0008`/`\u000c` for backspace and form feed, U+007F
  written as itself). The rule no longer requires the claim "equal to RDFC-1.0 output for
  blank-node-free datasets", which was untrue, and forbids it; AGSC-04-15 names the form as
  the specification's own. No byte of `graph.nq` and no Bundle hash changes;
  `tests/knowledge/nquads-rdfc-differences.test.js` checks the four differences against an
  RDFC-1.0 implementation.
- **AGSC-02-94 amended.** `ci` exits 0 after `init` once the publisher has added the security
  contact of AGSC-06-36; without it `ci` reports `AGSC-E901`. The rule had said "immediately
  after `init`". Vector `adopt-0006` is withdrawn (its runner had replaced `ci` by a schema
  check); `adopt-0007` and `adopt-0008` run the real `init` and `ci`. The test-case format
  gains `input.after_init[]` for the files a publisher adds between the two verbs.

- **Conformance made exact.** AGSC-10-15 lists the cases that sit in a lower Level's
  areas but test a higher Level's behaviour (five belong to Level 1, nine to Level 2,
  thirteen to Level 3); a claim at a lower Level neither runs them nor fails for them, and
  `agsc conform --level <n>` selects by that list. AGSC-09-01 is now the one complete list
  of what a claim states (the implementation, the Level, the full `spec_version`, the cases
  run and passed, the Unicode version, the deployment profile, the declared surfaces, the
  checker used); AGSC-00-12 points to it. AGSC-02-92 places adoption's transformations at
  Level 2 and its `init`/`ci` run at Level 3.
- **Severity of every error code.** The registry of §9.4 has a Severity column; codes whose
  severity depends on the context (`AGSC-E108`, `AGSC-E204`, `AGSC-E401`, `AGSC-E402`,
  `AGSC-E407`) name each context. No severity changes. `tools/validate-spec` reads the new
  column and still reads the three-column form of an older text.
- **Text written for a release candidate.** AGSC-05-25 and AGSC-05-09 say what the
  vocabulary version is from `1.0.0` on (`1.0.0`, changed later only when a term changes);
  AGSC-10-05 no longer promises a future claim; AGSC-00-16 says a release's tag is its
  immutable copy and the chapters are amended in place with dated notes; AGSC-10-08 drops a
  SHOULD no node could follow; the status line of `spec/11-boundary.md` no longer names a release candidate.
- `docs/IMPLEMENTERS-GUIDE.md` gains the per-Level checklist AGSC-10-10 requires, and names
  Level 3 and the Level-1 areas as the specification does; `docs/CONFORMANCE-STATEMENTS.md`
  gives a claim sentence with every element of AGSC-09-01.

- **Contradictions settled** (each rule amended with a dated note):
  - the `memory://` alias is resolved by the tool server and the command line at Level 2
    and above (AGSC-05-04, AGSC-05-04a, AGSC-00-20); no node is ever required to emit it;
  - a fenced block marked `export` is reserved and never extracted (AGSC-02-22): case
    `graph-0003`, which expected a blank-node error from such a block, is withdrawn and
    replaced by `graph-0027`, run with the real `lint` and `build`;
  - the closure's tie-break is the breadth-first walk's own order (AGSC-07-04, new case
    `compose-0017`);
  - an agent lane's Episode names its instruction bundle in a source entry the schema
    accepts (AGSC-08-28(d));
  - the automatic merge uses the separate merge credential (AGSC-08-02);
  - the versioning rule's neighbours follow it: a MINOR may raise a bound, never lower one
    or change a default (AGSC-11-01); the refused-address list is the one exception and
    concerns fetches (AGSC-11-08); a new well-known suffix is a MINOR with a redirect
    (AGSC-06-07); configuration is the one exception to a reader's tolerance (AGSC-00-15);
    an unknown frontmatter key in a node's own Bundle stays a warning (AGSC-00-21);
  - "ignore and preserve" gains rows for unknown enumeration values, a second top-level
    member of a discovery document and unknown plain target attributes (AGSC-00-21), and
    "link-shaped" is defined (AGSC-03-03);
  - case `adopt-0005`, which said adoption leaves `ci` green although its references stay
    broken, is withdrawn and replaced by `adopt-0009`, run with the real `init` and `ci`.
- **What byte-identity needs, written down** (each rule amended with a dated note):
  - the discovery document's links: AGSC-06-08 has a table of every link, when it is
    present and which links carry `digest`; new case `disc-0020` states three whole
    documents (public and restricted at Level 2, public at Level 0);
  - the shape of `graph.jsonld` and of each per-item `/pages/<slug>.jsonld` (AGSC-05-09):
    two members, one node per subject in `@id` order, term names from the published
    context, the most compact value form, one value never an array; an item's own file
    holds the triples whose subject is the item, so a cluster's membership stays in the
    cluster's file; new case `graph-0028` states four whole files;
  - the tool server's tools with their arguments and results (AGSC-09-13), and every verb
    with its flags (AGSC-09-07); `AGSC-E002` also covers a positional argument a verb does
    not define; under `--json` standard error carries findings only, after the one
    `{"override": …}` object per override that `ci` writes first (AGSC-09-10, AGSC-09-12,
    AGSC-01-37);
  - the minimum page policy: the directives every page's `Content-Security-Policy` contains
    (AGSC-06-17);
  - the minimum detection sets of the injection scan (28 phrases), the secret scan (key
    blocks, provider prefixes, assignments and placeholders) and the personal-data scan
    (e-mail and telephone shapes; a bare run of digits is not a number) — AGSC-08-13,
    AGSC-08-15, AGSC-08-16; the provenance header a writer adds to `/llms.txt` is not
    scanned; new cases `lint-0032` and `lint-0033`, both Level 3;
  - the ledger's trailing `build` entry names its builder, so it — and the head — are the
    one part of `ledger.jsonl` that differs between implementations or versions
    (AGSC-08-20a, AGSC-04-24); its `ref` is the `content/` tree id of HEAD, an input beside
    the git-log file. A builder-independent entry is planned for 1.1.
- **Clarifications for 1.0.0** (each rule amended with a dated note):
  - a discovery document whose anchor is not on the origin it was retrieved from is not
    that node's document (AGSC-06-08); a validator reports `AGSC-E907`;
  - at 1.0 a node occupies a whole origin: `site.base` and peer addresses carry no path
    (AGSC-01-19, AGSC-06-07; the configuration schema refuses a path — no build with one
    could succeed);
  - the well-known suffix is not registered: the posted Internet-Draft asks for it and no
    request has been sent to the registry (AGSC-06-07);
  - the Profile URI is registered in the IANA Profile URIs registry, RFC 7284 (AGSC-06-07,
    AGSC-06-25);
  - the first-run path names the build instant: `init`, the security contact, one commit or
    a set `SOURCE_DATE_EPOCH`, then `ci` (AGSC-02-94, as AGSC-06-24 already said);
  - no version's scope includes an ingest stub or channel adapters, and the reference engine
    ships none (AGSC-00-20); the scaffold requirement is served only by the files `init`
    writes (AGSC-00-18);
  - `Repr-Digest` only on a response served without a content coding (AGSC-06-17); the
    `digest` attribute is described without a reference RFC 9727 does not support
    (AGSC-06-10); a note on `derived-from` naming an Episode under PROV-O (AGSC-02-16);
  - "published" and "listed" items are defined once (AGSC-00-05): a retired item is
    published and not listed;
  - a case skipped for an undeclared surface is reported as `pass` (AGSC-09-02); a version
    in expected output stands for the tool's own (AGSC-09-05); the fixture Bundle the test
    cases use is part of the definition (AGSC-00-01);
  - lists made equal between copies: the federation parameters (AGSC-01-18, AGSC-11-06),
    the `agsc-` attributes (AGSC-06-10, AGSC-00-21), the edges that never affect a
    composition (AGSC-07-10), the `prov` keys, the files opened to other origins
    (AGSC-11-03), the `AGSC-E209` and `AGSC-E907` rows;
  - eight wrong references corrected, `--dev` and user configuration stated (AGSC-09-09,
    AGSC-09-93), the review flag read from the process environment only (AGSC-01-37);
  - the route set names every route once (AGSC-06-01), the `mcp` surface's target and when
    it is declared (AGSC-11-16), `/changelog/` as derived (AGSC-06-18), no `Optional`
    section in `/llms.txt` (AGSC-06-13), redirects from `aliases[]` (AGSC-06-04), a cluster
    page listing at most 500 members (AGSC-06-21), Node 22.13 (AGSC-10-11).
- **The wrong-code family, in the rules.** AGSC-01-14: a frontmatter or configuration string
  that is not well-formed Unicode (a lone surrogate written as an escape) is `AGSC-E108`,
  from `lint`, `build` and `ci` alike, with its file and key. AGSC-09-08: a git history too
  shallow to derive the ledger (`AGSC-E703`) exits 2, as AGSC-08-20a and the registry
  already said. AGSC-00-20 names the code of a registered `compose --emit` target whose
  rendering a distribution does not ship, `AGSC-E203`; vector `cli-0009` is withdrawn for
  `cli-0016`. AGSC-09-94: `run` and `trace` refused because `run.enabled` is false print
  their envelope under `--json`, as AGSC-09-10 requires; `cli-0013` is withdrawn for
  `cli-0017`. AGSC-00-05 names the index pages among what a retired item leaves. The
  registry rows of `AGSC-E108`, `AGSC-E203` and `AGSC-E901` say the same.
- **Inputs a rule already excluded, in the rules.** AGSC-01-19: `build.out` does not name
  `content/` or `dist/` or a path under either (`AGSC-E204`); the grammar alone admitted
  them, and a build with `"out": "content"` wrote the site into the source tree.
  AGSC-09-09: `--level` on `build`, `ci` and `conform` is `0`, `1`, `2` or `3`, and any other
  value is `AGSC-E003` with exit 2. AGSC-08-20b: a commit message is data, and a git-log
  producer that separates records with characters a message can contain does not conform.
  The registry row of `AGSC-E001` states the second meaning the engine already gave it, at
  exit 1: a form of a known verb the running distribution does not provide, and a case it
  does not pass in the `conform` report; the rows of `AGSC-E003` and `AGSC-E204` name the
  new cases.
- **The two tools and the security contact, in the rules.** AGSC-09-13a: a `compose` call
  whose `selection` is not an array is `AGSC-E201`. AGSC-09-14b: `remember` refuses every
  `kind` outside its five with `AGSC-E203`, and an `about` that names no item with
  `AGSC-E301`. AGSC-06-36: a `Contact:` value that is not an RFC 9116 contact URI is
  `AGSC-E204` and the route is not emitted. The registry rows of `AGSC-E201`, `AGSC-E203`,
  `AGSC-E204` and `AGSC-E301` name the cases.
- **Headers, in the rules.** AGSC-06-17: in `_headers` each address pattern is written once,
  as one block carrying every header the address takes, because the reference host serves
  only one of two blocks written for the same pattern. AGSC-09-93: given a URL,
  `validate-wellknown` also checks the response headers of the rules on cross-origin reading
  (AGSC-11-03) and caching (AGSC-11-05) on the discovery document and on every same-origin
  public artefact it reads — a missing header or value is `AGSC-E202`, a forbidden one
  `AGSC-E201`; errors at Level 2 and above, warnings below. The registry rows of both codes
  name the case.
- **Settled after the verification of this candidate** (each rule amended with a dated note):
  AGSC-02-92 names the path AGSC-02-94 states — the security contact and a build instant
  (one commit or `SOURCE_DATE_EPOCH`) — instead of promising a passing `ci` without the
  instant; `docs/SPEC.md` item 22 says the same. AGSC-04-24 excepts the `digest` of the
  discovery document's ledger link from cross-implementation byte-identity, beside the ledger
  head it already excepted. AGSC-10-02 no longer says that a Level-0 item without a
  provenance block inherits it from `bundle.operator` with `AGSC-E508`: AGSC-08-01, the
  required case `fm-0004` and every implementation report `AGSC-E501`, and `AGSC-E508` stays
  registered and is raised by no 1.0 rule (whether a later version admits the inheritance
  is a 1.1 question); the engine's uncalled inheritance function is removed. The `AGSC-E001`
  row lists exactly the forms of a known verb that take the code, adds the tool server's
  answer to an unknown tool name, and points the forms other rules give another code to
  `AGSC-E203` and `AGSC-E003`. The `AGSC-E201` and `AGSC-E202` rows carry the severity
  AGSC-09-93 gives a response-header check below Level 2 (a warning). AGSC-00-25 cites
  `cli-0016` in place of the withdrawn `cli-0009`, and `docs/SPEC.md` cites `graph-0012` in
  place of the withdrawn `graph-0003`. Dated notes are added where a reworded rule had none:
  AGSC-01-18, AGSC-01-26a, AGSC-03-13, AGSC-07-05, AGSC-08-29, AGSC-11-07, the `prov` row
  of the common keys and the error-table rows changed for this version.

### Changed (documentation)

- `docs/MEASUREMENTS.md` and `docs/measurements.json`: every one of the nine layers measured
  again on this version's tree, with the security corpus at 113 cases (94 faults, 94 stopped
  under the code their rule names); the request, MCP, install and cold-start figures measured
  the same day.
- The tool server's protocol revision is stated as it is: `agsc mcp` speaks MCP
  revision `2025-11-25` and advertises the extension identifier in its `initialize`
  result; revision `2026-07-28`, where the identifier travels in `server/discover`, is the
  target the rules name, and moving the server to it is planned for 1.1
  (`docs/PROTOCOLS.md`, `docs/RELATED-WORK.md`, `docs/SPEC.md`, `docs/PLAN.md`).
- `docs/RELATED-WORK.md` re-checked against its sources: the AI Catalog, the Agent Skills
  well-known index and the MCP Skills extension added; the Agentic Resource Discovery row
  rewritten from its own text; the `llm-context` registry request recorded as withdrawn;
  the WebMCP report date and the IETF working-group states updated with their dates; the
  knowledge draft described as an individual Internet-Draft there, in the README and in
  `internet-draft/README.md`.
- `docs/PROTOCOLS.md`: `graph.rdf` is not one of the graph views at 1.x, and
  `security.txt` is the publisher's own file. `docs/SPEC.md`: REUSE is not claimed, WCAG
  2.2 AA is checked by automated tooling and not claimed, and the RFC 6906 row names the
  tests that prove it.
- `docs/PRD.md` notes say what was delivered at 1.0 for `init` (PRD-009), channels
  (PRD-056), the scope cells that Amendment 6 does not reach, and seven other statements;
  `docs/PLAN.md` gains the addendum "The tree as shipped at 1.0"; `docs/USE-CASES.md` D3
  names the build test for peer citations; `docs/ROADMAP.md` names version 1.1 and says
  "dependency order".
- `SECURITY.md` names the two programs that touch a network (`agsc-host serve`,
  `tools/validate-wellknown`) and says which versions are supported after `1.0.0`;
  `CONTRIBUTING.md` says where an accepted change lands after `1.0.0`; `docs/PLUGINS.md`
  says which direction of a channel the 1.0 hook covers and that no responder ships; the
  README says which programming names the 1.x promise covers and points at the upgrade
  notes above.
- Dated drafting notes are removed from the public documents, and `src/REFERENCE.md`
  describes the engine as it is.
- `docs/RELATED-WORK.md` says that the profile URI is registered in the IANA Profile URIs
  registry (one sentence still said the registration was to be requested).
- `docs/IMPLEMENTERS-GUIDE.md` §7 states the claim as AGSC-09-01 now defines it (the full
  `spec_version`, not MAJOR.MINOR), the one exception to "a skip is a failure", and quotes
  AGSC-10-05 as amended; §1c lists `disc-0021`, and a test holds §1c equal to the table of
  AGSC-10-15.
- `ask` is described as what it does — it returns the descriptions of the best-matching
  items with their addresses, or exactly `no answer in this memory`, and calls no model —
  in `docs/USING-WITH-ASSISTANTS.md`, `docs/PRD.md` and `docs/DEMOS.md`.
- The agent skill's setup names the build instant (one commit or `SOURCE_DATE_EPOCH`) as
  its fourth step, and says that `run{}` lists a procedure's steps under an allow list.
- The folder `README.md` files that travel in the npm package (`docs/`, `tests/`,
  `tests/bin/`, `tests/conformance/`, `tests/knowledge/`, `tests/ontology/`, `tools/`) link
  to the repository for the 42 documents the package does not ship; a test checks every
  packed Markdown file.
- The note on PRD-045 says that the per-release archive deposit is the Zenodo record of
  each final release (1.0.0 and later), and that release candidates get none.
- `docs/plain/` says that a cluster's description is its authored summary, and
  describes the agent lane as a typed question, a threshold and a recorded judgment.

### Fixed

- `tools/release --version` compares two pre-releases of the same version by SemVer 2.0.0
  precedence: `1.0.0-rc.7` is greater than `1.0.0-rc.6` (it was refused as "not greater",
  so a release candidate could not be bumped by the tool).
- The command line now resolves `memory://<bundle-id>/<slug>` and this node's https item
  IRI wherever it takes an item name (`compose`, `compose --from`, `propose`, `run`), as
  AGSC-05-04b requires and the tool server already did; another Bundle's alias is refused
  with `AGSC-E309`.
- `lint`, `build` and `ci` now report the development placeholder `site.base`
  (`http://localhost[:<port>][/]`) as the warning `AGSC-E506` on every run until it is
  replaced, as AGSC-01-19 requires; only `init` reported it before, once (found by
  `adopt-0007`).
- `agsc ci` reported one wrong finding (`AGSC-E601`, "value of type undefined is not
  JSON") in place of every real one whenever a finding had no line number: a valid Bundle
  holding a folder `README.md` failed `ci`, and `ci` outside a Bundle did not say that
  `agsc.config.json` is missing. Every finding now carries `col`, `file` and `line`
  (AGSC-09-11), in `ci`'s gate file and in every verb's output envelope; the input was
  always refused, only the reported code was wrong. In the security corpus, the
  symlinked-item case is now refused under `AGSC-E902`, as its rule names.
- A fault seen by both the lint lane and the build lane of `agsc ci` was printed twice;
  each fault is now counted once (AGSC-09-11).
- `bench/parity.js` counted the one difference AGSC-09-16 requires between the two tool
  transports — a `remember` call that declares no operator — as unequal; it now checks
  that difference by its shape and reports it apart (`required_difference`).
- The determinism layer of `bench/measure.js` also compared the input files copied beside
  each build and reported 56 files compared; it now compares the 49 output files only.
- `bench/a11y.js` resolves the folder it serves, so a folder given with `..` in its path
  is no longer served as empty.
- `docs/MEASUREMENTS.md` and `docs/measurements.json`: every layer measured again on
  2026-10-02; figures that were out of date are corrected (§1–§9 and the summary table).
- The engine's discovery checker now checks each `rel#surface` link as
  `tools/validate-wellknown` and the Python checker do (AGSC-11-16): an `llms-txt` or
  `chunks` link carrying `agsc-surface-version`, an `mcp` link without one, or an
  `llms-txt` link not aimed at `/llms.txt` is `AGSC-E210`.
- `verify --ledger` no longer reports `AGSC-E702` for a published ledger that differs from
  its own recomputation only in the builder named on the trailing `build` entry; such a
  file is held to its own chain and the published head (AGSC-08-23).
- The injection scan reads at most 1 MiB of UTF-8 bytes, as AGSC-08-13 says, and never
  splits a character; it counted UTF-16 units before. Its blob finding says 256 characters,
  the threshold it applies, not 128.
- Notes a verb prints are no longer written to standard error under `--json`
  (AGSC-09-10).
- The engine's two readers of other nodes' discovery documents (the mutual check and the
  federation walk) and both checkers skip a document whose anchor is on another origin
  (AGSC-06-08).
- Every value outside the bound table of AGSC-11-01 is one `AGSC-E209` — `attachments` and
  `budget` were reported only as the schema's `AGSC-E201`, a federation value as both, and
  the chunk maximum was not checked.
- `tools/count-artifacts`, `tools/validate-vectors` and the vector runner read the declared
  version from its declaration line, so they accept `1.0.0` as well as a release candidate.
- Documentation corrected against the rules: the implementers' guide (the ten stamping
  places, the reservation value, the default build instant, the pattern attachment rule),
  `docs/SPEC.md` (federation in eight parts, the profile registration, `-0`, the boundary rules'
  trace row), the plain guides (retired items, Levels, federation, registrations), the
  glossary's retired line, the test-case README.
- `build` dropped a retired item's page, its per-item copies and its graph entry, against
  AGSC-11-22; a Bundle in which another page linked the retired item failed its build with
  `AGSC-E901`. The item now keeps its page (with the retirement notice), `/pages/<slug>.md`,
  `/pages/<slug>.jsonld` and its place in the three graph views with `asc:retiredAt`, and
  stays out of the search index, `/llms.txt`, the chunks, the skill packs, `agsc-counts` and
  the index pages.
- A fault that stops a build is reported beside every finding gathered before it: `build`
  said only `AGSC-E601` for an attachment entry without `media_type` (now its `AGSC-E202`)
  and for a lone surrogate in a title or in the configuration (now `AGSC-E108` with file
  and key, which `lint` reports too); a fault thrown part-way through `build` or `ci` no
  longer discards the findings already gathered.
- The two wrapper commands, `agentic-system-core` and the alias package `agsc-cli`, and
  `require('agentic-system-core').run()` print a registered code as `bin/agsc.js` does: a
  malformed `SOURCE_DATE_EPOCH` is `AGSC-E603` and exit 2, not an internal error with a
  stack trace and exit 1.
- Catch blocks that replaced a specific fault: a directory or an unreadable file where an
  item was expected is `AGSC-E901` with the system's reason, not "not valid UTF-8"; `trace`
  reports a path outside the Bundle as `AGSC-E902`, not as a JSON fault; a verb module or
  an adapter that fails to load keeps its reason; the tool server passes a registered
  code through instead of `AGSC-E901`.
- `verify --ledger` with no git-log file exits 2 with `AGSC-E703` (it exited 1).
- `compose --emit <target>` for a registered target this distribution does not ship is
  `AGSC-E203` (it was `AGSC-E001`, the unknown-verb code); the refusals of `compose --emit`
  and `refresh --agent` without `--dry-run` no longer name a milestone or a release.
- `run` and `trace` refused because `run.enabled` is false print their envelope on standard
  output under `--json` (still exit 2, `AGSC-E004`).
- One broken body reference is one finding: `build` reports it as `AGSC-E310` on the item's
  own file, as `lint` does, instead of `AGSC-E901` on the page, and `ci` reports it once.
- The acceptance scenario "Re-running init over an adopted and built Bundle changes
  nothing" runs: a second `init` skips the build output, `dist/` and `content/assets/` and
  counts the slugs already under `content/` as taken (AGSC-02-91); it was listed as pending.

- `build.out` naming `content/` or `dist/` is refused (`AGSC-E204`) instead of writing the
  site into the source tree — also when the value comes from `AGSC_BUILD_OUT` in the process
  environment or from a `.env` file in the Bundle folder, which were only type-checked and
  built into `content/` or into the Bundle root with exit 0; a string set through an
  environment layer is now held to the key's schema grammar as well.
- The release workflow's two npm publish steps do nothing when that exact version is already
  on the registry, so a re-run after a half-done publish (the engine out, the alias not)
  finishes the alias through the same lane, with provenance.
- A test holds the three tools that read the declared specification version
  (`tools/count-artifacts`, `tools/validate-vectors`, the conformance runner) to a copy of
  the distribution that declares `1.0.0`.
- Closed lists answered the names of `Object.prototype` members: `export --steer --target
  constructor` wrote a file named `function Object() { [native code] }`, `export --to board
  --format toString` exited 0, and `export --to constructor` and `import --from constructor`
  ended in an internal error. Each is now refused as any unknown name is; an imported status
  or outcome word of that shape is no longer a table hit.
- `--level` on `build` and `ci` is checked as on `conform` (`AGSC-E003`, exit 2); `--level -1`
  built a site and `--level 9` was ignored.
- A directory with `agsc.config.json` and no `content/index.md` is `AGSC-E901` in `lint`,
  `build` and `ci`; it linted and built clean.
- `trace` checks the Episode against the item schema before writing it and writes nothing
  when it fails (a `tokens_in` of `1e999` became `Infinity`, which the next build refused).
- The `remember` tool of the local tool server checks its arguments as the page tool does:
  a `kind` named after a prototype member is not a kind, a `sources` that is not a list no
  longer throws into the transport, and a title outside 3–120 characters, an `at` that is not
  an instant, an `outcome` or `severity` outside its list, an `operator`, `agent` or `model`
  outside its grammar and a `usage` member of the wrong type are refused with their code
  instead of returning an item that fails the schema. The page tools run the same function.
- `tools/validate-wellknown` holds each fetch to one deadline per response (it was an idle
  timeout a slow server could keep resetting), reports a fetched response over its cap as
  `AGSC-E907` as AGSC-11-10(f) says (it said `AGSC-E904`, which stays the code of a local file
  over 1 MiB), and caps targets other than the discovery document at `federation.max_bytes`'
  default (32 MiB) instead of 1 MiB.
- `build` wrote the cross-origin pair and the content type of fourteen addresses of `_headers`
  in two blocks each — the discovery document, the three graph files, `llms.txt`,
  `llms-full.txt`, the chunk and search files and their shards, the ledger, the per-item
  copies and `/now.md` — and the reference host served only one of them, so these files went
  out without `Access-Control-Expose-Headers` (AGSC-11-03). Each address is now one block.
- `tools/validate-wellknown` given a URL now checks the cross-origin and caching headers
  (AGSC-09-93 above); before, a node that served none of them passed.
- `tools/validate-wellknown` printed Node's `MaxListenersExceededWarning` before its verdict
  when it read more than ten files from one host: it waited for a `connect` event on a
  kept-alive socket that had already connected. A reused socket is now checked at once.
- Continuous integration: every gate step of the release workflow (`npm audit`, the
  requirements matrix, the counting tool, every validator, the Level-1 fixture check,
  `tools/release`, the cleanliness check and the architecture lane under `AGSC_AUDIT=1`) also
  runs on every push, on the same six legs, so a release tag is never the first time a gate
  runs; a test fails if the two workflows drift apart.

### Security

- A commit message could forge a ledger entry: the git-log read split records on the
  control characters RS, US and GS, which a message may contain, so one commit could add a
  second entry with another actor, `kind: release` and a commit id that does not exist, and
  its tag fed the content version. Records are now separated by NUL, which git never prints
  from a message; a message holding US is also kept whole (it was cut short).
- A frontmatter key named `__proto__` set the prototype of the copied frontmatter, so a
  `__proto__: {prov: …}` block hid a missing `prov` from `lint` and `build` and the page was
  published with no provenance. The key is now an own key: the missing `prov` is
  `AGSC-E501` and the key a malformed name (`AGSC-E204`).
- A `__proto__` member in `agsc.config.json` or the user configuration wrote into
  `Object.prototype` of the engine process. The merge skips `__proto__`, `constructor` and
  `prototype`; `lint` reports the key as `AGSC-E004`.
- The personal-data check was quadratic on a long run of e-mail local-part characters (an
  item with a 200,000-character run cost 65 s of `lint`, 0.9 s now). It now searches from each `@`, in linear time,
  and finds exactly what the pattern found; the board export's redaction uses the same scan.
- `git` ran with the Bundle repository's own configuration, so a `.git/config` that came with
  a downloaded folder ran its `core.fsmonitor` command during `lint`. Every git call now
  switches `core.fsmonitor` and `log.showSignature` off; `SECURITY.md` says that the rest of
  a Bundle's `.git` is trusted input.
- The npm publish job, which can mint an identity token, installs with `--ignore-scripts`.
- `@modelcontextprotocol/sdk` 1.30.1 → 1.32.1 (advisory GHSA-6qxp-vccf-f47h, in the SDK's
  OAuth client, which the engine does not use). The tool server speaks the same protocol
  revision, `2025-11-25`.

## [1.0.0-rc.6] - 2026-09-29

**First public release candidate.** Everything below is part of this first public
version; there is no earlier public version to compare it with.

### What the release contains

- **The specification, `1.0.0-rc.6`** (`spec/`): twelve chapters of numbered rules —
  the Bundle and its six item types, fourteen typed Links, canonical forms, the graph,
  the published surfaces, composition, governance, conformance, the four Levels and
  the node boundary — with three JSON Schemas (`schema/`), an OWL 2 RL vocabulary
  (`ontology/`), and expected-byte conformance vectors (`tests/vectors/`). Counts are
  derived by `node tools/count-artifacts --json`: 343 rule ids (332 active, 11
  reserved), 91 error codes and 52 vocabulary terms.
- **The reference engine** (`agentic-system-core` on npm, with the short alias
  `agsc-cli`): the `agsc` command line, which lints a Bundle, builds it into a static
  knowledge node — pages, a graph in several RDF views, a search index, text files for
  agents, chunks and one discovery document at
  `/.well-known/knowledge-linkset` — composes items into a Harness, imports and
  exports other formats, and serves the node to an assistant through a local MCP tool
  server; the same seven tools also run inside every published page.
- **The nine independent checkers** (`tools/`): seven validators and two generators
  that anyone can run against any distribution of the format, with no import from the
  engine (AGSC-09-90).
- **The site**: agenticsystemcore.com, with the specification's pages, the profile
  page and the namespace pages the vocabulary's identifiers resolve to.
- **The Python package** (`agentic-system-core` on PyPI, `1.0.0rc6`): the discovery
  checker, the conformance-vector runner and a small reading API in pure Python, for a
  machine with no Node.
- **The Internet-Draft** (`internet-draft/`), which describes the discovery document
  and requests registration of its well-known suffix.

### Added in the last checks before the tag

- Item pages show each reference as a full citation: author, year, title and address.
- The per-item JSON-LD file, `/pages/<slug>.jsonld`, keeps the item's Links.
- The `/compose/` page has a filter box over its items, shows the warnings of a
  composition with their codes, and says what to do when nothing is selected.
- Each diagram's arrowhead marker has its own id, so several diagrams on one page
  keep their own arrows.
- Diagram labels stay readable on a phone: a diagram keeps a minimum drawn width and
  scrolls inside its frame.
- `agsc export --to mermaid` draws the typed Links of the published items as Mermaid
  diagrams, one per item and one per cluster.
