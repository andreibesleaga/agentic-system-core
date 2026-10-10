# `bench/corpus/` — the data of two measurement layers

**Summary.** Two committed data files that `bench/measure.js` reads, kept as data so that a reviewer can read every case without running anything.

**Read after:** [bench/README.md](../README.md) and [docs/MEASUREMENTS.md](../../docs/MEASUREMENTS.md).

| File | What it holds | Read by |
|---|---|---|
| `security-floor.json` | the seeded fault corpus of the security floor: each case is one hostile or malformed input with the code it must be refused under (or, for a run just under 1 MiB long, the exit codes its command may finish with inside the kill bound), plus valid controls that must pass clean | `bench/security.js`, through `node bench/measure.js --layer security` |
| `parity-calls.json` | the page-tool / MCP parity call list: calls asked once per Bundle, and templates asked once for every item, compared as values across both transports | `bench/parity.js`, through `node bench/measure.js --layer parity` |

Every credential-shaped string in these files is fabricated. A changed case is a changed measurement: re-run the layer and the tests in `tests/bench/` in the same change set. The folder is not part of the npm package.
