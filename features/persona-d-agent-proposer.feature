# Trace: PRD-039, PRD-040, PRD-042, PRD-043 · audit/D §3(d) · PLAN §6(b), C5
# Source of truth: the private design register (audit D) §3(d) "Agent proposer (Mode 1 write)"
@persona-d @mode-1
Feature: Agent proposer contributes a change humans ratify
  As P4 (agent proposer, operator-signed)
  I want to prepare a Proposal locally and never push on my own
  So that a human operator remains the only one who writes to the remote (D27)

  Background:
    Given the agent is operator-run and has a "prov.operator" identity "human:<gh-id>"

  @PRD-042
  Scenario: Agent edits a Concept with a complete prov block
    When the agent edits "content/concepts/<slug>.md"
    Then the frontmatter carries "prov: {origin: ai-assisted, agent: \"claude-code/…\", model: \"…\", operator: \"human:<gh-id>\"}"
    And lint rejects the item if "prov.origin" or "prov.operator" is missing

  @PRD-039
  Scenario: Agent normalizes and writes a local patch, never pushes
    When the agent runs "npx agentic-system-core lint --fix"
    Then wikilinks, key order and trailing LF are normalized
    When the agent runs "npx agentic-system-core propose --title \"…\" --rationale \"…\""
    Then the CLI writes "dist/proposal/0001.patch" and "dist/proposal/0001.md" (the PR body)
    And the CLI prints, but does not execute, "git switch -c proposal/<slug> && git apply … && gh pr create --body-file …"
    And no network write occurs from the "propose" verb

  @PRD-040
  Scenario: Operator runs the printed commands and the PR carries the trailer
    Given the operator has reviewed the printed commands
    When the operator runs them
    Then the resulting PR carries an "Assisted-by:" trailer and the "prov" block from the file
    And the PR follows the same CI/merge path as a human contributor's Proposal

  @PRD-043
  Scenario: Fork-originated Proposals stay lint-only until labelled, capped at five
    Given four bot-authored PRs are already open from forks
    When a fifth bot-authored PR is opened from a fork
    Then CI runs lint-only checks on it, with no secrets exposed to the fork context
    When a sixth bot-authored PR is opened from a fork
    Then the sixth PR is refused per the "≤5 open bot PRs" cap
