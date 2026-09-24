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
| `links.js` | the Link graph: resolution, inverses, cycles, orphans |
| `nquads.js` | the RDF dataset of a Bundle and its canonical N-Quads |
| `turtle.js` | the stable Turtle view, and the Turtle this engine reads (the vocabulary) |
| `jsonld.js` | the JSON-LD view and the context file |
| `rdfxml.js` | the RDF/XML view |
| `skos.js` | the SKOS integrity rules of the graph view |
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
