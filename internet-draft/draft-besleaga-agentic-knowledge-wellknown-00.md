---
title: "The 'knowledge-linkset' Well-Known URI for Publishing Knowledge Artefacts"
abbrev: "knowledge-linkset Well-Known URI"
docname: draft-besleaga-agentic-knowledge-wellknown-00
workgroup: Independent Submission
category: info
submissiontype: independent
ipr: trust200902
keyword:
  - Internet-Draft
  - Well-Known URI
  - Linkset
  - Link Set
  - Knowledge Graph
  - Discovery
  - Integrity
  - Agents

author:
  - ins: A. N. Besleaga
    name: Andrei N. Besleaga
    organization: Independent
    email: andrei.besleaga.nicolae@gmail.com

normative:
  RFC2119:
  RFC3986:
  RFC7284:
  RFC6906:
  RFC8174:
  RFC8288:
  RFC8615:
  RFC8785:
  RFC9110:
  RFC9264:
  RFC9530:
  RFC9651:
  POWDER-DR:
    title: "Protocol for Web Description Resources (POWDER): Description Resources"
    author:
      - name: Phil Archer
      - name: Kevin Smith
      - name: Andrea Perego
    seriesinfo:
      W3C: Recommendation
    target: https://www.w3.org/TR/2009/REC-powder-dr-20090901/
    date: 2009-09-01

informative:
  RFC3987:
  RFC6838:
  RFC6892:
  RFC8259:
  RFC8574:
  RFC8792:
  RFC9111:
  RFC9309:
  RFC9421:
  RFC9727:
  I-D.jimenez-dawn-discovery-landscape:
    title: "A Survey of AI Agent Discovery Mechanisms"
    author:
      - name: Jaime Jimenez
      - name: Jim Feng
      - name: Jari Arkko
      - name: Mirja Kuehlewind
      - name: Rajat Kandoi
    seriesinfo:
      Internet-Draft: draft-jimenez-dawn-discovery-landscape-00
    target: https://datatracker.ietf.org/doc/html/draft-jimenez-dawn-discovery-landscape-00
    date: 2026-07-03
  I-D.arsentev-llm-context-discovery:
  I-D.serra-mcp-discovery-uri:
  I-D.ietf-aipref-vocab:
  I-D.ietf-aipref-attach:
  I-D.ietf-webbotauth-httpsig-protocol:
  I-D.aiendpoint-ai-discovery:
    title: "The AI Discovery Endpoint: A Structured Mechanism for AI Agent Service Discovery and Capability Exposure"
    author:
      - org: AIEndpoint
    seriesinfo:
      Internet-Draft: draft-aiendpoint-ai-discovery-01
    target: https://datatracker.ietf.org/doc/html/draft-aiendpoint-ai-discovery-01
    date: 2026-07-28
  I-D.car-ai-txt-wellknown:
    title: "AI.TXT: A Declaration File for AI Usage Preferences, Licensing, and Policy"
    author:
      - name: Kayla Cardillo
    seriesinfo:
      Internet-Draft: draft-car-ai-txt-wellknown-00
    target: https://datatracker.ietf.org/doc/html/draft-car-ai-txt-wellknown-00
    date: 2026-06-12
  DAWN-CHARTER:
    title: "Discovery of Agents With Names (dawn) -- proposed working group charter"
    author:
      - org: IETF
    target: https://datatracker.ietf.org/doc/charter-ietf-dawn/
    date: 2026-09-11
  AGENTPROTO-BOF:
    title: "Agent Communication Protocols (agentproto) -- BOF request"
    author:
      - org: IETF
    target: https://datatracker.ietf.org/doc/bofreq-steele-agentproto/
    date: 2026-09-04
  MCP:
    title: "Model Context Protocol Specification, revision 2026-07-28"
    author:
      - org: Model Context Protocol, a Series of LF Projects, LLC
    target: https://modelcontextprotocol.io/specification/2026-07-28
    date: 2026-07-28
  A2A:
    title: "Agent2Agent (A2A) Protocol Specification, version 1.0"
    author:
      - org: Agentic AI Foundation
    target: https://a2a-protocol.org/latest/specification/
    date: 2026-05-28
  LLMSTXT:
    title: "The /llms.txt file, version 2"
    author:
      - name: Jeremy Howard
    target: https://llmstxt.org/
    date: 2026-08-10
  OKF:
    title: "Open Knowledge Format, version 0.2"
    author:
      - org: Google Cloud
    target: https://github.com/GoogleCloudPlatform/open-knowledge-format
    date: 2026
  AIMEM-CG:
    title: "AI Agent Memory Interoperability Community Group"
    author:
      - org: W3C
    target: https://www.w3.org/community/ai-agent-memory-interop/
  VOID:
    title: "Describing Linked Datasets with the VoID Vocabulary"
    author:
      - org: W3C Semantic Web Interest Group
    seriesinfo:
      W3C: Interest Group Note
    target: https://www.w3.org/TR/void/
    date: 2011-03-03
  DCAT3:
    title: "Data Catalog Vocabulary (DCAT) -- Version 3"
    author:
      - org: W3C Dataset Exchange Working Group
    seriesinfo:
      W3C: Recommendation
    target: https://www.w3.org/TR/vocab-dcat-3/
    date: 2024-08-22
  IANA-IPV4-SPECIAL:
    title: "IANA IPv4 Special-Purpose Address Registry"
    author:
      - org: IANA
    target: https://www.iana.org/assignments/iana-ipv4-special-registry/
  IANA-IPV6-SPECIAL:
    title: "IANA IPv6 Special-Purpose Address Registry"
    author:
      - org: IANA
    target: https://www.iana.org/assignments/iana-ipv6-special-registry/
  AGSC-SPEC:
    title: "AgenticSystemCore Specification, version 1.0.0-rc.6 (release candidate)"
    author:
      - ins: A. N. Besleaga
        name: Andrei N. Besleaga
    target: https://agenticsystemcore.com/specs/
    date: 2026

--- abstract

This document defines the "knowledge-linkset" well-known URI, at which a
web origin publishes one link set describing the knowledge artefacts it
makes available: graph serializations, a JSON-LD context, an
agent-facing text file, a chunk export, a change ledger, and related
resources. Each artefact link may carry a SHA-256 digest, expressed with
the syntax of HTTP digest fields, so that a client can check that a
retrieved artefact is the one the publisher described. A profile URI
identifies the conventions the link set follows. The mechanism defines
no new media type and no new link relation type: a page points at the
resource with the existing "describedby" relation. This document
requests one well-known URI registration and records the fields of one
profile URI registration that is to be requested separately.

--- middle

# Introduction

Software agents that read the Web need two different things. They need
to find out *who can act*: which agent, tool server, or service is
reachable, under what name, with what capabilities. A survey of that
field is available in {{I-D.jimenez-dawn-discovery-landscape}}. They
also need to find out *what is known*: which described, versioned,
checkable artefacts an origin publishes about its own subject matter --
a graph, a vocabulary, an index, a text rendering, a change ledger.
The first question has many answers. The second has had no common one:
an origin that publishes a knowledge base in several serializations has
had no uniform place to list them, no uniform way to say which
serialization is which, and no uniform way to let a client check that
what it fetched is what was published.

This document defines that place. A web origin serves one resource at
`/.well-known/knowledge-linkset` {{RFC8615}}. The representation is a
link set {{RFC9264}}: a JSON document whose sole top-level member,
`linkset`, holds link contexts and their typed links. One link context
is used, anchored at the IRI ({{RFC3987}}) of the published knowledge
Bundle. Its
links name the artefacts, each with a media type, and each optionally
with a `digest` target attribute whose value uses the algorithm token
and syntax of HTTP digest fields {{RFC9530}}. A profile URI
{{RFC7284}}, carried either on the media type {{RFC9264}} or in a
`Link` header field {{RFC6906}}, tells a client which conventions the
document follows.

The design reuses what already exists and adds nothing to it beyond a
path and a profile. The document served is an ordinary link set, so a
generic link set client reads it without knowing this specification.
The relation used to point at it from a page is `describedby`, which is
already registered. The integrity attribute reuses an existing digest
algorithm token and an existing structured-field value syntax
{{RFC9651}}. No media type is defined ({{RFC6838}}), no URI scheme is defined, and
no registry is created. The precedent for this shape -- a well-known URI
whose representation is a link set identified by a profile URI -- is
`api-catalog` {{RFC9727}}, which applies it to a different object, an
origin's APIs.

The canonical, normative definition of the artefacts themselves, of the
Bundle that contains them, and of the byte-level forms their digests
cover, is the AgenticSystemCore Specification {{AGSC-SPEC}}. This
document specifies the discovery resource: its location, its media
type, its structure, the conventions its profile URI names, and the
behaviour expected of a client that reads it. Everything a publisher
needs in order to serve a conformant discovery document, and everything
a client needs in order to read one, is stated here.

## What this document does not do

This document defines no agent identity and no authentication of
fetchers; it defines no protocol, session, or transport between agents;
it defines no naming or resolution layer for agents; it defines no
expression of preferences about how content may be used; it defines no
read or write interface to an agent's memory; and it does not define
the formats of the artefacts it points at. Publishing a discovery
document grants no rights and no permissions of any kind, and asserts
no property of the artefacts other than that the origin published them.
{{relationship-to-other-work}} names the work that addresses each of
these topics.

# Conventions and Terminology

{::boilerplate bcp14-tagged}

Where a line in an example is too long to be shown whole, it is folded
with a trailing "\\" as {{RFC8792}} describes, and the example carries
the note that specification requires.

Bundle:
: The set of items and generated artefacts that one origin publishes
  under one anchor. The Bundle IRI is the origin's base URL with a
  trailing solidus.

artefact:
: One retrievable representation that belongs to a Bundle: a graph
  serialization, a JSON-LD context, a vocabulary file, a text rendering,
  a chunk export, a search index, a change ledger, an attachment.

discovery document:
: The link set served at the well-known URI defined by this document.

profile:
: A profile in the sense of {{RFC6906}}: additional semantics that a
  document follows without changing the semantics of its media type for
  a client that ignores the profile. The profile URI of this document's
  discovery document is given in {{the-profile-uri}}.

node:
: An origin that serves a discovery document conforming to this
  document.

peer:
: A node that another node names in its discovery document with the
  `peer` extension relation of {{relations}}.

# The 'knowledge-linkset' Well-Known URI {#the-well-known-uri}

A node MUST serve its discovery document at the path
`/.well-known/knowledge-linkset` of its origin, over HTTPS. A node MUST
serve exactly one such document; it MUST NOT split the description of
one Bundle across several discovery resources, and it MUST NOT serve a
second, differently named manifest of the same artefacts. A copy of the
document MAY be distributed by other means, for example inside a
release archive, and a node MAY additionally serve the same bytes at a
path of its own choosing.

## Media type and profile {#media-type-and-profile}

The representation MUST be a JSON link set, media type
`application/linkset+json` {{RFC9264}}. The profile URI of
{{the-profile-uri}} MUST be carried in at least one of two ways:

* as the `profile` parameter of the media type ({{RFC9264}},
  Section 5), which is the form a node uses by default:

~~~ http-message
NOTE: '\' line wrapping per RFC 8792

Content-Type: application/linkset+json; profile="https://w3id.\
org/agentic-system-core/profile/agentic-knowledge"
~~~
{: title="The profile carried on the media type"}

* or, where the hosting platform cannot attach a parameter to
  `Content-Type`, as a response header field ({{RFC6906}}):

~~~ http-message
NOTE: '\' line wrapping per RFC 8792

Link: <https://w3id.org/agentic-system-core/profile/agentic-\
knowledge>; rel="profile"
~~~
{: title="The profile carried in a Link header field"}

A client MUST accept either form, and a client's conformance MUST NOT
differ according to whether it can read response header fields. A
client that can read only the media type, which is the case for a
browser-resident client reading a cross-origin response, therefore
never loses information.

## Caching {#caching}

A node MUST send an `ETag` on the discovery document. When the entity
tag is derived from the bytes served, it is the lowercase hexadecimal
SHA-256 of those bytes enclosed in double quotes ({{RFC9110}},
Section 8.8.3). A node MUST send `Cache-Control: no-cache` on the
discovery document, so that a client revalidates before reuse
({{RFC9111}}, Section 5.2.2.4); the document names the current state of
a Bundle and is expected to change whenever the Bundle is rebuilt.
A client SHOULD make conditional requests ({{RFC9110}}, Section 13).

## Cross-origin access {#cross-origin-access}

The discovery document, and every artefact it names that the node
serves publicly, MUST be served with `Access-Control-Allow-Origin: *`
and `Access-Control-Expose-Headers: Link, ETag, Content-Type`, and MUST
NOT be served with `Access-Control-Allow-Credentials`. A node MUST NOT
require any request header field outside the CORS-safelisted set in
order to obtain the discovery document or any public artefact, so that
a client running in a browser can read them with a simple request.

A node whose content is gated MUST still serve the discovery document
publicly and with the wildcard above; the discovery document carries no
content. Such a node declares itself with the `agsc-visibility`
attribute of {{declaration-attributes}} and names, with the `access`
extension relation of {{relations}}, where a reader obtains
credentials. "Gated" means that the node's content is not public, never
that the node is invisible.

# The Link Set {#the-link-set}

## Top-level structure {#top-level-structure}

The document is a JSON object ({{RFC8259}}) whose sole top-level member
is `linkset` ({{RFC9264}}, Section 4.2.1). No other top-level member
may be present. A node that produces canonical bytes serializes the
document with JSON Canonicalization Scheme {{RFC8785}}; a node that
does not MUST at least produce I-JSON. The canonical form matters
because a digest of the discovery document itself, taken by a third
party, is stable only if the bytes are.

The `linkset` array holds exactly one link context object. Its `anchor`
is the Bundle IRI: the origin's base URL with a trailing solidus, for
example `https://example.org/`. A client MUST ignore an additional link
context object it does not understand.

Within a link context object, the remaining members are relation names,
each holding an array of link objects ({{RFC9264}}, Section 4.2). Every
link object MUST carry `href`, and every `href` MUST be an absolute URI
reference ({{RFC3986}}). Within one relation's array, link objects are
ordered by `href` in code point order, so that two builds of the same
Bundle produce the same bytes.

## Relations {#relations}

A relation name MUST be either a registered short name from the "Link
Relation Types" registry or an extension relation expressed as a URI
({{RFC8288}}, Section 2.1.2). An unregistered short name MUST NOT be
used.

The registered short names used are `describedby`, `alternate`,
`license`, `service-doc`, and `author`. A node that also publishes
related-system links ({{related-system-links}}) may in addition use
`related`, `service-desc`, `service-meta`, `collection`, `item`, and
`cite-as` ({{RFC8574}}).

The extension relations form a closed set. Each is the URI
`https://w3id.org/agentic-system-core/rel#<name>` with `<name>` taken
from the following list, and each such URI dereferences, through
w3id.org, to the section of the published specification that documents
it ({{the-profile-uri}}).

| Extension relation name | Target |
| --- | --- |
| `graph` | a further serialization of the Bundle's graph |
| `ontology` | the vocabulary the graph uses |
| `context` | the JSON-LD context of the graph |
| `now` | the generated state page of the Bundle |
| `skills` | the index of exported procedure packages |
| `ledger` | the derived change ledger of the Bundle |
| `peer` | another node's discovery document |
| `surface` | an agent-facing surface this node serves |
| `contribute` | an endpoint that accepts contributions |
| `access` | a page that says how to obtain credentials |
| `signature` | a detached signature over the discovery document |
| `boards` | the index of the Bundle's project boards |
{: title="The closed set of extension relations"}

A client MUST ignore a relation name it does not recognize. A node MUST
NOT invent a further extension relation under the same base: the set
above is closed, and a new member is added only by a later version of
{{AGSC-SPEC}} ({{versions}}).

## Target attributes {#target-attributes}

A link object MAY carry the target attributes `type`, `title`, and
`hreflang` ({{RFC8288}}, Section 3.4.1; {{RFC9264}}, Section 4.2.4.1),
and the extension target attribute `profile`, whose values are profile
URIs ({{RFC6906}}). As {{RFC9264}}, Section 4.2.4.1 requires, the
values of `type` and `title` are strings and the value of `hreflang` is
an array of strings. `type` is an advisory hint: a client MUST NOT
depend on it, and MUST use the media type of the response it actually
receives.

Every extension target attribute value, `profile` included, is an array
of strings, even when one value is carried ({{RFC9264}}, Section
4.2.4.3). A client MUST ignore an extension target attribute it does
not recognize.

### The digest attribute {#the-digest-attribute}

A link object MAY carry the target attribute `digest`. Its value is an
array holding one string. That string is the serialization of a
Dictionary ({{RFC9651}}, Section 3.2) with a single member whose key is
the algorithm name `sha-256` from the "Hash Algorithms for HTTP Digest
Fields" registry ({{RFC9530}}, Section 7.2) and whose value is a Byte
Sequence ({{RFC9651}}, Section 3.3.5) serialized as specified in
{{RFC9651}}, Section 4.1, that is, base64 between colons:

~~~ json
"digest": [
  "sha-256=:JeigkAtOPS9f9BzKym+X6J2O4awt53GEua1AhIAiLfE=:"
]
~~~

The digest is taken over the canonical bytes of the target: the bytes
the publisher generated and serves, before any content coding applied
by the transfer. A client that has retrieved the target compares the
digest against the decoded representation data. The attribute name is
deliberately not prefixed, so that a generic link set client that
already understands digest fields can read it.

### Bundle-fact attributes {#bundle-fact-attributes}

Facts about the Bundle as a whole ride on one link and one link only:
the `describedby` link of the anchor whose target is the Bundle's
JSON-LD graph. They are:

`agsc-spec-version`:
: one value, the version of {{AGSC-SPEC}} the node publishes against.

`agsc-generated-at`:
: one value, the instant the artefacts were generated, as
  `YYYY-MM-DDTHH:MM:SSZ` -- UTC, second precision, no offset. A node
  that supports reproducible builds derives it from the build's source
  date rather than from the wall clock.

`agsc-counts`:
: one string per item type, of the form `<type-plural>=<n>`, in code
  point order of the type name, counted over the published set.

`agsc-bundle-hash`:
: one value, the digest of the Bundle's canonical N-Quads
  serialization, in the syntax of {{the-digest-attribute}}; it equals
  the `digest` of the `graph` link to that serialization.

`agsc-bundle-version`:
: one value, the publisher's content version for the state the
  artefacts were generated from: a short name a person can read and
  cite, where the hash says only whether two retrievals carry the same
  content. It is derived by the publisher and is opaque to a client,
  which MUST NOT order two values or infer a sequence from them.

One further attribute rides on the `ledger` extension relation's link
and nowhere else:

`agsc-ledger-head`:
: one value, the lowercase hexadecimal SHA-256 of the last entry of the
  derived change ledger. A client that keeps the head it saw on an
  earlier retrieval can detect a ledger that no longer extends the one
  it read.

A client MUST NOT read a bundle-fact attribute from any other link.

### Declaration attributes {#declaration-attributes}

The extension target attributes below declare what a node is, rather
than what it published. They are present at every level of
completeness.

`agsc-surface` and `agsc-surface-version`:
: on a `surface` link, one value each: the kind of agent-facing surface
  the node serves, and, where the surface is defined by an external
  specification, the revision of that specification the node targets.

`agsc-access`:
: on a `surface` link, one value: `none`, `consent`, or `credential`.

`agsc-visibility`:
: on the anchor's `describedby` link, the single value `restricted`,
  emitted only by a node whose content is gated. A node whose content
  is public carries no such attribute.

`agsc-contribute-mode`:
: on a `contribute` link, one value naming how contributions are
  accepted.

`agsc-tombstone`:
: on the anchor's `describedby` link, one instant in the form of
  `agsc-generated-at`, present only on a node that has stopped
  publishing ({{tombstones}}).

A client that meets a value it does not know in any of these attributes
MUST NOT fail. It MUST treat the unknown value as the most restrictive
member of that attribute's list.

## The reduced form {#the-reduced-form}

A publisher without a build engine -- a content management system or a
wiki that exports static files -- publishes the same link set with
every `digest` attribute and every bundle-fact attribute omitted. Such
a publisher has no ledger, no build instant, no bundle hash and no
content version, and this document does not ask for any of them. The declaration attributes of
{{declaration-attributes}} are unaffected.

There is no structural difference between the two forms: `linkset` is
the sole top-level member in both, the anchor is the Bundle IRI in
both, and the relation set is the same. A client MUST treat a link
without a `digest` attribute as *unverified*, never as *invalid*.

## Related-system links {#related-system-links}

A node MAY carry, in the same link context, links to other discovery
documents and to related systems: an agent-facing text file, a dataset
description, a catalogue entry, an agent card, a tool server's
description, a query endpoint. Such links use registered short names
only, chosen by meaning: `describedby` when the target describes this
node, `alternate` when the target is the same knowledge in another
representation, `related` for a related resource, `service-desc`,
`service-doc`, and `service-meta` for an interface, `collection`
and `item` for containment, and `cite-as` ({{RFC8574}}) for the
identifier a reader should cite in preference to the node, such as a
persistent identifier's landing page. Each MUST carry `type` and MAY
carry `profile` and `title`.

A client MUST ignore a related-system link it does not understand. No
related-system link affects any digest, and none is followed by the
walk of {{following-peers}}, which follows `peer` links only.

# Discovery from a Page {#discovery-from-a-page}

A node SHOULD place, in the `head` element of every HTML page it
generates:

~~~ html
<link rel="describedby"
      href="/.well-known/knowledge-linkset"
      type="application/linkset+json">
~~~

and SHOULD send, at least on the origin's root route, the equivalent
response header field:

~~~ http-message
Link: </.well-known/knowledge-linkset>; rel="describedby";
  type="application/linkset+json"
~~~

## Why 'describedby', and why no new relation {#why-describedby}

`describedby` is registered in the "Link Relation Types" registry by
the POWDER Description Resources Recommendation {{POWDER-DR}}, whose
Appendix D defines it and whose Section 4.1.4 uses it; {{RFC6892}} registers its
inverse, `describes`. Its registered meaning -- the target is a
description of the context -- is exactly the meaning of this link. What
*kind* of description the target is, is said by the target's media type
and by its profile URI, not by a new relation name. A new relation
would add a name for a distinction the media type already draws, and
would leave every existing `describedby`-aware client unable to use it.

A page may carry several `describedby` links, because other
conventions, {{LLMSTXT}} among them, use the same relation for their
own description resources. A client selects this one by
`type="application/linkset+json"`, and, having fetched it, confirms the
profile ({{media-type-and-profile}}). Where several candidates remain,
a client SHOULD fetch the one whose `href` resolves to
`/.well-known/knowledge-linkset` on the origin.

This document therefore requests no link relation registration.

# The Profile URI {#the-profile-uri}

The profile URI of the discovery document is

~~~
https://w3id.org/agentic-system-core/profile/agentic-knowledge
~~~

## What the profile fixes {#what-the-profile-fixes}

A client that ignores the profile reads the document as a link set and
nothing is lost ({{RFC6906}}, Section 3). A client that recognizes it
may rely on the following, all of which are specified in this document:

* `linkset` is the sole top-level member, and the array holds one link
  context whose `anchor` is the Bundle IRI
  ({{top-level-structure}});
* the relation set is the closed set of {{relations}}, which only a
  later version of {{AGSC-SPEC}} extends ({{versions}});
* `digest`, where present, is a single-member Dictionary keyed
  `sha-256` over the canonical bytes of the target
  ({{the-digest-attribute}});
* bundle facts ride on the anchor's `describedby` link to the graph,
  and the ledger head on the `ledger` link, and nowhere else
  ({{bundle-fact-attributes}});
* every extension target attribute value is an array of strings
  ({{target-attributes}}).

The profile constrains no other document and changes the semantics of
`application/linkset+json` for no client.

## Carriage and resolution {#carriage-and-resolution}

The profile URI is carried as specified in {{media-type-and-profile}}:
on the media type, or in a `Link` header field, or both.

The profile URI, and every extension relation URI of {{relations}},
resolves through w3id.org, a persistent-identifier service, with an
HTTP 303 redirect ({{RFC9110}}, Section 15.4.4) to a published
specification page. That page carries one fragment identifier for the
list of relations and one per relation name, so that every extension
relation URI dereferences to its own documentation, as {{RFC8288}},
Section 2.1.2, expects of an extension relation.

Registration of the profile URI is requested independently of this
document; see {{iana-profile-uri}}.

## Versions {#versions}

The profile URI carries no version number. It names the same profile
for every version of {{AGSC-SPEC}} that has the same major version
number, and a discovery document in the full form states the version
it follows in its `agsc-spec-version` attribute
({{bundle-fact-attributes}}).

A later minor version of {{AGSC-SPEC}} only adds to what this document
describes: further members of the closed set of extension relations of
{{relations}}, under the same base URI and each with its own fragment
on the specification page of {{carriage-and-resolution}}; further
extension target attributes with the `agsc-` prefix; further
related-system relations once they are registered; and further values
of the declaration attributes. A client written against this document
ignores an unknown relation name ({{relations}}), an unknown extension
target attribute ({{target-attributes}}) and a related-system link it
does not understand ({{related-system-links}}), and treats an unknown
declaration value as {{declaration-attributes}} requires, so it reads a
document written against a later minor version without error and
without change. A change that such a client could not read in that way
is made only in a new major version of {{AGSC-SPEC}}.

# Client Behaviour {#client-behaviour}

A client of this document is any program that fetches a discovery
document: a crawler, an agent runtime, a validator, a browser script.
This section states what such a client is required to do. A client that
only fetches one document from an origin it was given needs
{{untrusted-content}} and {{fetch-safety}}; a client that follows
`peer` links needs all of it.

## Fetch safety {#fetch-safety}

* A client MUST fetch a discovery document with an absolute URL whose
  scheme is `https`. `http` is permitted only to a loopback address and
  only when the client has been explicitly placed in a development
  mode. Any other scheme, and any relative reference, MUST be refused.
* Before connecting, a client MUST resolve the host and MUST refuse any
  resolved address that is not globally reachable according to the IANA
  IPv4 Special-Purpose Address Registry {{IANA-IPV4-SPECIAL}} or, for an
  IPv6 address, according to the IANA IPv6 Special-Purpose Address
  Registry {{IANA-IPV6-SPECIAL}}. A client MUST equally
  refuse any IPv6 address that embeds an IPv4 address -- IPv4-mapped,
  IPv4-compatible, NAT64, Teredo, and 6to4 addresses -- classifying the
  embedded IPv4 address instead, and any multicast address. A host that
  resolves to several addresses MUST be refused if any one of them is
  refused.
* A client MUST classify addresses with a tested library or with the
  platform's own classification, and MUST NOT parse address literals by
  hand.
* A client MUST connect to one of the addresses it classified, MUST NOT
  re-resolve the host between classification and connection, and MUST
  re-verify the remote address of the established connection against
  the same rules, closing the connection on a mismatch. This is the
  guard against DNS rebinding.
* A client MUST bound the number of redirects it follows, MUST re-apply
  the two rules above to every hop, and MUST NOT follow a redirect to a
  non-`https` URL other than the development loopback case. The final
  URL of a redirected fetch is not substituted for the URL that was
  declared.
* A client MUST bound the size of a discovery document it will read.
  One mebibyte is a sufficient bound for the documents this document
  describes; a client MUST treat a larger response as unreadable rather
  than buffering it.
* A client SHOULD bound the time it waits for a response.

## Following peers {#following-peers}

A node names peers with the `peer` extension relation; the target is
the peer's discovery document URL. Two nodes are peers of each other
when each names the other; nothing else establishes the relation, and
nothing about it is negotiated.

A client that walks from a starting node MUST:

* bound the depth of the walk, the starting node being depth zero;
* consider at most a fixed number of `peer` links per discovery
  document, in document order, ignoring the rest;
* issue at most a fixed number of requests per walk, counting every
  request including redirects;
* keep a visited set keyed by the canonical well-known URL, and never
  fetch a member of it twice, which is the guard against cycles across
  origins;
* treat a peer whose fetch times out, returns a non-2xx status, exceeds
  the size bound, or yields a document that is not a conformant
  discovery document as unreachable: record it, skip it, and never
  retry it within the walk.

A client that stops because a bound was reached, or that ignored links
beyond its per-document bound, MUST report the result as partial, with
the set of nodes it did visit. A client that completes without touching
any bound MUST report the result as complete. The number of requests a
walk can make is bounded by the smaller of the request bound and the
sum, over the permitted depths, of the per-document bound raised to the
power of the depth.

Suggested defaults, which a deployment may lower and which this
document does not require a client to exceed: depth three, fifty `peer`
links per document, five hundred requests per walk, ten seconds per
request, three redirects per fetch.

## Untrusted content {#untrusted-content}

Everything a client obtains from a node other than the one it is acting
for is untrusted data. A client MUST carry that fact with the data: a
search hit, a retrieved item, a chunk, or a quotation derived from
another node MUST be labelled untrusted and MUST name the origin it
came from, through every interface the client offers and every export
it produces. A client MUST NOT merge another node's prose into its own
published artefacts other than through a reviewed proposal that records
the other node's IRI as the source.

## Federation is client-side {#federation-is-client-side}

The walk of {{following-peers}} is performed by the client. A node's
query surface is the set of artefacts it publishes. A node MUST NOT
fetch another node while building its own artefacts, and MUST NOT
expose an endpoint that fetches another node on a caller's behalf.
There is therefore no server-to-server call anywhere in this design,
and no node can be made into an open relay by naming it as a peer.

# Relationship to Other Work {#relationship-to-other-work}

This section records what neighbouring work does. It is informative.
Every statement is of the form "that work addresses X"; none is a
comparison.

`api-catalog` {{RFC9727}} registers a well-known URI whose
representation is a link set identified by a profile URI, listing an
origin's APIs. It is the precedent for the shape used here, applied to
a different object.

`llms.txt` {{LLMSTXT}} is a community convention for a Markdown file at
`/llms.txt` that presents an origin's content for consumption by
language models. Version 2, modified 10 August 2026, recommends
`rel="describedby"` for pointing at the file and `rel="alternate"` with
`type="text/markdown"` for pointing at a page's Markdown rendering. A
node may name such a file with the `alternate` relation.

{{I-D.arsentev-llm-context-discovery}} defines discovery of a
publisher-curated context file, typically `/llms.txt`, through a
well-known URI, a link relation, and a `robots.txt` record, and sets
size bounds on the index and detail resources. It discovers one text
file.

{{I-D.serra-mcp-discovery-uri}} defines an `mcp` URI scheme and the
discovery of Model Context Protocol servers through a well-known path
and DNS TXT records.

{{MCP}} defines a protocol between a client and a tool server, and
carries proposals for server cards that describe a server. A node may
declare a Model Context Protocol server as one of its surfaces
({{declaration-attributes}}).

{{A2A}} defines an agent card, served at a well-known path, that
describes an agent's capabilities and interfaces. A node may declare an
agent card as one of its surfaces.

The proposed `dawn` working group {{DAWN-CHARTER}} addresses the
discovery of agents by name. The survey
{{I-D.jimenez-dawn-discovery-landscape}} catalogues the mechanisms in
that space.

The `agentproto` BOF request {{AGENTPROTO-BOF}} addresses long-lived
sessions between agents and the resources they use.

The `aipref` working group defines a vocabulary for expressing
preferences about AI usage of content {{I-D.ietf-aipref-vocab}} and the
means of attaching such preferences to content in HTTP
{{I-D.ietf-aipref-attach}}. This document defines no preference
expression; a publisher attaches preferences by those means, and by
`robots.txt` {{RFC9309}}, to the artefacts a discovery document names.

The `webbotauth` working group defines HTTP message signatures for
automated traffic {{I-D.ietf-webbotauth-httpsig-protocol}}, which
identify the client making a request.

The W3C AI Agent Memory Interoperability Community Group {{AIMEM-CG}}
addresses the interoperability of protocols for AI agent memory. The
artefacts a discovery document names are read-only published files, not
a memory interface.

The Open Knowledge Format {{OKF}} defines a content model of Markdown
files with front matter and an index file. It calls its unit a
"Knowledge Bundle"; the Bundle of this document is a different object
and the two names are not interchangeable.

VoID {{VOID}} defines a vocabulary for describing RDF datasets and is
associated with the registered well-known URI `void`. DCAT
{{DCAT3}} defines a vocabulary for describing catalogues and datasets.
A publisher that also publishes such a description names it with a
further `describedby` link ({{related-system-links}}).

Two further Internet-Drafts request well-known URI suffixes for
AI-related discovery: {{I-D.aiendpoint-ai-discovery}} requests `ai`
(with `ai-discovery` as an alternative) for a description of a service's
capabilities, and {{I-D.car-ai-txt-wellknown}} requests `ai.txt` and
`ai.json` for declarations of AI usage preferences and licensing. Both
describe an endpoint or a policy. The suffix requested here names the
class of resource served -- a link set of published knowledge artefacts
-- and deliberately does not begin with `ai` or `agent`.

# Security Considerations {#security-considerations}

## What a digest proves {#what-a-digest-proves}

A `digest` attribute binds an artefact to the discovery document. It
lets a client detect that the artefact it retrieved is not the one the
publisher described: a truncated file, a cache that served an older
copy, a mirror that altered the bytes, a transfer that corrupted them.

A `digest` attribute does not bind the discovery document to an author.
An attacker who controls the origin controls the discovery document and
the artefacts together, and can make them agree. A client obtains the
identity of the publisher from the TLS certificate and the DNS name of
the origin, and from nothing in the document. A publisher who needs a
client to verify authorship independently of the origin signs the
responses -- {{RFC9421}} defines one way -- or publishes a detached
signature and names it with the `signature` extension relation
({{relations}}). This document defines no signature format: a client
MUST ignore that link if it does not understand the target, and the
link affects no digest and no walk.

A client that keeps the `agsc-ledger-head` value it saw on an earlier
retrieval, and that later reads a head that does not extend the earlier
one, has observed a rollback or a replacement of the ledger, and SHOULD
treat it as such rather than as an ordinary update.

## Fetching {#fetching-security}

A discovery document is a list of URLs supplied by a third party, and a
client that follows them is a request forwarder. {{fetch-safety}} is
therefore normative and not advisory: the scheme restriction, the
address refusals, the rule against re-resolving between classification
and connection, the re-verification of the established connection, the
redirect bounds, and the size bound together keep a client from being
used to reach a network the attacker cannot reach, to probe an internal
address space, or to be held open. A client that omits them can be
directed, by any origin it reads, at any address its network can reach.

Because no node ever fetches another node ({{federation-is-client-side}}),
a node cannot be turned into a request forwarder by being named as a
peer. The risk is entirely on the client side, where the bounds apply.

## Content is data {#content-is-data}

The artefacts a discovery document names are documents, and the prose
in them is data. A client that passes retrieved prose to a language
model, a shell, a query engine, or any other interpreter MUST treat it
as data: never executed, never interpolated into a path, a URL, or a
command string, never resolved as an identifier, and never read as an
instruction to the client. Prose retrieved from another node carries
the untrusted label of {{untrusted-content}} to every place it is used.

## What is not claimed {#what-is-not-claimed}

The mechanisms of this document prove neither safety nor the absence of
a novel attack carried in the content of an artefact. A digest proves
only that an artefact is what was published. An implementation MUST NOT
claim more.

## Exposure {#exposure}

A discovery document is public. A publisher MUST NOT name in it any
resource that is not intended to be public, and MUST NOT let the set of
links reveal the existence of resources it does not serve publicly. A
node whose content is gated serves the discovery document publicly all
the same ({{cross-origin-access}}), which is a deliberate disclosure
that the node exists.

A node whose content is gated MUST omit the `agsc-counts`,
`agsc-bundle-hash` and `agsc-bundle-version` attributes and the
`ledger` link, and MUST omit every `digest` whose target it does not
serve without authentication: a digest over a gated artefact lets
anyone confirm a guess of its content, and the counts and the content
version disclose activity. It still carries `agsc-spec-version` and
`agsc-generated-at`, which say only that the node exists and is
current.

The path `/.well-known/` on an origin MUST be under the publisher's
control. On static hosting this means that the file is produced by the
publisher's build and upload path and by nothing else.

## Size {#size}

A client MUST bound the size of a discovery document it reads
({{fetch-safety}}) and the number of requests a walk may make
({{following-peers}}). A publisher SHOULD keep a discovery document
small: it describes a Bundle's artefacts, not its items.

## Tombstones {#tombstones}

A node that stops publishing MUST keep serving a valid discovery
document whose anchor's `describedby` link carries the
`agsc-tombstone` attribute of {{declaration-attributes}}, MAY carry an
`alternate` link to a successor node's discovery document, and MAY omit
every other artefact link.

A client MUST NOT treat a successor named that way as the same node. It
MUST establish the peer relation with the successor afresh, and
everything it derives from the successor carries the successor's own
Bundle IRI as its origin ({{untrusted-content}}). A walk
({{following-peers}}) does not descend into a tombstoned node.

# Privacy Considerations {#privacy-considerations}

A discovery document is a static description of an origin's own
published artefacts. Serving it collects nothing, sets no cookie,
carries no identifier of a reader, and requires no request header field
beyond those a simple cross-origin request already carries
({{cross-origin-access}}). A client's retrieval appears in the
publisher's server logs like any other request for a static file.

The document may name an `author` link, and the artefacts it points at
may contain personal data. What appears there is chosen by the
publisher, and this document requires no personal data anywhere in the
discovery document. A publisher SHOULD use a role rather than a
personal contact where one will do.

A client SHOULD NOT send identifying header fields beyond those
{{RFC9110}} makes ordinary when fetching a discovery document, and a
client walking peers SHOULD NOT disclose to one node which other nodes
it has visited.

# IANA Considerations {#iana-considerations}

This document requests one registration in an existing registry and
records the fields of one further registration that is to be requested
separately. It creates no
registry, requests no media type, requests no URI scheme, and requests
no link relation type. No allocation described here requires IETF
Review or Standards Action.

## Well-Known URI Registration {#iana-well-known-uri}

IANA is requested to register the following entry in the "Well-Known
URIs" registry, per {{RFC8615}}, Section 3.1:

* **URI suffix**: knowledge-linkset
* **Change controller**: Andrei N. Besleaga
  (andrei.besleaga.nicolae@gmail.com)
* **Specification document(s)**: This document.
* **Status**: provisional
* **Related information**: Used with the "https" URI scheme. The
  resource is an `application/linkset+json` document {{RFC9264}}
  carrying the profile URI
  `https://w3id.org/agentic-system-core/profile/agentic-knowledge`,
  whose registration is described in {{iana-profile-uri}}.

The suffix names the class of resource served -- a link set of the
knowledge artefacts an origin publishes -- rather than a subject area,
in keeping with the precision {{RFC8615}}, Section 3, expects of a
registered name. Provisional status is requested because this is an
Independent Submission; the designated experts may promote the entry to
permanent once the resource is found to be in wide use ({{RFC8615}},
Section 3.1).

## Profile URI {#iana-profile-uri}

Registration of the following profile URI in the "Profile URIs"
registry ({{RFC7284}}, Section 4) is to be requested separately from
this document; that registry's policy is First Come First Served. The
fields are given here so that this document, which specifies the
profile, records them:

* **Profile URI**:
  `https://w3id.org/agentic-system-core/profile/agentic-knowledge`
* **Common Name**: AgenticSystemCore knowledge link set profile
* **Description**: Identifies an `application/linkset+json` document
  {{RFC9264}} that describes a published knowledge Bundle: one link
  context whose anchor is the Bundle IRI, links to the Bundle's
  artefacts -- graph serializations, a JSON-LD context, a vocabulary, a
  chunk export, an agent-facing text file, a change ledger -- each
  optionally carrying a `digest` target attribute in the syntax of
  {{RFC9530}}, and the bundle-fact and declaration target attributes
  this document defines. Served at `/.well-known/knowledge-linkset`;
  linked from pages with `rel="describedby"` and
  `type="application/linkset+json"`.
* **Reference**: This document; and {{AGSC-SPEC}}, which defines the
  artefacts and their canonical bytes.
* **Notes**: The profile does not change the semantics of
  `application/linkset+json` for a client that ignores it ({{RFC6906}},
  Section 3); it adds integrity, bundle-fact, and declaration target
  attributes that a client MAY use. The same profile URI serves every
  version of the AgenticSystemCore specification with the same major
  version number; a document in the full form states the version it
  follows in its `agsc-spec-version` attribute. Change controller:
  Andrei N. Besleaga, Independent, andrei.besleaga.nicolae@gmail.com.

# Implementation Status {#implementation-status}

> \[Note to the RFC Editor: please remove this section before
> publication.]

{::boilerplate rfc7942}

The implementations recorded here are those of the author, at the time
of writing.

**Reference node.**

* Organization: the author (Independent).
* Name and description: the node at `https://agenticsystemcore.com/`,
  a static site that serves a discovery document at
  `/.well-known/knowledge-linkset`, the artefacts it names, and the
  published specification that the profile URI and the extension
  relation URIs resolve to.
* Level of maturity: working implementation of a specification that is
  at release-candidate status; the node is public at the address above,
  and the reference engine is publicly released at 1.0.0-rc.6 (npm and
  PyPI `agentic-system-core`).
* Coverage: {{the-well-known-uri}}, {{the-link-set}},
  {{discovery-from-a-page}}, and {{the-profile-uri}}, in the full form;
  the reduced form of {{the-reduced-form}} is exercised by the
  validator's level-0 mode.
* Version compatibility: {{AGSC-SPEC}}.
* Licensing: the site's own terms; see the node.
* Contact: the author.

**Validator.**

* Organization: the author (Independent).
* Name and description: `validate-wellknown`, a command-line validator
  that takes a URL or a local file and checks that the response media
  type is `application/linkset+json` or that a `Link` header field
  names the profile URI; that `linkset` is the sole top-level member;
  that every relation name is a registered short name or a member of
  the closed extension set; that every extension target attribute value
  is an array of strings; that the reduced form's omissions are
  accepted where the reduced form is claimed and that the digests and
  bundle facts are present and recomputable otherwise. A `--peer` flag
  performs the mutual test of {{following-peers}} and accepts two local
  files, so that the test runs with no network access.
* Level of maturity: working implementation; publicly released with
  the reference engine at 1.0.0-rc.6 (npm and PyPI
  `agentic-system-core`).
* Coverage: {{the-well-known-uri}}, {{the-link-set}}, and the mutual
  peer test of {{following-peers}}.
* Licensing: Apache-2.0.
* Contact: the author.

**Conformance vectors.**

* Organization: the author (Independent).
* Name and description: a set of JSON test vectors for the discovery
  layer, each naming the rule it proves: the conformant link set shape
  and its target attributes, the reduced form, and the mutual peer
  test. They are fixtures rather than an implementation, and any
  independent implementation can be run against them.
* Level of maturity: working implementation; the vectors are fixtures,
  publicly released with the reference engine at 1.0.0-rc.6.
* Coverage: {{the-link-set}}, {{the-reduced-form}},
  {{following-peers}}.
* Licensing: Apache-2.0.
* Contact: the author.

--- back

# A Complete Example {#a-complete-example}

The document below is a complete discovery document for a node at
`https://example.org/`, in the full form of {{the-link-set}}. It is
shown pretty-printed; a node that produces canonical bytes
{{RFC8785}} serves the equivalent document with no insignificant
whitespace.

~~~ json
NOTE: '\' line wrapping per RFC 8792

{
  "linkset": [
    {
      "anchor": "https://example.org/",
      "alternate": [
        {
          "href": "https://example.org/llms-full.txt",
          "type": "text/plain",
          "digest": [
            "sha-256=:Nfm1AxNikrZAb82mhnWgjpi3i8rGJa9K64wnI0ZiJY0=:"
          ]
        },
        {
          "href": "https://example.org/llms.txt",
          "type": "text/plain",
          "digest": [
            "sha-256=:QjxPZtSHNKLvYtiXXCOwnjJn+fYmfqkRYmash8n7+O0=:"
          ]
        }
      ],
      "author": [
        {
          "href": "https://example.org/about/",
          "type": "text/html"
        }
      ],
      "describedby": [
        {
          "href": "https://example.org/graph.jsonld",
          "type": "application/ld+json",
          "agsc-bundle-hash": [
            "sha-256=:/WQyaCbIwaeGFFMAFw/eMonm8tK+F7amphaKNT4BpB0=:"
          ],
          "agsc-bundle-version": [
            "v1.4.0"
          ],
          "agsc-counts": [
            "clusters=6",
            "concepts=142",
            "episodes=17",
            "gates=4",
            "lessons=39",
            "procedures=28"
          ],
          "agsc-generated-at": [
            "2026-10-09T08:15:00Z"
          ],
          "agsc-spec-version": [
            "1.0.0-rc.6"
          ],
          "digest": [
            "sha-256=:JeigkAtOPS9f9BzKym+X6J2O4awt53GEua1AhIAiLfE=:"
          ]
        }
      ],
      "license": [
        {
          "href": "https://example.org/legal/",
          "type": "text/html"
        }
      ],
      "service-doc": [
        {
          "href": "https://example.org/specs/",
          "type": "text/html"
        }
      ],
      "https://w3id.org/agentic-system-core/rel#context": [
        {
          "href": "https://example.org/ns/context.jsonld",
          "type": "application/ld+json",
          "digest": [
            "sha-256=:Dv8ogyqhEZ0jxdWQj0FkVfpXbuTnyfvWEFNwtbRTSEA=:"
          ]
        }
      ],
      "https://w3id.org/agentic-system-core/rel#graph": [
        {
          "href": "https://example.org/graph.nq",
          "type": "application/n-quads",
          "digest": [
            "sha-256=:/WQyaCbIwaeGFFMAFw/eMonm8tK+F7amphaKNT4BpB0=:"
          ]
        },
        {
          "href": "https://example.org/graph.ttl",
          "type": "text/turtle",
          "digest": [
            "sha-256=:SylBDgXPkysmlRZkx+BvHSxVTbm3ZWGzFXskHf+kH80=:"
          ]
        }
      ],
      "https://w3id.org/agentic-system-core/rel#ledger": [
        {
          "href": "https://example.org/ledger.jsonl",
          "type": "application/jsonl",
          "agsc-ledger-head": [
            "6acd55d78bf24c2b7866c0e46a3bb88a4b7259cea9ca0bfa6263\
81068b0d56ed"
          ],
          "digest": [
            "sha-256=:mIn5HVeWxmn0Ecmh5Qwkc3doL+0fdO+Z7HieEDozhz0=:"
          ]
        }
      ],
      "https://w3id.org/agentic-system-core/rel#now": [
        {
          "href": "https://example.org/now.md",
          "type": "text/markdown",
          "digest": [
            "sha-256=:cJvRMVgkkW5Usdn/z0q1iNxyBErb59kLWRv83qvpx8A=:"
          ]
        }
      ],
      "https://w3id.org/agentic-system-core/rel#ontology": [
        {
          "href": "https://example.org/ns/agsc.ttl",
          "type": "text/turtle",
          "digest": [
            "sha-256=:kjVLSaNilITtebImxe9J+ukr7UOdmTG+NAtppRjsrH8=:"
          ]
        }
      ],
      "https://w3id.org/agentic-system-core/rel#peer": [
        {
          "href": "https://b.example/.well-known/knowledge-linkset",
          "type": "application/linkset+json"
        }
      ],
      "https://w3id.org/agentic-system-core/rel#skills": [
        {
          "href": "https://example.org/skills/index.json",
          "type": "application/json",
          "digest": [
            "sha-256=:NnyPQz+rxvP/Zl9ja4+0xRSCpb7gdArcAVXlAG5IoU0=:"
          ]
        }
      ],
      "https://w3id.org/agentic-system-core/rel#surface": [
        {
          "href": "https://example.org/chunks.jsonl",
          "type": "application/jsonl",
          "agsc-access": [
            "none"
          ],
          "agsc-surface": [
            "chunks"
          ],
          "digest": [
            "sha-256=:vAlDuXGRaRPyTeeRfLAFWa7acFyOL3Y7o+vbywRofDk=:"
          ]
        },
        {
          "href": "https://example.org/llms.txt",
          "type": "text/plain",
          "agsc-access": [
            "none"
          ],
          "agsc-surface": [
            "llms-txt"
          ]
        }
      ]
    }
  ]
}
~~~
{: title="A complete discovery document"}

The same node, publishing without a build engine, serves the reduced
form of {{the-reduced-form}}: a link set of the same structure that
names only the artefacts such a publisher has, with no `digest`
attribute, no bundle-fact attribute and no `ledger` link.

~~~ json
{
  "linkset": [
    {
      "anchor": "https://example.org/",
      "alternate": [
        {
          "href": "https://example.org/llms.txt",
          "type": "text/plain"
        }
      ],
      "describedby": [
        {
          "href": "https://example.org/graph.jsonld",
          "type": "application/ld+json"
        }
      ],
      "license": [
        {
          "href": "https://example.org/legal/"
        }
      ]
    }
  ]
}
~~~
{: title="The same document in the reduced form"}

# Change Log {#change-log}

> \[Note to the RFC Editor: please remove this appendix before
> publication.]

This is the initial version, -00. Later revisions record their changes
here.
