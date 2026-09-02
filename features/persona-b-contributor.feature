# Trace: PRD-039, PRD-040, PRD-041, PRD-042, PRD-050 · audit/D §3(b) · PLAN §6(b)
# Source of truth: discovery-product/audit/D-v1-system-walkthrough.md §3(b) "Human contributor proposing an edit (Mode 0)"
@persona-b @mode-0
Feature: Human contributor fixes a page and passes a hard review gate
  As P2 (human contributor)
  I want a legible, passable review gate with no hidden rules
  So that I can fix a page and see it merged and deployed without needing repo write access

  Background:
    Given the content repo "AgenticSystemCore.com" is public at launch (D41)
    And the item "content/concepts/a2a.md" exists with a valid "prov" block

  @PRD-039
  Scenario: Contributor opens the fork-and-edit URL from the page footer
    When the contributor clicks "Propose a change" on "/concepts/a2a/"
    Then the browser opens "https://github.com/andreibesleaga/AgenticSystemCore.com/edit/main/content/concepts/a2a.md"
    And GitHub's own fork-and-edit UI handles the fork, no custom code runs

  @PRD-040 @PRD-042
  Scenario: Contributor commits with the required trailer and PR marker
    Given the contributor has edited frontmatter or body in the fork
    When the contributor commits the change
    Then the commit message contains "Signed-off-by: <Name> <email> (CA-v1)"
    And the PR body contains the marker "<!-- agsc:proposal v1 -->"
    And the PR body states rationale, affected slugs and "prov.origin"

  @PRD-041 @PRD-042
  Scenario: CI runs a lint-only review, no LLM call
    When the PR triggers the "ci.yml" workflow with "contents: read"
    Then "npx agentic-system-core ci" runs lint L1 and L2 findings
    And the pipeline builds twice and diffs the two outputs byte-for-byte
    And findings are posted as PR annotations with file and line
    And no LLM or model API call occurs anywhere in this lane

  @PRD-041 @PRD-050
  Scenario: Owner reviews, ratifies and the change deploys
    Given the required CI status check is green
    When the owner adds "verified: [{by: human:andreibesleaga, at: \"2026-09-02\"}]" to the changed file
    And the owner approves and merges the PR under the ruleset "1 approval + Code Owner + green ci"
    Then the merge triggers "agsc ci" then a Cloudflare Pages deploy of "www/"
    And the change is live within approximately 2 minutes
    And "prov.commit" and "prov.reviewer" are derived at build time, never written into the file by CI
