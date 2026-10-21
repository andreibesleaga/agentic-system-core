<!--
Thank you. CONTRIBUTING.md says how a change is proposed; a rule change starts as an issue.
-->

## What this changes and why

<!-- One or two plain sentences; name the rule (AGSC-nn-nn), requirement (PRD-nnn) or defect (issue, AGSC-Ennn). -->

## How it was checked

- [ ] the test came first and failed before the change (a test under `tests/`, a vector under `tests/vectors/` or a scenario under `features/`)
- [ ] `npm test`, `npm run lint`, `npm run arch` and `npm run duplicates` pass
- [ ] a conforming 1.0 Bundle builds the same bytes, or the change log names each changed byte and the rule that allows it
- [ ] a user-visible change has an entry under `[Unreleased]` in `CHANGELOG.md`, and the docs that describe the behaviour say the same
- [ ] a change to the standard (`spec/`, `schema/`, `ontology/`, `tests/vectors/`) names the rule id and adds or withdraws a vector

## Sign-off (outside contributions)

An outside contribution signs off every commit under the contributor agreement (`CONTRIBUTOR-AGREEMENT`), with a last line of this shape:

```
Signed-off-by: Your Name <you@example.org> (CA-v1)
```

`git commit -s` writes the first part of that line; add ` (CA-v1)` at its end. The maintainer's own commits are exempt.
