# `src/governance/` — Governance & Provenance — who changed what, and whether it may be published

**Summary.** This folder holds the rules about change: the provenance record every item carries, the gates a change must pass, the lints that run on every build (schema, links, injection, secrets, personal data, clean-room wording), the ledger derived from the history, and the boards and agent lanes of the live board. It is pure, like Knowledge: every file it judges is handed to it.

**Read after:** [the module guide](../README.md). **Specification:** `spec/08` (governance), `spec/01` §1.7–1.8 (channels and agents), `spec/10` §10.6 (the live board).
**May depend on:** `knowledge/`, `ports/` (types only), `shared/` — enforced by `tests/arch/context-boundaries.test.js`.
**Tests:** `tests/governance/`.

## What each file does

| File | What it does |
|---|---|
| `prov.js` | the provenance fields and the gates a Proposal passes |
| `lint.js` | the lint aggregate: runs every lint over a Bundle and sorts the findings |
| `injection.js` | the injection scan (instructions hidden in content aimed at agents) |
| `secrets.js` | the secrets lint and the tracked `.env` case |
| `pii.js` | the personal-data lint: e-mail addresses and telephone numbers |
| `cleanroom.js` | the clean-room lint: refused phrases copied from other works |
| `fix.js` | `lint --fix`: the mechanical repairs a lint may make |
| `finding.js` | the one place a Governance finding is built |
| `agents.js` | agent declarations, what an agent may propose, and the spend cap |
| `ledger.js` | the ledger derived from the history, its hash chain and `verify --ledger` |
| `boards.js` | a Cluster read as a board: the two board exports, `done`, `claimed_by`, the WIP limit |
| `board-lanes.js` | the agent-lane gates on a board Proposal: claim, move, new task |

Every module names, in its header comment, the rules it implements. The function
signatures and the reasons behind the design are in [the per-module
reference](../REFERENCE.md) (§7 and §9).

## Working here

```bash
node --test "tests/governance/*.test.js"   # this folder's tests
npm test                                   # the whole suite before you finish
```
