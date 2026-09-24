# `tests/governance/`

**Summary.** Unit tests of provenance, the lints, gates, the ledger, boards and agent lanes. Subject: `src/governance/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/governance/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
