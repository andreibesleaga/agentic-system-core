# Roadmap

**Summary.** Version 1.0 checks a selection of items against their typed Links and
writes a small, deterministic set of files called a Harness. Version 1.1 gives every
Link a stated meaning and checks it, writes a **composition brief** beside the Harness,
shows the graph on every page, adds a query page, an optional domain layer and more
ways for agents and other tools to read a node. A Bundle that conforms to 1.0 builds
the same graph and the same seven Harness files under 1.1, but for the `spec_version`
they state. This page is informative; where it disagrees with a rule in
[`spec/`](../spec/README.md), the rule wins, and the complete list of what each version
specifies is AGSC-00-20.

**Who this is for:** anyone deciding whether to use composition and the graph today,
and anyone who wants to help shape what comes next. **Read after:**
[USE-CASES.md](USE-CASES.md) (scenario M5) and
[spec/07-composition.md](../spec/07-composition.md).

## What 1.0 does

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
  added, nothing is flagged, and the diagram has few or no edges.

## What 1.1 does

1.1 is a MINOR release: it adds and removes nothing (AGSC-00-14). New checks are
warnings, so a Bundle that passes its gate under 1.0 still passes.

- **A stated meaning for every Link.** The relation table of AGSC-03-01 gives each key
  its inverse, whether it is symmetric or may be read transitively, and the kinds of
  item it is expected to point to. `lint` warns about a Link from an item to itself,
  two keys on one pair that cannot both hold, a target of an unexpected kind and a
  `supersedes` of a stable item (AGSC-E313 to AGSC-E316). Derived readings carry the
  steps that make them hold (AGSC-05-33), and the graph answers ten written questions
  ([ONTOLOGY-QUESTIONS.md](ONTOLOGY-QUESTIONS.md)). `lint --suggest` proposes Links
  from the content into `dist/suggestions.json` and never writes under `content/`.
- **Vocabulary and ontology tools.** `export --skos` writes the SKOS view with its
  concept scheme; `import <file.ttl> --from skos` turns a thesaurus into draft items;
  `export --closure` writes what the OWL 2 RL subset entails, never as a published
  file; SHACL shapes ([SHACL-SHAPES.md](SHACL-SHAPES.md)) and a Dublin Core
  application profile ([DUBLIN-CORE-PROFILE.md](DUBLIN-CORE-PROFILE.md)) are generated
  from the schemas. [ONTOLOGY-PIPELINE.md](ONTOLOGY-PIPELINE.md) maps these to the six
  stages of a common ontology method.
- **The domain layer, optional.** A node may add its own classes and relations, domain
  keys on items, warrants, invariants and competency questions that `verify` and `ci`
  check, bounded contexts and context maps between nodes
  ([guides/mode-1.md](guides/mode-1.md#the-domain-layer)). A node that does not use it
  builds the bytes it built before.
- **A composition brief.** `compose --brief` writes `brief.json`, `BRIEF.md`,
  `context.md` and `brief.mmd` beside the Harness and never inside it: why each item is
  there, its relations, a dependency order, gaps and a checklist. It names listed items
  only, so it never lists a draft as a gap, and `brief.mmd` draws the Links inside the
  selection. `/compose/` shows the same brief, with filters by cluster and tag and the
  verdict in words. A saved architecture also gets C4 levels, decision records and a
  build plan (AGSC-07-29); [`examples/blueprints/`](../examples/blueprints/README.md)
  holds three worked ones. This distribution ships no model, so `--narrate` answers
  `AGSC-E001` and the brief is written without it.
- **The graph on the page.** An item page shows its Links in both directions as a
  figure and a table with the meaning of each key; a cluster page maps its members;
  `/clusters/` adds an overview, a legend and an explorer that works from the keyboard
  (AGSC-06-38). Per-item Mermaid text stays `agsc export --to mermaid`. `/query/` runs
  SPARQL 1.1 over the node's own graph in the browser, with no server
  ([guides/mode-0.md](guides/mode-0.md)).
- **Agents and other tools.** The tool server and the page tools serve ten tools
  (`brief`, `explain` and `check` join the seven); the tool server speaks MCP revision
  2026-07-28 beside 2025-11-25, and `mcp --http` serves it on your own machine
  ([USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md)). The chunk export gains a
  digest, a count and a set commitment, and a tabular index
  ([CITING-A-CHUNK.md](CITING-A-CHUNK.md)). The home page sends FAIR Signposting
  links and a fuller Dataset block; a node may opt in to a DCAT catalogue block, the
  `ard.json` and `ai-catalog.json` files and, with a responder, an A2A agent card.
  `export --manifest` adds file digests that `import` checks.
- **Capabilities of this distribution**, not format parts: direct memory adapters for
  Mem0, Letta, Zep, CSV, Basic Memory and Claude Code's memory files
  ([CONNECTORS.md](CONNECTORS.md)); the benchmark kit ([BENCHMARKS.md](BENCHMARKS.md));
  and the Python checker at the parity of the 1.1 engine, except the domain layer.

## Ideas after 1.1

Nothing on this list is promised, and it carries no version and no date. An idea
becomes work only when a release names it in AGSC-00-20; the names the specification
reserves stay as AGSC-00-20 states them.

1. **The domain layer in the Python checker.** The layer is optional and the engine
   checks it; the Python checker reports its cases as not run.
2. **A public node about the system itself**, beside the main site and the
   demonstration node. Nothing in 1.1 depends on it.
3. **Two more worked blueprints.** The three in `examples/blueprints/` cover the
   engine, two linked sites and the tool server with a client.
4. **"Download all" on `/skills/` and an index of the exports.** It would change the
   bytes of the published skills page of every node.
5. **`ask` offering a Proposal.** The bytes of its answer are pinned by a 1.0 case
   (`cli-0007`).
6. **`agsc-host` behind the file-system port**, as the engine's other commands are.
   An internal change with no effect on any file.
7. **Content Use Terms in plain words, opted into per node.** The rule slot is
   reserved; its wording is not written yet.
8. **Skills import extras:** `--replace` with no loss of data, and one route for the
   two import paths.
9. **Discovery extras:** an `/.well-known/api-catalog` route (RFC 9727), a lint warning
   for a pair of licences that do not fit together, a newer WebMCP report, and WebMCP as
   a condition of the benchmark kit.
10. **Mode 4 renderings for agent runtimes** (kaiban, GABBE) and narration as a
    rendering. Each needs a model or a runtime this distribution does not ship.
11. **Installers and runtimes:** Homebrew, Nix, a container image, Deno, Bun and
    Cloudflare Workers, a TypeScript port and a PyPI wrapper of the engine.
12. **Smaller items:** domain links on item pages and in the `links` tool; reports to
    the MCP SDK of the places where the tool server needs its own code; the patterns
    node rebuilt on 1.1.

## Compatibility promise

- A Bundle that conforms to 1.0 builds and composes under 1.1 with the same bytes for
  its graph and its seven Harness files, but for the `spec_version` the Harness files state
  (1.1.0); its pages change only by the added views and by the files AGSC-00-20 names.
- The five composition steps and every verdict stay as they are. The brief is an extra
  rendering, not a new step.
- A 1.0 tool that meets something from 1.1 ignores it or refuses it with a registered
  code, as AGSC-00-21 requires.

## How to follow or contribute

Changes to the specification follow the process in
[CONTRIBUTING.md](../CONTRIBUTING.md): open an issue that names the rule, the wording
you propose and the test vector that would prove it. Examples of compositions that
felt empty, and the Links that would have made them useful, are especially helpful.
