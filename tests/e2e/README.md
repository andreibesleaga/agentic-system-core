# `tests/e2e/`

**Summary.** End-to-end tests: a Level-0 node written without the engine passes the shipped checker; `modes/` walks each of the six modes as a person and as an agent would, from an empty folder (one file per mode); with options, the two real Bundles go through every verb, and the page tools run in a real browser. Subject: the whole distribution.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
npm run test:e2e
```

The optional lanes are switched on with `AGSC_E2E=1` (the two real Bundles, from sibling checkouts) and `AGSC_BROWSER=1` with `CHROME_EXE` (a real browser); `docs/TESTING.md` says how.

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
