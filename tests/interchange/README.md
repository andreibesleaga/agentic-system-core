# `tests/interchange/`

**Summary.** Unit tests of every import and export: OKF, COGX, GABBE, skills, boards, steering files, the old site, round trips. Subject: `src/interchange/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/interchange/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
