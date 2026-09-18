# Trace: PRD-032, PRD-033, PRD-034, PRD-035 · audit/D §3(f) · PLAN §6.a (Interchange)
# Source of truth: the private design register (audit D) §3(f) "Integrator installing skills (Mode 3)"
@persona-f @mode-3
Feature: Integrator installs this knowledge into my agent
  As P6 (integrator)
  I want inert, content-only skill packs installed into my agent's skill tree
  So that my agent gains this knowledge without executing anything foreign

  Background:
    Given "/skills/index.json" lists one Skill pack per Cluster, 20 packs plus the index
    And every pack declares its licence "LicenseRef-AgenticSystemCore-Content-Use-1.0" (see LICENSE-CONTENT)

  @PRD-033
  Scenario Outline: Integrator installs packs into one of the three supported trees
    When the integrator runs "npx agentic-system-core skills install https://agenticsystemcore.com --into <tree>"
    Then packs are written under "<path>" idempotently
    And re-running the same command changes nothing on disk

    Examples:
      | tree    | path              |
      | claude  | .claude/skills    |
      | agents  | .agents/skills    |
      | github  | .github/skills    |

  @PRD-032
  Scenario: Each installed pack is a valid agentskills.io SKILL.md
    When the integrator opens ".claude/skills/agsc-<cluster>/SKILL.md"
    Then it declares the six agentskills.io fields
    And "description" is at most 1024 characters and equals the cluster description
    And the body lists members with one-line descriptions and canonical URLs
    And "references/<slug>.md" copies accompany the pack

  @PRD-035
  Scenario: Installed packs are content-only and lockfile-verified
    When lint runs against the installed skill trees
    Then no "scripts/" directory, executable bit, symlink or "allowed-tools" field is present
    And a sha256 lockfile is present and verifies every file in the pack
    And any future update is diffed against the lockfile before overwrite

  @PRD-034
  Scenario: Integrator's improved skill round-trips back as a Procedure
    Given the integrator has edited a "SKILL.md" file locally
    When the integrator runs "npx agentic-system-core skills import <dir>"
    Then the file is mapped to "content/procedures/<slug>.md"
    And a subsequent "skills export" of the same Procedure reproduces the original "SKILL.md" bytes
