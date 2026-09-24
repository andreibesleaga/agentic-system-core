# Trace: PRD-032, PRD-033, PRD-034, PRD-035 · PLAN §6.a (Interchange)
@persona-f @mode-3
Feature: Integrator installs this knowledge into my agent
  As P6 (integrator)
  I want inert, content-only skill packs installed into my agent's skill tree
  So that my agent gains this knowledge without executing anything foreign

  Background:
    Given the Bundle's skill packs are built, one per Cluster, each listed with its lockfile in "skills/index.json" (AGSC-07-19, AGSC-07-20)
    And every pack declares its licence "LicenseRef-AgenticSystemCore-Content-Use-1.0" (see LICENSE-CONTENT)

  @PRD-033
  Scenario Outline: Integrator installs packs into one of the three supported trees
    When the integrator installs for "<tree>" with "npx agentic-system-core skills install <path>"
    Then every pack is written under "<path>", one "SKILL.md" per cluster directory, from the local build (AGSC-07-21)
    And re-running the same command changes nothing on disk

    Examples:
      | tree    | path              |
      | claude  | .claude/skills    |
      | agents  | .agents/skills    |
      | github  | .github/skills    |

  @PRD-032
  Scenario: Each installed pack is a valid agentskills.io SKILL.md
    When the integrator opens ".claude/skills/<cluster>/SKILL.md"
    Then its frontmatter declares "name", equal to the pack's directory, "description" and "license"
    And "description" is at most 1024 characters and equals the cluster description
    And the body lists each member with its type and canonical URL, its prose fenced as data (AGSC-07-16)

  @PRD-035
  Scenario: Installed packs are content-only and lockfile-verified
    When the integrator inspects the installed skill tree
    Then no "scripts/" directory, executable bit, symlink or "allowed-tools" field is present (AGSC-07-15)
    And the SHA-256 of every installed file equals its "lock" entry in "skills/index.json"
    And an update over a locally changed file is reported with its diff before it overwrites (AGSC-07-20)

  @PRD-034
  Scenario: Integrator's improved skill round-trips back as a Procedure
    Given the integrator has written a "SKILL.md" file locally
    When the integrator runs "npx agentic-system-core skills import <file>"
    Then the file is mapped to "content/procedures/<name>.md" (AGSC-07-22)
    And its declared fields survive: "description" as "description", "license" as "x-skill-license", and the body byte for byte
    And lint reports no error for the new Procedure
