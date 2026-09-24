# Trace: PRD-002, PRD-011, PRD-013, PRD-014, PRD-015, PRD-025 · PLAN §6(a)
@persona-a @mode-0
Feature: Human reader finds a pattern with evidence
  As P1 (human reader: architect/engineer)
  I want to browse and search the static site without JavaScript being required
  So that I can find the right Concept with evidence, offline-friendly and with no reading order imposed

  Background:
    Given the acceptance Bundle is built into "www/" for the site "https://agenticsystemcore.com/"
    And an item with "status: draft" stays dark: no page, no link, no index entry (AGSC-06-30)

  @PRD-011 @PRD-025
  Scenario: Home page states software-and-registry identity, no narrative
    When the reader opens "/"
    Then the page shows the Bundle's title and the summary of "content/index.md"
    And its head carries the "describedby" link to "/.well-known/knowledge-linkset" (AGSC-06-25)
    And the page links to "/clusters/", "/concepts/", "/lessons/", "/skills/", "/now/", "/compose/" and "/search/"
    And the page introduces the node and links each non-empty index page with its count, listing no item itself
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
    Then the page shows the title, the description as its summary, the type and kind, the cluster "Protocols" and the provenance
    And the page shows the SVG compiled from "content/diagrams/a2a.diagram" inline, named by "diagram.alt", and no diagram route exists (AGSC-02-13)
    And the page links its own "/pages/a2a.md" and "/pages/a2a.jsonld" (AGSC-06-02)
    And the Markdown view carries the "sources" entries with their "verified" dates and the "evidence" and "maturity" facets
    And the graph carries the typed Link "requires" to "mcp" and its computed inverse on "mcp" (AGSC-03-04)
    And the page offers "Propose an edit" as a plain link to the forge's edit view of "content/concepts/a2a.md"

  @PRD-015
  Scenario: Reader inspects cluster membership and the NOW page
    When the reader navigates to "/clusters/protocols/"
    Then the page lists every published item that names the cluster, each with its description
    When the reader navigates to "/now/"
    Then "/now/" and "/now.md" carry the line "content version …, built at …, fingerprint …, specification …" (AGSC-06-22)
    And they show the item counts, the stale item "tool-use-retries" and the open Lesson
    And both were generated purely from stored state, with no hand edit surviving a rebuild
