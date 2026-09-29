# Roadmap

**Summary.** Version 1.0 checks a selection of items against their typed Links and
writes a small, deterministic set of files called a Harness. It does that correctly
and the same way in the browser and on the command line, but what it hands back is
thin: mostly titles and one-line descriptions. The next version plans to give Links a
stated formal meaning, to check that meaning, and to add a richer, still deterministic
**composition brief** beside the Harness: a reading order, the relations explained, the
gaps, a checklist and a context file for agents. An optional service layer can offer
the same answers through the local tool server. Nothing here changes what a 1.0 Bundle
builds or composes. This page is informative; where it disagrees with a rule in
[`spec/`](../spec/README.md), the rule wins.

**Who this is for:** anyone deciding whether to use composition today, and anyone who
wants to help shape the next version. **Read after:**
[USE-CASES.md](USE-CASES.md) (scenario M5) and
[spec/07-composition.md](../spec/07-composition.md).

## What 1.0 does today

- **Typed Links.** An item may point to others with fourteen closed Link keys
  (AGSC-03-01). Five carry composition meaning: `requires` pulls items in, `excludes`
  forbids a pair, `supersedes` hides an older item, `uses` and `contradicts` give
  warnings. The others (`related`, `broader`, `narrower`, `derived-from` and the five
  project keys) are for navigation and provenance and never change a composition
  (AGSC-03-18, AGSC-07-10).
- **The graph.** Every Bundle is also published as RDF in several views, typed by a
  small OWL 2 RL vocabulary aligned to SKOS, PROV-O and Dublin Core (§5). Inverses and
  symmetric Links are computed, never authored (AGSC-03-04, AGSC-03-05). Lint refuses
  cycles and dangling targets and warns about orphans (§3.3). No reasoner runs at build
  (AGSC-05-23).
- **Composition.** Five fixed steps — closure, hiding, mutual exclusion, warnings, port
  wiring — produce a verdict with an explanation path for every added item (AGSC-07-04
  to AGSC-07-09, AGSC-07-23). A valid composition writes seven kinds of file: a JSON
  record, an `AGENTS.md` digest, a Structurizr model, a Mermaid diagram, an arc42
  skeleton, one decision record per item and one skill file per procedure (AGSC-07-12).
  The same bytes come from `/compose/` in the browser and from `agsc compose`
  (AGSC-07-13).
- **Honest limits.** The output is only as rich as the Links authored. A Bundle whose
  items use only `related` composes to a valid but nearly empty result: nothing is
  added, nothing is flagged, the diagram has few or no edges, and the digest carries
  each item's description rather than its text.

## Planned for the next version

The next version is a MINOR release: it adds, and removes nothing (AGSC-00-14). The
list below is a plan, not a promise of dates.

### A stated meaning for every Link

- One table giving, for each Link key, its inverse, whether it is symmetric, whether
  it may be read transitively (for example a chain of `broader` or `supersedes`), and
  which kinds of item it is expected to point to.
- New lint **warnings**: a Link from an item to itself; two Links on one pair that
  cannot both hold (for example `requires` and `excludes`); a Link whose target is an
  unexpected kind of item; an item that is replaced but not marked deprecated.
- Derived relations computed by plain code, each with the reason it holds — "this
  follows from X `supersedes` Y and Y `supersedes` Z" — so every derived fact can be
  explained.
- A written list of questions the graph must answer ("if I choose X, what else must I
  take?", "what replaced X?", "what blocks this task?"), each answered by the engine and
  pinned by a test vector.
- Validation shapes generated from the schemas and the Link table and run in a
  development lane, as the specification already plans (AGSC-05-24).
- A deterministic **suggestion** step that proposes Links from the content — shared
  sources, inline mentions, item titles found in other items' text — and never writes
  them. A person accepts a suggestion by editing the item, or an agent offers it as a
  Proposal through the agent lane.

### A richer composition output

A **composition brief**, written beside the seven Harness files and never inside
them, and shown directly on `/compose/`:

- a plain summary of the verdict;
- every selected item with its relations resolved — authored, inverse, symmetric and
  derived — and the reason for each;
- a reading order: what an item needs comes before it;
- gaps and open questions: items used but not selected, related items worth a look,
  items with no sources, stale or draft items, items a newer one replaces;
- a checklist derived from the relations: what to adopt first, what to provide, which
  contradictions to decide;
- a context file for agents with the items' text, in reading order, marked as data;
- a diagram of the selection and its nearest neighbours.

The brief needs no model. An optional narration step, off by default, may use a
configured model within the node's spend cap (AGSC-01-38); its output is a separate,
labelled file and never affects the verdict or any other file.

The `/compose/` page is also planned to gain search and filters, a visible list of
warnings, and the verdict in plain words.

### An optional service endpoint

- The local tool server and the in-page tools (AGSC-09-13, AGSC-09-16) gain tools that
  return the brief, explain why a relation holds, and run the new checks over a
  selection.
- A node operator may offer the same tools over a network transport through the
  `responder` surface the specification already declares (AGSC-11-21). The project
  itself hosts no service.
- Rules that do not change: no network and no clock at build, no embeddings or
  similarity scores as stored relations (AGSC-03-21), and an agent changes content
  only through the agent lane of §8.6 (AGSC-08-28), never around it.

### A graph view

- A graph view: each item page shows a small drawing of its direct links with each
  relation named and explained, each cluster gets a map, and the same neighbourhood is
  also published as Mermaid text; drawn at build time, no third-party script.

### Working with vocabulary and ontology tools

Version 1.0 already publishes each node's graph as Turtle, N-Quads and JSON-LD. Items
carry SKOS preferred and alternative labels, definitions, and `broader`, `narrower` and
`related` links; clusters list their members with `skos:member`; dates and source
records use Dublin Core terms; and a `derived-from` Link becomes a PROV-O derivation.
The files load in standard RDF tools and answer SPARQL queries. The graph types items
with the vocabulary's own classes, which the vocabulary declares as subclasses of the
SKOS and PROV-O classes, so a tool that looks for `skos:Concept` needs to load the
vocabulary and apply RDFS inference first. Planned: an export that writes the SKOS
types, top concepts and a titled concept scheme directly; an import that reads a SKOS
vocabulary written in Turtle into a Bundle; SHACL shapes; and a Dublin Core
application profile for item metadata. The semantic layer over the typed links is
planned to follow the six stages of the
[Ontology Pipeline™ framework](https://www.ontologypipeline.com/) by J. Talisman —
controlled vocabulary, metadata schema, taxonomy, thesaurus, ontology, knowledge
graph. This names the method the work plans to follow; it claims no compatibility
with the framework and no certification by its author.

## Compatibility promise

- A Bundle that conforms to 1.0 keeps building and composing under the next version,
  with the same bytes for its graph and its seven Harness files; its item pages change only by the added views.
- The five composition steps and every verdict stay as they are. The brief is an extra
  rendering, not a new step.
- New checks start as warnings, so a 1.0 Bundle that passes its gate today still
  passes.
- A 1.0 tool that meets something from the next version ignores it or refuses it with
  a registered code, as AGSC-00-21 already requires.

## How to follow or contribute

Changes to the specification follow the process in
[CONTRIBUTING.md](../CONTRIBUTING.md): open an issue that names the rule, the
wording you propose and the test vector that would prove it. Examples of compositions that felt empty, and the Links that would
have made them useful, are especially helpful. The list of what belongs to each
version is kept in the specification itself (AGSC-00-20); an item on this page that it
does not yet name is a proposal until a release adds it there.
