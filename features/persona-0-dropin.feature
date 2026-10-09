@persona-0 @mode-0 @PRD-053
Feature: Drop-in user — plain Markdown becomes a live ontologic wiki
  As a user with a folder of plain .md notes
  I want a living, linked, agent-readable wiki with zero configuration
  So that my notes become an online ontologic memory in three commands

  @human @matrix-H1
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

  @human @matrix-H1
  Scenario: Re-running init over an adopted and built Bundle changes nothing
    Given a folder of bare notes adopted by "npx agentic-system-core init", repaired, and built into "www/"
    When I run "npx agentic-system-core init" again
    Then no file under "content/" changes and nothing under "www/", "dist/" or "content/assets/" is adopted (AGSC-02-91)

  @human @matrix-H2
  Scenario: Publishing the adopted wiki locally
    Given a folder of bare notes adopted by "npx agentic-system-core init", repaired, and built into "www/"
    When I run "agsc-host emit cloudflare-pages"
    Then the host claims the reference profile, whose "_headers" and "_redirects" the build already wrote into "www/"
    When the Bundle is built and served on loopback
    Then the shipped validate-wellknown passes at Level 2 over loopback
    And no network call was attempted

  @human @matrix-H2
  Scenario: Publishing the adopted wiki pushed to a real forge
    Given a folder of bare notes adopted by "npx agentic-system-core init", repaired, and built into "www/"
    When I push the repository to a forge and connect it to Cloudflare Pages with the build command "npx agentic-system-core build" and the output folder "www/"
    Then Cloudflare Pages serves the wiki from "www/" at my domain, with the "_headers" and "_redirects" the build wrote

  @human @matrix-H1
  Scenario: Adopting notes with non-ASCII file names gives ASCII slugs
    Given a directory of bare notes named with the Kelvin sign U+212A, as in "Kelvin.md", and with the capital I with dot above U+0130, as in "Istanbul.md"
    When I run "npx agentic-system-core init"
    Then the note named with U+212A becomes "content/concepts/kelvin.md", because NFC turns the Kelvin sign into the letter K before the ASCII lower-casing (AGSC-02-91)
    And the note named with U+0130 becomes "content/concepts/stanbul.md", because only A to Z are lower-cased and every other character becomes "-" (AGSC-02-91)
    And each adopted file records its original file name in "aliases" (AGSC-02-93)

  @human @matrix-H1
  Scenario: A newcomer asks for help
    Given an empty folder
    When the newcomer runs "agsc help"
    Then the output names "AGSC-E001"
    And the output names "agsc --help"
    And the output names "agsc <verb> --help"
    When the newcomer runs "agsc --help"
    Then the command exits 0
    And the help gives each of the sixteen verbs of AGSC-09-07 a line of its own with a sentence of purpose

  @human @matrix-H1
  Scenario: A stray AGSC_ variable is named as an environment variable
    Given a folder of bare notes adopted by "npx agentic-system-core init"
    And the environment variable "AGSC_DOI" is "10.5281/zenodo.1"
    When the newcomer runs "agsc lint"
    Then the output names "AGSC-E004"
    And the output names "environment variable AGSC_DOI"
    And the output names "unset it"

  @human @matrix-H1
  Scenario: A newcomer on Node 18 gets one sentence
    Given an empty folder
    When the newcomer runs "agsc --version" on a Node.js that reports "v18.19.1"
    Then the command exits 2
    And the output names "agsc needs Node.js 22.13 or later"
    And the output is that one line, with no stack trace

  @human @matrix-H1
  Scenario: The first-run security.txt of the agent skill still passes ci after its date
    Given a folder of bare notes adopted by "npx agentic-system-core init"
    And the newcomer writes ".well-known/security.txt" exactly as the agent skill shows it
    And the environment variable "SOURCE_DATE_EPOCH" is "1812000000"
    When the newcomer runs "agsc ci" under the network trap
    Then the command exits 0
    And no network call was attempted
