# `tests/docs/`

**Summary.** Tests that keep a document true by running it. `demos.test.js` reads
[docs/DEMOS.md](../../docs/DEMOS.md), runs every fenced block marked `bash demo` in a
scratch copy with the fixed build instant the page names, and checks that every line
of the `text expect` block after it was printed. A demo the page cannot run — one
that needs a browser, a forge or a model key — has no runnable block. Subject: the
documentation.

**Read after:** [tests/README.md](../README.md).

```bash
node --test tests/docs/demos.test.js
```

Deterministic: fixed clock, empty git identity, no network, scratch files only under
the system temporary directory, removed afterwards. Skipped on Windows (the demos are
written for a POSIX shell).
