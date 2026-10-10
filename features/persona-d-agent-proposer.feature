# Trace: PRD-039, PRD-040, PRD-042, PRD-043 · PLAN §6(b), C5
@persona-d @mode-1
Feature: Agent proposer contributes a change humans ratify
  As P4 (agent proposer, operator-signed)
  I want to prepare a Proposal locally and never push on my own
  So that a human operator remains the only one who writes to the remote

  Background:
    Given the agent is operator-run and has a "prov.operator" identity "human:<gh-id>"

  @PRD-042 @agent @matrix-A4
  Scenario: Agent edits a Concept with a complete prov block
    When the agent edits "content/concepts/<slug>.md"
    Then the frontmatter carries "prov: {origin: ai-assisted, agent: \"claude-code/…\", model: \"…\", operator: \"human:<gh-id>\"}"
    And lint rejects the item if "prov.origin" or "prov.operator" is missing

  @PRD-039 @agent @matrix-A4
  Scenario: Agent normalizes and writes a local patch, never pushes
    Given the agent's edit of "content/concepts/<slug>.md" left keys out of schema order, a wikilink and no trailing LF
    When the agent runs "npx agentic-system-core propose <slug>"
    Then the CLI writes "dist/proposal/1.patch" and "dist/proposal/1.md", the PR body opening with "<!-- agsc:proposal v1 -->" (AGSC-08-05)
    And the CLI prints, but does not execute, "git apply dist/proposal/1.patch", "git checkout -b proposal/1" and the pull-request step (AGSC-08-04)
    When the agent runs "npx agentic-system-core lint --fix"
    Then wikilinks, key order and trailing LF are normalized, and a second lint reports no error (AGSC-04-19, AGSC-03-12)
    And the patch, applied to the edit as the agent left it, gives the file "lint --fix" wrote (AGSC-04-19)
    And no network write occurs from the "propose" verb

  @PRD-040 @human @matrix-A4
  Scenario: The operator runs the printed commands and commits with the trailers
    Given the agent's edit of "content/concepts/<slug>.md" is proposed from a git repository of one commit
    When the operator runs the printed "agsc lint --fix" and "git checkout -b proposal/1"
    And the operator commits the change as printed, with a "Signed-off-by:" trailer and an "Assisted-by:" line naming "prov.operator"
    Then the trailer block of that commit passes the grammar for an "ai-assisted" change (AGSC-08-06, AGSC-08-07)
    And lint and build pass on the branch "proposal/1", and the ledger entry of that commit names the operator from the sign-off (AGSC-08-20a)
    And "dist/proposal/1.patch" applies with "git apply" to a clean checkout of the first commit, and the item it gives passes lint
    And the item that patch gives is the file the operator committed after "agsc lint --fix" (AGSC-04-19)

  @PRD-040 @human @matrix-A4
  Scenario: The operator's pull request carries the trailer and follows the contributor's path
    Given the operator has committed the Proposal on the branch "proposal/1"
    When the operator opens the pull request
    Then the resulting PR carries an "Assisted-by:" trailer and the "prov" block from the file
    And the PR follows the same CI/merge path as a human contributor's Proposal

  @PRD-043 @agent @matrix-A4
  Scenario: Fork-originated Proposals stay lint-only until labelled, capped at five
    Given four bot-authored PRs are already open from forks
    When a fifth bot-authored PR is opened from a fork
    Then CI runs lint-only checks on it, with no secrets exposed to the fork context
    When a sixth bot-authored PR is opened from a fork
    Then the sixth PR is refused per the "≤5 open bot PRs" cap
