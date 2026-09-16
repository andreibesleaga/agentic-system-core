# Domain-driven architecture — bounded contexts, language, forward compatibility

*Informative. Written 2026-09-16 for the `1.0.0-rc.3` draft (DS-4). It complements `docs/PLAN.md` (arc42, frozen at S02) and never overrides a rule of `spec/`. Where this page and a rule disagree, the rule wins and this page is wrong.*

## 1. The domain in one sentence

A **Bundle** is a directory of Markdown **items** joined by fourteen typed **Links** into a graph that is emitted, deterministically, as pages, RDF, an index, an agent-retrieval export and a discovery document; a **composition** selects items and yields a **Harness**; **governance** records who changed what and why; and the **boundary** is where one node meets a browser, another node, a stranger's URL or a reader who may not see everything.

## 2. The five bounded contexts and the supporting one

| Context | Aggregates / entities | Owns | Never touches | Spec home | Vector areas |
|---|---|---|---|---|---|
| **Knowledge** | Bundle, Item (six types), Link (14 keys), Cluster, Chunk, Attachment | parsing, validation, linking, ontology emission, index, chunk export | git, network, review | spec/01, 02, 03, 04, 05, 06 §6.5 | `frontmatter`, `slug`, `links`, `lint`, `jcs`, `graph`, `chunks`, `adopt` |
| **Governance & Provenance** | Proposal, Review, Gate, Ledger, Channel | `prov` fields, DCO-Plus trailers, gates → CI checks, derived ledger, ingest | rendering, composition | spec/08, 01 §1.7 | `ledger`, `prov` |
| **Composition** | Selection, Verdict, Harness, Port wiring, saved Architecture | the five-step pipeline, the seven Harness files, emitters, skill packs | parsing, network | spec/07, 02 §2.10 | `compose`, `harness`, `skills` |
| **Distribution** (also called Emission) | Page, Route, Discovery document, Surfaces (tools, page tools, agent-facing text, chunks), NOW, Boards | routes, headers, link set, surface declaration, budgets | writes of any kind | spec/06, 09 §9.3, 10 §10.5 | `discovery`, `build`, `cli`, `boards` |
| **Boundary** | Peer, Visibility, Contribute target, Surface declaration, Responder/Solid hook, Tombstone | cross-origin access, peer-fetch safety, the federation walk (client rules), trust marking, contribute relation, the plugin contract, visibility and dynamic hooks, retirement | content semantics | spec/11 | `boundary` |
| *Interchange* (supporting) | foreign formats both ways | OKF, JSON-LD, JSONL, steering files, skills import | — | spec/01 §1.5–1.6, 03 §3.6 | `import`, `export` |

**Context map.** Knowledge → *conformist* → Distribution (Distribution renders what Knowledge validated and adds nothing to it). Knowledge → *customer/supplier* → Composition (Composition consumes the resolved graph; Knowledge does not know compositions exist). Governance → *published language* (trailers, ledger entries) → Distribution. **Boundary is an anti-corruption layer around every external surface** — MCP, WebMCP, the A2A card, Solid, a peer — so that an external draft moving (the MCP handshake changed between 2025-11-25 and 2026-07-28; WebMCP's report date moved from 10 to 15 September 2026) moves a declared version string and a plugin, never the core. The four-rule plugin contract — **declare · pin · inherit · prove** (AGSC-11-16…19) — is the anti-corruption layer's interface.

## 3. Ubiquitous language

The language is the vocabulary of `spec/00` §0.2 (Bundle, Item, the six types, NOW), the fourteen Link keys of AGSC-03-01, the 52 ontology terms of `ontology/agsc.ttl`, and the rc.3 boundary terms (peer, surface, visibility, contribute mode, tombstone). It is **generated, never typed**: `node tools/gen-glossary` writes `docs/GLOSSARY.md` from the ontology's labels and comments plus the closed lists the spec fixes, so the glossary cannot drift from the definition. Words that are UI or import vocabulary — card, page, deck, note — are forbidden as types, keys or terms (AGSC-00-08).

## 4. Two statements the model rests on

1. **Lint is closed-world; the exported RDF is open-world; no reasoner runs at build — so the two never contradict.** The lints of spec/03 and spec/08 decide over the Bundle they can see (an unresolved link is an error). The RDF says only what is emitted (AGSC-05-23: every relied-upon entailment — inverses, cluster nesting, SKOS integrity — is materialised explicitly). The reconciliation is *axiom hygiene*, not a single rule: no `asc:Item` superclass (AGSC-05-13), SKOS integrity conditions enforced by lint and never left to inference (AGSC-05-19/05-20), and no super-property, domain or range on `asc:uses`/`asc:excludes`/`asc:contradicts` (AGSC-05-26a) so that OWL 2 RL entailment can add nothing a lint did not already decide.
2. **Three graph serialisations are deliberate redundancy for consumers, not information.** `graph.jsonld`, `graph.ttl` and `graph.nq` carry one graph; the blank-node-free rule (AGSC-05-13, 04-16) makes the canonical form of each a sort, so consumers pick a syntax and lose nothing.

## 5. Forward-compatibility rule

A 1.x reader **MUST** ignore unknown members and unknown `x-<vendor>-<key>` keys (preserving them verbatim in lossless exports, AGSC-02-05/02-05a), **MUST** tolerate the reserved enum values the spec names when reading documents it did not author (AGSC-00-15, AGSC-11-02), and **MUST NOT** fail on a file whose `spec_version` MINOR is higher than its own (AGSC-00-14). A node's *own* configuration and frontmatter are validated closed, because a publisher must not emit a value its declared version does not define (AGSC-11-02 as amended). MAJOR is the only breaking boundary. Every parameter that is not a wire-format invariant lives in `agsc.config.json` with a spec default and a stated maximum (AGSC-11-01, R60).

## 6. Four wordings fixed here so that no document drifts

- **Determinism scope** — machine artefacts are byte-identical *across* conforming implementations; HTML pages are byte-identical *within* one implementation and are not in the cross-implementation vector set (AGSC-04-24, PRD-060).
- **The distinguishing property set is Level ≥ 2.** A Level-0 or Level-1 node is a discoverable, digest-checked publication; the properties that no neighbouring system offers together — deterministic graph exports, the chunk export, the plugin contract, federation — begin at Level 2 (AGSC-10-04).
- **The Harness is keyed by the ordered selection** (AGSC-07-12): the same items in a different order are a different Harness, because Step 5 wiring and the emitters are order-sensitive by rule and the files are byte-pinned.
- **"Registered" is written only after IANA acts.** Until then: "requested", "pending registration", or the extension URI (AGSC-06-07, 06-25, 11-05).

## Appendix A — Sort orders (non-normative summary of the rules)

| What | Order | Rule |
|---|---|---|
| JSON member names | UTF-16 code units of the NFC name | AGSC-04-05, 04-21 |
| Items | slug, code point | AGSC-04-13 |
| Links | `(key, target)`, code point | AGSC-04-13 |
| Tags | code point | AGSC-04-13 |
| Cluster members | `(order, slug)`, absent `order` last | AGSC-04-13 |
| Search tokens | as JSON member names (UTF-16) | AGSC-04-05, 04-13 |
| Sitemap entries | URL, code point | AGSC-04-13 |
| N-Quads lines | byte order of the UTF-8 line | AGSC-04-16, 05-32 |
| Turtle subjects and predicates | IRI code points | ontology header, AGSC-05-06 |
| Chunk lines | item slug, then `section`, then `ordinal` ascending numerically | AGSC-06-29 |
| llms.txt sections / items | cluster slug; item slug; an item once, under its primary cluster | AGSC-06-13a |
| Harness wiring | `(consumer, port)`; relationships `(producer, consumer, port)` | AGSC-07-23 |
| Board tasks | slug | AGSC-10-13 |
| Fragment index | file paths, code point | AGSC-06-33 |

## Appendix B — Complexity classes (non-normative, per component as specified)

Symbols: `n` items · `m` authored links · `b` body bytes · `t` distinct tokens · `k` selection size · `c` chunks · `p` peers · `h` hop limit · `g` commits · `s` triples.

| Component | Rules | Time | Note |
|---|---|---|---|
| Parse + schema validation | 01-15, 02-01…06 | O(b + n·f) | YAML subset without anchors: no aliasing blow-up |
| Link resolution, inverses, symmetric closure | 03-02, 03-04/05 | O(m) | hash map; `sym(E)` idempotent |
| Cycle and orphan detection | 03-08, 03-10 | O(n + m) | one DFS per relation |
| Inverted index | 06-16, 06-23 | O(b) + O(t log t) | postings ascending by construction |
| JCS of one object | 04-05 | O(K log K) | K members |
| NFC | 04-07, 04-23 | O(b), bounded buffer | 256-mark cap per starter (AGSC-E607) |
| Graph emission (three views) | 05-06…10, 05-31/32 | O(s log s) | blank-node-free ⇒ canonical form is a sort, never RDFC-1.0 |
| Ledger derivation / verification | 08-20…23 | O(g) | streaming verify |
| Composition Steps 1–4 | 07-04…08 | O(k + reachable) then O(closure · deg) | least fixpoint; BFS pinned for `path[]`; hiding is non-monotone ⇒ fixed order |
| Composition Step 5 (ports) | 07-23 | O(Σ ports) | hash map name → producers; verdict-neutral |
| Chunk export | 06-26…31 | O(b) | cut at headings outside fences after NFC; second cut at the size bound |
| Attachment hashing | 05-29 | O(bytes) | SHA-256 per file |
| Peer check `--peer` | 10-12 | O(links + digests) | 1 + d GETs each way, or zero offline |
| Federation walk | 11-10 | ≤ min(`max_requests`, Σ_{i≤h} `fan_out`^i) requests | Θ(p³) at h = 3 without the caps — hence the caps |
| Static fragments | 06-33 | O(s) build; ≈ |S| + |P| files | optional; measure before promising |

The one budget the spec states is ≤ 60 s per 500 items (AGSC-06-21). Every row is linear or `n log n` in its input.
