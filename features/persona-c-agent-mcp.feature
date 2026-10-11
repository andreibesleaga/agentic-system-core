# Trace: PRD-019, PRD-022, PRD-023, PRD-025, PRD-036, PRD-051, PRD-056, PRD-061 · PLAN §5.2 ToolTransport
@persona-c
Feature: Agent reader queries structured knowledge without scraping
  As P3 (agent reader)
  I want a local stdio MCP server over a knowledge Bundle on my disk
  So that I can search, read and follow links without page-scraping, with results trust-labelled

  Background:
    Given no remote MCP server is served and no "agent-card.json" is emitted at v1; both MAY be declared as surfaces (AGSC-06-34, AGSC-11-21)

  @PRD-023 @agent @mode-1 @matrix-A2
  Scenario: Agent starts the local stdio MCP server
    When the operator runs "npx agentic-system-core mcp <bundle-path>" from outside the Bundle
    Then the server starts and speaks JSON-RPC 2.0 over stdio
    And the server exposes exactly seven tools: "search", "read", "links", "compose", "propose", "ask", "remember"

  @PRD-023 @PRD-024 @agent @mode-1 @matrix-A2
  Scenario: The server reads the local Bundle, never the network
    When the server starts over the acceptance Bundle with every network call refused
    Then it answers "search", "read" and "links" from the Bundle's own files
    And an item edited on disk is served as edited when the server next starts
    And "mcp" given a URL instead of a Bundle directory is refused with "AGSC-E003" and exit 2 (AGSC-09-09)

  @PRD-023 @agent @mode-1 @matrix-A2
  Scenario: Agent calls search then read then links, all trust-labelled
    When the agent calls tool "search" with arguments "{query: \"protocol\"}"
    Then the result is the envelope "source", "trust: untrusted", "license" and "type" around hits naming "a2a" and "mcp" (AGSC-08-18)
    When the agent calls tool "read" with argument "{slug: \"a2a\"}"
    Then the result returns the body and frontmatter of "content/concepts/a2a.md"
    When the agent calls tool "links" with argument "{slug: \"mcp\"}"
    Then the result lists the "requires" Link from "a2a" as its computed inverse "required-by"

  @PRD-025 @agent @mode-1
  Scenario: Non-MCP agent reads via llms.txt and RDF instead
    Given the agent has no MCP client
    When the agent fetches "/llms.txt"
    Then every item is reachable from a listed page URL, and each item's Markdown is at "/pages/<slug>.md" (AGSC-06-14)
    When the agent instead fetches "/graph.ttl"
    Then the response loads into a standard RDF parser with zero blank nodes


  @PRD-056 @agent @mode-1 @matrix-A2
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

  @PRD-023 @agent @mode-1 @matrix-A3
  Scenario: An MCP client lists and gets the one prompt
    Given "npx agentic-system-core mcp" is running over the acceptance Bundle
    When the agent lists the prompts
    Then there is exactly one, "answer-from-this-memory-with-citations", taking one required argument "question" (AGSC-09-14b)
    When the agent gets that prompt with the question "What pattern handles tool-use retries?"
    Then it returns one user message that carries the question
    And a prompt name that does not exist is answered with a JSON-RPC error, not a tool envelope

  @PRD-051 @agent @mode-1 @matrix-A6
  Scenario: A page agent calls the seven page tools without a browser
    Given the node is built and its item page "/concepts/handoff/" loads the three page-tool scripts
    When an agent runs those scripts with nothing but the node's own files to fetch, and calls each of the seven tools
    Then every answer equals the answer the local tool server gives to the same call (AGSC-09-16)
    And the page read nothing outside the node

  @PRD-051 @agent @mode-1 @matrix-A6
  Scenario: A page agent calls the seven page tools in a browser through document.modelContext
    Given the node is built and its item page "/concepts/handoff/" loads the three page-tool scripts
    When a browser opens "/concepts/handoff/" offering "document.modelContext", and the agent calls each of the seven tools the page registers
    Then every answer equals the answer the local tool server gives to the same call (AGSC-09-16)
    And the page read nothing outside the node

  @PRD-019 @agent @mode-1 @matrix-A7
  Scenario: A crawler honours the robots.txt groups and the TDM reservation
    Given the node is built with "site.tdm_crawlers" naming "CCBot" and "GPTBot"
    When a crawler fetches "/robots.txt" and "/.well-known/tdmrep.json"
    Then "/robots.txt" holds one group per named product token, in the configured order and before the "User-agent: *" group, each with "Disallow: /" (AGSC-06-18)
    And every group carries the same optional "Content-Signal" record
    And "/.well-known/tdmrep.json" is exactly [{"location":"/","tdm-reservation":1}]
    And a crawler the list does not name may fetch every page, and "GPTBot" may fetch none

  @PRD-023 @agent @mode-1 @matrix-A2
  Scenario: The local tool server answers the author's draft; the page tools never show it
    Given the author's Bundle holds the draft Concept "unreleased-idea" and is built
    When the agent calls tool "read" with the slug "unreleased-idea" on the local tool server
    Then the local tool server returns the draft, because it reads the author's working tree
    When a page agent calls the page tool "read" with the slug "unreleased-idea" on the built node
    Then the page tool answers "AGSC-E301", as it does for a slug that does not exist
    And neither the page tool "search" nor any published file names the draft (AGSC-06-30)

  @PRD-061 @agent @mode-1
  Scenario: chunks.jsonl feeds a memory framework
    Given the author's Bundle holds the draft Concept "unreleased-idea" and is built
    When a memory framework loads "/chunks.jsonl" line by line
    Then every line is one canonical JSON object marked "trust: untrusted", carrying the Content Use Terms, its item IRI, its section and its ordinal (AGSC-06-29)
    And each "id" is recomputed from the item IRI, the section and the ordinal, and each "digest" from the text (AGSC-06-28)
    And the lines are ordered by item, section and ordinal, and no draft item is among them (AGSC-06-30)
    And a second build gives the same lines

  @PRD-061 @agent @mode-1
  Scenario: An agent cites a chunk back and the item page shows it at its heading
    Given the node is built
    When a memory framework loads "/chunks.jsonl" line by line
    Then every chunk that begins with a heading is an in-page anchor "chunk-" and the first 16 hex characters of its "id" on that heading of its item page (AGSC-06-28)
    And every other chunk is cited at the top of its page, and no page carries a chunk anchor that names no chunk (AGSC-06-30)

  @PRD-036 @agent @mode-4
  Scenario: An MCP client composes a selection through the compose tool
    Given "npx agentic-system-core mcp" is running over the acceptance Bundle
    When the agent calls tool "compose" with the selection "handoff"
    Then the verdict equals the one "agsc compose handoff" prints for the same selection (AGSC-09-16)
    And nothing is written to the Bundle by the server

  @PRD-023 @agent @mode-1 @matrix-A2
  Scenario: A missing resource is answered with -32002 under 2025-11-25
    Given the node is built
    When an MCP client that speaks the revision 2025-11-25 reads the resource "memory://agenticsystemcore/no-such-item"
    Then the server negotiated the revision "2025-11-25"
    And the answer is the JSON-RPC error -32002, "Resource not found", that revision defines, and not a tool envelope
