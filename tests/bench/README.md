# `tests/bench/`

**Summary.** Unit tests of the benchmark kit and its measurement script. Subject: `bench/, tools/bench`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/bench/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
