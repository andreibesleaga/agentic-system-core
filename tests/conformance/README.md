# `tests/conformance/`

**Summary.** The conformance vector runner: `vector-runner.test.js` runs every vector of `tests/vectors/` through the handlers in `areas/` and prints one summary line; `pending.json` lists any vector held back (empty today). Subject: `tests/vectors/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/conformance/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
