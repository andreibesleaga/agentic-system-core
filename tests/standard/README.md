# `tests/standard/`

**Summary.** Tests of the standard itself: the rules, schemas, vectors, route set, discovery relations and the Internet-Draft agree with one another; the rules no vector pins are checked here; the rule-coverage matrix is current. Subject: `spec/`, `schema/`, `tests/vectors/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
npm run test:standard
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
