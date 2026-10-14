# Trace: PRD-010, PRD-022, PRD-047, PRD-060, NFR-04, NFR-05 · spec/04 canonicalization, spec/05 graph, docs/BENCHMARKS.md
@persona-n
Feature: Researcher measures a node offline and cites exactly what was measured
  As P14 (researcher)
  I want to measure a node with the shipped kit, offline, and get the same numbers every time
  So that I can publish results that anyone can reproduce and that name the node, its content version, the specification and the engine

  @PRD-060 @NFR-05 @human @mode-0 @matrix-H19
  Scenario: A researcher runs the benchmark kit offline with a fixed seed
    Given the synthetic Bundle generator writes the Bundle of seed 20 twice
    Then the two generated Bundles are byte-identical
    Given a fresh copy of the acceptance Bundle
    And the Bundle is built
    And a labelled query set in the BEIR layout whose gold items are "mcp", "a2a" and "tool-use-retries"
    When the researcher runs "tools/bench" over the built node with that set, twice, under the network trap
    Then both runs score recall and precision at 10 on the surfaces "chunks", "llms" and "search"
    And the two reports are byte-identical
    And no network call was attempted

  @PRD-022 @PRD-060 @NFR-04 @agent @mode-1 @matrix-H19
  Scenario: The three graph dumps agree as sets
    Given a fresh copy of the acceptance Bundle
    And the Bundle is built
    When the agent parses "www/graph.jsonld", "www/graph.ttl" and "www/graph.nq" with standard RDF parsers, offline
    Then the three give the same set of triples
    And no triple of the three names a blank node

  @PRD-010 @PRD-047 @human @mode-0 @matrix-H19
  Scenario: A researcher cites the node through CITATION.cff, the graph dumps and a conform report
    Given a fresh copy of the acceptance Bundle
    And the Bundle is built
    When the researcher runs "agsc conform --level 1 --to report.json --json"
    Then the command exits 0
    And the engine's "CITATION.cff" names its title, its authors, its licence and its code repository, and any version it names is the package version
    And the conformance report names the implementation, its version and the specification version the graph dumps carry
    And "www/llms.txt" names the node's content version and the specification version in its provenance header
