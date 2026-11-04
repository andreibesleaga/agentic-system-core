# Trace: PRD-002, PRD-011, PRD-013, PRD-014, PRD-015, PRD-025 · PLAN §6(a)
@persona-a @mode-0
Feature: Human reader finds a pattern with evidence
  As P1 (human reader: architect/engineer)
  I want to browse and search the static site without JavaScript being required
  So that I can find the right Concept with evidence, offline-friendly and with no reading order imposed

  Background:
    Given the acceptance Bundle is built into "www/" for the site "https://agenticsystemcore.com/"
    And an item with "status: draft" stays dark: no page, no link, no index entry (AGSC-06-30)

  @PRD-011 @PRD-025 @human @matrix-H3
  Scenario: Home page states software-and-registry identity, no narrative
    When the reader opens "/"
    Then the page shows the Bundle's title and the summary of "content/index.md"
    And its head carries the "describedby" link to "/.well-known/knowledge-linkset" (AGSC-06-25)
    And the page links to "/clusters/", "/concepts/", "/lessons/", "/skills/", "/now/", "/compose/" and "/search/"
    And the page introduces the node and links each non-empty index page with its count, listing no item itself
    And the page contains no "start here" link and no imposed reading order

  @PRD-014 @human @matrix-H3
  Scenario: Reader searches via the prebuilt client-side index
    Given no server-side search endpoint exists
    When the reader types a query into the search box
    Then the browser fetches "/search.json" once
    And results are filtered client-side from the fetched inverted index
    And no network request is made to any third-party search service

  @PRD-002 @PRD-013 @human @matrix-H3
  Scenario: Reader opens a Concept page and sees evidence
    When the reader navigates to "/concepts/a2a/"
    Then the page shows the title, the description as its summary, the type and kind, the cluster "Protocols" and the provenance
    And the page shows the SVG compiled from "content/diagrams/a2a.diagram" inline, named by "diagram.alt", and no diagram route exists (AGSC-02-13)
    And the page links its own "/pages/a2a.md" and "/pages/a2a.jsonld" (AGSC-06-02)
    And the Markdown view carries the "sources" entries with their "verified" dates and the "evidence" and "maturity" facets
    And the graph carries the typed Link "requires" to "mcp" and its computed inverse on "mcp" (AGSC-03-04)
    And the page offers "Propose an edit" as a plain link to the forge's edit view of "content/concepts/a2a.md"

  @PRD-015 @human @matrix-H3
  Scenario: Reader inspects cluster membership and the NOW page
    When the reader navigates to "/clusters/protocols/"
    Then the page lists every published item that names the cluster, each with its description
    When the reader navigates to "/now/"
    Then "/now/" and "/now.md" carry the line "content version …, built at …, fingerprint …, specification …" (AGSC-06-22)
    And they show the item counts, the stale item "tool-use-retries" and the open Lesson
    And both were generated purely from stored state, with no hand edit surviving a rebuild

  @PRD-002 @PRD-013 @human @matrix-H3
  Scenario: Reader sees what a Concept is linked to and what links back to it
    Given the draft "unreleased-idea" also requires "mcp" and the Bundle is built again
    When the reader navigates to "/concepts/mcp/"
    Then the relations table lists the backlink "requires" from "Agent2Agent Protocol" with the meaning of "requires" (AGSC-06-38)
    And the figure beside the table draws exactly the rows of the table and is named by its title and description
    And each arrow of the figure carries the class of its relation, "agsc-rel-requires" for the backlink, and no colour (AGSC-01-42)
    And the draft "unreleased-idea" is neither drawn nor named on the page
    When the reader navigates to "/clusters/agent-patterns/"
    Then the cluster map draws the link "requires" from "Handoff" to "Supervisor" and its table lists the same link

  @PRD-002 @PRD-013 @human @matrix-H3
  Scenario: Reader sees how the clusters connect and what each relation means
    Given the concept "handoff" also uses "mcp" and the Bundle is built again
    When the reader navigates to "/clusters/"
    Then the overview table counts the relation "uses" from "Agent patterns" to "Protocols", and its figure draws the same arc (AGSC-06-38)
    And a radio button for each relation in the table filters it through the page's own stylesheet, with no script
    And the legend lists the fourteen relations in the order of AGSC-03-01, each with its meaning

  @PRD-002 @human @matrix-H3
  Scenario: Reader explores the graph with the keyboard alone
    Given the concept "tool-use-retries" is retired and the Bundle is built again
    When the reader opens the explorer on "/clusters/"
    Then the explorer draws every listed item and not the retired "tool-use-retries", and the page requests nothing from another origin
    And the arrow keys move through the explorer's list with the tooltip following, and Enter selects an item whose relations the detail panel names with their meanings
    And Escape closes the tooltip first and then clears the selection

  @PRD-011 @PRD-022 @human @matrix-H3
  Scenario: Reader asks the published graph a question on the query page
    When the reader opens the query page "/query/"
    Then the page loads the node's own graph into the engine it ships and requests nothing from another origin
    And a CONSTRUCT query for the "requires" links shows "Handoff" requiring "Supervisor" as a table and as a picture, with the result offered as CSV and as JSON
    And the share link of that query opens it in the editor of a new page without running it, and no request carries the query

  @PRD-011 @PRD-022 @human @matrix-H3
  Scenario: Reader runs one of the ten questions of the graph on the query page with the keyboard alone
    When the reader opens the query page "/query/"
    Then the example "If I choose X, what else must I take?" asks about "Agent2Agent Protocol" in its query and names it in the sentence under it
    And Enter on the example's button puts its query into the editor, and Ctrl+Enter runs it: the one row is the item "mcp", which is what the engine's own function answers for "a2a"
    And the vocabulary lists the fourteen relations, each with the meaning the specification gives it
