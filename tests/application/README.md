# `tests/application/`

**Summary.** Integration tests of the command line spawned as a user runs it: every verb, flags, exit codes, envelopes, configuration, plugins, compatibility across versions. Subject: `src/application/`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/application/**/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
