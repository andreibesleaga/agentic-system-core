# `tests/distribution/`

**Summary.** Unit tests of the build and every surface: routes, pages (with the graph view of AGSC-06-38 and the overview, legend and relation filter of `/clusters/`), headers, discovery, text files, search, NOW, compose page, the seven tools on both transports, hosting profiles. Subject: `src/distribution/`. The folder `explorer/` tests each module of the explorer of `/clusters/` (reading the graph, the layout, the tooltip, the keyboard state, what is drawn, the emitted files; property tests for determinism and idempotence); `explorer-browser.test.js` runs the explorer in a real browser (keyboard use, tooltip place, axe-core in both colour schemes) in the browser lane of `.github/workflows/test.yml`, and is skipped without `AGSC_BROWSER=1`, `CHROME_EXE`, `playwright-core` and `axe-core`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/distribution/**/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
