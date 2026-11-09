# `tests/examples/`

**Summary.** Integration tests of the three blueprints under `examples/blueprints/`: each
Bundle passes `agsc lint`, `agsc ci` and `agsc conform --level 2`, builds the same bytes
twice, and `compose --from` writes its blueprint (the C4 levels 1 to 3, the decision
records, the build plan) the same way twice, with the three levels agreeing; the dry run
in each folder's README runs and prints what it quotes. Subject: `examples/blueprints/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/TESTING.md).

```bash
node --test "tests/examples/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
