# `tests/distribution/`

**Summary.** Unit tests of the build and every surface: routes, pages, headers, discovery, text files, search, NOW, compose page, the seven tools on both transports, hosting profiles. Subject: `src/distribution/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/distribution/**/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
