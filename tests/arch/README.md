# `tests/arch/`

**Summary.** Architecture tests: context boundaries, purity of the core, pinned libraries, the package file list, the plugin contract, text-source hygiene, and the suite leaving no scratch behind. Subject: the whole tree.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/arch/*.test.js"
```

`AGSC_AUDIT=1` adds `npm audit`, the one check that needs the network.

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
