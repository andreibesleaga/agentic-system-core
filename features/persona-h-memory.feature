# Trace: PRD-021, PRD-022, PRD-026, PRD-027, PRD-061 · PLAN §5.2 ContentStore
@persona-h @mode-1
Feature: Agent uses a node as external auditable memory
  As P8 (agent-as-memory, Mode 1)
  I want lossless round-trip export/import
  So that this Bundle can serve as external, auditable memory for my agent without losing any key

  Background:
    Given the read path reuses persona-c (MCP) and the write path reuses persona-d (proposer)

  @PRD-026 @agent @matrix-A5
  Scenario: Agent exports the Bundle in three lossless forms
    Given the Bundle root carries the Content Use Terms as "LICENSE-CONTENT"
    When the agent runs "npx agentic-system-core export --markdown"
    Then "dist/export/markdown/" contains the lint-normalized Bundle with no key lost (AGSC-01-26)
    When the agent runs "npx agentic-system-core export --okf"
    Then "dist/export/okf/content/index.md" carries "okf_version" and a "content/log.md" is added
    When the agent runs "npx agentic-system-core export --jsonld"
    Then "dist/export/graph.jsonld" equals "www/graph.jsonld" byte-for-byte

  @PRD-026 @human @matrix-A5
  Scenario: Exported Markdown Bundle opens unchanged as an Obsidian vault
    Given "dist/export/markdown/" was produced by "export --markdown"
    When the folder is opened as an Obsidian vault
    Then no file requires modification to render correctly

  @PRD-026 @agent @matrix-A5
  Scenario: Agent imports a foreign OKF bundle idempotently
    When the agent runs "npx agentic-system-core import ./some-okf-bundle --from okf"
    Then each file is written under the folder of its type, a "procedure" under "content/procedures/"
    And an unknown "type" value is imported as "concept" with the warning "AGSC-E506", the original kept as "x-okf-type" (AGSC-01-22)
    And colliding slugs are deduplicated with a "-2" suffix
    And a second run writes nothing and reports every item unchanged
    And "npx agentic-system-core lint" finds no error in the imported items except a concept "kind" the foreign bundle never declared

  @PRD-021 @PRD-026 @human @matrix-A5
  Scenario: A thesaurus kept as SKOS arrives as drafts and imports idempotently
    Given a SKOS thesaurus "thesaurus.ttl" with a scheme, a collection and two concepts
    When the author imports "thesaurus.ttl" with "--from skos" into a copy of the Bundle that holds no item
    Then every item the SKOS import wrote is a draft with the provenance "imported", keeping its SKOS IRI in "x-skos-iri"
    And a statement the SKOS import cannot carry is reported as "AGSC-E506" naming its subject and predicate
    And the same import run again writes nothing and reports every item unchanged
    And no network call was attempted

  @PRD-021 @PRD-026 @human @matrix-A5
  Scenario: A foreign OKF bundle arrives as drafts, whatever licence it declares
    Given an OKF bundle "licensed-bundle" whose records declare the open licence "CC0-1.0" and the status "stable"
    When the author imports "licensed-bundle" with "--from okf" into a copy of the Bundle that holds no item
    Then every item the OKF import wrote is a draft, with one "AGSC-E506" warning each that names the status it replaced

  @PRD-026 @human @matrix-A5
  Scenario: A folder exported with a manifest is checked when it is imported
    Given the Bundle root carries the Content Use Terms as "LICENSE-CONTENT"
    When the author runs "agsc export --okf --manifest" under the network trap
    Then the command exits 0
    And "dist/export/okf/export-manifest.json" lists every other file of the export with its digest, the item count and the items digest
    When one exported file is edited and the folder is imported into a copy of the Bundle that holds no item
    Then the import warns once with "AGSC-E506" that the edited file differs from the manifest, and still writes the items

  @PRD-027 @agent @matrix-A5
  Scenario: memory:// URIs are documented as an alias only, never resolved
    Given an item's slug is "a2a" in bundle "agenticsystemcore"
    When documentation shows "memory://agenticsystemcore/a2a"
    Then it is documented strictly as an alias of "https://agenticsystemcore.com/concepts/a2a/"
    And no code path resolves a "memory://" URI over the network or filesystem

  @PRD-026 @human @matrix-H13
  Scenario: Another memory system exchanges a node through COGX
    When the author runs "agsc export --to cogx" under the network trap
    Then the command exits 0
    And the archive "dist/export/cogx" holds no "permissions.json", and every record names its item's IRI, the licence, the terms and the trust mark "untrusted"
    When the author imports "dist/export/cogx" with "--from cogx" into a copy of the Bundle that holds no item
    Then every published item comes back as authored, with the exporting node's content version
    And the copy builds, and its graph names every item the first node's graph names
    And the same import run again writes nothing and reports every item unchanged
    And no network call was attempted

  @PRD-061 @agent @matrix-A14
  Scenario: A memory framework takes the node's chunks through the records.js connector
    Given the Bundle is built
    When the agent reshapes "www/chunks.jsonl" with the connectors example records.js for LangGraph, AutoGen and Mem0 under the network trap
    Then each shape gives one record per chunk, and every record keeps the item IRI, the chunk digest, the licence, the terms and the trust mark "untrusted"
    And no network call was attempted

  @PRD-061 @agent
  Scenario: An agent checks the chunks it holds against what the node states about them
    Given a fresh copy of the acceptance Bundle
    And the Bundle is built and served on loopback
    When the agent fetches "/chunks.jsonl", "/chunks-index.toon" and the discovery document over loopback
    Then the chunks surface link states the digest of the file, the number of lines and the commitment to their ids, and the agent recomputes all three
    And the index has one row per chunk line, in the same order, with the first 16 characters of each line's id and digest
    And with one chunk line dropped the recomputed count and commitment no longer match what the node states
    And the shipped validate-wellknown passes at Level 2 over loopback

  @PRD-026 @agent
  Scenario: The JSON-lines export is exactly the per-item graph nodes
    Given the Bundle is built
    When the agent runs "agsc export --jsonl" under the network trap
    Then the command exits 0
    And each line of "dist/export/items.jsonl" is the node of the item's "www/pages/<slug>.jsonld", one line per item in slug order
    And no network call was attempted

  @PRD-022 @human
  Scenario: A taxonomy tool reads the SKOS export with no inference step
    Given the Bundle is built
    When the author runs "agsc export --skos" under the network trap
    Then the command exits 0
    And "dist/export/skos.ttl" types the Bundle as a skos:ConceptScheme and each published concept, lesson and cluster as a skos:Concept or skos:Collection, and holds no episode, procedure or gate
    And "dist/export/skos.ttl" is Turtle that a second run writes again byte for byte
    And no network call was attempted

  @PRD-022 @human
  Scenario: The author asks which notes should be linked and no note is touched
    Given a note "alpha" that links to the note "beta" in its body, with no Link between them
    When the author runs "agsc lint --suggest" under the network trap
    Then the command exits 0
    And "dist/suggestions.json" proposes the Link "related" from "alpha" to "beta" with the evidence "mention"
    And the content folder is byte for byte what it was before the suggestions were asked for
    And "dist/suggestions.json" is canonical JSON that a second run writes again byte for byte
    And no network call was attempted

  @PRD-022 @human
  Scenario: The author reads what the graph entails and the answer is never published
    Given the Bundle is built
    When the author runs "agsc export --closure" under the network trap
    Then the command exits 0
    And "dist/export/closure.nt" is not empty, shares no triple with "www/graph.nq" and types a concept skos:Concept
    And "dist/export/closure.nt" is N-Quads that a second run writes again byte for byte
    And no file under "www" has "closure" in its name
    And no network call was attempted

  @PRD-026 @human
  Scenario Outline: An export form writes its file: <form>
    Given the Bundle root carries the Content Use Terms as "LICENSE-CONTENT"
    When the author runs "agsc <command>" under the network trap
    Then the command exits 0
    And "<file>" is written, carries the Content Use Terms, and a second run writes the same bytes
    And no network call was attempted

    Examples:
      | form        | command                 | file                                            |
      | --zip       | export --markdown --zip | dist/export/markdown-0.0.0+20260101T000000Z.zip |
      | mermaid     | export --to mermaid     | dist/export/mermaid/items/handoff.mmd           |
      | llm-context | export --to llm-context | dist/export/llm-context/llms-ctx.txt            |
