# Implementers' guide — writing a second implementation

**Summary.** This guide is for someone who wants to write their own AgenticSystemCore
implementation in their own language. You need two directories: `spec/` and
`tests/vectors/`. You do not need to read the reference engine, and this guide never
asks you to. It tells you what to read first, where the bytes are pinned and why,
how to run the vector set and the nine validators against your own output, what this
specification deliberately leaves to you, and how to state which Level you reached.

The specification is the truth. Where this guide and a rule differ, the rule wins.
Every statement below names the rule it comes from.

**Who this is for:** an implementer in another language, or a publisher turning an
existing site into a node. **Read after:** [SPEC-ORIENTATION.md](SPEC-ORIENTATION.md).
**Read next:** [CONFORMANCE-STATEMENTS.md](CONFORMANCE-STATEMENTS.md).

**Node is not a prerequisite.** Nothing in this guide requires Node.js or any part of
this distribution's code. The reference checkers under `tools/` (Node 22.13 or later)
are a convenience: a conformance claim may instead rest on your own run of
`tests/vectors/**` in any language, reported as AGSC-09-02 and AGSC-09-03 say
(AGSC-10-11). Both routes are described in §5a.

---

## 1. What you are implementing

A **Bundle** is a folder of Markdown files with YAML frontmatter, plus one
`agsc.config.json` (AGSC-01-01…04). An implementation reads a Bundle and emits a
fixed set of files: HTML pages, four RDF views, a search index, a discovery
document, two text dialects for agents, and a few more (AGSC-06-01). The whole point
is that two implementations given the same Bundle emit the same bytes
(AGSC-04-01/02), so a reader can check any node's output against any other's.

There are four Levels (AGSC-10-01…06). Each is a set of obligations and a set of
vector areas. You pick one and claim it.

| Level | What it is | Rule |
|---|---|---|
| 0 | Publisher — four artefacts, valid I-JSON, no canonical form required | AGSC-10-02 |
| 1 | Reader — parse, validate, resolve links | AGSC-10-03 |
| 2 | Writer/Exporter — every surface, canonical bytes, import and export | AGSC-10-04 |
| 3 | Full engine — composition, governance (provenance gates, the four lints, channels), the command line and the tool server | AGSC-10-05 |

Start at Level 1. It is the smallest useful thing, it needs no emission, and the
vector areas it runs (`frontmatter`, `slug`, `bundle`, `jcs`, `discovery`, `links` and
`lint`, less the cases AGSC-10-15 assigns to a higher Level) are the ones that catch the
mistakes everything else is built on. Section 1c lists what each Level runs.

## 1a. A Level-0 node in ten steps, from any stack

*(AGSC-10-10, AGSC-10-11.)* Level 0 is static files that any CMS,
wiki or static-site generator can export (AGSC-10-02). No engine is needed. Each step
names what proves it: a rule, the vectors of an area you can run in your own language,
and the reference checker if you want a ready-made one.

| # | Step | Rule | Proved by |
|---|---|---|---|
| 1 | Choose the site base: one absolute `https:` URL. Every item IRI is the base, the type folder and the slug, with a trailing slash | AGSC-05-01 | the `graph` vectors; `validate-wellknown --level 0` checks the anchor |
| 2 | Give every piece of knowledge a slug: lowercase letters, digits, single hyphens, at most 64 characters, unique | AGSC-01-10 | the `slug` vectors |
| 3 | Export each piece as `content/<type-plural>/<slug>.md` with a YAML block carrying at least `type` and `title`; `prov` is inherited from the Bundle at Level 0, with a warning | AGSC-02-01, AGSC-10-02 | the `frontmatter` vectors; any JSON Schema 2020-12 validator with `schema/item.schema.json` |
| 4 | Write `content/index.md` with `spec_version`, `okf_version`, `title`, `description` and `base`, and no `type` | AGSC-01-04 | the `bundle` vectors; `schema/bundle.schema.json` |
| 5 | Publish `/graph.jsonld`, the JSON-LD view of the items | AGSC-05-09 | any JSON-LD 1.1 processor: it must expand without error |
| 6 | Publish `/llms.txt` in the fixed byte layout | AGSC-06-13, AGSC-06-13a | vector `disc-0013` (compare bytes) |
| 7 | Publish `/.well-known/knowledge-linkset`: a link set whose only member is `linkset`, one context anchored at the base, no digests at Level 0 | AGSC-06-07, AGSC-06-08a | vector `disc-0004`; `tools/validate-wellknown <file> --level 0` |
| 8 | Serve it as `application/linkset+json` with the profile parameter, or with a `Link: …; rel="profile"` header | AGSC-06-07, AGSC-11-04 | `validate-wellknown <url> --level 0` over HTTPS |
| 9 | Put `<link rel="describedby" href="/.well-known/knowledge-linkset" type="application/linkset+json">` in every page's head, and serve public files with `Access-Control-Allow-Origin: *` | AGSC-06-25, AGSC-11-03 | read the served headers; the Level-0 procedure's checks on the project's site |
| 10 | Run the Level-0 cases — the areas `frontmatter`, `slug`, `bundle` and `discovery`, less the cases AGSC-10-15 assigns to a higher Level (section 1c) — and publish your claim with the elements AGSC-09-01 lists | AGSC-10-01, AGSC-10-02, AGSC-09-01 | your own runner's report (AGSC-09-03); [CONFORMANCE-STATEMENTS.md](CONFORMANCE-STATEMENTS.md) |

`tests/e2e/level-0-without-engine.test.js` does exactly this with a few lines of code
and no engine, and passes the shipped checker.

## 1b. Mapping an existing platform

*(AGSC-10-10.)* How the constructs of common platforms map onto items,
frontmatter keys, Links and Clusters. It is guidance, not a rule: where a platform
offers a richer relation, `related` is always a safe default (AGSC-03-19), and a
link written in the body becomes an untyped *mentions* edge.

| Platform | Page → item | Categories / sections → Cluster | Tags → `tags` | Links in the body | Page metadata → frontmatter |
|---|---|---|---|---|---|
| MediaWiki | each article → a `concept` (a how-to page → `procedure`) | a category → a `cluster`; membership written as `clusters[]` on each item | a small set of categories → `tags` (two to five) | `[[internal links]]` → mentions edges; a "see also" section → `related` | last editor and revision → `prov.operator`, `modified` |
| WordPress | a post or page → a `concept` or `episode` | a category → a `cluster` | post tags → `tags` | links between posts → mentions edges | author → `prov.operator`; published and modified dates → `date`, `modified` |
| Docusaurus, MkDocs, Hugo | each Markdown file → an item (the files already carry frontmatter) | a sidebar group, section or directory → a `cluster` | the generator's tags or taxonomies → `tags` | relative Markdown links → mentions edges | the existing `title`, `description`; unknown keys kept as `x-<vendor>-` keys (AGSC-02-05a) |
| Notion, Confluence (export) | an exported page → an item; a database row → an item, a `task` concept when the database is a board | a parent page or a space → a `cluster`; a board database → a board | multi-select properties → `tags` | page mentions → mentions edges; a relation property → `related` or `blocked-by` | created by, last edited → `prov`, `modified`; the `board` adapter reads Notion database CSV exports |
| Obsidian, Logseq | each note → an item | a folder or a map-of-content note → a `cluster` | `#tags` → `tags` | `[[wikilinks]]` → mentions edges | note properties → frontmatter keys; unknown ones kept as `x-` keys |
| A Django, Laravel or Rails application | each record a public page shows → an item, written by a small export command | a model's category field → a `cluster` | a tag relation → `tags` | foreign keys that mean "depends on" → `requires`; others → `related` | owner and timestamps → `prov`, `date`, `modified` |

Whatever the platform, the export writes the files of §1a and nothing more. `agsc init`
adopts a folder of bare Markdown with no mapping at all (AGSC-02-90…93), if you would
rather start from the files than from the platform.

## 1c. The per-Level checklist

*(AGSC-10-10, AGSC-10-15.)* What each Level must implement, which cases it runs, and how to
check. A Level includes everything of the Levels below it (AGSC-10-06). How many cases a
Level runs is printed by `agsc conform --level <n>`, or by your own runner; it is never
typed here, because a later version adds cases.

| Level | The rules it implements | The cases it runs | Check with |
|---|---|---|---|
| 0 — Publisher | items with the required frontmatter (spec/02), `content/index.md` (AGSC-01-04), slugs (AGSC-01-10, AGSC-01-11), `/.well-known/knowledge-linkset` in the Level-0 form (AGSC-06-07…12, AGSC-06-08a), `/graph.jsonld` (AGSC-05-09), `/llms.txt` (AGSC-06-13…15); valid I-JSON, no canonical bytes (AGSC-04-04) | areas `frontmatter`, `slug`, `bundle`, `discovery` | `agsc conform --level 0`, or your own runner; `tools/validate-wellknown <url> --level 0` on the published node |
| 1 — Reader | + reading any conforming Bundle: the frontmatter contract, the slug grammar, the fourteen Links with their computed inverses, orphans and cycles (spec/03), the error codes and their severities (§9.4) | + areas `links`, `lint`, `jcs` | `agsc conform --level 1` |
| 2 — Writer | + deterministic emission (spec/04), the four graph views (spec/05), the route set with search, the NOW page, the ledger and the discovery link (spec/06, AGSC-08-20…24), export and import (AGSC-01-22…29) | + areas `graph`, `build`, `adopt`, `ledger`, `import`, `export`, `skills`, `chunks`, `boards`, `boundary` | `agsc conform --level 2`; `tools/validate-wellknown <url> --level 2` on the published node |
| 3 — Full engine | + composition (spec/07), governance (spec/08), the command line and the tool server (spec/09) | every area | `agsc conform --level 3` |

**Cases that belong to a higher Level.** Some cases sit in an area a lower Level runs but
test what only a higher Level does — a writer's refusal, an agent lane, a Level-2 digest,
the four lints, the `init` and `ci` verbs. AGSC-10-15 lists each with the Level it
belongs to: `bundle-0001`, `bundle-0006`, `bundle-0007`, `disc-0005` and `disc-0019` belong
to Level 1; `bundle-0008`, `disc-0009`, `disc-0012`, `disc-0015`, `disc-0016`, `disc-0017`,
`disc-0018`, `disc-0020` and `lint-0026` to Level 2; `bundle-0003`, `bundle-0004`, `bundle-0005`,
`lint-0001`, `lint-0002`, `lint-0003`, `lint-0028`, `lint-0029`, `lint-0032`, `lint-0033`, `adopt-0007`,
`adopt-0008` and `adopt-0009` to Level 3. A claim at a lower Level neither runs them nor fails for them.

**What the claim states.** The implementation and its version, the Level, the full
`spec_version`, the areas and how many cases ran and passed (every failed one by id), the
Unicode version of the runtime, for a published node at Level 2 or 3 its deployment
profile, every surface it declares with what proves it, and the checker used if it was not
your own — the list of AGSC-09-01; the wording is in
[CONFORMANCE-STATEMENTS.md](CONFORMANCE-STATEMENTS.md).

---

## 2. Reading order

Read these in this order. Each one assumes the ones before it.

1. **`spec/00-overview.md`** — the model, the six item types, the version rules
   (AGSC-00-04, AGSC-00-09…11, AGSC-00-14…16, AGSC-00-20), and **§0.6**, which is the one place that states what a reader and a writer must do
   across versions: what to ignore and preserve (AGSC-00-21), what must survive a
   round trip (AGSC-00-22), what you may not emit for a version you do not claim
   (AGSC-00-23), the closed list of eight plugin kinds (AGSC-00-24) and the names
   reserved to 1.1 (AGSC-00-25). Read §0.6 before you write a reader: it is the
   difference between refusing a document you could have read and running with half
   of it silently dropped. Twenty-five minutes.
2. **`tests/vectors/README.md`** — the vector file format. Read it before you read
   any vector; the members and their meanings are pinned in AGSC-09-04/05/06.
3. **`spec/01-bundle.md` and `spec/02-item.md`** — the file layout, the closed
   configuration (AGSC-01-18), the frontmatter keys, the YAML subset you must accept
   and the constructs you must refuse (AGSC-02-02). Run the `frontmatter` and `slug`
   vector areas while you read these; they will fail until your parser is right, and
   that is the fastest feedback you will get.
4. **`spec/03-links.md`** — the fourteen Link keys, the computed inverses, the
   cycles. Run the `links` area.
5. **`spec/04-canonicalization.md`** — the byte rules. §4 below is about this one.
   Run the `jcs` area.
6. **`spec/09-conformance.md`** — the CLI contract, the error-code registry
   (§9.4) and the diagnostics envelope (AGSC-09-11). Every finding you
   ever emit uses a code from that table; AGSC-09-15 forbids inventing one.
7. **`spec/10-implementation-profiles.md`** — the Levels, and AGSC-10-15, which says
   which vector areas each Level runs.

Then, only for Level 2 and above: `spec/05-graph.md` (the four RDF views),
`spec/06-surfaces.md` (the route set and the byte layouts), `spec/07-composition.md`
(the closure algebra and the Harness), `spec/08-governance.md` (provenance, the
ledger, channels), `spec/11-boundary.md` (federation, visibility, the tool surfaces).

`docs/GLOSSARY.md` names every term in one place. `docs/plain/` says the same things
in shorter sentences, and is the right place to send a colleague who is not
implementing anything.

---

## 3. Running the vector set

The vectors are the acceptance test. `node tools/count-artifacts --json` reports how
many there are, how many of the 25 areas AGSC-09-04 declares are populated, and how
many are `required`, `optional` and `withdrawn`. Run the command for the numbers;
never type them.

A vector is one JSON file holding one object: `id`, `area`, `rule`, `level`,
`description`, `input`, `expected`, and optionally `options`, `reason`, `note` and
`requires_surface` (AGSC-09-04). Your runner:

1. reads every file under `tests/vectors/<area>/`;
2. skips a vector whose `level` is `withdrawn` — it counts for nothing, in either
   direction (AGSC-00-16, AGSC-09-05);
3. skips a vector whose `requires_surface` names a surface your node does not
   declare, and counts it as passed (AGSC-09-04): a Level-2 writer is never held to
   a Level-3 surface;
4. runs every other vector of the areas your Level declares, and reports `pass`,
   `fail` or `skip` per id. **A `skip` counts as a failure for a required vector**
   (AGSC-09-02);
5. prints one summary line and writes the report of AGSC-09-03.

Three things about `expected` that are easy to get wrong:

* A **negative** vector carries `error` whose value is a code, never a message
  (AGSC-09-05). Compare codes. Message text is deliberately unspecified so that you
  can localise it.
* Where `expected` carries a string — `output`, `nquads`, `stdout`, `llms_txt` —
  compare **bytes**, not values. That is the whole point of those vectors.
* A `findings[]` entry asserts a **subset** of members. Your finding may carry more.

The vector files are UTF-8, LF, NFC and I-JSON, with members in JCS order, and they
"MUST be consumable without executing any code from this repository" (AGSC-09-06) —
so read them with your language's own JSON parser and nothing else. One exception is
stated in the rule: an `input` string whose non-NFC form is the subject of the case
(`jcs-0005`, `lint-0022`) must NOT be normalised on load.

Start with `tests/fixtures/minimal/`, a three-item Bundle that every part of the
specification touches. If your implementation can lint it clean, you have a Level-1
reader.

---

## 4. The byte-level pitfalls

This is where second implementations diverge, so it is worth being slow here. Every
one of these is a rule, and every one has at least one vector.

**Canonical JSON is RFC 8785 (JCS), with one addition.** AGSC-04-05 and AGSC-04-06:
every JSON artefact is JCS-canonical. AGSC-04-21 adds that strings are normalised to
**NFC first**, and then canonicalised. Member names sort by **UTF-16 code unit**,
which is RFC 8785's rule and is *not* code-point order — they differ above U+FFFF,
and `build-0003` exists because of it. Do not write your own canonicaliser if a
tested RFC 8785 library exists for your language; if you must, the `jcs` vector area
is where you will find out.

**Length is counted in Unicode code points, everywhere.** AGSC-02-24: `title` 3–120,
`description` 40–200, `when` ≤1024, port names ≤64. Not UTF-16 code units, not
grapheme clusters, not bytes. Ordering (above) and length (here) use different units
on purpose, and the rule says so.

**Everything is NFC, LF, and ends in exactly one newline.** AGSC-01-14 and
AGSC-04-07. A byte-order mark is a finding (`AGSC-E108`), a CRLF is a finding, two
trailing newlines are a finding. AGSC-04-23 caps a combining sequence
(`AGSC-E607`) — normalisation of an adversarial string must not be able to blow up.

**Authored single-line strings carry no line break.** AGSC-02-24
lists the members (`title`, `description`, every `tags[]` value, `prov.agent`,
`site.title`, …) that must not contain a C0 control, U+007F, U+0085, U+2028 or
U+2029; a violation is `AGSC-E204`. **And a writer must neutralise them as well**,
replacing each with one U+0020, because validation is not always in the path — an
imported Bundle, a channel contribution and an agent-lane proposal all reach a writer
from outside. `/llms.txt`, `/now.md`, `robots.txt`, `_headers` and every `SKILL.md`
are line-oriented: a newline inside an interpolated title forges a new line there.
Vector `fm-0010`.

**Six byte-level facts that are easy to miss.** A port that misses one emits different
bytes for the same Bundle, so each is named here with the rule that fixes it.

1. **The provenance header ends with an `assistance:` line.** AGSC-06-15 puts `assistance:` as the last
   line of the AGSC-06-13a block, immediately before `-->`. It is a CONSTANT of the
   specification, never authored and never configured, and it is carried by every
   file that carries that header — `/llms.txt`, `/llms-full.txt`, a skill pack, a
   steer bundle, a Harness file, the `llm-context` skim view. Vectors `disc-0013`
   and `disc-0014`.
2. **`-->` inside an interpolated value becomes `--&gt;`.** AGSC-06-13a names the
   replacement; a writer that neutralised it some other way emits different bytes for
   the same authored value, and the authored value itself is `AGSC-E204` at lint.
3. **`robots.txt` carries one group per named crawler.** AGSC-06-18: one
   `User-agent: <token>` + `Disallow: /` per product token of `site.tdm_crawlers[]`,
   in configuration order, **before** the `User-agent: *` group, and no `Disallow`
   for any other token. A node publishing `tdm-reservation: 1` — every node under the Content Use Terms;
   a node under another licence publishes `0` and no crawler group (AGSC-06-18) — with an
   empty or absent list fails its build with `AGSC-E202`. No rule pins the
   whole file's bytes, and vector `disc-0012` asserts the groups rather than the
   bytes.
4. **An inline body link emits a triple.** AGSC-05-27: one `asc:mentions` per ordered
   pair of items, whatever the number of references between them; none for a
   self-reference; no computed inverse. This moves `graph.nq`, `graph.ttl`,
   `graph.jsonld`, the per-item `.jsonld` and therefore the bundle hash of every
   node that has an inline body link. Vector `graph-0025`.
5. **`/ns/context.jsonld` names each term one way.** AGSC-06-32 pins the
   term NAMES, not only the mapping: an `asc:` term is named by its local name,
   always; an external property by its local name, or by its compact IRI where that
   local name is also an `asc:` term name or is shared by two external properties.
   The file is a constant of the specification and a node's copy must equal it byte
   for byte. A Level ≥ 2 writer serves the versioned copy at
   `/ns/<ontology-version>/context.jsonld` as well, byte-identical. Vector
   `graph-0019`.
6. **`/assets/<path>` is a route.** AGSC-06-01: every file under
   `content/assets/` that a PUBLISHED item's body references is emitted at that path
   relative to `content/assets/`, with the authored file's bytes, and the body's
   reference is rendered as that route.

**Sort orders are stated per artefact, and they are not all the same.** Findings sort
by `(file, line, col, code)`, code-point (AGSC-09-10). Canonical N-Quads lines sort
code-point (AGSC-04-15, AGSC-05-31/32). JSON member names sort UTF-16 (AGSC-04-05).
`llms.txt` sections sort by cluster slug and items by slug within them
(AGSC-06-13a). The composition verdict has five different orders, one per member
(AGSC-07-09). Read the rule; do not assume.

**The Turtle and N-Quads writers are pinned and blank-node-free.** AGSC-05-08: a
blank node in an RDF export is `AGSC-E605`. Canonical N-Quads is the `toRDF` line set
sorted code-point-wise, with plain literals typed `xsd:string` (AGSC-05-31/32).
`graph.jsonld` must survive the round trip of AGSC-06-32: expanding it with the
published `/ns/context.jsonld` and re-compacting must reproduce it byte for byte.

**Digests are SHA-256 over the emitted bytes.** In the discovery document each one is
carried in the RFC 9530 syntax `sha-256=:<base64>:` as a one-element array
(AGSC-06-08, AGSC-06-10). The ledger's chain hash is the SHA-256 of the 64 ASCII
bytes of the previous hash followed by the JCS form of the entry **excluding its own
`hash`**, and the first entry's `prev` is 64 zeros (AGSC-08-22).

**The build instant comes from `SOURCE_DATE_EPOCH` and from nowhere else.**
AGSC-04-09/10/11: no wall clock, ever, in any code path that reaches an emitted byte.
A malformed `SOURCE_DATE_EPOCH` is `AGSC-E603` and exit 2 — a configuration fault,
never a finding. With no value the instant is the time of the last commit, and only
where no git history exists is it 0, with the warning `AGSC-E606` (AGSC-04-09). This is what makes `verify`'s double build meaningful: build twice,
compare bytes, and any difference is `AGSC-E602` (AGSC-09-14).

**Error codes are a closed set.** `AGSC-E<nnn>`, nothing else; the hundreds
digit is the area (§9.4). Where two codes could name one fault, the more specific one
wins, and §9.4's **Precedence** paragraph states exactly which. Two conforming
implementations report the same code for the same input, and that is checkable.

---

## 4a. Deriving and stamping the content version (Level 2 and above)

**AGSC-04-25** (`spec/04-canonicalization.md` §4.9) gives a
Bundle one short, human-readable name for the state a build published, `bundle_version`.
It is **derived at build, never authored, never stored and never incremented** — a
static build keeps no state between runs, so a counter of its own could not be
reproduced — and its two inputs are ones your build already has: the git-log file of
AGSC-08-20b and the build instant of AGSC-04-09.

**Derive it once per invocation**, in one function, and hand the string to everything
that stamps it. The first branch that applies wins, where *the built commit* is the
last element of the git-log file:

1. the `tag` of the built commit, when it carries one;
2. otherwise `<tag>+<n>.g<hash>` — the newest earlier tagged element, the number of
   elements after it up to and including the built commit, and the first **twelve**
   lowercase-hexadecimal characters of the built commit's `sha`. Twelve is fixed by
   the rule: git's own abbreviation length depends on the clone, so `git describe`
   would make two clones of one repository derive two different versions;
3. otherwise `0.0.0+<n>.g<hash>` when no element carries a tag;
4. otherwise `0.0.0+<instant>`, the build instant written `YYYYMMDDThhmmssZ` —
   AGSC-04-10's form with its separators removed, because `:` is outside the grammar.

The grammar is `^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$`. A git tag outside it is not a
content version: treat the commit as untagged **for this rule alone**, fall to the
next branch, and report `AGSC-E506` naming the tag. The ledger is unaffected and
still takes `kind: release` from that same tag (AGSC-08-20a).

**Stamp it in exactly these ten places**, and nowhere else (the table of AGSC-04-25):

| where | how |
|---|---|
| `/.well-known/knowledge-linkset` | the attribute `agsc-bundle-version`, one value, on the anchor's `describedby` link beside `agsc-bundle-hash` (AGSC-06-08); omitted at Level 0 (AGSC-06-08a) and on a `restricted` node (AGSC-11-20) |
| `/now/` and `/now.md` | the pinned line `content version …, built at …, fingerprint …, specification …` (AGSC-06-22) |
| every agent-facing digest | the `bundle_version:` line of the provenance header, between `spec_version:` and `generated_at:` (AGSC-06-13a, AGSC-06-15) — which carries it into `/llms.txt`, `/llms-full.txt`, the language-model context export, every `export --steer` target and every `AGENTS.md`/`SKILL.md` a Harness emits, for free (AGSC-01-29) |
| `/chunks.jsonl` | the `bundle_version` member of the shard manifest, where sharding produced one (AGSC-06-31) |
| `/skills/index.json` | the `bundle_version` member of the index object (AGSC-07-19) |
| a Harness | the `bundle_version` member of `harness.jsonld` (AGSC-07-12); the seven file kinds stay seven |
| `export --markdown` / `--okf` | the `bundle_version` key of `content/index.md`, beside `spec_version` (AGSC-01-26) — the one derived key of an otherwise byte-preserving export |
| `export --jsonld` / `--jsonl` | **nowhere**: both are byte-identical to the graph of the same build and may not invent a member the graph does not carry (AGSC-01-27) |
| `/changelog/` | a versions list, one row per git-log element carrying a `tag`, oldest first: the tag, that element's `committed_at` date and its `sha`. It comes from the git-log file and **not** from `ledger.jsonl`, because a 1.0 ledger entry carries `kind: release` and the commit reference but not the tag's name (AGSC-08-21) |
| the archive of a multi-file result (`--zip`) | the file name `<directory>-<bundle_version>.zip`; the archive's content is unchanged (AGSC-04-25, AGSC-07-13a) |

Two things to get right. **A browser host cannot derive it**: a page has no git
history, so AGSC-07-13's byte-identity between a CLI Harness and a page Harness holds
only if the page is *given* the value, exactly as it is given the build instant. And
the content version is **not an input to any digest**: `bundle.hash` is the hash of
`graph.nq` (AGSC-04-15) and nothing here adds to it, so re-tagging unchanged content
changes the published version and not the fingerprint. That is the property that
makes the two worth publishing together.

An `import` records where each written item came from: `prov.source_version` is the
source's content version and `prov.source_hash` its bundle hash, each **omitted when
the source publishes neither** — never invented (AGSC-01-22, AGSC-08-01).

Vectors: `build-0014` (all four branches, the unusable tag and the NOW line),
`disc-0013`/`disc-0014` (the header line in the two agent-facing files),
`disc-0015` (the discovery attribute at three visibilities) and `imp-0002` (the
import record and the newer-source refusal).

---

## 5. Checking your own output

Nine command contracts check the normative artefacts and the output of any node
(AGSC-09-90). You may run this distribution's implementations of them, or write your
own with the same names, the same flags, the same envelope and the same codes; a
conformance claim names which it ran.

| Tool | What it checks | Rule |
|---|---|---|
| `validate-spec` | the specification's own consistency — duplicate and unresolved rule ids, code closure, trace brackets, version literals | AGSC-09-91 |
| `validate-schemas` | `schema/*.json` against JSON Schema 2020-12 and the closed keyword subset | AGSC-02-24 |
| `validate-ontology` | `ontology/agsc.ttl` — OWL 2 RL-safe, blank-node-free, the SKOS integrity conditions | AGSC-05-22 |
| `validate-vectors` | the vector files' own format | AGSC-09-90 |
| `validate-wellknown` | **your node's discovery document**, at a Level; `--peer` runs the mutual check of AGSC-10-12 over two local files, with no network | AGSC-09-93 |
| `validate-features` | the scenario pack and its requirement tags | PRD-054 |
| `validate-diagrams` | the diagram pack and its staleness | PRD-054 |
| `gen-spec-html` | renders `spec/` to HTML; `--check <dir>` compares a published tree byte for byte | AGSC-09-90 |
| `gen-ns` | derives `/ns/` from the ontology; `--check <dir>` audits a built one | AGSC-06-32 |

Each answers `--json` with the AGSC-09-11 envelope, `verb` set to its own name, and
exits 0 pass / 1 fail / 2 usage. So the check you actually run against your own
build is:

```
your-engine build
node tools/validate-wellknown <your-out>/.well-known/knowledge-linkset --level 2 --json
node tools/gen-ns --check <your-out>/ns
```

`validate-wellknown --level 2` recomputes every `digest` against the bytes on disk,
so it is the cheapest end-to-end proof that your emission is internally consistent.

Every checker, `validate-spec` included, exits 0 on this distribution's own tree.

## 5a. Two routes to a claim

*(AGSC-10-11.)* **Route one — your own runner.** Read the vector files
with your language's JSON parser (AGSC-09-06), run the areas your Level names, and
write the report of AGSC-09-03. Nothing from this distribution runs. **Route two — the
reference checkers.** Run `tools/validate-wellknown` and the other checkers above on
your output with Node 22.13 or later. Either route supports a claim; a claim says which
it used (AGSC-09-90). Neither is a certification.

## 5b. Querying across nodes

*(AGSC-11-13.)* A node's query surface is its published dumps, and a
consumer federates on its own side: download the dumps, load them together, query.
No node fetches another, and no node answers queries. In `graph.nq` every triple sits
in a named graph whose name is the node's Bundle IRI, so loading two nodes' files into
one dataset keeps them apart. This SPARQL 1.1 query counts the Concepts of every node
loaded, with the node it came from:

```sparql
PREFIX asc:  <https://w3id.org/agentic-system-core/ns#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?node (COUNT(?item) AS ?concepts)
WHERE {
  GRAPH ?node { ?item a asc:Concept ; skos:prefLabel ?label . }
}
GROUP BY ?node
ORDER BY ?node
```

Run over the `graph.nq` files of the project's two nodes (the specification's own site
and the patterns node, built on 2026-09-24) with any SPARQL 1.1 engine — for example
Python's `rdflib` 7.1.4, `Dataset().parse(file, format="nquads")` once per file — it
answered one row per node: 12 Concepts on the first and 10 on the second. Every result
taken from another node is untrusted until you check it, and carries its origin: the
graph name (AGSC-11-11).

---

## 6. What is implementation-defined

The specification is deliberately silent about these, and your choices here cannot
make you non-conforming.

* **The diagram compiler.** AGSC-01-07 and AGSC-02-13 describe a diagram DSL and its
  compiled SVG; no rule pins the SVG bytes. A compiled `.svg` must not be committed
  (AGSC-01-07), and an image attached to a concept of `kind: pattern` must be SVG
  (AGSC-02-98; any other image type there is `AGSC-E412`). How you draw it is yours.
* **Three of the four forge enforcement files.** AGSC-08-12 pins the bytes of
  `status-checks.json` and of nothing else. `pre-commit`, `CODEOWNERS` and
  `ruleset.json` are house style; two conforming engines will differ, and no vector
  can pin them.
* **A steer bundle's layout.** AGSC-01-28 pins the eleven target paths, the closed
  source set and the obligations of AGSC-01-29. It does not pin the bytes.
* **A published skill pack's layout.** AGSC-07-19/20 pin the pack's `name`,
  `description` bound, licence and lockfile. They do not pin the `SKILL.md` body.
* **Every diagnostic message's text.** Only codes are asserted (AGSC-09-05,
  AGSC-09-13a). Localise freely.
* **The HTML.** AGSC-06-19 requires the Schema.org JSON-LD and `sitemap.xml`
  ordering; the page markup itself is yours, within the budgets of AGSC-06-21.
* **Two configuration keys the reference engine accepts and preserves without acting
  on them.** `site.analytics_token` (AGSC-01-18) is carried for a host's own
  analytics; the reference engine emits nothing for it. `channels[].rate.per_hour`
  (AGSC-01-30) binds a channel adapter that is written; the reference engine ships no
  channel adapter at 1.0, so nothing enforces it there. A second engine may act on
  both.
* **Everything a rule marks OPTIONAL or MAY**, including `/graph/fragments/**`
  (AGSC-06-33), memory adapters (AGSC-01-26a) and the two opt-in verbs `run` and
  `trace` (AGSC-09-94), which "may not be required by any conformance Level".

Adapters are the one place where you must document rather than choose silently:
AGSC-01-26a requires a memory adapter to be "listed with its claimed key set in the
distribution's implementer documentation". This distribution's adapters are
`llm-context` and `mermaid` (export), `okf` and `old-site` (import), and `cogx`, `gabbe`,
`skills` and `board` (both ways), and `src/interchange/README.md` lists what each one
claims.

**Where you may extend, and where you may not.** `spec/00-overview.md` §0.6,
AGSC-00-24, closes the extension points at **eight kinds** — memory adapter, channel
adapter, forge shim, deployment profile, surface, page tool, composition emitter,
checker — and states the three obligations that bind all of them: a plugin reaches
the network only where its row grants it and no row grants it during `build`,
`lint`, `verify` or `ci`; it writes only the outputs its row names; and it never
changes the canonical bytes of a 1.0 surface. A capability that is none of the eight
is a change to the specification, not a plugin. Read §0.6 before you design an
extension point of your own; this distribution's side of it — the registries, the
capability check and eight worked samples — is `docs/PLUGINS.md`.

---

## 7. Claiming a Level

AGSC-09-01: a claim names its Level, the `spec_version` MAJOR.MINOR, and the vector
set it passed. AGSC-10-15 says which vector areas belong to which Level.

1. Run the vector set for your Level. Every `required` vector of every declared area
   must pass; a `skip` is a failure (AGSC-09-02).
2. Produce `conformance-report.json` — `{impl, version, spec_version, class,
   results:[{id, status, got?}], summary}` (AGSC-09-03).
3. Optionally publish it at `/conformance/`. That route exists only when you publish
   the report (AGSC-06-01).
4. State the claim plainly. AGSC-09-03: "A published claim is the claimant's own
   assertion; this specification defines no arbitration." There is no certification
   body and no badge. Do not imply one.

Three things a claim must not say: never name a Level whose vectors you did not run;
never count a withdrawn vector; never attribute approval of this specification to a
standards body or a registry that has not acted on it.

**What the reference distribution claims today: nothing.** AGSC-10-05 says the
reference implementation "will claim Level 3 at its 1.0.0 release; no claim exists
before a green run of the Level-3 set". At `1.0.0-rc.6` the reference engine passes
every vector of the set and skips none (the counts are the
conformance runner's own summary line, and `node tools/count-artifacts --json` gives
the totals), and that is a run, not a claim.

---

## 7a. Where a node can live

A node is a set of files; any place that can put them behind an
HTTPS origin, with the response headers the rules name, can host it — a web host, a
local machine, a clone, IPFS behind a gateway, a device, or a ledger-anchored store with
a web interface in front. A claim names its deployment profile (AGSC-06-01); no rule of
1.x pins a transport other than HTTP. The profiles, and what each cannot do:
[CONNECTORS.md](CONNECTORS.md#where-a-node-can-live).

---

## 8. If you find a defect in the specification

Say so. AGSC-00-16 makes rule ids and error codes permanent, vectors immutable (a
wrong vector is withdrawn and superseded, never edited) and reserved ids never
reused, precisely so that a defect can be corrected without breaking anyone. A
correction that only clarifies the text, or adds a case conforming implementations
already pass, is a PATCH; one that adds a key, a value, a code or a case is a MINOR,
exactly as a new Link key is (AGSC-00-14; `docs/SPEC.md` §8). Open an issue against the repository named in
`package.json`, quote the rule id, and say what two readings you found.

---

*This guide is normative about nothing. Every obligation in it belongs to the rule it
cites.*
