# features/ — Gherkin persona scenarios (E2E source, M13/M15)

Thirteen `.feature` files, one per persona walkthrough of the `docs/PRD.md` §1 persona table
§3 (a)–(j), plus the drop-in user (0), the live board (k) and the port implementer (l). Each file is `Feature:` + 2–4 `Scenario:`/`Scenario Outline:` in strict Given/When/Then,
tagged `@persona-x` + one or more `@PRD-xxx`. Content is drawn only from the frozen walkthrough steps
and `docs/PRD.md` acceptance criteria — nothing invented.

## How these map to the E2E suite

Per PRD.md §5 definition-of-done item (1): "persona walkthroughs (a)–(j) exist as
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

Scope note: PRD §4 non-goals as re-read on 2026-09-15 and 2026-09-16 — `agent-card.json` is not emitted by default and MAY be declared as the `a2a-card` surface beside a `responder` (AGSC-06-34, AGSC-11-21); remote MCP is not *served* at 1.0 but MAY be *declared* as a `responder` surface whose bytes this specification does not pin; persona (c)/(h) scenarios test the
**local stdio** MCP server only.

## Scenario-coverage table (scenario ↔ PRD ids)

| File | Persona | Mode | Scenarios | PRD ids covered |
|---|---|---|---|---|
| `persona-0-dropin.feature` | P0 drop-in user | 0 | 3 | PRD-053 |
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
| `persona-l-port-implementer.feature` | P10 port implementer | 1 | 2 | PRD-010, 054, NFR-02 |

**P10 port implementer** (added 2026-09-24): one scenario writes a Level-0 node without the engine and
judges it with the shipped checker alone; the other runs the Python checker package over the same
`tests/vectors/` as the engine's `conform` and compares the two reports vector by vector. The second
one runs wherever that package's checkout sits beside the engine and a Python 3.9+ interpreter exists,
and is reported as skipped, with the reason, where it does not (`conditional` in
`tests/acceptance/pending.json`). The shared vectors themselves remain the port's full acceptance
(`spec/09-conformance`).

## How the runner executes them (2026-09-24)

`tests/acceptance/features.test.js` parses every file with the Gherkin reference parser and runs each
scenario — each Examples row of an Outline — through the step definitions of
`tests/acceptance/steps/`, against the real command line, the real local MCP server and the shipped
tools, on scratch copies of `tests/acceptance/bundle/`, with a fixed build instant and a preload that
refuses every network call. The commands a step names are the verbs and flags of `agsc <verb> --help`
at 1.0.0-rc.6. A scenario that needs a forge, a model adapter, an outside service or a live browser
session is listed in `tests/acceptance/pending.json` with that class and its reason; a scenario whose
rule the reference engine does not meet yet is listed there as a `gap`, and its steps are written.

## Traceability

Every scenario's PRD tag round-trips to `docs/PRD.md` §2 (EARS requirement + acceptance) and to the
matching row of `docs/PLAN.md` §5.3 (correspondence rules: context ↔ `src/` dir ↔ `spec/` section ↔
vector area). A CI script at M13 asserts every `@PRD-xxx` tag used here exists in `docs/PRD.md` and
that every v1-scope PRD id with a persona-facing acceptance criterion is tagged on at least one
scenario (golden thread, NFR-03, Article I "no requirement without a test").

Standing rule: this README and the thirteen `.feature` files are kept in sync with `docs/PRD.md`; a stale
mapping is a gate failure at M13 (decided 2026-09-02).
