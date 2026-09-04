# Trace: PRD-024, PRD-025, PRD-050 · audit/D §3(j) · PLAN §7 (w3id conneg)
# Source of truth: discovery-product/audit/D-v1-system-walkthrough.md §3(j) "Standards implementer discovering via /.well-known/agentic-knowledge"
@persona-j @mode-1
Feature: Standards implementer adopts the discovery format on their own site
  As P11 (standards implementer)
  I want one well-known discovery file with an RFC 9264 linkset and content negotiation for the vocabulary
  So that I can adopt the pattern on my own site using only static files, no server code

  @PRD-024
  Scenario: Implementer discovers the linkset via the well-known URI
    When the implementer runs 'curl -H "Accept: application/linkset+json" https://agenticsystemcore.com/.well-known/agentic-knowledge'
    Then the response is served as "application/linkset+json" with profile "https://w3id.org/agentic-system-core/profile/agentic-knowledge" and "linkset" is its sole top-level member
    And it is a RFC 9264 linkset with "anchor" equal to the site base
    And it links "describedby" to "/graph.jsonld"
    And it links relation "https://w3id.org/agentic-system-core/rel#graph" to "/graph.jsonld" and to "/graph.ttl"
    And it links relation "…rel#ontology" to "/ns/agsc.ttl" and "…rel#context" to "/ns/context.jsonld"
    And it links relation "…rel#now" to "/now.md" and "…rel#skills" to "/skills/index.json"
    And it links "alternate" to "/llms.txt" and "service-doc" to "/specs/"

  @PRD-024
  Scenario: Implementer verifies the link-set integrity attributes
    When the implementer reads the "describedby" link to "/graph.jsonld" inside "/.well-known/agentic-knowledge"
    Then it carries "agsc-spec-version", "agsc-generated-at", "agsc-counts" and "agsc-bundle-hash", every value an array
    And the "…rel#graph" and "…rel#ledger" links each carry a "digest" of the form "sha-256=:<base64>:"
    And "agsc-generated-at" derives from "SOURCE_DATE_EPOCH", never the wall clock

  @PRD-050
  Scenario: Implementer content-negotiates the vocabulary via w3id
    When the implementer requests "https://w3id.org/agentic-system-core/ns#Concept" with "Accept: text/turtle"
    Then w3id's ".htaccess" issues a 303 redirect to "/ns/agsc.ttl"
    When the same IRI is requested with "Accept: application/ld+json"
    Then w3id issues a 303 redirect to "/ns/context.jsonld"
    When the same IRI is requested with no matching Accept header
    Then the response is the "/ns/" HTML index
    And every redirect target is same-origin, never an open redirect

  @PRD-025
  Scenario: Implementer falls back to llms.txt without any RDF tooling
    When the implementer fetches "/llms.txt"
    Then every published item is reachable from the listed links
    And no authentication or API key is required

  @PRD-054
  Scenario: Implementer validates the published artifacts with the shipped tools
    When the implementer runs "node tools/validate-wellknown https://agenticsystemcore.com/.well-known/agentic-knowledge"
    Then it exits 0 and prints an agsc.diagnostics.v1 envelope with verb "validate-wellknown"
    And running it against a linkset carrying an unregistered short name exits 1
