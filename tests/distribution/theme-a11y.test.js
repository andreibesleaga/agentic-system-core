'use strict';
// The default theme of every engine-built page, against the measurements of the sites
// review (verification report 11, 2026-10-02; the main site's `assets/site.css` is the
// same bytes, so one change serves both). Each assertion names the finding it closes.
//
//   U3  diagrams on phones: drawn at no less than 42rem, so no label is under 12 px,
//       and the figure that scrolls is reachable by keyboard (`tabindex="0"`,
//       WCAG 2.1.1, AGSC-06-20) — plan item B12;
//   U4  form controls have a 3:1 outline (WCAG 1.4.11): one `--control` colour;
//   U5  a table cell wraps, so a long value (a commit hash) does not scroll the page
//       sideways at 320–390 px (WCAG 1.4.10);
//   U11 an error-code reference is not shrunk twice (0.82 × 0.82 em);
//   U18 the engine's diagram accent class `agsc-accent` is coloured like the site's `.acc`;
//   U10 print: dark text on white whatever the visitor chose, and code wraps on paper;
//   U19 rule chips and source addresses are 24 px targets (WCAG 2.5.8), and a long
//       address still breaks inside its box, so the page does not scroll sideways.

const test = require('node:test');
const assert = require('node:assert/strict');

const theme = require('../../src/distribution/theme.js');
const html = require('../../src/distribution/html.js');

const CSS = theme.stylesheet();

/** WCAG 2.x relative luminance and contrast ratio of two #rrggbb colours. */
function contrast(a, b) {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The value of a custom property in each of the three variable blocks (light, system dark, chosen dark). */
function tokens(name) {
  return [...CSS.matchAll(new RegExp(`--${name}: (#[0-9a-f]{6})`, 'gu'))].map((m) => m[1]);
}

test('U3 / B12: a diagram keeps a 42rem drawn width and its figure is focusable', () => {
  assert.match(CSS, /figure\.diagram svg \{ min-width: 42rem; \}/u);
  assert.doesNotMatch(CSS, /min-width: 34rem/u);
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'fixtures', 'diagrams', 'a2a.diagram'), 'utf8');
  const { html: figure } = html.diagramFigure({ diagram: { alt: 'Two agents and the task between them.', file: 'x.svg' }, slug: 'x' }, source);
  assert.ok(figure.startsWith('<figure class="diagram" tabindex="0"><svg '), figure.slice(0, 80));
});

test('U4: every form control has an outline of at least 3:1 against the page in both schemes', () => {
  // The three screen blocks (light, system dark, chosen dark); the fourth is print.
  const control = tokens('control').slice(0, 3);
  const bg = tokens('bg').slice(0, 3);
  assert.equal(tokens('control').length, 4, 'one --control value in each variable block');
  control.forEach((c, i) => assert.ok(contrast(c, bg[i]) >= 3, `--control ${c} on ${bg[i]}: ${contrast(c, bg[i]).toFixed(2)}`));
  for (const selector of ['\\.theme select', 'form\\.search input', 'form\\.search button']) {
    assert.match(CSS, new RegExp(`${selector} \\{[^}]*border: 1px solid var\\(--control\\)`, 'u'), selector);
  }
});

test('U5: table cells wrap a long value', () => {
  assert.match(CSS, /th, td \{[^}]*overflow-wrap: anywhere/u);
});

test('U11: an error-code reference is not shrunk twice', () => {
  assert.match(CSS, /a\.ref code \{ font-size: 1em; \}/u);
  assert.match(CSS, /\.trace a\.ref \{ font-size: 1em; \}/u);
});

test('U18: the engine diagram accent is coloured', () => {
  assert.match(CSS, /figure\.diagram svg \.acc, figure\.diagram svg \.agsc-accent \{ stroke: var\(--accent\); \}/u);
});

test('U10: print is dark on white and code wraps on paper', () => {
  const print = /@media print \{([\s\S]*?)\n\}/u.exec(CSS);
  assert.ok(print, 'a print block');
  assert.match(print[1], /color-scheme: light/u);
  assert.match(print[1], /--fg: #1a1a1a/u);
  assert.match(print[1], /pre \{ white-space: pre-wrap; overflow: visible; \}/u);
});

test('U19: rule chips and source addresses are 24 px targets', () => {
  assert.match(CSS, /a\.rule \{[^}]*line-height: 24px/u);
  assert.match(CSS, /\.source-url a \{[^}]*display: inline-block; padding: 2px 0;/u);
});

test('U19 keeps reflow (WCAG 1.4.10): a long source address breaks inside its box at 320-390 px', () => {
  // An inline box is as wide as its longest unbreakable run; without a break opportunity
  // a 60-character address widened the page to 533 px at 390 px (measured on the
  // demonstration node, 2026-10-07). It may break anywhere and never exceeds its column.
  assert.match(CSS, /\.source-url a \{[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere;/u);
});
