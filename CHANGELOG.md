# Changelog

All notable changes to AgenticSystemCore: the specification, its schemas, ontology
and conformance vectors, and the reference engine that implements them. The
specification carries its own version (`spec_version`); from this release on, a rule
changed by a later version also carries a dated amendment note in `spec/`
(AGSC-00-16).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
