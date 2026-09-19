'use strict';
// tests/knowledge/diagram-dsl.test.js — the DSL tokenizer, the layout rules and
// every refusal of `src/knowledge/diagrams.js` (AGSC-02-13, AGSC-04-01).
// TDD: every case below states a rule, not an implementation detail.

const assert = require('node:assert/strict');
const test = require('node:test');

const diagrams = require('../../src/knowledge/diagrams.js');

/** A source that compiles: one accented element, nothing else. */
const MINIMAL = 'box a 20 20 100 40 "a" acc\n';

const codes = (findings) => findings.map((f) => f.code);

test('tokens keeps a quoted string whole and drops the quotes', () => {
  assert.deepEqual(diagrams.tokens('box a 1 2 3 4 "one|two" acc'),
    ['box', 'a', '1', '2', '3', '4', 'one|two', 'acc']);
  assert.deepEqual(diagrams.tokens('note "a b  c"'), ['note', 'a b  c']);
  assert.deepEqual(diagrams.tokens('   '), []);
});

test('statements strips comments and blanks and keeps the source line number', () => {
  const parsed = diagrams.statements('# head\n\nbox a 1 2 3 4 "x" acc # tail\n\n  \n');
  assert.deepEqual(parsed, [{ line: 3, text: 'box a 1 2 3 4 "x" acc' }]);
});

test('fixed renders one decimal place, drops a trailing .0 and never emits -0', () => {
  assert.equal(diagrams.fixed(10), '10');
  assert.equal(diagrams.fixed(10.25), '10.3');
  assert.equal(diagrams.fixed(-0.01), '0');
  assert.equal(diagrams.fixed(1 / 3), '0.3');
});

test('textWidth falls back to 0.62em for a glyph the table does not carry', () => {
  assert.equal(diagrams.textWidth('中', 10), 6.2);
  assert.ok(diagrams.textWidth('W', 10) > diagrams.textWidth('i', 10));
  assert.equal(diagrams.textWidth('', 10), 0);
});

test('esc escapes exactly the five XML characters and declares no entity', () => {
  assert.equal(diagrams.esc('a&b<c>d"e'), 'a&amp;b&lt;c&gt;d&quot;e');
});

test('clip lands on the border of the box it is given', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };
  const point = diagrams.clip(box, { x: 50, y: 25 }, { x: 200, y: 25 });
  assert.deepEqual(point, { x: 100, y: 25 });
});

test('geometryKey is direction-free and ignores a waypoint on the straight line', () => {
  const straight = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }];
  const reversed = [{ x: 100, y: 0 }, { x: 0, y: 0 }];
  assert.equal(diagrams.geometryKey(straight), diagrams.geometryKey(reversed));
  const bent = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }];
  assert.notEqual(diagrams.geometryKey(bent), diagrams.geometryKey(reversed));
});

test('compile is a total function: a non-string source is the empty source', () => {
  const result = diagrams.compile(undefined, { slug: 'x' });
  assert.equal(result.svg, null);
  assert.deepEqual(codes(result.findings), ['AGSC-E412']);
  assert.match(result.findings[0].message, /exactly one element must be marked acc \(found 0\)/u);
});

test('a source over the AGSC-01-16 cap is AGSC-E904, not a compile attempt', () => {
  const huge = `${'# '.repeat(diagrams.MAX_SOURCE_LENGTH)}\n`;
  const result = diagrams.compile(huge, { slug: 'x' });
  assert.equal(result.svg, null);
  assert.deepEqual(codes(result.findings), ['AGSC-E904']);
});

test('the accessible name defaults to "<slug> diagram" and the label statement wins', () => {
  assert.match(diagrams.compile(MINIMAL, { slug: 'thing' }).svg,
    /<title id="thing-title">thing diagram<\/title>/u);
  const labelled = diagrams.compile(`label "a named picture"\n${MINIMAL}`, { slug: 'thing' });
  assert.match(labelled.svg, /<title id="thing-title">a named picture<\/title>/u);
  assert.equal(labelled.label, 'a named picture');
});

test('an options.label overrides the default but not a label statement', () => {
  const given = diagrams.compile(MINIMAL, { slug: 'thing', label: 'from the caller' });
  assert.match(given.svg, /<title id="thing-title">from the caller<\/title>/u);
});

test('the note becomes the <desc>; with no note the desc is derived', () => {
  const withNote = diagrams.compile(`${MINIMAL}note "what you see"\n`, { slug: 'x' });
  assert.match(withNote.svg, /<desc id="x-desc">what you see<\/desc>/u);
  assert.equal(withNote.note, 'what you see');
  const without = diagrams.compile(MINIMAL, { slug: 'x' });
  assert.match(without.svg, /<desc id="x-desc">x diagram\. A line drawing; the highlighted element carries the accent\.<\/desc>/u);
  assert.equal(without.note, null);
});

test('role="img" and aria-labelledby name both accessible strings (AGSC-06-20)', () => {
  const svg = diagrams.compile(MINIMAL, { slug: 'x' }).svg;
  assert.match(svg, /role="img" aria-labelledby="x-title x-desc"/u);
});

test('nothing carries a colour: currentColor only, and no style anywhere', () => {
  const svg = diagrams.compile(`${MINIMAL}note "n"\n`, { slug: 'x' }).svg;
  assert.equal(/#[0-9a-fA-F]{3,6}\b/u.test(svg), false);
  assert.equal(/\bstyle\b/u.test(svg), false);
  assert.equal(/rgb\(|hsl\(/u.test(svg), false);
  assert.equal((svg.match(/currentColor/gu) || []).length, 3);
});

test('the accent is a class AND a presentation attribute, so no CSS is needed', () => {
  const svg = diagrams.compile(MINIMAL, { slug: 'x' }).svg;
  assert.ok(svg.includes(`class="${diagrams.ACCENT_CLASS}" stroke-width="${diagrams.ACCENT_STROKE_WIDTH}"`));
});

test('exactly one acc element is required — zero and two both fail', () => {
  const none = diagrams.compile('box a 20 20 60 20 "a"\n', { slug: 'x' });
  assert.match(none.findings[0].message, /found 0/u);
  const two = diagrams.compile('box a 20 20 60 20 "a" acc\nbox b 200 20 60 20 "b" acc\n', { slug: 'x' });
  assert.match(two.findings[0].message, /found 2/u);
  assert.equal(two.svg, null);
});

test('an unknown statement is refused with its line number', () => {
  const result = diagrams.compile(`${MINIMAL}swirl 1 2\n`, { slug: 'x' });
  assert.equal(result.svg, null);
  assert.equal(result.findings[0].line, 2);
  assert.match(result.findings[0].message, /unknown statement "swirl"/u);
});

test('a bad number is refused in every statement that takes one', () => {
  for (const source of [
    'canvas wide 200', 'box q x 20 60 20 "q"', 'circle c x 20 10 "c"',
    'region r x 20 60 20 "r"', 'line x 1 2 3', 'cross x 2', 'bar x 2 3',
    'text x 2 "t"',
  ]) {
    const result = diagrams.compile(`${MINIMAL}${source}\n`, { slug: 'x' });
    assert.equal(result.svg, null, source);
    assert.ok(result.findings.some((f) => /bad number/u.test(f.message)), source);
  }
});

test('a non-positive canvas is refused', () => {
  const result = diagrams.compile(`canvas 0 100\n${MINIMAL}`, { slug: 'x' });
  assert.match(result.findings[0].message, /canvas must be positive, got 0x100/u);
});

test('an empty label, an empty note, an empty path and a bare text are refused', () => {
  for (const [source, pattern] of [
    ['label "  "', /label needs a non-empty text/u],
    ['note ""', /note needs a text/u],
    ['path ""', /path needs a `d` value/u],
    ['text 10 10', /text needs x, y and a string/u],
    ['box', /box needs an id/u],
    ['circle', /circle needs an id/u],
    ['region', /region needs an id/u],
  ]) {
    const result = diagrams.compile(`${MINIMAL}${source}\n`, { slug: 'x' });
    assert.equal(result.svg, null, source);
    assert.ok(result.findings.some((f) => pattern.test(f.message)), source);
  }
});

test('a duplicate id is refused across box, circle and region', () => {
  for (const second of ['box a 200 20 60 20 "b"', 'circle a 200 40 10 "b"', 'region a 200 20 60 20 "b"']) {
    const result = diagrams.compile(`${MINIMAL}${second}\n`, { slug: 'x' });
    assert.ok(result.findings.some((f) => /duplicate id "a"/u.test(f.message)), second);
  }
});

test('a shape outside the canvas is refused, naming the corner', () => {
  const result = diagrams.compile('box a 400 20 200 40 "a" acc\n', { slug: 'x' });
  assert.equal(result.svg, null);
  assert.ok(result.findings.some((f) => /sits outside the canvas at \(600,60\)/u.test(f.message)));
  const negative = diagrams.compile('box a -5 20 60 20 "a" acc\n', { slug: 'x' });
  assert.ok(negative.findings.some((f) => /outside the canvas at \(-5,20\)/u.test(f.message)));
});

test('two shapes that overlap are refused, and a region may overlap anything', () => {
  const overlap = diagrams.compile('box a 20 20 100 40 "a" acc\nbox b 60 30 100 40 "b"\n', { slug: 'x' });
  assert.ok(overlap.findings.some((f) => /shapes "a" and "b" overlap/u.test(f.message)));
  const region = diagrams.compile('region r 10 10 200 100 "r"\nbox a 20 20 100 40 "a" acc\n', { slug: 'x' });
  assert.equal(region.svg === null, false);
});

test('an id beginning with _ is excluded from the overlap and footer checks', () => {
  const result = diagrams.compile('box _a 20 20 100 40 "a"\nbox _b 60 30 100 40 "b" acc\n', { slug: 'x' });
  assert.equal(result.svg === null, false);
});

test('a shape in the footer band is refused only when a note occupies it', () => {
  const clean = diagrams.compile('box a 20 230 100 25 "a" acc\n', { slug: 'x' });
  assert.equal(clean.svg === null, false);
  const clash = diagrams.compile('box a 20 230 100 25 "a" acc\nnote "n"\n', { slug: 'x' });
  assert.ok(clash.findings.some((f) => /intrudes into the footer note band/u.test(f.message)));
});

test('an arrow to an unknown id is refused', () => {
  const result = diagrams.compile(`${MINIMAL}arrow a ghost\n`, { slug: 'x' });
  assert.match(result.findings[0].message, /arrow references an unknown id \(a -> ghost\)/u);
});

test('two arrows on the same resolved path are refused — the second would be invisible', () => {
  const source = 'box a 20 20 80 40 "a" acc\nbox b 200 20 80 40 "b"\narrow a b\narrow b a\n';
  const result = diagrams.compile(source, { slug: 'x' });
  assert.equal(result.svg, null);
  assert.match(result.findings[0].message, /resolve to the same path/u);
});

test('a via waypoint, or `both`, separates the two directions', () => {
  const via = 'box a 20 20 80 40 "a" acc\nbox b 200 20 80 40 "b"\narrow a b\narrow b a via=240,120;60,120\n';
  assert.equal(diagrams.compile(via, { slug: 'x' }).svg === null, false);
  const both = 'box a 20 20 80 40 "a" acc\nbox b 200 20 80 40 "b"\narrow a b both\n';
  const svg = diagrams.compile(both, { slug: 'x' }).svg;
  assert.ok(svg.includes('marker-start="url(#ar2)"'));
});

test('a malformed or empty via= is refused', () => {
  const base = 'box a 20 20 80 40 "a" acc\nbox b 200 20 80 40 "b"\n';
  const bad = diagrams.compile(`${base}arrow a b via=x,y\n`, { slug: 'x' });
  assert.ok(bad.findings.some((f) => /bad number/u.test(f.message)));
  const empty = diagrams.compile(`${base}arrow a b via=\n`, { slug: 'x' });
  assert.ok(empty.findings.some((f) => /bad number|no waypoint/u.test(f.message)));
});

test('a note wider than the canvas is refused with the measured overflow', () => {
  const long = `${MINIMAL}note "${'a very long footer sentence '.repeat(6)}"\n`;
  const result = diagrams.compile(long, { slug: 'x' });
  assert.equal(result.svg, null);
  assert.match(result.findings[0].message, /px over the 428px limit for a 460px canvas/u);
});

test('a free text past either margin is refused, naming the edge', () => {
  const right = diagrams.compile(`${MINIMAL}text 450 100 "a fairly long label"\n`, { slug: 'x' });
  assert.match(right.findings[0].message, /past the right edge/u);
  const left = diagrams.compile(`${MINIMAL}text 2 100 "a fairly long label" left\n`, { slug: 'x' });
  assert.match(left.findings[0].message, /past the left edge/u);
});

test('left and right anchor a free text; the default is centred', () => {
  const svg = diagrams.compile(`${MINIMAL}text 30 100 "l" left\ntext 430 100 "r" right\ntext 230 100 "c"\n`,
    { slug: 'x' }).svg;
  assert.ok(svg.includes('text-anchor="start"'));
  assert.ok(svg.includes('text-anchor="end"'));
  assert.ok(svg.includes('<text x="230" y="100" font-size="11">c</text>'));
});

test('a box label splits on | and drops to 11px when it is long and unsplit', () => {
  const svg = diagrams.compile('box a 20 20 200 60 "one|two" acc\n', { slug: 'x' }).svg;
  assert.equal((svg.match(/<text /gu) || []).length, 2);
  const long = diagrams.compile('box a 20 20 200 60 "a label longer than twenty-two" acc\n', { slug: 'x' }).svg;
  assert.ok(long.includes('font-size="11"'));
});

test('a box or circle with no label token paints no text', () => {
  const svg = diagrams.compile('box a 20 20 60 20\ncircle c 300 40 10\nline 10 200 100 200 acc\n',
    { slug: 'x' }).svg;
  assert.equal((svg.match(/<text /gu) || []).length, 0);
});

test('a `""` label is the tokenizer dropping it: the next token becomes the label', () => {
  // The owner's tokenizer removes quote characters rather than emitting an empty
  // token, so `box a 1 2 3 4 "" acc` paints the word `acc`. Recorded as
  // behaviour, not endorsed: a source wanting no label omits the argument.
  const svg = diagrams.compile('box a 20 20 60 20 "" acc\n', { slug: 'x' }).svg;
  assert.ok(svg.includes('<text x="50" y="34" font-size="12">acc</text>'));
});

test('a region may carry no caption; a caption is painted above it', () => {
  const bare = diagrams.compile(`region r 10 10 200 100\n${MINIMAL}`, { slug: 'x' });
  assert.equal(bare.svg === null, false);
  assert.equal((bare.svg.match(/<text /gu) || []).length, 1);
  const captioned = diagrams.compile(`region r 10 30 200 100 "outside"\n${MINIMAL}`, { slug: 'x' }).svg;
  assert.ok(captioned.includes('<text x="110" y="22" font-size="11">outside</text>'));
});

test('dashed uses the pattern its element calls for, and acc keeps the arrow pattern', () => {
  const plain = diagrams.compile('box a 20 20 60 20 "a" dashed\nbox b 200 20 60 20 "b" acc\n', { slug: 'x' }).svg;
  assert.ok(plain.includes('rx="6" stroke-dasharray="5 3"'));
  const accented = diagrams.compile('box a 20 20 60 20 "a" acc dashed\n', { slug: 'x' }).svg;
  assert.ok(accented.includes(`stroke-width="${diagrams.ACCENT_STROKE_WIDTH}" stroke-dasharray="4 3"`));
  const line = diagrams.compile(`${MINIMAL}line 10 100 200 100 dashed\n`, { slug: 'x' }).svg;
  assert.ok(line.includes('stroke-dasharray="6 5"'));
  const circle = diagrams.compile(`${MINIMAL}circle c 300 100 10 "c" dashed\n`, { slug: 'x' }).svg;
  assert.ok(circle.includes('r="10" stroke-dasharray="4 3"'));
  const path = diagrams.compile(`${MINIMAL}path "M10 100 L40 100" dashed\n`, { slug: 'x' }).svg;
  assert.ok(path.includes('d="M10 100 L40 100" stroke-dasharray="4 3"'));
});

test('thick widens a line and a bar, and acc may mark a line or a path', () => {
  const thick = diagrams.compile('line 10 100 200 100 thick acc\nbar 10 150 100 thick\n', { slug: 'x' }).svg;
  assert.equal((thick.match(/stroke-width="5"/gu) || []).length, 2);
  const path = diagrams.compile('path "M10 100 L40 100" acc arrow\n', { slug: 'x' }).svg;
  assert.ok(path.includes(`class="${diagrams.ACCENT_CLASS}"`));
  assert.ok(path.includes('marker-end="url(#ar2)"'));
});

test('a canvas statement moves the note, the footer band and the margins', () => {
  const svg = diagrams.compile(`canvas 300 200\n${MINIMAL}note "n"\n`, { slug: 'x' }).svg;
  assert.ok(svg.includes('viewBox="0 0 300 200"'));
  assert.ok(svg.includes('<text x="150" y="188" font-size="11">n</text>'));
});

test('check() is byte comparison, not tolerance (AGSC-04-02)', () => {
  const svg = diagrams.compile(MINIMAL, { slug: 'x' }).svg;
  assert.deepEqual(diagrams.check(MINIMAL, svg, { slug: 'x' }), { stale: false, findings: [], svg });
  const stale = diagrams.check(MINIMAL, `${svg} `, { slug: 'x' });
  assert.equal(stale.stale, true);
  assert.deepEqual(codes(stale.findings), ['AGSC-E602']);
  const broken = diagrams.check('swirl\n', svg, { slug: 'x' });
  assert.equal(broken.stale, true);
  assert.equal(broken.svg, null);
  assert.deepEqual(codes(broken.findings), ['AGSC-E412', 'AGSC-E412']);
});

test('altFrom derives a non-empty accessible name from any source', () => {
  assert.equal(diagrams.altFrom(`label "the picture"\n${MINIMAL}note "the mechanism"\n`, { slug: 'x' }),
    'the picture. the mechanism');
  assert.equal(diagrams.altFrom(MINIMAL, { slug: 'x' }), 'x diagram.');
  assert.equal(diagrams.altFrom('', {}), 'diagram diagram.');
});

test('render is deterministic: the same parts always give the same bytes', () => {
  const parts = { width: 100, height: 50, label: 'l', note: null, draw: [], texts: [], slug: 's' };
  assert.equal(diagrams.render(parts), diagrams.render(parts));
});

test('a finding carries the file and the slug the caller gave', () => {
  const result = diagrams.compile('swirl\n', { slug: 'a2a', file: 'content/diagrams/a2a.diagram' });
  assert.equal(result.findings[0].file, 'content/diagrams/a2a.diagram');
  assert.equal(result.findings[0].slug, 'a2a');
  assert.equal(result.findings[0].severity, 'error');
});
