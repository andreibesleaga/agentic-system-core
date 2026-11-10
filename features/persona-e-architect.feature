# Trace: PRD-001, PRD-022, PRD-036, PRD-037, PRD-038, PRD-071 · PLAN §6(c)
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

  @PRD-076 @human
  Scenario: A node that declares bounded contexts gets a context map beside the Harness, and the Harness keeps its bytes
    Given the clusters "agent-patterns" and "protocols" are declared contexts, and "supervisor" moves to "protocols" by its "domain_context" (AGSC-01-41, AGSC-08-32)
    And the peer "https://b.example/.well-known/knowledge-linkset" is a "translation-layer" whose crosswalk "domain/b.ttl" maps "handoff" to "https://b.example/concepts/handover/" (AGSC-11-24)
    When the operator runs "agsc compose handoff" under the network trap
    Then the command exits 0
    And the companion directory beside the Harness holds "context-map.json" alone, with "handoff" in "agent-patterns", "supervisor" in "protocols", the Link "handoff requires supervisor" across them and the peer's crosswalk (AGSC-07-30)
    And the same composition on the node without contexts writes the same seven file kinds, byte for byte, and no companion directory (AGSC-07-30)
    And no network call was attempted

  @PRD-082 @human
  Scenario: The architect asks for a brief, written beside the Harness, and the Harness keeps its bytes
    When the operator runs "agsc compose handoff --brief" under the network trap
    Then the command exits 0
    And the companion directory beside the Harness holds the four files of the brief, whose dependency order puts "supervisor" before "handoff" (AGSC-07-25, AGSC-07-26)
    And the brief's checklist adopts "supervisor" and then "handoff" (AGSC-07-27)
    And the same composition without "--brief" writes the same seven file kinds, byte for byte, and no companion directory (AGSC-07-25)
    And no network call was attempted

  @PRD-082 @human
  Scenario: A narration is not written by this distribution, and the brief still is
    When the operator runs "agsc compose handoff --brief --narrate writer --json" under the network trap
    Then the command exits 1
    And the JSON envelope carries the error "AGSC-E001"
    And the companion directory beside the Harness holds the four files of the brief and no "narration.md" (AGSC-07-28)
    And no network call was attempted

  @PRD-082 @human
  Scenario: A brief above the bound of derived keeps its first readings and says how many there are
    Given the Bundle holds a chain of 145 Concepts, "chain-144" requiring "chain-143" and so on down to "chain-0"
    When the operator runs "agsc compose chain-144 --brief --json" under the network trap
    Then the command exits 0
    And the brief holds the first readings of derived and derived_total counts them all (AGSC-07-25)
    And no network call was attempted

  @PRD-082 @human
  Scenario: A saved architecture gets its blueprint beside the Harness, and its page shows the brief
    Given the Bundle holds the saved architecture "agent-team" selecting "supervisor" and "handoff", and the node is rebuilt
    When the operator runs "agsc compose --from agent-team --brief" under the network trap
    Then the command exits 0
    And the companion directory beside the Harness holds the brief and the blueprint: the three C4 levels and a build plan whose first step adopts "supervisor" (AGSC-07-29)
    And the page "/concepts/agent-team/" shows the brief of the composition and links "/compose/?from=agent-team" (AGSC-07-25, AGSC-07-24)
    And no network call was attempted

  @PRD-082 @PRD-038 @human
  Scenario: The architect reads the brief of a selection on "/compose/" and downloads it
    When the architect opens "/compose/" to take downloads and ticks the Concept "handoff"
    Then the page shows the verdict in words and the brief, whose dependency order puts "supervisor" before "handoff" (AGSC-07-25, AGSC-07-26)
    And "Download the brief (.zip)" gives, byte for byte, the archive of the four files "agsc compose handoff --brief" writes (AGSC-07-13)

  @PRD-076 @human
  Scenario: Titles are compared inside each bounded context, so one title may serve two contexts
    Given the clusters "agent-patterns" and "protocols" are declared contexts, and "supervisor" moves to "protocols" by its "domain_context" (AGSC-01-41, AGSC-08-32)
    And the item "supervisor" takes the title of "handoff"
    When the operator runs "agsc lint --json" under the network trap
    Then the command exits 0
    And the JSON envelope carries no "AGSC-E419"
    And the JSON envelope carries no "AGSC-E416"
    When the item "supervisor" moves to the context "agent-patterns" of "handoff" (AGSC-08-32)
    And the operator runs "agsc lint --json" under the network trap
    Then the command exits 0
    And the JSON envelope carries the warning "AGSC-E419"
    And no network call was attempted

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

  @PRD-071 @human
  Scenario: A worked blueprint of the repository turns into its C4 levels, decision records and build plan
    Given the worked blueprint "tool-server" of "examples/blueprints/" is copied into a scratch folder with a git history
    When the operator runs "agsc compose --from tool-server-and-client --brief" under the network trap
    Then the command exits 0
    And the blueprint beside the Harness holds the three C4 levels, one decision record for each decision of the Bundle naming at least two considered options, and a build plan in which every step names what verifies it (AGSC-07-29)
    And no network call was attempted
