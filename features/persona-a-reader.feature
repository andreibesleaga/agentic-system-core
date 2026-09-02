# Trace: PRD-002, PRD-011, PRD-013, PRD-014, PRD-015, PRD-025 · audit/D §3(a) · PLAN §6(a)
# Source of truth: discovery-product/audit/D-v1-system-walkthrough.md §3(a) "Human reader (Mode 0)"
@persona-a @mode-0
Feature: Human reader finds a pattern with evidence
  As P1 (human reader: architect/engineer)
  I want to browse and search the static site without JavaScript being required
  So that I can find the right Concept with evidence, offline-friendly and with no reading order imposed (R23)

  Background:
    Given the site "https://agenticsystemcore.com/" is built and deployed from "www/"
    And the Bundle contains 66 "status: stable" Concepts rendered at "release: launch"
    And 87 "status: draft" Concepts remain dark (not linked, not indexed)

  @PRD-011 @PRD-025
  Scenario: Home page states software-and-registry identity, no narrative
    When the reader opens "https://agenticsystemcore.com/"
    Then the page shows the install line "npx agentic-system-core …"
    And the page shows counts "66 concepts, 20 clusters"
    And the page links to "/graph.jsonld", "/llms.txt", "/now/", "/compose/", "/skills/"
    And the page contains no "start here" link and no imposed reading order

  @PRD-014
  Scenario: Reader searches via the prebuilt client-side index
    Given no server-side search endpoint exists
    When the reader types a query into the search box
    Then the browser fetches "/search.json" once
    And results are filtered client-side from the fetched inverted index
    And no network request is made to any third-party search service

  @PRD-002 @PRD-013
  Scenario: Reader opens a Concept page and sees evidence
    When the reader navigates to "/concepts/a2a/"
    Then the page shows "title", "description", and facet chips for "evidence" and "maturity"
    And the page shows an inlined SVG compiled from "content/diagrams/a2a.diagram" with non-empty alt text
    And the page shows "Sources" entries carrying their "verified" dates
    And the page shows typed Links with computed inverses, for example "required-by …"
    And the page shows a cluster breadcrumb "family › deck › subdeck"
    And the page footer offers "Download: .md · .jsonld · Propose a change"

  @PRD-015
  Scenario: Reader inspects cluster membership and the NOW page
    When the reader navigates to "/clusters/protocols/"
    Then members are grouped by sub-cluster
    When the reader navigates to "/now/"
    Then the page shows last build time, item counts, stale items and open Lessons
    And the page was generated purely from stored state, with no hand edits surviving a rebuild
