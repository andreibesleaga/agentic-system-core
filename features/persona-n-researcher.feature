# Trace: PRD-010, PRD-020, PRD-022, PRD-024, PRD-047, PRD-060, PRD-066, PRD-067, PRD-068, NFR-04, NFR-05 · spec/04 canonicalization, spec/05 graph, spec/06 AGSC-06-40/41 (Signposting, Dataset), docs/BENCHMARKS.md
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

  @PRD-066 @NFR-05 @human @mode-0 @matrix-H19
  Scenario: A researcher writes the gold index of a built node and checks the agent-study kit against it before any scored run
    Given a fresh copy of the acceptance Bundle
    And the Bundle is built
    And a copy of the shipped agent-study set whose gold index "bench/runners/kit.js gold-index" writes from the build, with its example question labelled by the build's first chunk
    When the researcher dry-runs "tools/bench" over the built node with that set, twice, under the network trap
    Then both dry runs exit 0 and the results-row contract accepts its 1 example
    And both find every row of the gold index among the chunks of the build
    And the two reports are byte-identical
    And no network call was attempted

  @PRD-067 @NFR-05 @human @mode-0 @matrix-H19
  Scenario: A researcher runs every self-contained measurement layer with one command into a scratch record
    Given a scratch directory outside the repository
    When the researcher runs "bench/measure.js --all --offline" into it, each layer measured by a stand-in
    Then the command exits 0 having measured conformance, determinism, security, perf and package, in that order, and said that it left out install
    And the scratch directory's "measurements.json" holds exactly those layers in the layout of "docs/measurements.json"
    And "docs/measurements.json" is unchanged

  @PRD-068 @NFR-05 @human @mode-0 @matrix-H19
  Scenario: A researcher holds the numbers of a results page to the measurement record before publishing it
    Given a results page whose measured region quotes the package count of the install layer of "docs/measurements.json"
    When the researcher runs "tools/lint-claims" over the page with that record
    Then the claims check passes
    Given the measured region of the page also says that an install holds 999,999 packages
    When the researcher runs "tools/lint-claims" over the page with that record
    Then the claims check fails on "999,999", the one number the record does not hold

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

  @PRD-020 @PRD-024 @human @mode-0 @matrix-H19
  Scenario: A dataset harvester finds the licence, the creator and the files of a node from its home page alone
    Given a fresh copy of the acceptance Bundle
    And the configuration names the creator "Josiah Carberry" with the ORCID iD "0000-0002-1825-0097" and the licence "https://creativecommons.org/licenses/by/4.0/"
    And the Bundle is built and served on loopback
    When the harvester reads the Link header of the home page over loopback
    Then it finds the FAIR Signposting links cite-as, type, describedby, item, license and linkset of the node
    And the Dataset block of "www/index.html" names the licence, the creator with the ORCID iD and one download for each machine file
    And the PROV-O terms appear in "www/index.html" and in no other file of the build
    And the shipped validate-wellknown passes at Level 2 over loopback
