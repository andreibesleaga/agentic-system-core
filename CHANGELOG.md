# Changelog

All notable changes to AgenticSystemCore: the specification, its schemas, ontology
and conformance vectors, and the reference engine that implements them. The
specification carries its own version (`spec_version`); from this release on, a rule
changed by a later version also carries a dated amendment note in `spec/`
(AGSC-00-16).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The Internet-Draft `draft-besleaga-agentic-knowledge-wellknown-00` was posted to the IETF
  Datatracker on 2026-09-30 as an individual Internet-Draft.
- `bench/queries/bench-v2`, the committed retrieval query set: twelve new intents for the
  demonstration node, each answered by an item that node publishes, and the eight intents
  for the main node unchanged. It replaces `bench-v1`, whose intents for the demonstration
  node named items that node no longer publishes; the two sets are not comparable.

### Fixed

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
