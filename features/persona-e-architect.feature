# Trace: PRD-001, PRD-036, PRD-037, PRD-038 · PLAN §6(c)
@persona-e @mode-4
Feature: Architect turns Concepts into a starting architecture
  As P5 (architect / combiner)
  I want closure and conflict explanations plus a downloadable Harness
  So that I can compose a working starting architecture from selected Concepts, with no server involved

  Background:
    Given "/compose/" loads "/graph.jsonld" and "www/compose/agsc-core.js"
    And "www/compose/agsc-core.js" is the "src/composition/" module set, bundled, with no "node:" import

  @PRD-036 @human @matrix-H9
  Scenario: Selecting Concepts triggers requires-closure with an explanation
    When the architect ticks the Concept "handoff" on "/compose/"
    Then the panel's list "Why an item was added" reads "supervisor was added: handoff requires supervisor"
    And the verdict the page shows equals the one "agsc compose handoff" prints, with the path from the selection to "supervisor"

  @PRD-036 @human @matrix-H9
  Scenario: Excludes mutex and warnings surface before download
    Given the Concepts carry an "excludes", a "contradicts" and a "uses" Link, and the node is rebuilt
    And the architect has selected two Concepts related by "excludes"
    When the closure runs
    Then the panel reports a mutex conflict naming the violating pair
    And the Harness cannot be built from that selection
    Given the architect has selected two Concepts related by "contradicts"
    Then the panel shows a warning, not a hard error
    Given a selected Concept has a "uses" target that is not selected
    Then the panel shows a soft warning for the missing "uses" target

  @PRD-037 @human @matrix-H9
  Scenario: Architect builds and downloads a seven-file Harness
    Given the Bundle holds the Procedure "run-the-tests", and the node is rebuilt
    When the architect ticks "handoff" and "run-the-tests" on "/compose/" and presses "Build the Harness"
    Then the page offers one download per Harness file, and the files are exactly:
      | file                       |
      | harness.jsonld             |
      | AGENTS.md                  |
      | workspace.dsl              |
      | diagram.mmd                |
      | arc42.md                   |
      | decisions/<nnnn>-<slug>.md |
      | skills/<slug>/SKILL.md     |
    And "Download all (.zip)" gives, byte for byte, the archive "agsc compose handoff run-the-tests --zip" writes (AGSC-07-13)

  @PRD-038 @human @matrix-H9
  Scenario: Browser output is byte-identical to the CLI for the same selection
    When the architect runs "npx agentic-system-core compose a2a mcp supervisor --out ./harness-x/" on the CLI
    And separately runs "www/compose/agsc-core.js" as "/compose/" does, over the published "/graph.jsonld", in a context that holds nothing but the language
    Then the Harness files from both paths are the same files, byte for byte (AGSC-07-13)

  @PRD-001 @human @matrix-H9
  Scenario: run --dry-run prints the resolved command list and executes nothing
    Given the Bundle holds the Procedure "run-the-tests", and the node is rebuilt
    And the configuration enables "run" for the program "echo" only
    When the operator runs "agsc run run-the-tests --dry-run" under the network trap
    Then the command exits 0
    And the output names "run: step 1: echo hello"
    And the output names "nothing executed"
    And no file of the Bundle changed and no network call was attempted (AGSC-09-94)

  @PRD-001 @human @matrix-H9
  Scenario: trace records a captured agent run as an Episode, offline
    Given the configuration enables "run" for the program "echo" only
    And the captured run record "run1.json" of an agent run that started at "2026-01-01T09:00:00Z"
    When the operator runs "agsc trace run1.json" under the network trap
    Then the command exits 0
    And the Bundle holds "content/episodes/first-run.md"
    And that Episode starts at "2026-01-01T09:00:00Z", names the record's actor and keeps the record's unknown member under an "x-" name (AGSC-09-94)
    And no network call was attempted
