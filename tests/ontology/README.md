# `tests/ontology/`

**Summary.** Tests of the ontology: every property is used; the vocabulary file is inside OWL 2 RL, declarations included, and carries the version, dates and comments the rules state; the ontology check rejects an out-of-profile datatype and an undeclared class or annotation property; and the alignments file states only verified mappings. Subject: `ontology/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md).

```bash
node --test "tests/ontology/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
