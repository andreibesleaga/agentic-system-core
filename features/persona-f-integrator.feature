# Trace: PRD-032, PRD-033, PRD-034, PRD-035 · PLAN §6.a (Interchange)
@persona-f @mode-3
Feature: Integrator installs this knowledge into my agent
  As P6 (integrator)
  I want inert, content-only skill packs installed into my agent's skill tree
  So that my agent gains this knowledge without executing anything foreign

  Background:
    Given the Bundle's skill packs are built, one per Cluster, each listed with its lockfile in "skills/index.json" (AGSC-07-19, AGSC-07-20)
    And every pack declares its licence "LicenseRef-AgenticSystemCore-Content-Use-1.0" (see LICENSE-CONTENT)

  @PRD-033 @human @matrix-H7
  Scenario Outline: Integrator installs packs into one of the three supported trees
    When the integrator installs for "<tree>" with "npx agentic-system-core skills install <path>"
    Then every pack is written under "<path>", one "SKILL.md" per cluster directory, from the local build (AGSC-07-21)
    And re-running the same command changes nothing on disk

    Examples:
      | tree    | path              |
      | claude  | .claude/skills    |
      | agents  | .agents/skills    |
      | github  | .github/skills    |

  @PRD-032 @agent @matrix-A10
  Scenario: Each installed pack is a valid agentskills.io SKILL.md
    When the integrator opens ".claude/skills/<cluster>/SKILL.md"
    Then its frontmatter declares "name", equal to the pack's directory, "description" and "license"
    And "description" is at most 1024 characters and equals the cluster description
    And the body lists each member with its type and canonical URL, its prose fenced as data (AGSC-07-16)

  @PRD-035 @human @matrix-H7
  Scenario: Installed packs are content-only and lockfile-verified
    When the integrator inspects the installed skill tree
    Then no "scripts/" directory, executable bit, symlink or "allowed-tools" field is present (AGSC-07-15)
    And the SHA-256 of every installed file equals its "lock" entry in "skills/index.json"
    And an update over a locally changed file is reported with its diff before it overwrites (AGSC-07-20)

  @PRD-034 @human @matrix-H7
  Scenario: Integrator's improved skill round-trips back as a Procedure
    Given the integrator has written a "SKILL.md" file locally
    When the integrator runs "npx agentic-system-core skills import <file>"
    Then the file is mapped to "content/procedures/<name>.md" (AGSC-07-22)
    And its declared fields survive: "description" as "description", "license" as "x-skill-license", and the body byte for byte
    And lint reports no error for the new Procedure

  @PRD-034 @human @matrix-H8
  Scenario Outline: A team imports a skills repository laid out as <layout>
    Given a local clone of a "<layout>" skills collection in the folder "clone"
    When the team runs "agsc import clone --from skills --layout <layout> --dry-run" under the network trap
    Then the command exits 0
    And the import plan wrote nothing into the Bundle
    When the team runs "agsc import clone --from skills --layout <layout> --json" under the network trap
    Then the command exits 0
    And <items> skills arrive as "<type>" items, each naming its source file, the layout and its licence, or as a draft when no open licence is found
    And <dropped> parts that would execute are dropped and reported as "AGSC-E407", and none of them reaches the Bundle
    And the same import run again writes nothing and reports every item unchanged
    And no network call was attempted

    Examples:
      | layout        | items | type      | dropped |
      | agentskills   | 4     | procedure | 2       |
      | claude-plugin | 2     | procedure | 3       |
      | marketplace   | 1     | procedure | 0       |
      | cursor        | 2     | concept   | 0       |
      | windsurf      | 2     | concept   | 0       |

  @PRD-034 @human @matrix-H8
  Scenario: A team lists what a skills collection would bring in, and nothing is written
    Given a local clone of a "agentskills" skills collection in the folder "clone"
    And a local clone of a "awesome-list" skills collection in the folder "links"
    When the team runs "agsc import clone --from skills --list" under the network trap
    Then the command exits 0
    And the list names each skill with its file and licence, and says which would arrive as a draft
    When the team runs "agsc import links --from skills --list" under the network trap
    Then the command exits 0
    And the output names "3 entries point to other repositories"
    And the import plan wrote nothing into the Bundle

  @PRD-034 @PRD-032 @human @matrix-H8
  Scenario: A team files an imported skill into one of its clusters, and that cluster's pack carries it
    Given a local clone of a "marketplace" skills collection in the folder "clone"
    When the team runs "agsc import clone --from skills --cluster agent-patterns" under the network trap
    Then the command exits 0
    And the imported skill "csv-helper" joins the cluster "agent-patterns"
    When the team runs "agsc skills" under the network trap
    Then the command exits 0
    And the "agent-patterns" pack lists the imported skill "csv-helper"
