# `src/knowledge/` — Knowledge — the content and its graph

**Summary.** This folder turns files into validated items and a typed graph. It parses the frontmatter and the Markdown body, checks them against the schemas, resolves the fourteen Link keys, writes the four RDF views and the chunk export, adopts bare Markdown, derives the content version and compiles the diagram language to SVG. It is pure: it never reads a file, a clock or the network; it takes strings and records and returns records.

**Read after:** [the module guide](../README.md). **Specification:** `spec/01` (the Bundle), `spec/02` (the item), `spec/03` (links), `spec/04` (canonical bytes), `spec/05` (the graph), `spec/06` §6.5 (chunks).
**May depend on:** only `shared/` (and itself) — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/knowledge/`.

## What each file does

| File | What it does |
|---|---|
| `frontmatter.js` | the frontmatter block, the body and the parsed Item record |
| `yaml.js` | the YAML subset the specification allows, and the refusals with their codes |
| `schema.js` | JSON Schema 2020-12 validation (Ajv) and `oneOf` discrimination |
| `validate.js` | item, index and configuration checks and the order of their codes |
| `slug.js` | the slug grammar, uniqueness, the slugifier and collision suffixes |
| `unicode.js` | NFC, code-point length, the two orderings, the combining-mark bound |
| `jcs.js` | canonical JSON (RFC 8785) with NFC first, and the I-JSON check |
| `markdown.js` | the Markdown subset (CommonMark + GFM tables) and body references |
| `relations.js` | the relation table of AGSC-03-01: the fourteen keys and their columns, read by every server-side copy |
| `link-graph.js` | the typed Links between published items as both pictures of them read them: the edges, a cluster's members and the title an item is drawn with; shared by the `mermaid` export and the graph view of the pages |
| `links.js` | the Link graph: resolution, inverses, cycles, orphans, the warnings of AGSC-03-23 to 03-26, and the domain links of a node with a site vocabulary (AGSC-03-27) |
| `derive.js` | the readings of the Link graph (inverse, symmetric, transitive, closure), each with its reasons |
| `questions.js` | the ten questions of the graph (AGSC-05-34), one pure function each |
| `nquads.js` | the RDF dataset of a Bundle and its canonical N-Quads |
| `turtle.js` | the stable Turtle view, and the Turtle this engine reads (the vocabulary) |
| `jsonld.js` | the JSON-LD view and the context file |
| `rdfxml.js` | the RDF/XML view |
| `skos.js` | the SKOS integrity rules of the graph view |
| `skos-export.js` | the SKOS view of `graph.nq` that `export --skos` writes: the scheme, the top concepts, the SKOS types, no episode, procedure or gate |
| `suggest.js` | the Link suggestions of `lint --suggest`: five generators (mention, shared sources, phrase, lesson without episode, term), each with its evidence |
| `closure.js` | the consequences of the graph that `export --closure` writes: eight OWL 2 RL rules kept as data and run by the `n3` `Reasoner`, plus the irreflexive check |
| `domain.js` | the site vocabulary of the domain layer: the rules (a) to (g) its file meets (`AGSC-E420`), the model the graph writer and the link reader use (which class a `domain_type` names, which property a domain link names and which side of an inverse pair is computed), the faults of the `domain` object, and the items' domain keys that name nothing (`AGSC-E418`) |
| `contexts.js` | bounded contexts: the contexts `domain.contexts` declares, the context of an item (its `domain_context`, else its primary cluster, AGSC-08-32), and the address of a `peers[]` entry in the plain or the typed form (AGSC-11-24); read by the label check, the site vocabulary, the context map and every writer that names a peer |
| `warrants.js` | the warrant of a term (`warrant`, AGSC-05-40): a source plus one of the three kinds of warrant of ANSI/NISO Z39.19, `literary`, `user` and `organisational`, read once for the graph writer and the display; its faults come from the item schema (`AGSC-E512`) |
| `shacl-core.js` | the SHACL Core subset of AGSC-05-41 that evaluates a site's own invariants: the check that refuses a shapes file outside it (`AGSC-E420`), the run of the pinned `rdf-validate-shacl` over a data graph, and the results in the order of the rule; `site-checks.js` turns them into findings |
| `competency.js` | the competency questions of a site (AGSC-05-41): the shape of the questions file, the SPARQL subset (refused as `AGSC-E420` before any query runs), the run of each query by the pinned `oxigraph` after the pinned Traqula parser read it, and whether each answer agrees with its `expected` |
| `site-checks.js` | the check that `verify` and `ci` run where a node declares `domain.shapes` or `domain.questions` (AGSC-09-20): one data graph (`graph.nq` and its closure), the shapes and the questions over it, and the findings `AGSC-E421` and `AGSC-E422` |
| `chunks.js` | the chunk export for retrieval: the two cuts, the identifiers, the shards |
| `adopt.js` | adoption of bare Markdown: what `init` prepends, total and byte-preserving |
| `content-version.js` | the content version of a Bundle, derived once from its history |
| `provenance-header.js` | the provenance header every agent-facing text file starts with |
| `runblocks.js` | the executable fenced blocks and their expected output |
| `diagrams.js` | the diagram language compiled to SVG, inside the SVG allow-list |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§2, §7 and §8).

## Working here

```bash
node --test "tests/knowledge/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
