# Trace: PRD-026, PRD-028, PRD-029, PRD-030, PRD-031, PRD-064 · PLAN §6.a (Mode 2), §6.a (Interchange)
@persona-g
Feature: Project team keeps its agent-built specs governed
  As P7 (project team, Mode 2)
  I want Gates compiled to CI checks and a NOW page as working memory
  So that our own specs stay governed with the same engine, no new subsystem

  Background:
    Given the team ran "npx agentic-system-core init" in an empty directory "my-specs"
    And the scaffold created "agsc.config.json", "content/index.md", ".gitignore" and ".env.example" and printed the two "before you build" steps
    And the team added ".well-known/security.txt" and keeps its principles, decisions, specs, tasks, one procedure, one lesson, one gate and one session log as items

  @PRD-028 @human @mode-2 @matrix-H6
  Scenario: Team authors Mode-2 Concepts without a new item type
    When lint runs over the team's "content/concepts/<slug>.md" files of "kind: principle", "kind: decision", "kind: spec" and "kind: task"
    And over "content/gates/<slug>.md" and "content/episodes/<slug>.md" (session logs)
    Then lint accepts every kind without introducing a new "type"
    And the five Mode-2 Link keys (`implements`, `verifies`, `covers`, `blocked-by`, `decided-by`) exist at 1.0 but are never required (AGSC-03-20)

  @PRD-029 @agent @mode-2 @matrix-A1
  Scenario: Team exports steer files for their coding agent
    When the team runs "npx agentic-system-core export --steer"
    Then "AGENTS.md"/"CLAUDE.md" bundles are rendered from NOW/Concept/Procedure/Gate/Lesson items
    And the output is byte-stable across repeated runs
    And the exported files are context only — enforcement happens in CI, not in the steer files themselves

  @PRD-031 @human @mode-2 @matrix-H6
  Scenario: A Gate's checks compile into a required CI status check
    Given "content/gates/<slug>.md" declares "checks: [schema, links, provenance, determinism, review]" and "enforce: [status-check]"
    When "npx agentic-system-core ci" runs
    Then each declared check becomes one named required status check in "dist/forge/status-checks.json" (AGSC-08-09, AGSC-08-12)
    And "dist/gate.json" names the gate and its level (AGSC-08-10)
    And after a change to the Gate's checks the next run never keeps the old status checks: it compiles the new ones, or reports the drift as "AGSC-E707" and overwrites nothing until the stale file is removed (AGSC-08-12)

  @PRD-030 @human @mode-2 @matrix-H6
  Scenario: Team publishes its own specs as an instance of itself (should)
    When "npx agentic-system-core build" runs over the team's Bundle
    Then every published item of the team has its page, its Markdown view and its node in "graph.jsonld"
    And the build names "/specs/" as the specification site's route, which a content node does not emit (AGSC-06-01)
    And an item with "status: draft" is excluded from every page and every export (AGSC-06-30, AGSC-01-26)

  @PRD-026 @human @mode-2 @matrix-H12
  Scenario: A team on the GABBE kit exports its node into the kit and reads it back
    When the team runs "agsc export --to gabbe" under the network trap
    Then the command exits 0
    And the kit holds the procedure as a skill, the gate as a guide, each concept as semantic memory, the session log as a decision log and the lesson in "CONTINUITY.md"
    When the team imports "dist/export/gabbe" with "--from gabbe" into a copy of the Bundle that holds no item
    Then every published item comes back as authored, with the exporting node's content version
    And the same import run again writes nothing and reports every item unchanged
    And no network call was attempted

  @PRD-064 @PRD-026 @human @mode-5 @matrix-H11
  Scenario Outline: A team moves a board to <tool> and back
    Given the team's "<tool>" export file is in the folder "from-<tool>"
    When the team runs "agsc import from-<tool> --from board --format <tool> --dry-run" under the network trap
    Then the command exits 0
    And the import plan wrote nothing into the Bundle
    When the team runs "agsc import from-<tool> --from board --format <tool>" under the network trap
    Then the command exits 0
    And every row of the export arrives as a draft task on a draft board, so nothing of it is published yet
    When the team publishes the imported board
    And the Bundle is built
    And the team runs "agsc export --to board --format <tool>" under the network trap
    Then the command exits 0
    When the team imports "dist/export/board/<tool>" with "--from board --format <tool>" into a copy of the Bundle that holds no item
    Then every board the export carries comes back with its items as published
    And no network call was attempted

    Examples:
      | tool            |
      | agsc-board      |
      | asana           |
      | github          |
      | gitlab          |
      | jira            |
      | linear          |
      | markdown        |
      | notion          |
      | obsidian-kanban |
      | todotxt         |
      | trello          |

  @PRD-064 @agent @mode-5 @matrix-A15
  Scenario: A CI job brings a tracker's file in as a plan and takes the node's board out as a file
    Given the team's Bundle holds a published board "delivery" with two tasks
    And the team's "github" export file is in the folder "board"
    When the agent runs "agsc import board --from board --format github --dry-run --json" under the network trap
    Then the command exits 0
    And the JSON envelope carries the warning "AGSC-E506"
    And the import plan wrote nothing into the Bundle
    When the agent runs "agsc export --to board --format github --json" under the network trap
    Then the command exits 0
    And the JSON envelope's status is "pass"
    And "dist/export/board/github/delivery.json" lists the two tasks of the board as issues
    And no network call was attempted
