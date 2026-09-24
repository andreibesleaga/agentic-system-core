# `tests/ports/`

**Summary.** Unit tests of the four port interfaces: exactly four files, exporting nothing, declaring what their adapters implement. Subject: `src/ports/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/ports/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
