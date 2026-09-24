# `tests/knowledge/`

**Summary.** Unit tests of parsing, validation, slugs, canonical JSON, links, the four RDF views, chunks, adoption, the content version, the diagram compiler. Subject: `src/knowledge/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/knowledge/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
