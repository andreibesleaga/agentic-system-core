# Trace: PRD-010, PRD-054, PRD-055, NFR-02 · spec/09 conformance, spec/10 Levels
@persona-l @mode-1
Feature: Port implementer proves a second implementation conforms
  As P10 (port implementer)
  I want the shipped checker and the shared vector set to judge my implementation, not the engine's code
  So that I can prove a port conforms from the specification's files alone

  @PRD-054 @NFR-02 @human @matrix-H14
  Scenario: A Level-0 node written without the engine passes the shipped checker
    Given a publisher writes, without the engine, two Markdown items, "graph.jsonld", "llms.txt" and "/.well-known/knowledge-linkset" with no digest and no "agsc-*" attribute
    When the port implementer runs the shipped "validate-wellknown" tool on that discovery file at Level 0
    Then it exits 0 and reports "pass" (AGSC-10-02)
    And the same file with a relation name that is neither registered nor an extension of the format exits 1 (AGSC-06-10)

  @PRD-010 @NFR-02 @human @matrix-H14
  Scenario: The Python package's runner agrees with the engine on the shared vectors
    Given the Python checker package is checked out beside the engine
    When the port implementer runs the engine's "conform" and the Python package's "run-vectors" over the same "tests/vectors/"
    Then every vector the Python package runs has the same result as in the engine's conformance report
    And every vector it does not run is reported as not run with a reason, never counted as a pass

  @PRD-055 @agent @matrix-H14
  Scenario: The reference engine's Level-3 report
    Given a fresh copy of the acceptance Bundle
    When the agent runs "agsc conform --level 3 --to report.json"
    Then the command exits 0
    And "report.json" names the implementation "agentic-system-core" and the class "full-engine", which is Level 3 (AGSC-10-01, AGSC-09-03)
    And every required case of the Level-3 set is reported "pass" by its id, and "summary.fail" is 0
    And every withdrawn case is reported apart as "skip", never counted as a pass, and "summary.pass" counts only the cases that ran and passed (AGSC-09-02, AGSC-09-05)
