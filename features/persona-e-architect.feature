# Trace: PRD-036, PRD-037, PRD-038 · audit/D §3(e) · PLAN §6(c)
# Source of truth: the private design register (audit D) §3(e) "Architect using the combiner in the browser (Mode 4)"
@persona-e @mode-4
Feature: Architect turns Concepts into a starting architecture
  As P5 (architect / combiner)
  I want closure and conflict explanations plus a downloadable Harness
  So that I can compose a working starting architecture from selected Concepts, with no server involved

  Background:
    Given "/compose/" has loaded "/graph.jsonld" and "www/js/agsc-core.js"
    And "www/js/agsc-core.js" is the identical "src/composition/" module set with no "node:" imports

  @PRD-036
  Scenario: Selecting Concepts triggers requires-closure with an explanation
    When the architect ticks the Concept "handoff"
    Then the panel shows "auto-added: supervisor ← required-by handoff"
    And the addition carries an explanation path from the selection to "supervisor"

  @PRD-036
  Scenario: Excludes mutex and warnings surface before download
    Given the architect has selected two Concepts related by "excludes"
    When the closure runs
    Then the panel reports a mutex conflict naming the violating pair
    Given the architect has selected two Concepts related by "contradicts"
    Then the panel shows a warning, not a hard error
    Given a selected Concept has a "uses" target that is not selected
    Then the panel shows a soft warning for the missing "uses" target

  @PRD-037
  Scenario: Architect names and downloads a seven-file Harness
    When the architect names the Harness "harness-x"
    And clicks "Download"
    Then a zip is built in the browser containing exactly:
      | file                              |
      | harness.jsonld                    |
      | AGENTS.md                         |
      | workspace.dsl                     |
      | diagram.mmd                       |
      | arc42.md                          |
      | decisions/0001-<slug>.md          |
      | skills/<slug>/SKILL.md            |
    And if browser zip writing is unavailable, files download individually as the documented fallback

  @PRD-038
  Scenario: Browser output is byte-identical to the CLI for the same selection
    When the architect runs "npx agentic-system-core compose a2a mcp supervisor --out ./harness-x/" on the CLI
    And separately selects the same three Concepts in "/compose/" and downloads the Harness
    Then the seven files from both paths are byte-identical
