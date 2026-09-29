'use strict';
// CONTEXT Distribution (Emission) — Surface: the default theme of every engine-built page.
//
// An engine-built node looks like AgenticSystemCore.com. The
// stylesheet below is that site's `assets/site.css`, byte for byte (the site's build
// refuses to publish if its copy drifts from this one), and the header, navigation and
// footer markup of `html.js` carries the same classes. A Bundle overrides the stylesheet
// by authoring `content/assets/site.css`, which is served at the same route
// (AGSC-06-01's `/assets/<path>` route of an authored asset).
//
// Both files are same-origin (AGSC-06-05, AGSC-06-17's `style-src 'self'` and
// `script-src 'self'`): no inline style, no inline script, no other host, no font file
// (system fonts). The script only sets `data-theme` on <html> from the visitor's own
// choice; without it the page follows `prefers-color-scheme`. It stores one key in
// `localStorage` (a presentation preference, read only by this script, never sent),
// the one browser-storage key AGSC-06-05 admits: `agsc-theme`, `light` or `dark`,
// written only on the visitor's choice and removed when the visitor picks the system theme.
//
// Pure: two constants and two getters, no I/O.

const STYLESHEET_ROUTE = '/assets/site.css';
const SCRIPT_ROUTE = '/assets/theme.js';

const STYLESHEET = `/* AgenticSystemCore.com site. System fonts, no external requests (AGSC-06-05). */
:root {
  --bg: #fbfbfa; --bg-alt: #f1f1ee; --fg: #1a1a1a; --muted: #5c5c5c; --rule: #d9d9d4;
  --link: #245a9c; --code-bg: #efefeb; --focus: #245a9c; --accent: #245a9c;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1115; --bg-alt: #171a20; --fg: #e8e8e6; --muted: #a3a3a0; --rule: #30343b;
    --link: #8ab4f8; --code-bg: #1b1e25; --focus: #8ab4f8; --accent: #8ab4f8;
  }
}
/* The visitor's own choice (the header's theme switcher) overrides the system theme. */
:root[data-theme="dark"] {
  --bg: #0f1115; --bg-alt: #171a20; --fg: #e8e8e6; --muted: #a3a3a0; --rule: #30343b;
  --link: #8ab4f8; --code-bg: #1b1e25; --focus: #8ab4f8; --accent: #8ab4f8;
}
:root { color-scheme: light dark; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 1rem/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow-wrap: break-word;
}
a { color: var(--link); text-underline-offset: 0.15em; }
a:focus-visible, [tabindex]:focus-visible, input:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.skip { position: absolute; left: 1rem; top: -3rem; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--rule); z-index: 1; }
.skip:focus { top: 1rem; }
header.site { border-bottom: 1px solid var(--rule); }
header.site nav { max-width: 60rem; margin: 0 auto; padding: 0.75rem 1rem; display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; align-items: center; }
header.site ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
header.site a { display: inline-block; padding: 0.25rem 0; min-height: 24px; text-decoration: none; }
header.site a[aria-current="page"] { text-decoration: underline; text-decoration-thickness: 2px; }
.brand { font-weight: 650; color: var(--fg); }
/* Theme switcher: shown only when the script runs; without it the page follows the system theme. */
.theme { margin-left: auto; display: inline-flex; align-items: center; }
.theme[hidden] { display: none; }
.theme select { font: inherit; font-size: 0.85rem; color: var(--fg); background: var(--bg); border: 1px solid var(--rule); border-radius: 4px; padding: 0.1rem 0.25rem; min-height: 24px; cursor: pointer; }
.theme select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
main.wide { max-width: 62rem; }
/* Prose keeps a readable measure even on wide pages; tables and figures may use the full width. */
main.wide > p, main.wide > ul, main.wide > ol, main.wide > h2, main.wide > h3, main.wide > h4, main.wide > blockquote, main.wide > aside, main.wide > dl, main.wide > section { max-width: 46rem; }
footer.site { border-top: 1px solid var(--rule); color: var(--muted); font-size: 0.9rem; }
footer.site p { max-width: 60rem; margin: 0 auto; padding: 0.5rem 1rem; }
footer.site p:first-child { padding-top: 1.25rem; }
footer.site p:last-child { padding-bottom: 1.5rem; }
h1 { font-size: 1.75rem; line-height: 1.25; letter-spacing: -0.01em; margin: 0 0 0.75rem; }
h2 { font-size: 1.3rem; line-height: 1.3; margin: 2rem 0 0.75rem; }
h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
h4 { font-size: 1rem; margin: 1.25rem 0 0.5rem; }
p, ul, ol, dl, pre, blockquote, .table-wrap, figure { margin: 0 0 1rem; }
ul, ol { padding-left: 1.5rem; }
li { margin: 0.25rem 0; }
.tagline, .lead { font-size: 1.1rem; }
.tagline { color: var(--muted); margin-top: -0.25rem; }
.summary { background: var(--bg-alt); border-left: 4px solid var(--accent); padding: 0.6rem 0.9rem; border-radius: 0 4px 4px 0; font-size: 1.05rem; }
.summary strong { color: var(--muted); font-weight: 600; font-size: 0.8em; letter-spacing: 0.04em; text-transform: uppercase; display: block; margin-bottom: 0.15rem; }
code { font-family: ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 0.9em; background: var(--code-bg); padding: 0.05em 0.3em; border-radius: 3px; }
pre { background: var(--code-bg); padding: 0.75rem 1rem; overflow-x: auto; border-radius: 4px; line-height: 1.5; }
pre code { background: none; padding: 0; font-size: 0.85rem; }
pre.terms, pre.feature { white-space: pre-wrap; }
blockquote { border-left: 3px solid var(--rule); padding: 0.25rem 0 0.25rem 1rem; color: var(--fg); }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
th, td { border: 1px solid var(--rule); padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }
thead th { background: var(--bg-alt); }
tbody th { font-weight: normal; }
dl.meta { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
dl.meta dt { color: var(--muted); }
dl.meta dd { margin: 0; min-width: 0; }
.status { background: var(--bg-alt); border: 1px solid var(--rule); border-radius: 4px; padding: 0.25rem 1rem 0.5rem; margin: 0 0 1.5rem; }
.status h2 { font-size: 1rem; margin: 0.75rem 0 0.5rem; }
.toc { border-left: 3px solid var(--rule); padding-left: 1rem; margin: 0 0 1.5rem; }
.toc h2 { font-size: 1rem; margin: 0 0 0.25rem; }
.toc ol { margin: 0; }
.id, .grade { color: var(--muted); font-size: 0.9em; }
ol.index { padding-left: 2rem; }
/* Plain-language box on every specification section. */
aside.plain { background: var(--bg-alt); border: 1px solid var(--rule); border-radius: 4px; padding: 0.25rem 1rem 0.5rem; margin: 0 0 1.5rem; }
aside.plain h2 { font-size: 1rem; margin: 0.75rem 0 0.5rem; }
aside.plain p { margin-bottom: 0.6rem; }
/* Rules: the identifier is a small chip on its own line; cross-references are small and quiet; the
   trailing traceability record is a separate grey line, so the sentence itself reads without interruption. */
li.rule-item { list-style: none; margin: 0 0 1.1rem -1.5rem; padding: 0.35rem 0 0.35rem 0.9rem; border-left: 3px solid var(--rule); }
li.rule-item.retired { color: var(--muted); font-size: 0.92rem; border-left-style: dotted; }
a.rule { display: inline-block; font-family: ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 0.78rem; color: var(--muted); text-decoration: none; border: 1px solid var(--rule); border-radius: 3px; padding: 0 0.35em; margin: 0 0.25em 0.25em 0; line-height: 1.5; }
a.rule strong { font-weight: 600; }
a.rule:hover, a.rule:focus-visible { color: var(--link); border-color: var(--link); }
a.ref, a.ref code { font-family: ui-monospace, "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 0.82em; color: var(--muted); text-decoration-color: var(--rule); }
a.ref:hover, a.ref:focus-visible { color: var(--link); }
.ref.pending { text-decoration: underline dotted; text-underline-offset: 0.2em; cursor: help; }
.trace { display: block; font-size: 0.8rem; color: var(--muted); margin-top: 0.3rem; }
.trace a { color: var(--muted); }
/* Diagrams: inline SVG themed by the page colours; the caption says what the picture means. */
figure.diagram { margin: 1.25rem 0 1.5rem; }
figure.diagram svg { display: block; width: 100%; max-width: 46rem; height: auto; }
figure.diagram svg .acc { stroke: var(--accent); }
figure.diagram figcaption { font-size: 0.92rem; color: var(--muted); max-width: 46rem; margin-top: 0.35rem; }
/* On a narrow screen a diagram keeps a minimum drawn width and scrolls inside its figure, so its labels stay readable. */
figure.diagram { overflow-x: auto; }
figure.diagram svg { min-width: 34rem; }
/* Home page capability grid. */
.modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.75rem; padding: 0; margin: 0 0 1.5rem; list-style: none; }
.modes li { margin: 0; border: 1px solid var(--rule); border-radius: 4px; padding: 0.6rem 0.8rem; background: var(--bg-alt); }
.modes li strong { display: block; margin-bottom: 0.2rem; }
.modes li a { text-decoration: none; }
.modes li a:hover, .modes li a:focus-visible { text-decoration: underline; }
/* Search. */
form.search { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0 0 1rem; }
form.search input { flex: 1 1 14rem; font: inherit; padding: 0.45rem 0.6rem; border: 1px solid var(--rule); border-radius: 4px; background: var(--bg); color: var(--fg); min-height: 44px; }
form.search[hidden] { display: none; }
form.search button { font: inherit; padding: 0.45rem 0.9rem; border: 1px solid var(--rule); border-radius: 4px; background: var(--bg-alt); color: var(--fg); min-height: 44px; cursor: pointer; }
#results { list-style: none; padding: 0; }
#results li { margin: 0 0 0.75rem; }
/* The compose page's item list: one checkbox per row, no bullet beside it. */
#items { list-style: none; padding: 0; }
.snippet { color: var(--muted); font-size: 0.92rem; }
#site-index h2 { font-size: 1.1rem; }
.edit { border-top: 1px solid var(--rule); padding-top: 0.75rem; margin-top: 2rem; color: var(--muted); font-size: 0.92rem; }
.edit code { font-size: 0.9em; }
@media (max-width: 36rem) { dl.meta { grid-template-columns: 1fr; } dl.meta dd { margin-bottom: 0.5rem; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
@media print { header.site, .skip, .theme, form.search { display: none; } main, main.wide { max-width: none; } }
`;

const SCRIPT = `(function () {
  'use strict';
  // The visitor's theme choice: 'light', 'dark' or absent ('auto', the system theme).
  // Stored in this browser only, under one key; never sent anywhere, no cookie.
  var KEY = 'agsc-theme';
  var root = document.documentElement;
  function read() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch (e) { return 'auto'; }
  }
  function apply(v) {
    if (v === 'light' || v === 'dark') root.setAttribute('data-theme', v);
    else root.removeAttribute('data-theme');
  }
  apply(read());
  function wire() {
    var box = document.getElementById('theme');
    var select = box && box.querySelector('select');
    if (!select) return;
    select.value = read();
    select.addEventListener('change', function () {
      var v = select.value === 'light' || select.value === 'dark' ? select.value : 'auto';
      try {
        if (v === 'auto') window.localStorage.removeItem(KEY);
        else window.localStorage.setItem(KEY, v);
      } catch (e) { /* storage unavailable: the choice lasts for this page only */ }
      apply(v);
    });
    box.hidden = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
}());
`;

/** The theme switcher: hidden until the script shows it; a native select named "Theme" by aria-label. */
const SWITCHER = '<div class="theme" id="theme" hidden>'
  + '<select id="theme-select" aria-label="Theme"><option value="auto">Auto</option>'
  + '<option value="light">Light</option><option value="dark">Dark</option></select></div>';

function stylesheet() { return STYLESHEET; }
function script() { return SCRIPT; }

module.exports = { STYLESHEET_ROUTE, SCRIPT_ROUTE, SWITCHER, stylesheet, script };
