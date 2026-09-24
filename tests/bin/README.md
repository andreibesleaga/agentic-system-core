# `tests/bin/`

**Summary.** Integration tests of the installed commands end to end: the build instant from git, `init` then `ci`, the user configuration file. Subject: `bin/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/bin/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
