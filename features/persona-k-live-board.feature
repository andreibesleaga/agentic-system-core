# Trace: PRD-063, PRD-064, PRD-065 · spec/08 §8.6, spec/10 §10.6, spec/01 AGSC-01-36…38
# Source of truth: docs/PRD.md Amendment 8 and the rules named on each step
@persona-k @mode-5 @PRD-063 @PRD-064 @PRD-065
Feature: Self-driving team — agents and people finish a project's tasks on one live board
  As P12 (a self-driving team of agents and people)
  I want a shared pull board that agents plan, claim and work on until it is done
  So that product and project management runs itself under the guards a person configured once

  An agent lane works the board as a client of the tool server (AGSC-08-28): every
  call returns a prepared Proposal, and a person, or a standing decision, applies and
  merges it. The lane run of "refresh --agent <name> --dry-run" does everything up to
  the opening of the Proposal and calls no model, so the stop conditions of the lane
  run here too.

  Background:
    Given a Bundle with a board cluster "sprint-1" holding tasks of kind task with task_state "TASK_STATE_SUBMITTED"
    And agsc.config.json declares contribute[]
    And a channel "lane" with author "lane-bot", owner "human:alice" and publish "auto"
    And an agents[] entry "worker" of kind "llm" with tasks "plan, claim, work, edit" and types "concept, episode, lesson", channel "lane", budget_usd_month 5, enabled true

  @PRD-064 @agent @matrix-A11
  Scenario: An agent claims a task by proposing its working state through the tool server
    Given the Bundle is a git repository of one commit with fixed dates
    When the agent "worker" calls propose for "task-a" with task_state "TASK_STATE_WORKING" through the tool server
    Then the prepared Proposal's patch changes only task_state and modified of "task-a", and the tool server wrote nothing (AGSC-10-17)
    When the operator applies the prepared patch with git apply
    And a commit "Claim task-a" carrying the trailer "Channel-Auto: worker"
    And the Bundle is built
    Then "/boards/sprint-1.json" shows "task-a" with state "TASK_STATE_WORKING" and claimed_by "process:worker" (AGSC-10-13)

  @PRD-064 @agent
  Scenario: A forge merges the agent's claim automatically
    Given the lane's claim of "task-a" was prepared through the tool server
    When the auto-merge job merges it under every condition of AGSC-08-26 with the trailer "Channel-Auto: worker"
    Then the content branch holds the claim with no person's merge decision, and the ledger records it with mode "auto" (AGSC-08-29)

  @PRD-063 @agent @matrix-A11
  Scenario: The agent lane cannot reach the slow lane
    When the agent "worker" calls remember with kind "procedure" through the tool server
    Then the tool server refuses it with "AGSC-E509" and prepares nothing (AGSC-08-28)
    And the same procedure from the person "human:alice" is prepared, and a gate is refused to every caller (AGSC-10-18)

  @PRD-065 @agent @matrix-A11
  Scenario: The work-in-progress limit keeps the agent on one task
    Given "worker" already holds "task-a" in "TASK_STATE_WORKING" and max_claims is 1
    When the agent "worker" calls propose for "task-b" with task_state "TASK_STATE_WORKING" through the tool server
    Then the tool server refuses it with "AGSC-E511" and prepares nothing (AGSC-10-17)
    When the agent "worker" calls propose for "task-a" with task_state "TASK_STATE_COMPLETED" through the tool server
    And the operator applies the prepared patch with git apply
    And a commit "Complete task-a" carrying the trailer "Channel-Auto: worker"
    And the agent "worker" calls propose for "task-b" with task_state "TASK_STATE_WORKING" through the tool server
    And the operator applies the prepared patch with git apply
    And a commit "Claim task-b" carrying the trailer "Channel-Auto: worker"
    And the Bundle is built
    Then "/boards/sprint-1.json" shows "task-b" with state "TASK_STATE_WORKING" and claimed_by "process:worker" (AGSC-10-13)
    When the agent "worker" calls propose for "task-b" with task_state "TASK_STATE_COMPLETED" through the tool server
    And the operator applies the prepared patch with git apply
    And a commit "Complete task-b" carrying the trailer "Channel-Auto: worker"
    And the Bundle is built
    Then "/boards/sprint-1.json" carries done true (AGSC-10-13)

  @PRD-063 @agent @matrix-A12
  Scenario: The lane's budget stops a dry run for the month
    Given the episodes of "worker" this month sum to usage cost_usd 5
    When the agent runs "agsc refresh --agent worker --dry-run --json" under the network trap
    Then the command exits 0
    And the Bundle does not hold "dist/proposal/1.patch"
    And the JSON envelope carries the warning "AGSC-E510"
    And no network call was attempted

  @PRD-065 @agent @matrix-A12
  Scenario: The node-wide cap stops every lane
    Given agsc.config.json has budget.usd_month 10
    And a .env file in the Bundle root, ignored by git, sets "AGSC_BUDGET_USD_MONTH" to "6"
    And the episodes of "worker" this month sum to usage cost_usd 3
    And the episodes of "planner" this month sum to usage cost_usd 3
    When the agent runs "agsc refresh --agent worker --dry-run --json" under the network trap
    Then the command exits 0
    And the Bundle does not hold "dist/proposal/1.patch"
    And the JSON envelope carries the warning "AGSC-E510"

  @PRD-065 @human @matrix-H10
  Scenario: ci --json names the budget override and never its value
    Given agsc.config.json has budget.usd_month 10
    And a .env file in the Bundle root, ignored by git, sets "AGSC_BUDGET_USD_MONTH" to "6"
    And the Bundle is a git repository of one commit with fixed dates
    When the operator runs "agsc ci --json" under the network trap
    Then the command exits 0
    And the output names "AGSC_BUDGET_USD_MONTH"
    And the output never carries the value the .env file gave "AGSC_BUDGET_USD_MONTH" (AGSC-01-37)

  @PRD-064 @agent @matrix-A12
  Scenario: A done board stops the lane
    Given every task of "sprint-1" is in "TASK_STATE_COMPLETED"
    When the Bundle is built
    Then "/boards/sprint-1.json" carries done true (AGSC-10-13)
    When the agent runs "agsc refresh --agent worker --dry-run" under the network trap
    Then the command exits 0
    And the Bundle does not hold "dist/proposal/1.patch"
    And the output names "nothing can be claimed"

  @PRD-063 @human @matrix-H10
  Scenario: The NOW page shows the budget warning when a cap is reached
    Given agsc.config.json has budget.usd_month 10
    And the episodes of "worker" this month sum to usage cost_usd 10
    When the operator runs "agsc build --json" under the network trap
    Then the command exits 0
    And the JSON envelope carries the warning "AGSC-E510"
    And "now.md" and "now/index.html" of the built node name "AGSC-E510" (AGSC-08-28)

  @PRD-063 @agent @matrix-A12
  Scenario: A dry run without a build instant is refused like build
    Given the Bundle has no git history and its security.txt leaves Expires to the build
    And the environment variable "SOURCE_DATE_EPOCH" is unset
    When the operator runs "agsc build --json" under the network trap
    Then the command exits 1
    And the JSON envelope carries the error "AGSC-E204"
    When the agent runs "agsc refresh --agent worker --dry-run --json" under the network trap
    Then the command exits 1
    And the JSON envelope carries the error "AGSC-E204"
    And the Bundle does not hold "dist/proposal/1.patch"

  @PRD-063 @human @matrix-H10
  Scenario: The build stays deterministic while the lane is non-deterministic
    Given the lane's Proposal claiming a task was merged with the trailer "Channel-Auto: lane"
    When "npx agentic-system-core ci" runs twice on the merged content
    Then the two runs give the same verdict, two builds give byte-identical output, and no model or network call is reachable from lint, build, verify or ci (AGSC-08-30)
    And "npx agentic-system-core verify --ledger" re-verifies the ledger, which records the lane's commit with mode "auto"

  @PRD-065 @agent
  Scenario: A planner cannot flood the board
    Given max_new_items of "worker" is 20
    When "worker" opens a Proposal that creates 21 task concepts
    Then the Proposal is rejected with "AGSC-E511" naming the count and the bound (AGSC-08-28 c)
