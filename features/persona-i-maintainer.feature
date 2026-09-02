# Trace: PRD-005, PRD-044, PRD-045, PRD-048, PRD-049 · audit/D §3(i) · PLAN §7
# Source of truth: discovery-product/audit/D-v1-system-walkthrough.md §3(i) "Maintainer running CI/cron/refresh/review"
@persona-i @mode-0
Feature: Owner-as-operator keeps the site green with zero maintenance
  As P9 (owner-as-operator)
  I want one identical pipeline locally and in CI, plus an unattended weekly refresh
  So that the site stays green with no manual publishing step beyond git writes

  @PRD-049
  Scenario: Local ci and CI ci run the identical pipeline
    When the maintainer runs "npx agentic-system-core ci" locally
    Then the pipeline runs lint, then build twice with a byte diff, then writes "dist/gate.json"
    And the exit code is 0 on success, 1 on a failed gate, 2 on a usage error
    When the same commit runs inside "ci.yml" with "contents: read"
    Then the exit code and artifacts match the local run exactly

  @PRD-005
  Scenario: Every build/ci run appends one verifiable ledger entry
    When "agsc build" or "agsc ci" completes successfully
    Then exactly one line is appended to "ledger.jsonl" as "{ts, kind: \"build\", ref, actor, prev, hash}"
    And "hash" equals "sha256(prev + canonical(entry))"
    When the maintainer runs "npx agentic-system-core verify --ledger"
    Then the full chain re-verifies offline
    And tampering with any one line makes "verify --ledger" fail

  @PRD-044
  Scenario: The weekly refresh cron opens at most one issue, never a commit
    Given the cron "29 5 * * 0" fires "refresh.yml"
    When "agsc refresh --auto" runs
    Then it re-checks staleness ("stale_after" vs the build clock) and external links via HEAD requests
    And if findings exist, it opens at most one GitHub issue via "gh issue create"
    And it never creates a commit
    And running it again with unchanged findings is idempotent (no duplicate issue)

  @PRD-048
  Scenario: Owner cuts a release and the packages publish with attestations
    When the owner pushes a tag "v1.0.0"
    Then "release.yml" runs on Node 24 with "id-token: write" and "attestations: write"
    And "agentic-system-core" (bin "agsc") and the "agsc-cli" alias publish via npm trusted publishing
    And both packages carry "actions/attest" provenance

  @PRD-045
  Scenario: Restore-from-zero reproduces the site from a bare clone
    When the maintainer clones the content repo fresh
    And runs "npx agentic-system-core ci"
    Then the rebuilt "www/" is byte-identical to the last published deploy
    And the weekly attested snapshot and the per-release Zenodo deposit remain available as fallbacks
