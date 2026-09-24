# features/ — Gherkin persona scenarios (E2E source, M13/M15)

Twelve `.feature` files, one per persona walkthrough of the `docs/PRD.md` §1 persona table
§3 (a)–(j). Each file is `Feature:` + 2–4 `Scenario:`/`Scenario Outline:` in strict Given/When/Then,
tagged `@persona-x` + one or more `@PRD-xxx`. Content is drawn only from the frozen walkthrough steps
and `docs/PRD.md` acceptance criteria — nothing invented.

## How these map to the E2E suite

Per PRD.md §5 definition-of-done item (1): "persona walkthroughs (a)–(j) of audit/D §3 exist as
end-to-end tests (fixed clock, no network, recorded fixtures) green on three OSes at the tag." At M13
a Gherkin runner (or a hand-written `node:test` harness reading these files) turns every `Scenario`
into one E2E test case against:

- a fixture Bundle under `tests/fixtures/` (mini content set, deterministic clock 2026-01-01T00:00:00Z),
- a golden `www/` build (or its hash — see PLAN §11 R4/M13 trim "golden `www/` fixture → hash-only"),
- recorded MCP/HTTP fixtures — no live network, per NFR-05.

`Given` steps set up fixture state (Bundle contents, prior CI state); `When` steps invoke the CLI verb,
HTTP route or MCP tool under test; `Then` steps assert on file bytes, JSON shape, HTTP status/headers or
CLI exit code. Steps that name a concrete command (e.g. `npx agentic-system-core lint --fix`) are
executable as written — no vague "the system behaves correctly" steps appear.

Scope note: PRD §4 non-goals as read by D72 and the pre-DS-4 audit (2026-09-16) — `agent-card.json` is not emitted by default and MAY be declared as the `a2a-card` surface beside a `responder` (AGSC-06-34, AGSC-11-21); remote MCP is not *served* at 1.0 but MAY be *declared* as a `responder` surface whose bytes this specification does not pin; persona (c)/(h) scenarios test the
**local stdio** MCP server only, per D41/G42.

## Scenario-coverage table (scenario ↔ PRD ids)

| File | Persona | Mode | Scenarios | PRD ids covered |
|---|---|---|---|---|
| `persona-0-dropin.feature` | P0 drop-in user | 0 | 2 | PRD-053 |
| `persona-a-reader.feature` | P1 human reader | 0 | 4 | PRD-002, 011, 013, 014, 015, 025 |
| `persona-b-contributor.feature` | P2 human contributor | 0 | 4 | PRD-039, 040, 041, 042, 050 |
| `persona-c-agent-mcp.feature` | P3 agent reader | 1 (read) | 5 | PRD-023, 024, 025, 056 |
| `persona-d-agent-proposer.feature` | P4 agent proposer | 1 (write) | 4 | PRD-039, 040, 042, 043 |
| `persona-e-architect.feature` | P5 architect/combiner | 4 | 4 | PRD-036, 037, 038 |
| `persona-f-integrator.feature` | P6 integrator | 3 | 4 | PRD-032, 033, 034, 035 |
| `persona-g-team.feature` | P7 project team | 2 | 4 | PRD-028, 029, 030, 031 |
| `persona-h-memory.feature` | P8 agent-as-memory | 1 (import/export) | 4 | PRD-026, 027 (reads via persona-c: PRD-022) |
| `persona-i-maintainer.feature` | P9 owner-as-operator | 0 | 5 | PRD-005, 044, 045, 048, 049 |
| `persona-j-standards.feature` | P11 standards implementer | 1 | 5 | PRD-024, 025, 050, 054 |
| `persona-k-live-board.feature` | P12 self-driving team (rc.4) | 5 | 8 | PRD-063, 064, 065 |

Not covered here by design: **P10 port implementer** — audit/D §3 has no (k) walkthrough for it; its
acceptance runs instead through `tests/vectors/` + `spec/09-conformance` (M13, PLAN §5.3), not a
persona E2E scenario.

## Traceability

Every scenario's PRD tag round-trips to `docs/PRD.md` §2 (EARS requirement + acceptance) and to the
matching row of `docs/PLAN.md` §5.3 (correspondence rules: context ↔ `src/` dir ↔ `spec/` section ↔
vector area). A CI script at M13 asserts every `@PRD-xxx` tag used here exists in `docs/PRD.md` and
that every v1-scope PRD id with a persona-facing acceptance criterion is tagged on at least one
scenario (golden thread, NFR-03, Article I "no requirement without a test").

Standing rule: this README and the twelve `.feature` files are kept in sync with `docs/PRD.md`; a stale
mapping is a gate failure at M13 (decided 2026-09-02).
