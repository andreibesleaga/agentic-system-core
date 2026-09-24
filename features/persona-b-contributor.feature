# Trace: PRD-039, PRD-040, PRD-041, PRD-042, PRD-050 · PLAN §6(b)
@persona-b @mode-0
Feature: Human contributor fixes a page and passes a hard review gate
  As P2 (human contributor)
  I want a legible, passable review gate with no hidden rules
  So that I can fix a page and see it merged and deployed without needing repo write access

  Background:
    Given the Bundle names the contribution target "https://github.com/andreibesleaga/AgenticSystemCore.com" with mode "pr"
    And the item "content/concepts/a2a.md" exists with a valid "prov" block

  @PRD-039
  Scenario: Contributor opens the fork-and-edit URL from the page footer
    When the contributor reads the "Propose an edit" link on "/concepts/a2a/"
    Then it points at "https://github.com/andreibesleaga/AgenticSystemCore.com/edit/HEAD/content/concepts/a2a.md", the forge's edit view of the default branch
    And it is a plain anchor: the page has no form, and nothing it loads comes from another origin
    And the discovery document names the same target as its "…rel#contribute" link with mode "pr" (AGSC-11-14)

  @PRD-040 @PRD-042
  Scenario: Contributor commits with the required trailer and PR marker
    Given the contributor has edited frontmatter or body in the fork
    When the contributor commits the change
    Then the commit message contains "Signed-off-by: <Name> <email> (CA-v1)"
    And the PR body contains the marker "<!-- agsc:proposal v1 -->"
    And the PR body states rationale, affected slugs and "prov.origin"

  @PRD-041 @PRD-042
  Scenario: CI runs a lint-only review, no LLM call
    Given the contributor's change adds a concept with no description
    When the change runs "npx agentic-system-core ci"
    Then ci runs lint, build, verify and forge, and "dist/gate.json" records each check with its findings (AGSC-08-10)
    And two builds of the same change give the same bytes, which ci compares before it passes (AGSC-04-02)
    And every finding names its file, line and column
    And no model or network call occurs anywhere in this lane (AGSC-08-30)

  @PRD-041 @PRD-050
  Scenario: Maintainer reviews, ratifies and the change deploys
    Given the required CI status check is green
    When the maintainer adds "verified: [{by: human:andreibesleaga, at: \"2026-09-02\"}]" to the changed file
    And the maintainer approves and merges the PR under the ruleset "1 approval + Code Owner + green ci"
    Then the merge triggers "agsc ci" then a Cloudflare Pages deploy of "www/"
    And the change is live within approximately 2 minutes
    And "prov.commit" and "prov.reviewer" are derived at build time, never written into the file by CI
