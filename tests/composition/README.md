# `tests/composition/`

**Summary.** Unit tests of selection and closure, the Harness, the context map beside it (`context-map.test.js`), the brief beside it (`brief.test.js`: properties over generated graphs — order of the selection, repeat runs, listed items only, the readings of `derived`, the size bound of `context.md`, no narration), skill packs, the ZIP archive, the browser build. Subject: `src/composition/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/composition/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
