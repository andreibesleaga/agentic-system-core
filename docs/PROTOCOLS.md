# Protocols and standards — what the system uses, why, and where

**Summary.** AgenticSystemCore invents as little as it can. Discovery uses the web's
existing well-known addresses, link relations and link sets; integrity uses the
standard digest syntax; the graph uses the W3C's RDF family; canonical bytes use the
JSON Canonicalization Scheme; agents are served through the Model Context Protocol and
WebMCP; licence signals use robots.txt and TDMRep. This page lists every outside
standard or format the system touches: what it is, why it is used, which rules use it,
and where the primary document is.

**Who this is for:** a standards reviewer, an implementer, an architect checking
dependencies. **Read after:** [SPEC-ORIENTATION.md](SPEC-ORIENTATION.md). **Read next:**
[SPEC.md](SPEC.md) §4 (the standards register, with the conformance test for each row)
and [RELATED-WORK.md](RELATED-WORK.md) §2 (each building block's status on the day it
was checked).

Nothing here claims that any body has reviewed, adopted or approved this work. A name
this project defines — the well-known suffix `knowledge-linkset` and the profile
identifier — has its **registration to be requested** through the Internet-Draft in
`internet-draft/`; neither is registered today. The primary-document links below were
read on 2026-09-24.

---

## 1. Discovery on the web

| Standard | What it is | Why it is used here | Rules | Primary document |
|---|---|---|---|---|
| RFC 8615, Well-Known URIs | the `/.well-known/` path prefix and its registry | the discovery document lives at `/.well-known/knowledge-linkset` (suffix: not registered; asked for in the posted Internet-Draft, no request sent to the registry) | AGSC-06-07 | <https://www.rfc-editor.org/info/rfc8615> |
| RFC 8288, Web Linking | the model of typed links and link relations | pages point at the discovery document with the registered relation `describedby`; this project's own relations are URIs, as the RFC requires for unregistered ones | AGSC-06-10, AGSC-06-25 | <https://www.rfc-editor.org/info/rfc8288> |
| RFC 9264, Linkset | a document format (`application/linkset+json`) that holds a set of links | the discovery document *is* a link set: one file naming every machine artefact | AGSC-06-07 to AGSC-06-10 | <https://www.rfc-editor.org/info/rfc9264> |
| RFC 6906, the `profile` relation; RFC 7284, the Profile URI Registry | how a document says which profile of a format it follows | the discovery document's media type carries this project's profile identifier (registration to be requested) | AGSC-06-07, AGSC-11-04 | <https://www.rfc-editor.org/info/rfc6906>, <https://www.rfc-editor.org/info/rfc7284> |
| RFC 8574, `cite-as` | a registered relation naming the identifier to cite | a node MAY say which address to cite it by | AGSC-06-35 | <https://www.rfc-editor.org/info/rfc8574> |
| RFC 9727, `api-catalog` | a well-known address plus a relation plus a profile, for APIs | the design precedent this discovery design follows | AGSC-06-07 | <https://www.rfc-editor.org/info/rfc9727> |
| RFC 9110, HTTP Semantics | the meaning of HTTP responses, headers and content negotiation | entity tags, response headers and redirects a host sends | AGSC-11-05, AGSC-06-17 | <https://www.rfc-editor.org/info/rfc9110> |
| W3C VoID | a vocabulary for describing linked datasets | prior art for dataset discovery, cited as complementary | AGSC-06-12 | <https://www.w3.org/TR/void/> |

## 2. Integrity and canonical bytes

| Standard | What it is | Why it is used here | Rules | Primary document |
|---|---|---|---|---|
| RFC 9530, Digest Fields | the syntax for content digests (`sha-256`) | every artefact the discovery document names carries its SHA-256 digest; a host may send `Repr-Digest` | AGSC-06-08, AGSC-06-17 | <https://www.rfc-editor.org/info/rfc9530> |
| RFC 8785, JSON Canonicalization Scheme (Informational) | one byte form for any JSON value | every JSON file is written in this form, after Unicode NFC, so two implementations emit the same bytes | AGSC-04-04 to AGSC-04-06, AGSC-04-21 | <https://www.rfc-editor.org/info/rfc8785> |
| RFC 7493, I-JSON | the interoperable subset of JSON | every JSON artefact, and every vector, is I-JSON | AGSC-04-04, AGSC-09-06 | <https://www.rfc-editor.org/info/rfc7493> |
| Unicode 16.0.0 and UTS #46 | characters, normalisation (NFC), IDNA mapping | text is normalised before it is sorted or hashed; host names are compared after mapping | AGSC-04-22, AGSC-11-12 | <https://www.unicode.org/versions/Unicode16.0.0/>, <https://www.unicode.org/reports/tr46/> |

## 3. Content and the graph

| Standard | What it is | Why it is used here | Rules | Primary document |
|---|---|---|---|---|
| CommonMark 0.31.2 (+ GFM tables) | a precise Markdown grammar | the grammar of every item's body; headings are the chunk cut points | AGSC-02-20, AGSC-06-27 | <https://spec.commonmark.org/0.31.2/> |
| YAML 1.2 (a failsafe subset) | the data format of the frontmatter block | the small, safe subset every item header is written in | AGSC-02-01, AGSC-02-02 | <https://yaml.org/spec/1.2.2/> |
| JSON Schema 2020-12 | a vocabulary for validating JSON | the three schemas; the keyword subset is fixed | AGSC-02-24, AGSC-00-09 | <https://json-schema.org/specification> |
| RDF 1.1 N-Quads and Turtle; JSON-LD 1.1; RDF/XML | the W3C syntaxes of an RDF graph | the four views of one graph: `graph.nq`, `graph.ttl`, `graph.jsonld`, `graph.rdf` | AGSC-05-10, AGSC-05-31, AGSC-06-32 | <https://www.w3.org/TR/n-quads/>, <https://www.w3.org/TR/turtle/>, <https://www.w3.org/TR/json-ld11/> |
| RDF Dataset Canonicalization (RDFC-1.0) | a canonical form for RDF datasets | not used: `graph.nq` is this specification's own canonical form, with the same quads as RDFC-1.0 output for a blank-node-free dataset and four terms written differently; no RDFC-1.0 claim may be made | AGSC-04-16 | <https://www.w3.org/TR/rdf-canon/> |
| OWL 2 RL; SKOS; PROV-O; DCMI Terms | an ontology profile and three widely used vocabularies | the vocabulary is OWL 2 RL, clusters are SKOS collections, provenance aligns to PROV-O, metadata to Dublin Core | AGSC-05-12, AGSC-05-17 to AGSC-05-22 | <https://www.w3.org/TR/owl2-profiles/>, <https://www.w3.org/TR/skos-reference/>, <https://www.w3.org/TR/prov-o/>, <https://www.dublincore.org/specifications/dublin-core/dcmi-terms/> |
| Open Knowledge Format (OKF) 0.2 | a Markdown-with-frontmatter format for knowledge bundles | an item is a superset of OKF; OKF bundles import and export losslessly | AGSC-01-04, AGSC-01-22, AGSC-01-26 | <https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md> |

## 4. Agents and tools

| Standard | What it is | Why it is used here | Rules | Primary document |
|---|---|---|---|---|
| Model Context Protocol (MCP), revision 2026-07-28 | a JSON-RPC protocol between AI applications and tool servers | `agsc mcp` is a local tool server with seven tools; the extension identifier `com.agenticsystemcore/knowledge` is advertised | AGSC-09-13, AGSC-11-18 | <https://modelcontextprotocol.io/specification/2026-07-28> |
| WebMCP (a W3C Community Group draft, not on the standards track) | an in-page API, `document.modelContext`, through which a page registers tools for the browser's agent | every built page registers the same seven tools, answering as the local server does | AGSC-09-16, AGSC-11-18 | <https://github.com/webmachinelearning/webmcp> |
| Agent2Agent (A2A) | a protocol between agent systems, with a published Agent Card | the nine task states of a board are A2A's; an A2A card is an optional surface | AGSC-02-99, AGSC-06-34 | <https://a2a-protocol.org/latest/specification/> |
| Agent Skills (`SKILL.md`) | a folder format for agent skills: a `SKILL.md` with YAML frontmatter | procedures are published as skill packs in this format and imported back | AGSC-07-19 to AGSC-07-22 | <https://agentskills.io/specification> |
| `llms.txt` | a proposal for a Markdown file at `/llms.txt` that gives language models a site's content | every node publishes `/llms.txt` and `/llms-full.txt` with a fixed byte layout | AGSC-06-13 to AGSC-06-15 | <https://llmstxt.org/> |
| COGX (the Cognee exchange format) | the format Cognee imports memories through, including those of Mem0, LangMem, Letta, Zep and Graphiti | the `cogx` memory adapter exports and imports archives; an adapter, not a rule | AGSC-01-26a (memory adapters) | <https://docs.cognee.ai/examples/migrate-memory-systems> |

## 5. Licence, security and crawling signals

| Standard | What it is | Why it is used here | Rules | Primary document |
|---|---|---|---|---|
| RFC 9309, Robots Exclusion Protocol | `robots.txt` | one of the three licence dialects: the AI-usage signals and per-crawler groups | AGSC-06-18, AGSC-01-18 | <https://www.rfc-editor.org/info/rfc9309> |
| TDMRep (W3C Community Group final report, 10 May 2024) | a text-and-data-mining reservation at `/.well-known/tdmrep.json` | the second licence dialect, when the node adopts the Content Use Terms | AGSC-06-18 | <https://www.w3.org/community/reports/tdmrep/CG-FINAL-tdmrep-20240510/> |
| RFC 9116, `security.txt` | a well-known file naming where to report a vulnerability | every node publishes one; `ci` refuses a Bundle without a `Contact:` line | AGSC-06-36 | <https://www.rfc-editor.org/info/rfc9116> |
| RFC 7763, `text/markdown` | the media type for Markdown | the type the host sends for the per-item Markdown views | AGSC-06-17 | <https://www.rfc-editor.org/info/rfc7763> |

## 6. Process standards the repository follows

| Standard | Where |
|---|---|
| BCP 14 (RFC 2119, RFC 8174) — the meaning of MUST, SHOULD, MAY | `spec/00-overview.md`, first lines |
| Semantic Versioning 2.0.0 | `spec_version` (AGSC-00-14) and the packages |
| Keep a Changelog 1.1.0 | `CHANGELOG.md` |
| arc42, C4 | `docs/PLAN.md`, [ARCHITECTURE-GUIDE.md](ARCHITECTURE-GUIDE.md) |
| Gherkin | `features/` |

`SPEC.md` §4 says, row by row, whether this project *defines* an artefact (and requests
its registration) or *conforms* to someone else's, and which vector or test proves it.
