# Trace: PRD-022, PRD-026, PRD-027 · audit/D §3(h) · PLAN §5.2 ContentStore
# Source of truth: the private design register (audit D) §3(h) "Agent using an instance as memory (Mode 1) with import/export"
@persona-h @mode-1
Feature: Agent uses a node as external auditable memory
  As P8 (agent-as-memory, Mode 1)
  I want lossless round-trip export/import
  So that this Bundle can serve as external, auditable memory for my agent without losing any key

  Background:
    Given the read path reuses persona-c (MCP) and the write path reuses persona-d (proposer)

  @PRD-026
  Scenario: Agent exports the Bundle in three lossless forms
    When the agent runs "npx agentic-system-core export --markdown ./out"
    Then "./out" contains the lint-normalized Bundle with no key lost
    When the agent runs "npx agentic-system-core export --okf ./out"
    Then "./out/index.md" carries "okf_version" and a "log.md" is added
    When the agent runs "npx agentic-system-core export --jsonld ./out"
    Then the output equals "www/graph.jsonld" byte-for-byte

  @PRD-026
  Scenario: Exported Markdown Bundle opens unchanged as an Obsidian vault
    Given "./out" was produced by "export --markdown"
    When the folder is opened as an Obsidian vault
    Then no file requires modification to render correctly (R33)

  @PRD-026
  Scenario: Agent imports a foreign OKF bundle idempotently
    When the agent runs "npx agentic-system-core import ./some-okf-bundle"
    Then files are copied under the matching type folder, for example "Attested Computation" maps to "procedure"
    And an unknown "type" value is imported as "concept" with a warning
    And colliding slugs are deduplicated with a "-2" suffix
    And "npx agentic-system-core lint" runs clean afterward

  @PRD-027
  Scenario: memory:// URIs are documented as an alias only, never resolved
    Given an item's slug is "a2a" in bundle "agenticsystemcore"
    When documentation shows "memory://agenticsystemcore/a2a"
    Then it is documented strictly as an alias of "https://agenticsystemcore.com/concepts/a2a/"
    And no code path resolves a "memory://" URI over the network or filesystem
