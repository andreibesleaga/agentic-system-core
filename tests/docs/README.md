# `tests/docs/`

**Summary.** Tests that keep a document true by running it. `demos.test.js` reads
[docs/DEMOS.md](../../docs/DEMOS.md), runs every fenced block marked `bash demo` in a
scratch copy with the fixed build instant the page names, and checks that every line
of the `text expect` block after it was printed. A demo the page cannot run — one
that needs a browser, a forge or a model key — has no runnable block.
`guides.test.js` does the same for the six mode guides of
[docs/guides/](../../docs/guides/README.md): each guide runs from top to bottom as one
walk-through, with no build instant set (the guides commit, as a reader does; the git
dates are fixed). Both use `_page-runner.js`; with `DOCS_ENGINE_PACKAGE` pointing at an
installed copy of the packed package, they check the pages against the package as it
will be published. `agent-skill.test.js` keeps the agent skill in
`skills/agentic-system-core/` well-formed, its verbs real, and the plugin's copy equal
to it. Subject: the documentation.

**Read after:** [tests/README.md](../README.md).

```bash
node --test tests/docs/demos.test.js tests/docs/guides.test.js tests/docs/agent-skill.test.js
```

Deterministic: fixed clock, empty git identity, no network, scratch files only under
the system temporary directory, removed afterwards. Skipped on Windows (the demos and
guides are written for a POSIX shell).
