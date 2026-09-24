# `tests/boundary/`

**Summary.** Unit tests of federation, visibility and the agent-surface contract. Subject: `src/boundary/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/boundary/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
