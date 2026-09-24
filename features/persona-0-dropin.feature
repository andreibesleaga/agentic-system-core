@persona-0 @PRD-053
Feature: Drop-in user — plain Markdown becomes a live ontologic wiki
  As a user with a folder of plain .md notes
  I want a living, linked, agent-readable wiki with zero configuration
  So that my notes become an online ontologic memory in three commands

  Scenario: Three commands from bare notes to a full local site
    Given a directory containing "ideas.md", "notes/agents.md" and "todo.md" with no YAML frontmatter, and "kept.md" with a frontmatter block
    When I run "npx agentic-system-core init"
    Then every adopted file gains exactly "type", "title", "aliases", "prov" and "kind", in that order, and every body byte is unchanged (AGSC-02-90)
    And each adopted file is moved to "content/concepts/<slug>.md" with its original path recorded in "aliases" (AGSC-02-93)
    And "notes/agents.md" is flattened to "content/concepts/agents.md"
    And every relative link or image in an adopted body that no longer resolves is reported as warning "AGSC-E507" naming the original path, the new path and the reference, each referenced local file under the adoption root is copied to "content/assets/<original-relative-path>", and no body byte is rewritten (AGSC-02-95)
    And "kept.md", which already had a frontmatter block, is untouched (AGSC-02-91)
    And init prints its two "before you build" steps, the security contact and the crawler list it wrote into "site.tdm_crawlers" (AGSC-02-92)
    And lint reports no error except the missing security contact "AGSC-E901" and the references "AGSC-E507" named, which stay "AGSC-E310" until repaired (AGSC-02-95)
    When I add ".well-known/security.txt" with a "Contact:" line and repair the references "AGSC-E507" named
    And I run "npx agentic-system-core ci"
    Then ci passes offline with warnings only and writes its verdict to "dist/gate.json" (AGSC-02-92, AGSC-08-10)
    When I run "npx agentic-system-core build"
    Then "www/" contains the site, "graph.jsonld", "llms.txt" and "/.well-known/knowledge-linkset"
    And "npx agentic-system-core mcp" serves search, read and links over the same files

  Scenario: Re-running init over an adopted and built Bundle changes nothing
    Given a folder of bare notes adopted by "npx agentic-system-core init", repaired, and built into "www/"
    When I run "npx agentic-system-core init" again
    Then no file under "content/" changes and nothing under "www/", "dist/" or "content/assets/" is adopted (AGSC-02-91)

  Scenario: Publishing the adopted wiki
    Given the adopted Bundle from the previous scenario
    When I push the repository with the generated GitHub workflow
    Then Cloudflare Pages serves the wiki from "www/" at my domain
    And re-running "init" changes nothing (idempotent adoption)
