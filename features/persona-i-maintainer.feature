# Trace: PRD-005, PRD-017, PRD-018, PRD-021, PRD-044, PRD-045, PRD-048, PRD-049, PRD-056 · PLAN §7
@persona-i @mode-0
Feature: Maintainer-as-operator keeps the site green with zero maintenance
  As P9 (maintainer-as-operator)
  I want one identical pipeline locally and in CI, plus an unattended weekly refresh
  So that the site stays green with no manual publishing step beyond git writes

  @PRD-049 @human @matrix-H5
  Scenario: Local ci and CI ci run the identical pipeline
    When the maintainer runs "npx agentic-system-core ci" locally
    Then the pipeline runs lint, then build twice with a byte comparison, then verify, and writes "dist/gate.json" (AGSC-04-02, AGSC-08-10)
    And the exit code is 0 on success, 1 on a failed gate, 2 on a usage error (AGSC-09-08)
    When the same commit runs "ci" in a fresh clone, as the shipped GitHub Action does with "contents: read"
    Then the exit code and "dist/gate.json" match the local run exactly

  @PRD-005 @human @matrix-H5
  Scenario: Every build/ci run derives the whole verifiable ledger
    When "agsc build" or "agsc ci" completes successfully
    Then "ledger.jsonl" is recomputed from git history into the build output as lines "{ts, kind, ref, actor, prev, hash}"
    And "hash" equals "sha256(prev + canonical(entry))"
    And no ledger line is ever committed to the content branch
    When the maintainer runs "npx agentic-system-core verify --ledger"
    Then the full chain re-verifies offline
    And the recomputed head equals the "agsc-ledger-head" attribute of the "…rel#ledger" link in the well-known file
    And tampering with any one line, or truncating the tail, makes "verify --ledger" fail

  @PRD-017 @PRD-044 @human @matrix-H5
  Scenario: The NOW page lists stale items, offline, and the build commits nothing
    Given a fresh copy of the acceptance Bundle
    And the Bundle is a git repository of one commit with fixed dates
    And the item "content/concepts/tool-use-retries.md" went stale on "2025-06-01T00:00:00Z", before the build instant
    When the maintainer runs "agsc build" under the network trap
    Then the command exits 0
    And "now.md" lists "tool-use-retries" as its one stale item, and the NOW page says so too (AGSC-02-11)
    And no network call was attempted
    And the build created no commit and changed nothing under "content/"

  @PRD-048 @human @matrix-H5
  Scenario: The release workflow holds only the permissions trusted publishing and provenance need
    When the maintainer reads ".github/workflows/release.yml"
    Then it runs on a pushed "v*" tag or a manual run, and never on a pull request
    And the workflow reads with "contents: read", and only the publishing job, behind the "release" environment, adds "id-token: write" and "attestations: write"
    And the publishing job runs on Node 24, attests the packed tarballs with "actions/attest-build-provenance" pinned to a commit, and publishes "agentic-system-core" and "agsc-cli" each with "--provenance"

  @PRD-048 @human @matrix-H5
  Scenario: The maintainer cuts a release and the packages publish with attestations
    When the maintainer pushes a tag "v1.0.0"
    Then "agentic-system-core" (bin "agsc") and the "agsc-cli" alias publish via npm trusted publishing
    And both packages carry "actions/attest" provenance

  @PRD-045 @human @matrix-H5
  Scenario: Restore-from-zero rebuilds the node byte for byte from a bare clone
    Given the patterns node of the real-Bundle lane, with its git history
    When the maintainer clones it fresh into two folders and runs "npx agentic-system-core ci" in each
    Then ci passes in both clones, offline
    And "agsc build" in the two clones gives byte-identical "www/" trees

  @PRD-045 @human
  Scenario: Restore-from-zero matches the last published deploy and the Zenodo deposit
    When the maintainer rebuilds the site from a bare clone
    Then the rebuilt "www/" is byte-identical to the last published deploy
    And the per-release Zenodo deposit remains available as a fallback

  @PRD-056 @human @matrix-H5
  Scenario: A channel set to auto reports a non-merge commit without the trailers
    Given a fresh copy of the acceptance Bundle
    And the Bundle registers a channel "main" whose publish choice is "auto"
    And the Bundle is a git repository of one commit with fixed dates
    And a commit "Edit outside a pull request" with no trailer is made directly on the content branch
    When the maintainer runs "agsc ci --json"
    Then the command exits 1
    And the JSON envelope carries the error "AGSC-E706"
    And the "AGSC-E706" finding names the sha of that commit, and not the root commit (AGSC-08-26)
    When the maintainer runs "agsc verify --json"
    Then the JSON envelope carries the error "AGSC-E706"

  @PRD-018 @human @matrix-H5
  Scenario: A superseded item keeps its slug and its page, its old address redirects, and the slug is never reused
    Given a fresh copy of the acceptance Bundle
    And the item "content/concepts/tool-use-retries.md" is retired and superseded by "bounded-retries", which keeps the old address "/patterns/tool-use-retries/" among its aliases
    When the maintainer runs "agsc build"
    Then the command exits 0
    And the retired item keeps its slug and its page "/concepts/tool-use-retries/", which says it is retired (AGSC-01-12, AGSC-11-22)
    And "_redirects" sends "/patterns/tool-use-retries/" to "/concepts/bounded-retries/" with a 301, and no line redirects the retired page (AGSC-06-04)
    When a new lesson "content/lessons/tool-use-retries.md" reuses the retired slug
    And the maintainer runs "agsc ci --json"
    Then the command exits 1
    And the JSON envelope carries the error "AGSC-E206"
    And the output names "content/lessons/tool-use-retries.md"

  @PRD-021 @human @matrix-H21
  Scenario: A maintainer imports the old site
    Given an empty Bundle that names its identity, its crawlers and a security contact
    When the maintainer imports the old-site fixture with its selection file, under the network trap
    Then the import names the deliberate defects of the fixture, the selected "ghost" that no card holds among them, and exits 1
    And the chosen records become items, clusters and diagrams, and the deferred, excluded and unknown rows of the selection do not (AGSC-01-22)
    And each imported item keeps the old card's aliases
    And a second import over the same input writes nothing (AGSC-01-23)
    And the imported Bundle passes "agsc ci"
    And no network call was attempted
