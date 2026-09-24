# Trace: PRD-022, PRD-026, PRD-027 · PLAN §5.2 ContentStore
@persona-h @mode-1
Feature: Agent uses a node as external auditable memory
  As P8 (agent-as-memory, Mode 1)
  I want lossless round-trip export/import
  So that this Bundle can serve as external, auditable memory for my agent without losing any key

  Background:
    Given the read path reuses persona-c (MCP) and the write path reuses persona-d (proposer)

  @PRD-026
  Scenario: Agent exports the Bundle in three lossless forms
    Given the Bundle root carries the Content Use Terms as "LICENSE-CONTENT"
    When the agent runs "npx agentic-system-core export --markdown"
    Then "dist/export/markdown/" contains the lint-normalized Bundle with no key lost (AGSC-01-26)
    When the agent runs "npx agentic-system-core export --okf"
    Then "dist/export/okf/content/index.md" carries "okf_version" and a "content/log.md" is added
    When the agent runs "npx agentic-system-core export --jsonld"
    Then "dist/export/graph.jsonld" equals "www/graph.jsonld" byte-for-byte

  @PRD-026
  Scenario: Exported Markdown Bundle opens unchanged as an Obsidian vault
    Given "dist/export/markdown/" was produced by "export --markdown"
    When the folder is opened as an Obsidian vault
    Then no file requires modification to render correctly

  @PRD-026
  Scenario: Agent imports a foreign OKF bundle idempotently
    When the agent runs "npx agentic-system-core import ./some-okf-bundle --from okf"
    Then each file is written under the folder of its type, a "procedure" under "content/procedures/"
    And an unknown "type" value is imported as "concept" with the warning "AGSC-E506", the original kept as "x-okf-type" (AGSC-01-22)
    And colliding slugs are deduplicated with a "-2" suffix
    And a second run writes nothing and reports every item unchanged
    And "npx agentic-system-core lint" finds no error in the imported items except a concept "kind" the foreign bundle never declared

  @PRD-027
  Scenario: memory:// URIs are documented as an alias only, never resolved
    Given an item's slug is "a2a" in bundle "agenticsystemcore"
    When documentation shows "memory://agenticsystemcore/a2a"
    Then it is documented strictly as an alias of "https://agenticsystemcore.com/concepts/a2a/"
    And no code path resolves a "memory://" URI over the network or filesystem
