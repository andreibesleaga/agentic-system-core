# Trace: PRD-024, PRD-025, PRD-050, PRD-054, PRD-055, PRD-057, PRD-058 · PLAN §7 (w3id conneg) · spec/10 §10.4, spec/11 §11.3
@persona-j @mode-1
Feature: Standards implementer adopts the discovery format on their own site
  As P11 (standards implementer)
  I want one well-known discovery file with an RFC 9264 linkset and content negotiation for the vocabulary
  So that I can adopt the pattern on my own site using only static files, no server code

  @PRD-024 @human @matrix-H15
  Scenario: Implementer discovers the linkset via the well-known URI
    When the implementer reads "/.well-known/knowledge-linkset" and the headers "_headers" serves it with
    Then it is served as "application/linkset+json" with profile "https://w3id.org/agentic-system-core/profile/agentic-knowledge" and "linkset" is its sole top-level member (AGSC-06-17, AGSC-06-08)
    And it is a RFC 9264 linkset with "anchor" equal to the site base
    And it links "describedby" to "/graph.jsonld"
    And it links relation "https://w3id.org/agentic-system-core/rel#graph" to "/graph.nq" and to "/graph.ttl"
    And it links relation "…rel#context" to "/ns/context.jsonld", and carries no "…rel#ontology" link, because a content node does not serve the vocabulary (AGSC-06-10)
    And it links relation "…rel#now" to "/now.md" and "…rel#skills" to "/skills/index.json"
    And it links "alternate" to "/llms.txt", and every target on the node's own origin is a file the build emitted

  @PRD-024 @human @matrix-H15
  Scenario: Implementer verifies the link-set integrity attributes
    When the implementer reads the "describedby" link to "/graph.jsonld" inside "/.well-known/knowledge-linkset"
    Then it carries "agsc-spec-version", "agsc-generated-at", "agsc-counts" and "agsc-bundle-hash", every value an array
    And the "…rel#graph" and "…rel#ledger" links each carry a "digest" of the form "sha-256=:<base64>:"
    And "agsc-generated-at" derives from "SOURCE_DATE_EPOCH", never the wall clock

  @PRD-050 @agent @matrix-H15
  Scenario: The w3id rule file sends the namespace, a fixed version, the profile and the relations to the site
    When the agent reads the rules of "w3id/.htaccess" that w3id serves under "https://w3id.org/agentic-system-core/"
    Then each of these requests is answered "303 See Other" with this "Location":
      | path                      | Accept              | Location                                                    |
      | ns                        | text/turtle         | https://agenticsystemcore.com/ns/agsc.ttl                   |
      | ns                        | application/ld+json | https://agenticsystemcore.com/ns/context.jsonld             |
      | ns                        | text/html           | https://agenticsystemcore.com/ns/                           |
      | ns/1.0.0                  | text/turtle         | https://agenticsystemcore.com/ns/1.0.0/agsc.ttl             |
      | ns/1.0.0                  | application/ld+json | https://agenticsystemcore.com/ns/1.0.0/context.jsonld       |
      | ns/1.0.0                  | text/html           | https://agenticsystemcore.com/ns/1.0.0/                     |
      | ns/1.0.0-draft.1          | text/turtle         | https://agenticsystemcore.com/ns/1.0.0-draft.1/agsc.ttl     |
      | profile/agentic-knowledge | */*                 | https://agenticsystemcore.com/specs/agentic-knowledge/      |
      | rel                       | */*                 | https://agenticsystemcore.com/specs/agentic-knowledge/      |
    And every "Location" the rules can produce is on "https://agenticsystemcore.com/", so no rule is an open redirect

  @PRD-050 @human @matrix-H15
  Scenario: Implementer content-negotiates the vocabulary via w3id
    When the implementer requests "https://w3id.org/agentic-system-core/ns#Concept" with "Accept: text/turtle"
    Then w3id's ".htaccess" issues a 303 redirect to "/ns/agsc.ttl"
    When the same IRI is requested with "Accept: application/ld+json"
    Then w3id issues a 303 redirect to "/ns/context.jsonld"
    When the same IRI is requested with no matching Accept header
    Then the response is the "/ns/" HTML index
    And every redirect target is same-origin, never an open redirect

  @PRD-025 @human @matrix-H15
  Scenario: Implementer falls back to llms.txt without any RDF tooling
    When the implementer fetches "/llms.txt"
    Then every published item is reachable from the listed links
    And no authentication or API key is required

  @PRD-054 @human @matrix-H15
  Scenario: Implementer validates the published artifacts with the shipped tools
    When the implementer runs "the shipped validate-wellknown tool on https://agenticsystemcore.com/.well-known/knowledge-linkset"
    Then it exits 0 and prints an agsc.diagnostics.v1 envelope with verb "validate-wellknown"
    And running it against a linkset carrying an unregistered short name exits 1

  @PRD-024 @PRD-055 @human @matrix-H15
  Scenario: A node served on loopback passes the shipped checker at Level 1
    Given a fresh copy of the acceptance Bundle
    When the Bundle is built and served on loopback
    Then the shipped validate-wellknown passes at Level 1 over loopback

  @PRD-024 @agent @matrix-H15
  Scenario: A discovery document served as application/json with a profile Link fails Level 2
    Given a fresh copy of the acceptance Bundle
    And the Bundle is built and served on loopback
    When the host serves the discovery document as "application/json", with the profile carried only by a "Link: rel=profile" header
    Then the shipped validate-wellknown fails at Level 2 over loopback
    And its finding "AGSC-E201" says the media type "application/json" is not "application/linkset+json" (AGSC-06-07)

  @PRD-057 @human @matrix-H16
  Scenario: Two publishers federate and pass the mutual check both ways
    Given two publishers build the nodes "a.example" and "b.example" from the acceptance Bundle, each naming the other in "peers[]"
    When the publisher runs the shipped validate-wellknown at Level 2 on the discovery file of "a.example" with "--peer" the discovery file of "b.example"
    Then it exits 0, and so does the same check from "b.example" to "a.example" (AGSC-10-12)
    And a node "c.example" that names "a.example" as its peer, while "a.example" does not name it, is "resolved, not mutual" with "AGSC-E907"

  @PRD-058 @human @matrix-H16
  Scenario: A publisher advertises a contribute channel
    Given a fresh copy of the acceptance Bundle
    And the publisher adds the contribute entry "urn:agsc:channel:inbox" in mode "channel", backed by the channel "inbox" that publishes "hitl"
    When the Bundle is built
    Then the discovery document carries one "…rel#contribute" link per "contribute[]" entry, each with its mode as "agsc-contribute-mode" (AGSC-11-14)
    When the channel "inbox" is set to publish "auto"
    And the publisher runs "agsc lint --json"
    Then the JSON envelope carries the error "AGSC-E209"

  @PRD-057 @agent @matrix-A9
  Scenario: A cross-node citation carries rdfs:seeAlso and asc:peerOrigin
    Given the node "a.example" names "b.example" as its peer, and its item "handoff" cites "https://b.example/concepts/supervisor/" and "https://elsewhere.example/paper/" in "sources[]"
    When the Bundle is built
    Then "graph.nq", "graph.ttl" and "graph.jsonld" of "a.example" each say that "handoff" has "rdfs:seeAlso" "https://b.example/concepts/supervisor/" and "asc:peerOrigin" "https://b.example/" (AGSC-11-12)
    And the source on "elsewhere.example", which no peer declares, gets neither, and no Link key of "handoff" names a URL

  @PRD-057 @agent @matrix-A9
  Scenario Outline: A peer at an IPv4-compatible or IPv4-mapped address is refused as the shipped checker refuses it
    Given the node "a.example" names "b.example" as its peer, and the Bundle is built
    When an agent walks the federation from "a.example" while "b.example" resolves to "<address>"
    Then the walk skips "b.example" with "AGSC-E905" and never reads it (AGSC-11-08)
    And the shipped validate-wellknown refuses "https://[<address>]/.well-known/knowledge-linkset" with "AGSC-E905" and makes no network call

    Examples:
      | address        |
      | ::127.0.0.1    |
      | ::ffff:8.8.8.8 |
