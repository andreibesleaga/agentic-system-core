# Changelog

All notable changes to AgenticSystemCore: the specification, its schemas, ontology
and conformance vectors, and the reference engine that implements them. The
specification carries its own version (`spec_version`); from this release on, a rule
changed by a later version also carries a dated amendment note in `spec/`
(AGSC-00-16).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
