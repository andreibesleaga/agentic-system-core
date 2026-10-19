# Trace: PRD-024, PRD-057 · spec/11 AGSC-11-20 (visibility), AGSC-11-03 (cross-origin reading), AGSC-09-93
@persona-o @mode-1
Feature: Restricted publisher tells the world the node exists while its content stays gated
  As P15 (restricted publisher)
  I want my node's discovery document to stay public while it gives away no content fact
  So that readers and agents learn the node exists and where to ask for access, and nothing more

  @PRD-024 @human @matrix-H17
  Scenario: A restricted node omits the bundle facts a public node shows
    Given a fresh copy of the acceptance Bundle
    And the Bundle is a git repository of one commit with fixed dates
    And the Bundle is built
    And the publisher keeps the discovery document of this public build
    When the publisher makes the node restricted
    And the publisher names its access page "https://agenticsystemcore.com/access/"
    And the Bundle is built
    Then the anchor's "describedby" link says "agsc-visibility" "restricted" and still carries "agsc-spec-version" and "agsc-generated-at" (AGSC-11-20)
    And it omits "agsc-counts", "agsc-bundle-hash", "agsc-bundle-version" and "agsc-ledger-head", which the public build carried, and the "…rel#ledger" link
    And it carries a "digest" only for "/graph.jsonld" and "/llms.txt", the targets it serves unauthenticated

  @PRD-024 @human @matrix-H17
  Scenario: A restricted publisher names its access page in the configuration
    Given a fresh copy of the acceptance Bundle
    And the publisher makes the node restricted
    And the publisher names its access page "https://agenticsystemcore.com/access/"
    When the publisher runs "agsc lint --json"
    Then the command exits 0
    And the JSON envelope carries no "AGSC-E004"
    When the publisher removes the access page from the configuration
    And the publisher runs "agsc lint --json"
    Then the JSON envelope carries the error "AGSC-E202"

  @PRD-024 @human @matrix-H17
  Scenario: A restricted node's discovery document carries exactly one access link
    Given a fresh copy of the acceptance Bundle
    And the publisher makes the node restricted
    And the publisher names its access page "https://agenticsystemcore.com/access/"
    When the Bundle is built
    Then the discovery document carries exactly one "…rel#access" link, to "https://agenticsystemcore.com/access/" (AGSC-11-20)
    And the shipped validate-wellknown passes the discovery file at Level 0

  @PRD-024 @agent @matrix-H17
  Scenario: Both checkers flag a restricted node without an access link
    Given a restricted node's discovery document, derived from a public build as AGSC-11-20 asks, with no "…rel#access" link
    When the agent checks it at Level 0 with the shipped validate-wellknown and with the Python checker
    Then both report the error "AGSC-E202" for the missing access link
    When the document carries two "…rel#access" links
    Then both report the error "AGSC-E210" for the repeated access link
    When the document carries exactly one "…rel#access" link
    Then both pass it
    When the document's one "…rel#access" link carries no "agsc-access"
    Then both report the error "AGSC-E202" for the access class of the access link, and nothing else
    When the document's one "…rel#access" link carries "agsc-access" "none"
    Then both report the error "AGSC-E210" for the access class of the access link, and nothing else
    When the document carries exactly one "…rel#access" link and no "agsc-generated-at"
    Then both report the error "AGSC-E202" for "agsc-generated-at", which a restricted node keeps at every Level, and nothing else
    When the document carries exactly one "…rel#access" link and no "agsc-spec-version"
    Then both report the error "AGSC-E202" for "agsc-spec-version", which a restricted node keeps at every Level, and nothing else

  @PRD-057 @agent @matrix-H17
  Scenario: An unauthenticated agent sees only the public view of a restricted node
    Given a fresh copy of the acceptance Bundle
    And the publisher makes the node restricted
    And the publisher names its access page "https://agenticsystemcore.com/access/"
    And the Bundle is built and served on loopback
    When an agent with no credentials reads the node over loopback from another origin
    Then only "/.well-known/knowledge-linkset" is served with "Access-Control-Allow-Origin: *"; "/graph.jsonld", "/llms.txt", "/chunks.jsonl" and an item page are served without it (AGSC-11-20, AGSC-11-03)
    And the discovery document it reads names no per-type count, no bundle hash, no content version, no ledger head and no ledger link
    And the shipped validate-wellknown passes at Level 0 over loopback
