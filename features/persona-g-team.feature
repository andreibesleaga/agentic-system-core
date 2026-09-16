# Trace: PRD-028, PRD-029, PRD-030, PRD-031 · audit/D §3(g) · PLAN §6.a (Mode 2)
# Source of truth: the private design register (audit D) §3(g) "Team using an instance as live specs (Mode 2) with Claude Code/GABBE"
@persona-g @mode-2
Feature: Project team keeps its agent-built specs governed
  As P7 (project team, Mode 2)
  I want Gates compiled to CI checks and a NOW page as working memory
  So that our own specs stay governed with the same engine, no new subsystem

  Background:
    Given the team ran "npx agentic-system-core init my-specs --host none"
    And the scaffold created "agsc.config.json", "content/index.md", six empty type folders and ".github/workflows/ci.yml"

  @PRD-028
  Scenario: Team authors Mode-2 Concepts without a new item type
    When the team authors "content/concepts/<slug>.md" with "kind: principle", "kind: decision", "kind: spec" or "kind: task"
    And authors "content/gates/<slug>.md" and "content/episodes/<slug>.md" (session logs)
    Then lint accepts every kind without introducing a new "type"
    And no typed Mode-2 Link key is required (deferred to v2, G34)

  @PRD-029
  Scenario: Team exports steer files for their coding agent
    When the team runs "npx agentic-system-core export --steer"
    Then "AGENTS.md"/"CLAUDE.md" bundles are rendered from NOW/Concept/Procedure/Gate/Lesson items
    And the output is byte-stable across repeated runs
    And the exported files are context only — enforcement happens in CI, not in the steer files themselves

  @PRD-031
  Scenario: A Gate's checks compile into a required CI status check
    Given "content/gates/<slug>.md" declares "checks: [schema, links, provenance, determinism, review]"
    When "npx agentic-system-core build" runs
    Then each declared check maps to one named required CI status check
    And the Gate page and the CI check stay in lockstep after every build

  @PRD-030
  Scenario: Team publishes its own specs as an instance of itself (should)
    When "npx agentic-system-core build" runs with "/specs/" enabled
    Then "/specs/" is generated from "spec/00–09"
    And a file listed in the Bundle's private-source exclusion list is excluded from every export
