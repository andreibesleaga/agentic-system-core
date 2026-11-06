# `tests/distribution/`

**Summary.** Unit tests of the build and every surface: routes, pages (with the graph view of AGSC-06-38 and the overview, legend and relation filter of `/clusters/`), headers, discovery, text files, search, NOW, compose page (`compose-page-run.test.js` in a minimal DOM: the filters, the verdict in words, the brief and the blueprint offered with the bytes `agsc compose --brief` writes, the skills archive; `compose-browser.test.js` in a real browser: no element of the page moves while it loads, the filters from the keyboard, the brief inline, axe in both schemes), the brief on an architecture's page (`architecture-brief.test.js`), the domain parts of item pages (`domain-view.test.js`; `domain-browser.test.js` in a real browser, axe in both schemes) and on the three hosts of one node (`domain-parity.test.js`: `compose --brief`, the local server and the page tools give one brief with the domain links, and a draft context is named in no page script, no `domain` member of a page answer and no brief file; the real `agsc mcp` child gives the same domain links), the ten tools on both transports (`tool-parity.test.js` asks the real `agsc mcp` process and the emitted page the committed call list; `tool-answers.test.js` holds what 1.1 adds — the bound, the citation records, `explain`, `check`, `brief`, the domain parts — to the engine's own modules, with property tests), hosting profiles. Subject: `src/distribution/`. The folder `explorer/` tests each module of the explorer of `/clusters/` (reading the graph, the layout, the tooltip, the keyboard state, what is drawn, the emitted files; property tests for determinism and idempotence); `explorer-browser.test.js` runs the explorer in a real browser (keyboard use, tooltip place, axe-core in both colour schemes) in the browser lane of `.github/workflows/test.yml`, and is skipped without `AGSC_BROWSER=1`, `CHROME_EXE`, `playwright-core` and `axe-core`.

**Read after:** [tests/README.md](../README.md) and [docs/TESTING.md](../../docs/TESTING.md).

```bash
node --test "tests/distribution/**/*.test.js"
```

Every test here fixes its own clock, reaches no network and writes only under the
system temporary directory, removing what it wrote.
