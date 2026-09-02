# AGSC-06 — Published surfaces: routes, discovery files, llms.txt

## 6.1 Route set

- **AGSC-06-01** A writer MUST emit exactly this route set into `build.out` (default `www/`): `/`; `/concepts/` and `/concepts/<slug>/`; `/procedures/`, `/lessons/`, `/episodes/`, `/gates/` with their item pages; `/clusters/` and `/clusters/<slug>/`; `/tags/<tag>/`; `/search/` with `/search.json`; `/now/` and `/now.md`; `/compose/`; `/skills/`, `/skills/index.json`, `/skills/<cluster>/SKILL.md`; `/specs/`; `/ns/` and its vocabulary files; `/about/`; `/legal/`; `/changelog/`; `/graph.jsonld`, `/graph.ttl`, `/graph.nq` and optionally `/graph.rdf`; `/pages/<slug>.md` and `/pages/<slug>.jsonld`; `/llms.txt` and `/llms-full.txt`; `/sitemap.xml`; `/robots.txt`; `/tdmrep.json`; `/feed.xml`; `/.well-known/agentic-knowledge`; `/404.html`; `_headers`; `_redirects`. [PRD-011 ← R36, audit/D §5]
- **AGSC-06-02** Item pages MUST link their own `/pages/<slug>.md` and `.jsonld`. An empty type folder MUST be omitted from navigation but MUST still resolve. [audit/D §5]
- **AGSC-06-03** The site identity is software plus registry. A reading order, a "start here" sequence, chapter structure or companion framing MUST NOT be emitted. [R23, Art. XIII]
- **AGSC-06-04** `/404.html`, `_headers` and `_redirects` MUST be generated, never hand-maintained; a renamed or superseded slug MUST produce a `_redirects` entry. [PRD-018, PRD-020]
- **AGSC-06-05** Pages MUST NOT reference a third-party origin, load a font, script or image from another host, set a cookie, use `localStorage`, or emit a beacon. [PRD-046 ← R52, N4]
- **AGSC-06-06** `/ns/` conneg is done by the w3id `.htaccess`, mapping `Accept` to a fixed table of same-origin static targets (`/ns/agsc.ttl`, `/ns/context.jsonld`, `/ns/agsc.rdf`, else the HTML index). No project-owned server code exists; `/ns/<version>/…` copies are immutable. [D41, D47, ADR-005]

## 6.2 The well-known file

- **AGSC-06-07** There MUST be exactly one discovery file, `/.well-known/agentic-knowledge`, served as `application/vnd.agenticsystemcore.agentic-knowledge+json`. Separate manifests MUST NOT be emitted; a release MAY carry a copy named `agentic-knowledge.json`. `agent-card.json` MUST NOT be published while no A2A endpoint exists. [PRD-024 ← D21-final, D47-note(c), D41]
- **AGSC-06-08** The document is a JCS-canonical JSON object with exactly two top-level members, `integrity` and `linkset`:

```json
{
  "integrity": {
    "bundle": { "base": "…", "id": "…", "title": "…" },
    "counts": { "clusters": 0, "concepts": 0, "episodes": 0, "gates": 0, "lessons": 0, "procedures": 0 },
    "generated_at": "2026-01-01T00:00:00Z",
    "hashes": { "bundle": "…", "context": "…", "graph_nq": "…", "ontology": "…" },
    "ledger_head": "…",
    "spec_version": "1.0.0-draft.1"
  },
  "linkset": [
    {
      "anchor": "https://example.org/",
      "alternate": [ { "href": "https://example.org/llms.txt", "type": "text/plain" } ],
      "describedby": [ { "href": "https://example.org/graph.jsonld", "type": "application/ld+json" } ],
      "license": [ { "href": "https://example.org/legal/" } ],
      "service-doc": [ { "href": "https://example.org/specs/" } ],
      "https://w3id.org/agentic-system-core/rel#graph": [
        { "href": "https://example.org/graph.ttl", "type": "text/turtle" }
      ]
    }
  ]
}
```

- **AGSC-06-09** The `linkset` member MUST conform to RFC 9264: an array of link-context objects, each with `anchor` and relation-keyed arrays of objects carrying `href` and optionally `type`. [PRD-024, RFC 9264]
- **AGSC-06-10** Relation names MUST be either IANA-registered short names (`describedby`, `alternate`, `license`, `service-doc`, `author`) or extension URIs of the form `https://w3id.org/agentic-system-core/rel#<name>` with `<name>` ∈ `graph`, `ontology`, `context`, `shapes`, `now`, `skills`, `ledger`. Unregistered short names MUST NOT be used. [audit/G §1 RFC 9264 row, RFC 8288]
- **AGSC-06-11** Every `hashes` value MUST be a lowercase hex SHA-256 over the canonical bytes of the named artefact, and `ledger_head` MUST be the `hash` of the last `ledger.jsonl` entry (§08). `generated_at` MUST derive from `SOURCE_DATE_EPOCH`. [PRD-005, PRD-024, D44(h)]
- **AGSC-06-12** A VoID description of the Bundle SHOULD be emitted and linked, because `/.well-known/void` is registered prior art for dataset discovery; the relationship MUST be stated wherever this discovery layer is described. [audit/G §1 VoID row]

## 6.3 llms.txt

- **AGSC-06-13** `/llms.txt` MUST begin with a single H1 (the Bundle title), followed by one blockquote summary, then H2 sections whose bodies are link lists `- [title](url): one-line description`. An `Optional` H2 section MAY hold lower-priority links. [audit/G §1 llms.txt row]
- **AGSC-06-14** Every published item MUST be reachable from `/llms.txt`, directly or through a listed cluster section. `/llms-full.txt` carries the same index plus item bodies. [PRD-025 ← R33]
- **AGSC-06-15** Both files MUST open with the fixed provenance header naming the Bundle IRI, the licence `LicenseRef-AgenticSystemCore-Content-Use-1.0` and the build instant, and MUST fence every quoted body as ```` ```text agsc-content ```` so prose is presented as data, not instruction. [NFR-07 ← N9, ADR-001]

## 6.4 Machine surfaces and headers

- **AGSC-06-16** `search.json` MUST be a prebuilt inverted index `{terms:{token:[docIndex…]}, docs:[{slug,title,description,cluster}]}` requiring no runtime dependency. [PRD-014 ← D19, G15]
- **AGSC-06-17** `_headers` MUST set `Content-Type: text/markdown; charset=utf-8; variant=GFM` for `/pages/*.md`, the vendor media type for the well-known file, and a `default-src 'none'` policy with `script-src 'self'`. [PRD-020, D40, audit/G §1 RFC 7763 row]
- **AGSC-06-18** `robots.txt` MUST follow RFC 9309 and carry the AI-usage signals; `tdmrep.json` MUST declare the same policy; every prose-carrying export MUST embed the Content Use Terms, and a build omitting them MUST fail. [PRD-019 ← R39, D06, D39]
- **AGSC-06-19** `sitemap.xml` MUST list every published route with `lastmod` from the build instant, ordered by URL. Schema.org JSON-LD (`TechArticle`, `DefinedTerm`, `Dataset`) MUST be embedded in item and index pages. [PRD-020 ← R41, R42]
- **AGSC-06-20** Generated HTML MUST meet WCAG 2.2 AA — semantics, keyboard operability, contrast, and `alt` text from the diagram's `alt` key. [NFR-08 ← N10]
- **AGSC-06-21** Budgets are normative and MUST fail the build when exceeded: ≤100 KB per HTML page, ≤500 KB `search.json` at 500 items, ≤60 s build for 500 items, zero external page requests. [NFR-06 ← N8]
- **AGSC-06-22** `/now/` and `/now.md` MUST be generated from stored state only — counts, last build, stale items, open Lessons, monthly spend — never hand-edited. A section whose input is absent MUST be omitted, not guessed. [PRD-015 ← R29, D44(a), G16]
