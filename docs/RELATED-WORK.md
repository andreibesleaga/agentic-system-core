# Relationship to other work

*Informative. Written 2026-09-16 for the `1.0.0-rc.3` draft (DS-4). Every date is the date the cited document carried when it was checked; every "checked" note is the day it was read. Nothing here claims adoption, review or endorsement by any body. The IANA Well-Known URIs and Link Relation Types registries were read live on 2026-09-16: `knowledge-linkset` is not registered and is requested by the Internet-Draft; the discovery link uses the registered relation `describedby` (D82 Q3, 2026-09-17) and no relation is requested.*

## 1. One sentence

**Agent discovery finds who can act; knowledge discovery finds what is known.** Every mechanism in the agent-discovery space catalogued below discovers an *actor or an endpoint* — an agent, a tool server, a service. This specification discovers a *described, integrity-checked body of knowledge*: a static Bundle of Markdown items with a typed graph, a discovery document that is an RFC 9264 link set, and digests on every artefact it points at. The two are complementary, and the survey that catalogues the former (`draft-jimenez-dawn-discovery-landscape-00`, 3 July 2026) never mentions RFC 9264 link sets and names no mechanism for the latter.

## 2. Normative building blocks this specification stands on

| Work | Status when checked | What is taken from it | Where |
|---|---|---|---|
| RFC 8615 Well-Known URIs | Standards Track, May 2019 | the `/.well-known/` path and its registry (Specification Required); the suffix `knowledge-linkset` is **requested**, not registered | AGSC-06-07 |
| RFC 8288 Web Linking | Standards Track, Oct 2017 | link relation model; §2.1.2 — an unregistered extension relation MUST be a URI | AGSC-06-10, 06-25, 11-05 |
| RFC 9264 Linkset | Standards Track, Jul 2022 | the discovery document *is* an `application/linkset+json` document; §4.2.4.3 extension target attributes as arrays; §5 the `profile` media-type parameter | AGSC-06-07…10 |
| RFC 6906 The `profile` Link Relation | Informational, Mar 2013 | secondary carrier of the profile | AGSC-06-07, 11-04 |
| RFC 7284 Profile URI Registry | Informational, Jun 2014 | the one profile URI this specification requests | AGSC-06-07 |
| RFC 9530 Digest Fields | Standards Track, Feb 2024 | the `sha-256` algorithm token and `digest` attribute syntax | AGSC-06-08, 06-10 |
| RFC 9727 api-catalog | Standards Track, Jun 2025 | the design precedent: well-known + link relation + profile URI, no vendor media type | AGSC-06-07 |
| RFC 8785 JCS + erratum 7920 | Standards Track, Jun 2020; erratum verified | canonical JSON; `-0` serialises as `0`; member names sorted by UTF-16 code unit | AGSC-04-05 |
| RFC 9110 HTTP Semantics | Standards Track, Jun 2022 | quoted `ETag`, conneg, 303 | AGSC-11-05, 06-06 |
| RFC 3987 IRIs | Standards Track, Jan 2005 | IRI character rules for cross-node citation | AGSC-11-12 |
| JSON Schema 2020-12 | draft, keyword subset | `minLength`/`maxLength` in Unicode code points | AGSC-02-24 |
| RDF 1.1 Turtle / N-Quads, JSON-LD 1.1, OWL 2 RL, SKOS, PROV-O, DCTerms | W3C Recommendations | the four graph views, the vocabulary profile, provenance classes | spec/05 |
| CommonMark 0.31.2 | community spec | the body grammar; headings for chunk cuts | AGSC-02-20, 06-27 |
| Unicode 16.0.0, UTS #46 (non-transitional) | Unicode Consortium | NFC, General_Category, IDNA mapping | AGSC-04-22, 11-12 |
| A2A 1.0.x (Agent2Agent; repository tag v1.0.1 of 2026-05-28, specification page banner 1.0.0) | Linux Foundation, Agentic AI Foundation | the nine `TASK_STATE_*` values verbatim; the Agent Card and its §8.4 signing (JCS then JWS) as the optional `a2a-card` surface | AGSC-02-99, 06-34 |
| MCP revision 2026-07-28, SEP-2133 Extensions (Final) | Agentic AI Foundation | the local tool server; the extension identifier `com.agenticsystemcore/knowledge` advertised through `server/discover` | AGSC-09-13, 11-18 |
| WebMCP Draft Community Group Report, 15 September 2026 | W3C Web Machine Learning CG (draft, not a W3C standard) | `document.modelContext`, `registerTool/getTools/executeTool`, `readOnlyHint`/`untrustedContentHint`/`consequentialHint` | AGSC-09-16, 11-18 |
| W3C VoID (IG Note 2011; `/.well-known/void` registered 2011) | W3C | prior art for dataset discovery; MUST be cited as complementary | AGSC-06-12 |

## 3. The agent-discovery mechanisms, and why none of them is this

The DAWN landscape survey (Jimenez, Feng, Arkko, Kühlewind, Kandoi — Ericsson; `draft-jimenez-dawn-discovery-landscape-00`, 3 July 2026) catalogues the field. Its own scope statement is discovery of "entities (agents, tools, services) and … their capabilities". The mechanisms, with this specification's reading of each:

| # | Mechanism | What it discovers | Reading |
|---|---|---|---|
| 1 | DNS-AID | agents, by DNS name | actor; DNS-centric |
| 2 | DN-ANR | agents, by name resolution | actor |
| 3 | AID | agent identifiers | actor |
| 4 | AgentDNS (expired draft) | agent endpoints via DNS | actor |
| 5 | `api-catalog` (RFC 9727) | a site's APIs | endpoint; **our design precedent**, different object |
| 6 | A2A Agent Cards (`/.well-known/agent-card.json`, registered by the Linux Foundation, permanent) | an agent's capabilities and interfaces | actor; complementary — declarable here as the `a2a-card` surface, never emitted without a responder |
| 7 | MCP server discovery (SEP-2127 Server Cards — **still an open pull request** on 2026-09-12; SEP-2133 Extensions — Final) | MCP servers | endpoint; complementary — the local `mcp` surface is declared through the plugin contract |
| 8 | ANP `/.well-known/agent-descriptions` (W3C AI Agent Protocol CG) | inter-agent descriptions | actor |
| 9 | AIDIP | agent identity | actor |
| 10 | AGNTCY ADS | agent directory service | actor |
| 11 | 3GPP 6G Rel-20 agent discovery | network-side agents | actor |
| 12 | IoA (Internet of Agents) | agents | actor |
| 13 | ARDP | agent resource discovery | actor / endpoint |
| 14 | Agent Directory `/.well-known/ad` | directory of agents | actor |
| 15 | a2aregistry.org | hosted directory | actor |
| + | `/.well-known/ai` (`draft-aiendpoint-ai-discovery-01`), `/.well-known/agent-discovery.json` (ADP; the suffix `agent` was **denied** by IANA in June 2026, per the ADP draft's own text), `/.well-known/agents.txt` (agent policy), `draft-serra-mcp-discovery-uri-04` (`mcp:` scheme), `draft-narvaneni-agent-uri-03` (`agent:` scheme), `draft-aevum-agentcard-00` | endpoints, policies, identities | name-space competition only; none describes a knowledge base |

**None of these discovers an integrity-checked knowledge bundle with a typed graph, and none uses an RFC 9264 link set.** Since the survey, two mechanisms discover a single *context file* — `draft-arsentev-llm-context-discovery-00` (2026-09-11; well-known suffix and link relation `llm-context`, both requested from IANA, pointing at a publisher-curated file such as `/llms.txt`) and llms.txt v2 itself (2026-08-10; `rel="describedby"` to the file) — and one discovers *agentic resources* (Agentic Resource Discovery, below). None carries digests over a set of artefacts, a typed graph, or a link set; that narrower gap is the one this specification fills, with registered building blocks rather than a new media type. Decided 2026-09-17 (D82 Q3): no fourth link relation — the discovery link is the registered `describedby` with `type="application/linkset+json"`, the profile URI carries the refinement, and the Internet-Draft requests two registrations (the suffix and the profile URI), not three. The link set can in turn point at any of these neighbours through related-system links (AGSC-06-35).

## 4. Adjacent work: the four verdicts

*include* = cited normatively or as a link target · *complement* = orthogonal and pointed at · *compare* = same neighbourhood, different object · *compete* = contests only a name.

| Work | Verdict | Note |
|---|---|---|
| `llms.txt` (community spec, v2, modified 2026-08-10) | include | v2 fixes a grammar (a leading H1 is the only required element; blockquote, heading-free sections, H2 file lists, an `Optional` convention) and a discovery path (`rel="describedby"`, `rel="alternate" type="text/markdown"`); AGSC-06-13a is a **profile** of it — H1 first, a provenance comment, a stricter byte layout |
| `draft-arsentev-llm-context-discovery-00` (Independent, 2026-09-11) | compare | requests the well-known suffix `llm-context` and the link relation `llm-context` for a publisher-curated LLM context file (typically `/llms.txt`); discovers one text file with no integrity, graph or bundle — complementary, and the nearest IETF neighbour of the discovery layer |
| Agentic Resource Discovery, ARD v0.91 (Google with the Linux Foundation AI Catalog WG, 2026-06-17; `ards-project/ard-spec`, pushed 2026-09-12) | compare | `/.well-known/ard.json` manifest of JSON-LD entries, `<link rel="ard">`, a federated `POST /search` registry API; entries describe *agentic resources* (agents, tools, services) and may use an OKF namespace in queries — the nearest live neighbour of a well-known discovery document, for actors and endpoints rather than a knowledge bundle |
| Agent Skills (`SKILL.md`) | include | Procedures export one-to-one to skill files (spec/07 §7.4) |
| AGENTS.md (Agentic AI Foundation) | complement | a repository instruction file; a possible link target, never a Bundle item |
| Google Open Knowledge Format v0.2 | compare | closest content-model neighbour: Markdown + YAML, `index.md`; no discovery, no integrity; imported losslessly (AGSC-01-26). Two things the I-D must say: OKF also calls its unit a **"Knowledge Bundle"** — this specification's `Bundle` is a different object (a directory, one configuration file and a typed graph), and the names are not interchangeable (AR2-53); and OKF's conformance philosophy is the opposite of this one — OKF forbids a consumer from rejecting a bundle for broken links or unknown types, this specification fails the build (AR2-54) |
| W3C DCAT 3 (Rec, 22 Aug 2024) | complement | catalogue vocabulary a publisher MAY use to describe the Bundle as a `dcat:Dataset`; see spec/06 §6.8 |
| Schema.org `DataCatalog`/`Dataset` | complement | one permitted serialisation of the same description in page JSON-LD |
| NLWeb | complement | a consumer: a query endpoint over Schema.org data; every instance an MCP server |
| IETF aipref (vocab/attach drafts; revisions move monthly — re-check before the I-D) | complement, hard boundary | AI-usage preferences; this specification emits TDMRep + robots signals and **no** aipref field at 1.x (AGSC-06-18) |
| IETF webbotauth | complement | bot identity by HTTP message signatures; this specification defines no agent identity |
| IETF DAWN (proposed WG) | complement | discovery of *agents and AI resources* by name (DNS-centric); this specification discovers a published document set on a known origin through an HTTP well-known path and needs no naming layer — it is a stand-alone application of RFC 8615, 8288 and 9264, which is why it is offered on the Independent Stream; the RFC 5742 conflict review will ask exactly this, and this row is the answer (AR2-12) |
| IETF agentproto (BOF) | complement | long-lived agent sessions; no overlap |
| W3C AI Agent Memory Interoperability CG (chartered 2026-06-19) | compare | portable agent memory; the nearest "memory" neighbour, no report published when checked |
| `draft-saihm-memory-protocol-01` (In ISE Review) | compare | encrypted memory cells bound to MCP tools; the other ISE-stream AI-memory draft, different object |
| W3C Linked Web Storage / Solid | complement | storage substrate; declarable here as the `solid` surface (AGSC-11-21), bytes pinned by the Solid Protocol |
| Linked Data Fragments / Triple Pattern Fragments | include (informative) | the optional static fragments (AGSC-06-33) are a static subset at the dump end of the LDF spectrum |
| Wikidata / Wikibase, MediaWiki | compare | the hypertext lineage: a wiki with a typed graph; this specification is static, git-governed, and has no live write path |
| Karpathy "LLM wiki" note (2026-04-04); Ming et al., *Retrieval as Reasoning: Self-Evolving Agent-Native Retrieval via LLM-Wiki*, arXiv 2605.25480 | compare | agent-written wikis with an error book; this specification is public, human-and-agent governed, ontology-typed, and its Lessons page set is the error book |
| Blackboard architectures — Hayes-Roth, *A blackboard architecture for control*, Artificial Intelligence 26(3), 1985; Nii, *The blackboard model of problem solving*, AI Magazine 7(2), 1986 | include (informative) | the lineage of Mode 5 (AGSC-10-16, rc.4): a shared data structure, knowledge sources that contribute to it, and a control component; here the Bundle is the data structure, agent lanes, channels and people are the knowledge sources, and gates, reviews and the standing ratification are the control |
| Multi-agent orchestration frameworks with shared state (in-process graphs, crews, group chats) | compare | in-process, per-run state owned by one runtime; a Blackboard node is a published, versioned, governed file set that any of them can read and propose to, with the history in git and the ledger |
| agentpatternscatalog.org, nibzard/awesome-agentic-patterns, AgentO ontology | compare | pattern catalogues without a verified-evidence graph, composition to an executable harness, or a discovery layer; AgentO is a possible alignment target for `kind: pattern` items |

## 5. What is new here, stated as properties

1. A knowledge base is discoverable by a **registered-mechanism** path (well-known URI + link relation + profile URI), with **RFC 9530 digests** on every artefact, and no new media type.
2. Every machine artefact is **byte-deterministic across implementations** (AGSC-04-24), which no wiki, catalogue or memory protocol above claims.
3. Federation is **static and client-side** — nodes never call nodes — with a bounded walk, a mutual-conformance check and cross-node *citation* instead of cross-node links (spec/11 §11.3).
4. Every agent surface is a **declared plugin** under one contract — declare, pin, inherit, prove (spec/11 §11.4) — so an external draft moving does not move the core.
5. The **agent-retrieval chunk export** (AGSC-06-26…31) gives agents stable, citable, pre-split units with provenance, without embeddings.

These are property claims about the specification's text and vectors, not performance claims.
