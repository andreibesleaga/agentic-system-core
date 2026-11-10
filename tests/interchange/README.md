# `tests/interchange/`

**Summary.** Unit tests of every import and export: OKF, SKOS, COGX, GABBE, skills, boards, the direct memory adapters of 1.1 (Mem0, Letta, Zep, CSV, Basic Memory, Claude Code: `memory-adapters.test.js` through the real verbs, `memory-adapters-fixtures.test.js` over each tool's recorded files, with property tests; both under the in-process network trap of `_memory-network-trap.js`), steering files, the export manifest, the old site, round trips. Subject: `src/interchange/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/interchange/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
