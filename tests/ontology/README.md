# `tests/ontology/`

**Summary.** Tests of the ontology: every property is used, and the alignments file states only verified mappings. Subject: `ontology/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/ontology/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
