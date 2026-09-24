# Trace: PRD-063, PRD-064, PRD-065 · spec/08 §8.6, spec/10 §10.6, spec/01 AGSC-01-36…38 (rc.4)
# Source of truth: docs/PRD.md Amendment 8 and the rc.4 rules named on each step
@persona-k @mode-5 @PRD-063 @PRD-064 @PRD-065
Feature: Self-driving team — agents and people finish a project's tasks on one live board
  As P12 (a self-driving team of agents and people)
  I want a shared pull board that agents plan, claim and work on until it is done
  So that product and project management runs itself under the guards a person configured once

  Background:
    Given a Bundle with a board cluster "sprint-1" holding tasks of kind task with task_state "TASK_STATE_SUBMITTED"
    And agsc.config.json declares contribute[]
    And a channel "lane" with author "lane-bot", owner "human:alice" and publish "auto"
    And an agents[] entry "worker" of kind "llm" with tasks "plan, claim, work, edit" and types "concept, episode, lesson", channel "lane", budget_usd_month 5, enabled true

  @PRD-064
  Scenario: An agent claims a task by proposing its working state
    When "npx agentic-system-core refresh --agent worker" runs
    Then the agent opens a Proposal whose diff changes only task_state and modified of one task to "TASK_STATE_WORKING" (AGSC-10-17)
    And the Proposal's items carry prov origin "ai-generated", agent "worker", the model and operator "human:alice"
    And the Proposal contains one episode item with usage and outcome (AGSC-08-28 d)
    And the auto-merge job merges it under every condition of AGSC-08-26 with the trailer "Channel-Auto: lane"
    When "npx agentic-system-core build" runs
    Then "/boards/sprint-1.json" shows that task with state "TASK_STATE_WORKING" and claimed_by "worker"

  @PRD-064
  Scenario: The board reaches done and the agent stops
    Given every task of "sprint-1" has been proposed to "TASK_STATE_COMPLETED" and merged
    When "npx agentic-system-core build" runs
    Then "/boards/sprint-1.json" carries done true
    When "npx agentic-system-core refresh --agent worker" runs
    Then no Proposal is opened, because no board the agent may touch holds a claimable task (AGSC-10-17)

  @PRD-063
  Scenario: The agent lane cannot reach the slow lane
    When the agent "worker" opens a Proposal that changes "content/procedures/deploy.md"
    Then the Proposal is rejected with "AGSC-E509" before any lint runs (AGSC-08-28 c)
    And a person, not the agent, is the only one who can change a procedure, a gate, a cluster or the configuration (AGSC-10-18)

  @PRD-063
  Scenario: The budget stops the lane for the month
    Given the episodes of "worker" this month sum to usage cost_usd 5
    When "npx agentic-system-core refresh --agent worker" runs
    Then no model is called and the NOW page records the warning "AGSC-E510" (AGSC-08-28 e)

  @PRD-063
  Scenario: The build stays deterministic while the lane is non-deterministic
    Given the lane's Proposal claiming a task was merged with the trailer "Channel-Auto: lane"
    When "npx agentic-system-core ci" runs twice on the merged content
    Then the two runs give the same verdict, two builds give byte-identical output, and no model or network call is reachable from lint, build, verify or ci (AGSC-08-30)
    And "npx agentic-system-core verify --ledger" re-verifies the ledger, which records the lane's commit with mode "auto"

  @PRD-065
  Scenario: The work-in-progress limit keeps the agent on one task
    Given "worker" already holds "task-a" in "TASK_STATE_WORKING" and max_claims is 1
    When "worker" proposes "TASK_STATE_WORKING" for "task-b" without completing "task-a"
    Then the Proposal is rejected with "AGSC-E511" before any lint runs (AGSC-10-17)
    When "worker" proposes "TASK_STATE_COMPLETED" for "task-a" and "TASK_STATE_WORKING" for "task-b" in one Proposal
    Then the Proposal is accepted and the board export shows "task-b" claimed_by "worker"

  @PRD-065
  Scenario: A planner cannot flood the board
    Given max_new_items of "worker" is 20
    When "worker" opens a Proposal that creates 21 task concepts
    Then the Proposal is rejected with "AGSC-E511" naming the count and the bound (AGSC-08-28 c)

  @PRD-065
  Scenario: The node-wide cap and the .env file bound every model call
    Given agsc.config.json has budget.usd_month 10 and a .env file in the Bundle root with "AGSC_BUDGET_USD_MONTH=4"
    And the episodes of this month across every lane sum to usage cost_usd 4
    When "npx agentic-system-core refresh --agent worker" runs
    Then no model is called and the NOW page records the warning "AGSC-E510" (AGSC-01-38, AGSC-08-25)
    And "npx agentic-system-core ci --json" prints the override name "AGSC_BUDGET_USD_MONTH" and never its value (AGSC-01-37)
    And a .env file tracked in the content branch is reported as "AGSC-E403"
