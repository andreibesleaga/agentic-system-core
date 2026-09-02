# Trace: PRD-022, PRD-023, PRD-025 · audit/D §3(c) · PLAN §5.2 ToolTransport
# Source of truth: discovery-product/audit/D-v1-system-walkthrough.md §3(c) "Agent reader via MCP (Mode 1 read)"
@persona-c @mode-1
Feature: Agent reader queries structured knowledge without scraping
  As P3 (agent reader)
  I want a local stdio MCP server over the published static exports
  So that I can search, read and follow links without page-scraping, with results trust-labelled

  Background:
    Given no remote MCP server and no "agent-card.json" exist at v1 (D41, G42)

  @PRD-023
  Scenario: Agent starts the local stdio MCP server
    When the operator runs "claude mcp add agsc -- npx -y agentic-system-core mcp --site https://agenticsystemcore.com"
    Then the server starts and speaks JSON-RPC 2.0 over stdio
    And the server exposes exactly five tools: "search", "read", "links", "compose", "propose"

  @PRD-023 @PRD-024
  Scenario: Server caches published exports and refreshes on manifest change
    When the server starts
    Then it fetches "/.well-known/agentic-knowledge" (integrity block), "/graph.jsonld" and "/search.json"
    And it stores them under "$XDG_CACHE_HOME/agsc/<host>/"
    And it re-fetches only when the published integrity hash changes
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
