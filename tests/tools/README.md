# `tests/tools/`

**Summary.** Tests of each shipped checker and generator on good and bad input, with no import from `src/`, and of the maintainer tools. Subject: `tools/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/tools/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
