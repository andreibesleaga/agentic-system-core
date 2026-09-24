# `tests/connectors/`

**Summary.** Integration tests of the connector examples and the two entry points at the root (`action.yml`, `.pre-commit-hooks.yaml`). Subject: `examples/connectors/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/connectors/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
