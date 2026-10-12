# features/ — Gherkin persona scenarios (the end-to-end acceptance source)

Sixteen `.feature` files, one per persona walkthrough of the `docs/PRD.md` §1 persona table
§3 (a)–(j), plus the drop-in user (0), the live board (k), the port implementer (l), the security reviewer (m), the researcher (n) and the restricted publisher (o). Each file is `Feature:` + 3–14 `Scenario:`/`Scenario Outline:` in strict Given/When/Then,
tagged `@persona-x`, `@mode-n`, one actor tag (`@human` or `@agent`) and one or more `@PRD-xxx`, and,
where it covers a row of `features/MATRIX.md`, `@matrix-<row>` (see "Tags" below). Content is drawn
only from the frozen walkthrough steps and `docs/PRD.md` acceptance criteria — nothing invented.

## How these map to the E2E suite

Per PRD.md §5 definition-of-done item (1): "persona walkthroughs (a)–(j) exist as
end-to-end tests (fixed clock, no network, recorded fixtures) green on three OSes at the tag." The
runner described below turns every `Scenario` into one end-to-end test case against:

- a fixture Bundle under `tests/fixtures/` (mini content set, deterministic clock 2026-01-01T00:00:00Z),
- a golden `www/` build, or its hash (PLAN §11 R4),
- recorded MCP/HTTP fixtures — no live network, per NFR-05.

`Given` steps set up fixture state (Bundle contents, prior CI state); `When` steps invoke the CLI verb,
HTTP route or MCP tool under test; `Then` steps assert on file bytes, JSON shape, HTTP status/headers or
CLI exit code. Steps that name a concrete command (e.g. `npx agentic-system-core lint --fix`) are
executable as written — no vague "the system behaves correctly" steps appear.

Scope note: PRD §4 non-goals, as the PRD's notes read them — `agent-card.json` is not emitted by default and MAY be declared as the `a2a-card` surface beside a `responder` (AGSC-06-34, AGSC-11-21); remote MCP is not *served* at 1.0 but MAY be *declared* as a `responder` surface whose bytes this specification does not pin; persona (c)/(h) scenarios test the
**local stdio** MCP server only.

## Scenario-coverage table (scenario ↔ PRD ids)

| File | Persona | Mode | Scenarios | PRD ids covered |
|---|---|---|---|---|
| `persona-0-dropin.feature` | P0 drop-in user | 0 | 9 | PRD-053 |
| `persona-a-reader.feature` | P1 human reader | 0 | 4 | PRD-002, 011, 013, 014, 015, 025 |
| `persona-b-contributor.feature` | P2 human contributor | 0 | 6 | PRD-039, 040, 041, 042, 050 |
| `persona-c-agent-mcp.feature` | P3 agent reader | 1 (read); 4 (compose over MCP) | 14 | PRD-019, 023, 024, 025, 036, 051, 056, 061 |
| `persona-d-agent-proposer.feature` | P4 agent proposer | 1 (write) | 5 | PRD-039, 040, 042, 043 |
| `persona-e-architect.feature` | P5 architect/combiner | 4 | 6 | PRD-001, 036, 037, 038 |
| `persona-f-integrator.feature` | P6 integrator | 3 | 7 | PRD-032, 033, 034, 035 |
| `persona-g-team.feature` | P7 project team | 2, 5 | 7 | PRD-026, 028, 029, 030, 031, 064 |
| `persona-h-memory.feature` | P8 agent-as-memory | 1 (import/export) | 8 | PRD-026, 027, 061 (reads via persona-c: PRD-022) |
| `persona-i-maintainer.feature` | P9 owner-as-operator | 0 | 10 | PRD-005, 017, 018, 021, 044, 045, 048, 049, 056 |
| `persona-j-standards.feature` | P11 standards implementer | 1 | 12 | PRD-024, 025, 050, 054, 055, 057, 058 |
| `persona-k-live-board.feature` | P12 self-driving team | 5 | 12 | PRD-063, 064, 065 |
| `persona-l-port-implementer.feature` | P10 port implementer | 1 | 3 | PRD-010, 054, 055, NFR-02 |
| `persona-m-security-reviewer.feature` | P13 security reviewer | 0, 1 | 12 | PRD-005, 023, 047, 050, 053, 062, 065, NFR-07 |
| `persona-n-researcher.feature` | P14 researcher | 0, 1 | 3 | PRD-010, 022, 047, 060, NFR-04, 05 |
| `persona-o-restricted.feature` | P15 restricted publisher | 1 | 5 | PRD-024, 057 |

**P10 port implementer**: one scenario writes a Level-0 node without the engine and
judges it with the shipped checker alone; a second runs the Python checker package over the same
`tests/vectors/` as the engine's `conform` and compares the two reports vector by vector; a third reads
the reference engine's own Level-3 report. The second
one runs wherever that package's checkout sits beside the engine and a Python 3.9+ interpreter exists,
and is reported as skipped, with the reason, where it does not (its pending file under `tests/acceptance/pending/` is of class `conditional`, and
`tests/acceptance/steps/_python-package.js` probes for the checkout and the interpreter). The shared vectors themselves remain the port's full acceptance
(`spec/09-conformance`).

## How the runner executes them

`tests/acceptance/features.test.js` parses every file with the Gherkin reference parser and runs each
scenario — each Examples row of an Outline — through the step definitions of
`tests/acceptance/steps/`, against the real command line, the real local MCP server and the shipped
tools, on scratch copies of `tests/acceptance/bundle/`, with a fixed build instant and a preload that
refuses every network call. The commands a step names are the verbs and flags of `agsc <verb> --help`
of this release. A scenario that needs a forge, a model adapter or an outside service has one file of its own under `tests/acceptance/pending/` with that class and its reason; one that needs a browser or another local tool has a file of class `conditional` naming the need, and runs wherever its probe finds it; a scenario whose rule the reference engine does not meet yet has a file of class `gap` naming in `closes_in` the change that makes it run, and its steps are written.

## Tags

Every scenario carries, on itself or inherited from its `Feature:`:

- `@persona-x`, the persona of its file, and `@mode-n`, the mode (0–5) the journey runs in;
- exactly one actor tag. `@human` when a person performs the `When` steps — the reader, the author,
  the contributor, the maintainer, the operator who runs the printed commands, the architect. `@agent`
  when software does — an MCP client, a coding agent reading steer files or an installed skill pack, an
  agent proposer or a bot opening pull requests, an agent lane on a live board, the lint-only review
  lane;
- one or more `@PRD-xxx` (or `@NFR-xx`) requirement ids of `docs/PRD.md`;
- `@matrix-<row>` for each row of `features/MATRIX.md` the scenario covers (for example
  `@matrix-H18`). A scenario of a `gap`, `forge`, `model` or `external` pending file may carry the tag
  too; it covers its row only once it runs.

`features/MATRIX.md` holds the persona × mode × surface matrix: one table of persona rows (`H1`…
for people, `A1`… for agents) and one table of surfaces, each with a target status (B, C, G→X, P, U,
rec, 1.1), defined at the top of that file. `tools/validate-features` reports a scenario with no actor
tag and a `@matrix-` tag naming no row as errors; `tools/validate-features --strict-matrix` also
reports, as errors, every row or surface no running scenario covers, a U or rec cell without its
reason, a G cell without its `gap` file or a `gap` file without its G cell, and a persona of the
`docs/PRD.md` table that no feature file declares.

## Traceability

Every scenario's PRD tag round-trips to `docs/PRD.md` §2 (EARS requirement + acceptance) and to the
matching row of `docs/PLAN.md` §5.3 (correspondence rules: context ↔ `src/` dir ↔ `spec/` section ↔
vector area). `tools/validate-features` asserts that every `@PRD-xxx` tag used here exists in
`docs/PRD.md` and warns where the coverage table above and a file's own tags disagree; PRD ids that
no scenario tags are reported as an informational count, because the pack covers the persona
walkthroughs, not every requirement.

Standing rule: this README and the sixteen `.feature` files are kept in sync with `docs/PRD.md`, and
`tools/validate-features` reports a stale mapping.
