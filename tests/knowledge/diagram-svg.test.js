'use strict';
// tests/knowledge/diagram-svg.test.js — AGSC-02-98 and AGSC-06-20 as INVARIANTS
// of `src/knowledge/diagrams.js`, not as properties of fifteen fixtures.
//
// The goldens prove the compiler right on the shapes the corpus uses. This suite
// proves the two properties that must hold for EVERY source: whatever compiles is
// inside the SVG allow-list, and it always carries the two accessible strings.
// Hostile labels are part of the generator on purpose — a `<script>` in a box
// label must come out escaped, never as an element.

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');

const diagrams = require('../../src/knowledge/diagrams.js');
const { svgViolations } = require('../../src/governance/lint.js');

/** Labels a hostile author might try. Every one must survive as text. */
const HOSTILE = [
  '<script>alert(1)</script>',
  '"><script src=x>',
  'a & b',
  'onload=alert(1)',
  'data:image/png;base64,AAAA',
  'javascript:alert(1)',
  '<style>*{}</style>',
  '<!DOCTYPE html>',
  '<!ENTITY x "y">',
  '<?xml version="1.0"?>',
  '<foreignObject/>',
  '‮evil',
];

/** A generator of sources that COMPILE: one accent, ids unique, inside the canvas. */
const source = () => fc.tuple(
  fc.integer({ min: 0, max: 6 }),
  fc.constantFrom(...HOSTILE),
  fc.boolean(),
  fc.boolean(),
  fc.integer({ min: 120, max: 460 }),
).map(([count, label, dashed, withNote, width]) => {
  const lines = [`canvas ${width} 260`, `label ${JSON.stringify(label)}`];
  for (let i = 0; i < count; i += 1) {
    const y = 20 + i * 34;
    const accent = i === 0 ? ' acc' : '';
    const dash = dashed && i % 2 === 1 ? ' dashed' : '';
    lines.push(`box b${i} 10 ${y} ${Math.min(80, width - 20)} 24 ${JSON.stringify(label)}${accent}${dash}`);
  }
  if (count === 0) lines.push(`line 10 10 ${width - 10} 10 acc`);
  if (count >= 2) lines.push('arrow b0 b1');
  if (withNote) lines.push('note "a short footer"');
  return `${lines.join('\n')}\n`;
});

test('whatever compiles is inside the AGSC-02-98 allow-list', () => {
  fc.assert(fc.property(source(), (text) => {
    const result = diagrams.compile(text, { slug: 'p' });
    if (result.svg === null) return; // a refused source emits nothing at all
    assert.deepEqual(svgViolations(result.svg), []);
  }), { numRuns: 300, seed: 28 });
});

test('whatever compiles carries role="img", a <title> and a <desc> (AGSC-06-20)', () => {
  fc.assert(fc.property(source(), (text) => {
    const result = diagrams.compile(text, { slug: 'p' });
    if (result.svg === null) return;
    assert.ok(result.svg.includes('role="img"'));
    assert.match(result.svg, /<title id="p-title">[^<]*<\/title>/u);
    assert.match(result.svg, /<desc id="p-desc">[^<]*<\/desc>/u);
  }), { numRuns: 300, seed: 28 });
});

test('whatever compiles is byte-reproducible (AGSC-04-01/04-02)', () => {
  fc.assert(fc.property(source(), (text) => {
    assert.equal(diagrams.compile(text, { slug: 'p' }).svg, diagrams.compile(text, { slug: 'p' }).svg);
  }), { numRuns: 200, seed: 28 });
});

test('a hostile label never becomes markup, in a title, a desc or a box label', () => {
  for (const label of HOSTILE) {
    const text = `label ${JSON.stringify(label)}\nbox a 20 20 200 40 ${JSON.stringify(label)} acc\n`
      + `note ${JSON.stringify(label.slice(0, 40))}\n`;
    const result = diagrams.compile(text, { slug: 'p' });
    if (result.svg === null) continue;
    assert.deepEqual(svgViolations(result.svg), [], label);
    assert.equal(result.svg.includes('<script'), false, label);
    assert.equal(result.svg.includes('<!DOCTYPE'), false, label);
    assert.equal(result.svg.includes('<?'), false, label);
  }
});

test('a label carrying a raw < is escaped, so the document stays well-formed XML', () => {
  const result = diagrams.compile('label "a < b"\nbox a 20 20 60 20 "x" acc\n', { slug: 'p' });
  assert.ok(result.svg.includes('<title id="p-title">a &lt; b</title>'));
  assert.deepEqual(svgViolations(result.svg), []);
});
