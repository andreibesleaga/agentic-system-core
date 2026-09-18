# Trace: PRD-022, PRD-023, PRD-025 · audit/D §3(c) · PLAN §5.2 ToolTransport
# Source of truth: the private design register (audit D) §3(c) "Agent reader via MCP (Mode 1 read)"
@persona-c @mode-1
Feature: Agent reader queries structured knowledge without scraping
  As P3 (agent reader)
  I want a local stdio MCP server over the published static exports
  So that I can search, read and follow links without page-scraping, with results trust-labelled

  Background:
    Given no remote MCP server is served and no "agent-card.json" is emitted at v1 (D41, G42); both MAY be declared as surfaces (AGSC-06-34, AGSC-11-21)

  @PRD-023
  Scenario: Agent starts the local stdio MCP server
    When the operator runs "claude mcp add agsc -- npx -y agentic-system-core mcp --site https://agenticsystemcore.com"
    Then the server starts and speaks JSON-RPC 2.0 over stdio
    And the server exposes exactly seven tools: "search", "read", "links", "compose", "propose", "ask", "remember"

  @PRD-023 @PRD-024
  Scenario: Server caches published exports and refreshes on manifest change
    When the server starts
    Then it fetches "/.well-known/knowledge-linkset" (the link set), "/graph.jsonld" and "/search.json"
    And it stores them under "$XDG_CACHE_HOME/agsc/<host>/"
    And it re-fetches only when a published "digest" target attribute changes
    And no network call happens except inside the "mcp" verb

  @PRD-023
  Scenario: Agent calls search then read then links, all trust-labelled
    When the agent calls tool "search" with arguments "{q: \"a2a\", limit: 5}"
    Then the result is JSON carrying "source", "trust: untrusted", "license" and "type" on every item
    When the agent calls tool "read" with argument "{slug: \"a2a\"}"
    Then the result returns the Markdown body and frontmatter of "content/concepts/a2a.md"
    When the agent calls tool "links" with argument "{slug: \"a2a\", type: \"requires\"}"
    Then the result lists the "requires" targets with their computed inverse "required-by"

  @PRD-025
  Scenario: Non-MCP agent reads via llms.txt and RDF instead
    Given the agent has no MCP client
    When the agent fetches "/llms.txt"
    Then every item is reachable via a listed "/pages/<slug>.md" link
    When the agent instead fetches "/graph.ttl"
    Then the response loads into any standard RDF store with zero blank nodes


  @PRD-056 @D51-b
  Scenario: Agent uses the node as memory and knowledge base over MCP
    Given "npx agentic-system-core mcp" is running over the fixture Bundle
    When the agent calls tool "ask" with "What pattern handles tool-use retries?"
    Then the answer cites at least one item IRI from the Bundle
    And an unanswerable question returns "no answer in this memory"
    When the agent calls tool "remember" with kind "episode", a title and a body
    Then a conforming Episode item and a Proposal are produced under the client's channel mode (hitl by default)
    And nothing is written to the content branch by the server
    And "resources/list" includes every item, "graph.jsonld" and "llms.txt"
