@persona-0 @PRD-053
Feature: Drop-in user — plain Markdown becomes a live ontologic wiki
  As a user with a folder of plain .md notes
  I want a living, linked, agent-readable wiki with zero configuration
  So that my notes become an online ontologic memory in three commands

  Scenario: Three commands from bare notes to a full local site
    Given a directory containing "ideas.md", "notes/agents.md" and "todo.md" with no YAML frontmatter
    When I run "npx agentic-system-core init"
    Then every file gains minimal frontmatter (type, kind, title, prov) and every body byte is unchanged
    And files that already had frontmatter are untouched
    When I run "npx agentic-system-core ci"
    Then the build succeeds offline with warnings only
    And "www/" contains the site, "graph.jsonld", "llms.txt" and "/.well-known/agentic-knowledge"
    And "npx agentic-system-core mcp" serves search/read/links over the same files

  Scenario: Publishing the adopted wiki
    Given the adopted Bundle from the previous scenario
    When I push the repository with the generated GitHub workflow
    Then Cloudflare Pages serves the wiki from "www/" at my domain
    And re-running "init" changes nothing (idempotent adoption)
