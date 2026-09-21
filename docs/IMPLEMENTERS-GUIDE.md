# Implementers' guide — writing a second implementation

**Summary.** This guide is for someone who wants to write their own AgenticSystemCore
implementation in their own language. You need two directories: `spec/` and
`tests/vectors/`. You do not need to read the reference engine, and this guide never
asks you to. It tells you what to read first, where the bytes are pinned and why,
how to run the vector set and the nine validators against your own output, what this
specification deliberately leaves to you, and how to state which Level you reached.

The specification is the truth. Where this guide and a rule differ, the rule wins.
Every statement below names the rule it comes from.

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
| 3 | Governed node — provenance gates, the four lints, channels | AGSC-10-01, spec/08 |

Start at Level 1. It is the smallest useful thing, it needs no emission, and the
vector areas it runs (`frontmatter`, `slug`, `links`, `jcs`) are the ones that catch
the mistakes everything else is built on.

---

## 2. Reading order

Read these in this order. Each one assumes the ones before it.

1. **`spec/00-overview.md`** — the model, the six item types, the version rules
   (AGSC-00-04, AGSC-00-09…11, AGSC-00-14…16, AGSC-00-20). Twenty minutes.
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
   (§9.4, 90 codes) and the diagnostics envelope (AGSC-09-11). Every finding you
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

The vectors are the acceptance test. There are **150** of them in **18** populated
areas of the 25 AGSC-09-04 declares (`node tools/count-artifacts --json` derives
those numbers; never type them). 135 are `required`, 1 is `optional`, 14 are
`withdrawn`.

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

**Authored single-line strings carry no line break.** AGSC-02-24 as amended at rc.5
lists the members (`title`, `description`, every `tags[]` value, `prov.agent`,
`site.title`, …) that must not contain a C0 control, U+007F, U+0085, U+2028 or
U+2029; a violation is `AGSC-E204`. **And a writer must neutralise them as well**,
replacing each with one U+0020, because validation is not always in the path — an
imported Bundle, a channel contribution and an agent-lane proposal all reach a writer
from outside. `/llms.txt`, `/now.md`, `robots.txt`, `_headers` and every `SKILL.md`
are line-oriented: a newline inside an interpolated title forges a new line there.
Vector `fm-0010`.

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
never a finding. With no value at all the instant is 0 and the build warns
(`AGSC-E606`). This is what makes `verify`'s double build meaningful: build twice,
compare bytes, and any difference is `AGSC-E602` (AGSC-09-14).

**Error codes are a closed set of 90.** `AGSC-E<nnn>`, nothing else; the hundreds
digit is the area (§9.4). Where two codes could name one fault, the more specific one
wins, and §9.4's **Precedence** paragraph states exactly which. Two conforming
implementations report the same code for the same input, and that is checkable.

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

**One honest note about this distribution's own run.** `validate-spec` currently
exits 1 on the frozen 1.0.0-rc.5 text: it finds defects that are recorded as
specification items for 1.0.0, not defects of any implementation. Treat it as a
reporting step until those items are applied. Every other validator exits 0.

---

## 6. What is implementation-defined

The specification is deliberately silent about these, and your choices here cannot
make you non-conforming.

* **The diagram compiler.** AGSC-01-07 and AGSC-02-13 describe a diagram DSL and its
  compiled SVG; no rule pins the SVG bytes. A compiled `.svg` must not be committed
  (AGSC-01-07), and where a picture ships as an attachment it must be SVG with its
  source beside it (AGSC-02-98). How you draw it is yours.
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
* **Everything a rule marks OPTIONAL or MAY**, including `/graph/fragments/**`
  (AGSC-06-33), memory adapters (AGSC-01-26a) and the two opt-in verbs `run` and
  `trace` (AGSC-09-94), which "may not be required by any conformance Level".

Adapters are the one place where you must document rather than choose silently:
AGSC-01-26a requires a memory adapter to be "listed with its claimed key set in the
distribution's implementer documentation". This distribution's adapters are
`llm-context` (export) and `okf` (import), and `src/interchange/README.md` lists what
each one claims.

---

## 7. Claiming a Level

AGSC-09-01: a claim names its Level, the `spec_version` MAJOR.MINOR, and the vector
set it passed. AGSC-10-15 says which vector areas belong to which Level.

1. Run the vector set for your Level. Every `required` vector of every declared area
   must pass; a `skip` is a failure (AGSC-09-02).
2. Produce `conformance-report.json` — `{impl, version, spec_version, class,
   results:[{id, status, got?}], summary}` (AGSC-09-03).
3. Optionally publish it at `/conformance/`. That route exists only when you publish
   the report (AGSC-06-01 as amended at rc.5).
4. State the claim plainly. AGSC-09-03: "A published claim is the claimant's own
   assertion; this specification defines no arbitration." There is no certification
   body and no badge. Do not imply one.

Three things a claim must not say: never name a Level whose vectors you did not run;
never count a withdrawn vector; never attribute approval of this specification to a
standards body or a registry that has not acted on it.

**What the reference distribution claims today: nothing.** AGSC-10-05 says the
reference implementation "will claim Level 3 at its 1.0.0 release; no claim exists
before a green run of the Level-3 set". At `1.0.0-rc.5` the vector set runs
136 pass / 0 fail / 14 skip (all 14 withdrawn) of 150, and that is a run, not a
claim.

---

## 8. If you find a defect in the specification

Say so. AGSC-00-16 makes rule ids and error codes permanent, vectors immutable (a
wrong vector is withdrawn and superseded, never edited) and reserved ids never
reused, precisely so that a defect can be corrected without breaking anyone. A
correction is a MINOR bump with a registry row and a vector, exactly as a new Link
key is (`docs/SPEC.md` §8). Open an issue against the repository named in
`package.json`, quote the rule id, and say what two readings you found.

---

*This guide is normative about nothing. Every obligation in it belongs to the rule it
cites.*
