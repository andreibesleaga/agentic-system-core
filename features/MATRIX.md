# features/MATRIX.md — who uses this, in which mode, over which surface

The persona × mode × surface matrix of this pack. Each row names one kind of person
(`H…`) or agent (`A…`) that uses a node, or one surface a node offers, and says how the
scenarios of `features/` cover it. `tools/validate-features` reads both tables: in normal
mode an uncovered row or surface is a warning, and with `--strict-matrix` it is an error.
`features/README.md` gives the tag conventions.

## The statuses of the Target column

| Status | Meaning |
|---|---|
| B | an executable scenario covers it and runs offline in the acceptance runner |
| C | a scenario covers it that runs where its need is present (a browser, a second checker), and is reported as skipped with its reason elsewhere |
| G→X | a scenario is written and waits for the change X: its pending file has class `gap` and names X in `closes_in`; the scenario runs once X lands |
| P | a half that really needs a forge, a model or an outside service; its pending file has class `forge`, `model` or `external` |
| U | covered by unit, integration or conformance tests only; the Reason column says why no scenario |
| rec | no scenario by design; the Reason column says why |
| 1.1 | outside this version |

A row is covered when a scenario tagged `@matrix-<row>` runs (it has no pending file, or one
of class `conditional`). A surface is covered when every feature its Scenario column names has a
scenario that runs. A G cell of a row is answered by a `gap` file whose scenario is tagged with
that row; a G cell of a surface by a `gap` file of a feature the surface names. The Owner column
names the change that writes or keeps the scenarios of the row while this version is prepared.

## Persona rows

| Row | Who | Feature file | Target | Owner | Reason |
|---|---|---|---|---|---|
| H1 | Solo author, folder of notes (P0) | persona-0 | B + G→E3, E5, E6, E7 | W0-SPLIT | |
| H2 | Solo author publishing (P0, P9) | persona-0: a local publish over loopback | B; forge push P | W0-SPLIT | |
| H3 | Human reader (P1) | persona-a | B + C (search) | W0-BROWSER | |
| H4 | Contributor (P2) | persona-b: the local commit half | B; PR body P | W0-SPLIT | |
| H5 | Maintainer and operator (P9) | persona-i | B; publish P; G→E11 | W0-SPLIT | |
| H6 | Project team (P7) | persona-g | B | W0-JOURNEYS | |
| H7 | Team with procedures (P6) | persona-f | B | W0-JOURNEYS | |
| H8 | Skills-repository importer | persona-f: an outline over the five layouts | B | W0-JOURNEYS | |
| H9 | Architect (P5) | persona-e | B + C ×3 | W0-BROWSER | |
| H10 | People on a live board (P12) | persona-k | B + G→E4 | W0-K | |
| H11 | Board to and from a project tool, eleven formats | persona-g: an outline | B | W0-JOURNEYS | |
| H12 | Team on the GABBE kit | persona-g | B | W0-JOURNEYS | |
| H13 | Other memory systems through COGX | persona-h: a COGX export and import round trip, offline | B | W0-JOURNEYS | |
| H14 | Port implementer (P10) | persona-l; the Python checker's CI runs the conditional one | B | W0-FED | |
| H15 | Standards implementer (P11) | persona-j | B; w3id live P; G→CK | W0-FED | |
| H16 | Federating publishers | persona-j | B | W0-FED | |
| H17 | Restricted publisher (P15) | persona-o | B + G→RS-a, RS-b | W0-FED | |
| H18 | Security reviewer (P13) | persona-m | B + G→E1, E2, E3 | W0-PERSONAS | |
| H19 | Researcher (P14) | persona-n | B | W0-PERSONAS | |
| H20 | Manager deciding to depend on it | — | rec | — | prose (README, CONFORMANCE-STATEMENTS, GOVERNANCE) is the right evidence for this reader; no journey runs a command |
| H21 | Old-site importer (maintainer only) | persona-i: an import of the old-site fixture | B | W0-SPLIT | |
| A1 | Coding agent reading steer files | persona-g | B | W0-JOURNEYS | |
| A2 | MCP reader (P3) | persona-c | B + G→E10 | W0-BROWSER | |
| A3 | MCP client, the one prompt | persona-c | B | W0-BROWSER | |
| A4 | Agent proposer (P4) | persona-d | B; PR P | W0-SPLIT | |
| A5 | Agent as external memory (P8) | persona-h | B; Obsidian P | W0-JOURNEYS | |
| A6 | Page agent (document.modelContext) | persona-c: offline and in a browser | B + C | W0-BROWSER | |
| A7 | Crawler honouring robots.txt and the TDM reservation | persona-c | B | W0-BROWSER | |
| A8 | Discovery client walking peers (library) | — | U | — | a library function only; walking peers as a command would add behaviour, which is outside this version |
| A9 | Federation peer checking a node | persona-j | B + G→E10 | W0-FED | |
| A10 | Skills consumer fetching packs | persona-f | B | W0-JOURNEYS | |
| A11 | Lane working the board through the tool server | persona-k | B | W0-K | |
| A12 | Lane run by refresh --dry-run | persona-k | G→E4 | W0-K | |
| A13 | Review agent (lint only) | persona-b | B | W0-SPLIT | |
| A14 | Memory-framework importers (records.js) | persona-h: records.js reshapes chunks.jsonl for a memory framework, offline | B | W0-JOURNEYS | |
| A15 | Project-tool importer and exporter | persona-g: an outline | B | W0-JOURNEYS | |
| A16 | Channel ingest agent | — | 1.1 | — | |
| A17 | Declared-only remote surfaces | — | 1.1 | — | |
| A18 | Runtime harness emitters | — | 1.1 | — | |

## Surfaces

| Surface | Target | Scenario | Owner | Reason |
|---|---|---|---|---|
| CLI verbs (16) | B for all 16 | persona-0, persona-b, persona-c, persona-d, persona-e, persona-f, persona-g, persona-h, persona-i, persona-j, persona-k, persona-l: thirteen verbs in scenarios; run --dry-run and trace in persona-e; conform --level 3 in persona-l | W0-BROWSER, W0-FED | |
| Global flags | U | — | — | the unit tests of the command line cover every global flag, and --json is in many steps |
| MCP tools (7) | B for all 7 | persona-c, compose included | W0-BROWSER | |
| MCP resources and the prompt | B | persona-c | W0-BROWSER | |
| Page tools (7) | B + C | persona-c, offline and in a browser | W0-BROWSER | |
| Discovery Levels 0–3 | B for every Level | persona-l (Level 0, the Level-3 claim), persona-j (Level 1, Level 2) | W0-FED | |
| Exports and adapters | B | persona-h (export --jsonl, an outline over --zip, mermaid and llm-context, cogx), persona-f (skills), persona-g (gabbe, board) | W0-JOURNEYS | |
| Imports | B | persona-h (okf, cogx), persona-f (skills repositories), persona-g (board, gabbe), persona-i (old-site) | W0-JOURNEYS, W0-SPLIT | |
| Live boards, claims, lanes, budget, .env | B + G→E4 | persona-k | W0-K | |
| Six modes | B | persona-0 (mode 0), persona-h (mode 1), persona-g (mode 2), persona-f (mode 3), persona-e (mode 4), persona-k (mode 5) | — | |
| Restricted visibility | B + G→RS-a, RS-b | persona-o | W0-FED | |
| Federation, peers, contribute | B + G→E10 | persona-j | W0-FED | |
| security.txt | B + G→E6 | persona-0, persona-m | W0-SPLIT, W0-PERSONAS | |
| Legal texts, TDM | B | persona-0, persona-c (a crawler) | W0-SPLIT, W0-BROWSER | |
| Hosting profiles | B + G→E1 | persona-0, persona-m | W0-SPLIT, W0-PERSONAS | |
| Ledger and anchor | B + G→E2 | persona-i, persona-k, persona-m | W0-SPLIT, W0-K, W0-PERSONAS | |
