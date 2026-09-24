# Trace: PRD-022, PRD-023, PRD-025 · PLAN §5.2 ToolTransport
@persona-c @mode-1
Feature: Agent reader queries structured knowledge without scraping
  As P3 (agent reader)
  I want a local stdio MCP server over a knowledge Bundle on my disk
  So that I can search, read and follow links without page-scraping, with results trust-labelled

  Background:
    Given no remote MCP server is served and no "agent-card.json" is emitted at v1; both MAY be declared as surfaces (AGSC-06-34, AGSC-11-21)

  @PRD-023
  Scenario: Agent starts the local stdio MCP server
    When the operator runs "npx agentic-system-core mcp <bundle-path>" from outside the Bundle
    Then the server starts and speaks JSON-RPC 2.0 over stdio
    And the server exposes exactly seven tools: "search", "read", "links", "compose", "propose", "ask", "remember"

  @PRD-023 @PRD-024
  Scenario: The server reads the local Bundle, never the network
    When the server starts over the acceptance Bundle with every network call refused
    Then it answers "search", "read" and "links" from the Bundle's own files
    And an item edited on disk is served as edited when the server next starts
    And "mcp" given a URL instead of a Bundle directory is refused with "AGSC-E003" and exit 2 (AGSC-09-09)

  @PRD-023
  Scenario: Agent calls search then read then links, all trust-labelled
    When the agent calls tool "search" with arguments "{query: \"protocol\"}"
    Then the result is the envelope "source", "trust: untrusted", "license" and "type" around hits naming "a2a" and "mcp" (AGSC-08-18)
    When the agent calls tool "read" with argument "{slug: \"a2a\"}"
    Then the result returns the body and frontmatter of "content/concepts/a2a.md"
    When the agent calls tool "links" with argument "{slug: \"mcp\"}"
    Then the result lists the "requires" Link from "a2a" as its computed inverse "required-by"

  @PRD-025
  Scenario: Non-MCP agent reads via llms.txt and RDF instead
    Given the agent has no MCP client
    When the agent fetches "/llms.txt"
    Then every item is reachable from a listed page URL, and each item's Markdown is at "/pages/<slug>.md" (AGSC-06-14)
    When the agent instead fetches "/graph.ttl"
    Then the response loads into a standard RDF parser with zero blank nodes


  @PRD-056
  Scenario: Agent uses the node as memory and knowledge base over MCP
    Given "npx agentic-system-core mcp" is running over the acceptance Bundle
    When the agent calls tool "ask" with "What pattern handles tool-use retries?"
    Then the answer cites at least one item IRI from the Bundle (AGSC-09-14a)
    And a question that shares no word with the Bundle returns exactly "no answer in this memory"
    When the agent calls tool "remember" with kind "episode", a title, a body, its actor, the instant "at" and its operator
    Then a conforming Episode item comes back as a Proposal with no finding (AGSC-09-14b)
    And an episode without its declared actor is refused with "AGSC-E003"
    And nothing is written to the Bundle by the server
    And "resources/list" includes every item, "graph.jsonld" and "llms.txt"
