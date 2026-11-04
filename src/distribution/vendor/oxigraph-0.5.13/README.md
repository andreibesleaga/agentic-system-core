# `src/distribution/vendor/oxigraph-0.5.13/` — the query engine of `/query/`

**What this is.** The files of one release of a SPARQL engine that the `/query/` page of every
node runs in the visitor's browser (AGSC-06-39): the WebAssembly build of
[Oxigraph](https://github.com/oxigraph/oxigraph) 0.5.13, exactly as the npm package
`oxigraph@0.5.13` ships it, with its licence texts. The build copies them, byte for byte, to
`/query/vendor/oxigraph-0.5.13/` as page assets of `/query/` (AGSC-06-01); they are outside the
page budget of AGSC-06-21. Nothing here is written or changed by this project.

**Why this engine.** It is already the engine's pinned dependency (`package.json`), so the
browser and the development lane run the same release; it answers SELECT, ASK, CONSTRUCT and
DESCRIBE, writes the W3C result formats itself, sends nothing after it has loaded, and needs
only `'wasm-unsafe-eval'` added to `script-src` of `/query/`, which AGSC-06-39 allows. In a
browser it loads a graph of 5,000 items (75,012 quads) and is ready in about 1.4 s on the same
machine and 2.2 s over a 20 Mbit/s link with Brotli (measured on 4 November 2026). The other
candidate, Comunica, has no browser bundle in its npm packages, so it would need a bundler.

| File | Bytes | SHA-256 | From |
|---|---|---|---|
| `web.js` | 50946 | `210c42fbba2915f668386f3285d28218db5865267e95b5403b82150431931f7c` | npm `oxigraph@0.5.13`, `web.js` |
| `web_bg.wasm` | 4324920 | `75e3f0f4de67921e88e3f6d587b2a8e7aa822abbe3a3b79873f2b97f20d52c24` | npm `oxigraph@0.5.13`, `web_bg.wasm` |
| `LICENSE-MIT` | 1063 | `1f4f6736adc52ebfda18bb84947e0ef492bd86a408c0e83872efb75ed5e02838` | <https://github.com/oxigraph/oxigraph> at tag `v0.5.13` (the npm package ships no licence file) |
| `LICENSE-APACHE` | 10847 | `a60eea817514531668d7e00765731449fe14d059d3249e0bc93b36de45f759f2` | the same repository and tag |
| `THIRD-PARTY.txt` | 11429 | `751d2b0096efb48de8746ad06802c8d65e46d48fa344311dea834814db48ac41` | written for this distribution: the crates that may be compiled into `web_bg.wasm`, each with its licence expression |

Licence: `MIT OR Apache-2.0` (Oxigraph's own; `REUSE.toml` annotates the two engine files).

**The pin.** `src/distribution/query-page.js` (`ENGINE`) states the version, the licence and the
SHA-256 and byte count of each file, and `tests/arch/query-engine-pin.test.js` checks the files
against it, checks that `web.js` and `web_bg.wasm` equal the files of the pinned `oxigraph`
dependency in `node_modules/`, and checks that this table states the same values.

**How to move to another release** (a same-major bump of the `oxigraph` dependency):

1. Bump `oxigraph` in `package.json` (exact version) and run `npm install`.
2. Create `src/distribution/vendor/oxigraph-<version>/`, copy `node_modules/oxigraph/web.js`
   and `web_bg.wasm` into it, and take `LICENSE-MIT` and `LICENSE-APACHE` from the Oxigraph
   repository at tag `v<version>`.
3. Rewrite `THIRD-PARTY.txt` from that tag's `Cargo.lock` (the crates reached from
   `oxigraph-js`, each with the licence expression crates.io states).
4. Update `ENGINE` in `src/distribution/query-page.js` and this table (`sha256sum`, `wc -c`),
   delete the old folder, and say in `CHANGELOG.md` which bytes of every node change.
5. Run `node --test tests/arch/query-engine-pin.test.js tests/distribution/query*.test.js
   "tests/distribution/query/*.test.js"`, then the browser lane
   (`tests/distribution/query-browser.test.js`).
