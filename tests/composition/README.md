# `tests/composition/`

**Summary.** Unit tests of selection and closure, the Harness, the context map beside it (`context-map.test.js`), the brief beside it (`brief.test.js`: properties over generated graphs — order of the selection, repeat runs, listed items only, the readings of `derived`, the size bound of `context.md`, no narration), its domain paragraph (`brief-domain.test.js`: the parts equal the knowledge readers', the bytes of the plain brief with no domain key, order independence, the bound with longer sections, a context that is a cluster not listed named nowhere, the domain links in `relations`, and the plain files recovered from the domain ones by removing the parts), the blueprint outputs of a saved architecture (`blueprint.test.js`: the same properties, and the cases the vectors `compose-0028` to `compose-0030` do not reach), skill packs, the ZIP archive, the browser build. Subject: `src/composition/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/composition/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
