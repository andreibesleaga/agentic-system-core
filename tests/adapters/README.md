# `tests/adapters/`

**Summary.** Unit tests of the four Node adapters: file system (paths, size cap, strict UTF-8), clock, process runner, refusing network. Subject: `src/adapters/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/adapters/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
