'use strict';
// The diagram compiler's REFUSALS and its small pure helpers.
//
// `compile` is TOTAL: every malformed source is a Finding with a registered
// code and `svg: null`, never a thrown string (AGSC-09-11) and never a
// half-drawn picture (AGSC-04-02 compares bytes, and half a picture is not
// reproducible from its source). One test per refusal, because each refusal is
// a promise the import depends on — a card whose diagram does not compile is a
// card whose `diagram` key must be dropped, and that decision needs a finding
// to hang on.

const test = require('node:test');
const assert = require('node:assert');

const diagrams = require('../../src/knowledge/diagrams.js');

/** Compile and return the codes plus the messages, which is what a caller reads. */
function refuse(source, options = {}) {
  const result = diagrams.compile(source, { slug: 'x', ...options });
  assert.strictEqual(result.svg, null, 'a refused source must emit no SVG');
  return result.findings;
}

/** A minimal source that compiles, so a refusal can be added one line at a time. */
const OK = 'canvas 200 120\nlabel "T"\nbox a 20 20 80 40 "a" acc\n';

test('a source that compiles is the baseline this suite varies', () => {
  const result = diagrams.compile(OK, { slug: 'x' });
  assert.deepStrictEqual(result.findings, []);
  assert.strictEqual(result.label, 'T');
  assert.strictEqual(result.note, null);
});

test('AGSC-01-16: a source over the code-point cap is AGSC-E904, and nothing is parsed', () => {
  const findings = refuse('#'.repeat(diagrams.MAX_SOURCE_LENGTH + 1));
  assert.deepStrictEqual(findings.map((f) => f.code), ['AGSC-E904']);
  assert.match(findings[0].message, /code-point cap/u);
});

test('a non-string source is treated as empty, never as a fault', () => {
  const findings = refuse(undefined);
  assert.deepStrictEqual(findings.map((f) => f.code), ['AGSC-E412']);
  assert.match(findings[0].message, /exactly one element must be marked acc \(found 0\)/u);
});

test('an unknown statement is refused by name', () => {
  const findings = refuse(`${OK}rhombus q 1 2\n`);
  assert.match(findings[0].message, /unknown statement "rhombus"/u);
});

test('a comment and a blank line are not statements', () => {
  const result = diagrams.compile(`# a comment\n\n${OK}   # trailing\n`, { slug: 'x' });
  assert.deepStrictEqual(result.findings, []);
  assert.deepStrictEqual(diagrams.statements('# only\n\n').length, 0);
});

test('canvas: a non-number and a non-positive size are both refused', () => {
  assert.match(refuse('canvas wide 100\nbox a 0 0 10 10 "" acc\n')[0].message, /bad number "wide"/u);
  assert.match(refuse('canvas 0 100\nbox a 0 0 10 10 "" acc\n')[0].message, /canvas must be positive/u);
});

test('label: an empty label is refused rather than silently defaulted', () => {
  assert.match(refuse('label ""\nbox a 20 20 80 40 "a" acc\n')[0].message, /label needs a non-empty text/u);
  assert.match(refuse('label\nbox a 20 20 80 40 "a" acc\n')[0].message, /label needs a non-empty text/u);
});

test('box: a missing id, a duplicate id and a bad coordinate are each refused', () => {
  assert.match(refuse(`${OK}box\n`)[0].message, /box needs an id/u);
  assert.match(refuse(`${OK}box a 10 10 10 10\n`)[0].message, /duplicate id "a"/u);
  assert.match(refuse(`${OK}box b x 10 10 10\n`)[0].message, /bad number "x"/u);
});

test('a shape outside the canvas is refused with the offending point', () => {
  assert.match(refuse('canvas 100 100\nbox a 90 90 40 40 "a" acc\n')[0].message,
    /box a sits outside the canvas at \(130,130\)/u);
});

test('two non-region shapes may not overlap', () => {
  const findings = refuse('canvas 300 200\nbox a 10 10 100 40 "a" acc\nbox b 50 20 100 40 "b"\n');
  assert.match(findings[0].message, /shapes "a" and "b" overlap/u);
});

test('circle: id, duplicate and coordinate refusals, and a label', () => {
  assert.match(refuse(`${OK}circle\n`)[0].message, /circle needs an id/u);
  assert.match(refuse(`${OK}circle a 10 10 5\n`)[0].message, /duplicate id "a"/u);
  assert.match(refuse(`${OK}circle c r 10 5\n`)[0].message, /bad number "r"/u);
  const ok = diagrams.compile('canvas 300 200\ncircle c 150 100 40 "c" acc\n', { slug: 'x' });
  assert.deepStrictEqual(ok.findings, []);
  assert.ok(ok.svg.includes('<circle cx="150" cy="100" r="40" class="agsc-accent"'));
});

test('region: id, duplicate and coordinate refusals; a region may hold a shape', () => {
  assert.match(refuse(`${OK}region\n`)[0].message, /region needs an id/u);
  assert.match(refuse(`${OK}region a 0 0 10 10\n`)[0].message, /duplicate id "a"/u);
  assert.match(refuse(`${OK}region r 0 0 z 10\n`)[0].message, /bad number "z"/u);
  const ok = diagrams.compile('canvas 300 200\nregion r 10 40 200 100 "zone"\nbox a 30 60 100 40 "a" acc\n',
    { slug: 'x' });
  assert.deepStrictEqual(ok.findings, [], 'a box inside a region is not an overlap');
  assert.ok(ok.svg.includes('>zone</text>'));
});

test('arrow: an unknown endpoint, a malformed via and an empty via are refused', () => {
  assert.match(refuse(`${OK}arrow a nosuch\n`)[0].message, /arrow references an unknown id/u);
  const two = 'canvas 400 200\nbox a 20 20 100 40 "a" acc\nbox b 260 20 100 40 "b"\n';
  assert.match(refuse(`${two}arrow a b via=zz,10\n`)[0].message, /bad number "zz"/u);
  assert.match(refuse(`${two}arrow a b via=\n`)[0].message, /bad number "undefined" in via/u);
});

test('AGSC-04-01: two arrows that resolve to one path are refused, not overdrawn', () => {
  const source = 'canvas 400 200\nbox a 20 20 100 40 "a" acc\nbox b 260 20 100 40 "b"\n'
    + 'arrow a b\narrow b a\n';
  assert.match(refuse(source)[0].message, /resolve to the same path/u);
  // `both` is the shape the message recommends, and it compiles.
  const ok = diagrams.compile('canvas 400 200\nbox a 20 20 100 40 "a" acc\nbox b 260 20 100 40 "b"\n'
    + 'arrow a b both dashed\n', { slug: 'x' });
  assert.deepStrictEqual(ok.findings, []);
  assert.ok(ok.svg.includes('marker-start="url(#ar2)"'));
  assert.ok(ok.svg.includes('stroke-dasharray="4 3"'));
});

test('line, path, cross and bar', () => {
  assert.match(refuse(`${OK}line 1 2 3\n`)[0].message, /bad number "undefined"/u);
  assert.match(refuse(`${OK}path\n`)[0].message, /path needs a `d` value/u);
  assert.match(refuse(`${OK}cross q 10\n`)[0].message, /bad number "q"/u);
  assert.match(refuse(`${OK}bar 10 10 w\n`)[0].message, /bad number "w"/u);
  const ok = diagrams.compile('canvas 300 200\nbox a 20 20 80 40 "a" acc\n'
    + 'line 10 150 290 150 thick dashed\npath "M10 10 L20 20" arrow dashed\n'
    + 'cross 150 100\nbar 20 180 100 thick\n', { slug: 'x' });
  assert.deepStrictEqual(ok.findings, []);
  assert.ok(ok.svg.includes('stroke-width="5"'));
  assert.ok(ok.svg.includes('stroke-dasharray="6 5"'));
});

test('text: a missing string, a bad size and an over-wide string are refused', () => {
  assert.match(refuse(`${OK}text 10 10\n`)[0].message, /text needs x, y and a string/u);
  assert.match(refuse(`${OK}text 10 10 "hi" size=big\n`)[0].message, /bad number "big"/u);
  assert.match(refuse(`canvas 120 80\nbox a 10 10 40 20 "a" acc\ntext 60 60 "${'w'.repeat(40)}"\n`)[0].message,
    /past the (left|right) edge/u);
  const ok = diagrams.compile('canvas 400 200\nbox a 20 20 80 40 "a" acc\n'
    + 'text 20 180 "left" left\ntext 380 180 "right" right\ntext 200 100 "mid" size=13\n', { slug: 'x' });
  assert.deepStrictEqual(ok.findings, []);
  assert.ok(ok.svg.includes('text-anchor="start"'));
  assert.ok(ok.svg.includes('text-anchor="end"'));
  assert.ok(ok.svg.includes('font-size="13"'));
});

test('note: an empty note and an over-wide note are refused; a note becomes the desc', () => {
  assert.match(refuse(`${OK}note\n`)[0].message, /note needs a text/u);
  assert.match(refuse(`canvas 200 120\nbox a 20 20 80 40 "a" acc\nnote "${'n'.repeat(80)}"\n`)[0].message,
    /over the .* limit for a 200px canvas/u);
  const ok = diagrams.compile('canvas 400 260\nbox a 20 20 80 40 "a" acc\nnote "a short note"\n',
    { slug: 'x' });
  assert.deepStrictEqual(ok.findings, []);
  assert.strictEqual(ok.note, 'a short note');
  assert.ok(ok.svg.includes('<desc id="x-desc">a short note</desc>'));
});

test('a shape intruding into the footer note band is refused', () => {
  const source = 'canvas 300 200\nbox a 20 150 100 45 "a" acc\nnote "n"\n';
  assert.match(refuse(source)[0].message, /intrudes into the footer note band/u);
});

test('AGSC-02-98: exactly one accent, no more and no fewer', () => {
  assert.match(refuse('canvas 200 120\nbox a 20 20 80 40 "a"\n')[0].message, /\(found 0\)/u);
  assert.match(refuse('canvas 300 120\nbox a 20 20 80 40 "a" acc\nbox b 150 20 80 40 "b" acc\n')[0].message,
    /\(found 2\)/u);
});

test('an id starting with `_` is geometry, not a shape, for the overlap check', () => {
  const source = 'canvas 300 200\nbox _g 10 10 100 40 "g" acc\nbox _h 50 20 100 40 "h"\n';
  const result = diagrams.compile(source, { slug: 'x' });
  assert.deepStrictEqual(result.findings, []);
});

test('fixed(): one decimal place, `.0` dropped, and no negative zero', () => {
  assert.strictEqual(diagrams.fixed(1), '1');
  assert.strictEqual(diagrams.fixed(1.25), '1.3');
  assert.strictEqual(diagrams.fixed(-0.01), '0');
  assert.strictEqual(diagrams.fixed(-2.5), '-2.5');
});

test('tokens(): quoted strings survive, runs of spaces do not', () => {
  assert.deepStrictEqual(diagrams.tokens('box a 1 2 "two words" acc'),
    ['box', 'a', '1', '2', 'two words', 'acc']);
  assert.deepStrictEqual(diagrams.tokens('   '), []);
});

test('textWidth(): a known glyph and an unknown one both have a width', () => {
  assert.ok(diagrams.textWidth('AA', 10) > 0);
  assert.strictEqual(diagrams.textWidth('中', 10), 6.2, 'an unknown glyph takes the fallback');
  assert.strictEqual(diagrams.textWidth('', 10), 0);
});

test('esc(): the five XML entities, and the apostrophe left alone', () => {
  assert.strictEqual(diagrams.esc('a&b<c>d"e\'f'), 'a&amp;b&lt;c&gt;d&quot;e\'f');
});

test('clip(): a purely vertical segment clips on the horizontal border', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  assert.deepStrictEqual(diagrams.clip(box, { x: 5, y: 5 }, { x: 5, y: 50 }), { x: 5, y: 10 });
});

test('geometryKey(): a waypoint on the straight line is not a distinction', () => {
  const straight = diagrams.geometryKey([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
  assert.strictEqual(straight, diagrams.geometryKey([{ x: 0, y: 0 }, { x: 10, y: 0 }]));
  // …and the key is direction-free, so `a -> b` collides with `b -> a`.
  assert.strictEqual(diagrams.geometryKey([{ x: 10, y: 0 }, { x: 0, y: 0 }]), straight);
});

test('a multi-line box label is split on `|` and centred', () => {
  const result = diagrams.compile('canvas 300 200\nbox a 20 20 160 60 "one|two" acc\n', { slug: 'x' });
  assert.deepStrictEqual(result.findings, []);
  assert.ok(result.svg.includes('>one</text>'));
  assert.ok(result.svg.includes('>two</text>'));
});

test('a long single-line box label drops to font-size 11', () => {
  const result = diagrams.compile(`canvas 400 200\nbox a 20 20 360 60 "${'x'.repeat(30)}" acc\n`,
    { slug: 'x' });
  assert.deepStrictEqual(result.findings, []);
  assert.ok(result.svg.includes('font-size="11"'));
});

test('the caller may supply the accessible name when the source has no label', () => {
  const result = diagrams.compile('canvas 200 120\nbox a 20 20 80 40 "a" acc\n',
    { slug: 'x', label: 'Given name' });
  assert.strictEqual(result.label, 'Given name');
  assert.ok(result.svg.includes('<title id="x-title">Given name</title>'));
  const fallback = diagrams.compile('canvas 200 120\nbox a 20 20 80 40 "a" acc\n', {});
  assert.strictEqual(fallback.label, 'diagram diagram');
});

test('render(): the whole document is assembled from the parts, in one shape', () => {
  const svg = diagrams.render({
    width: 100, height: 50, label: 'L', note: null, draw: ['<rect/>'], texts: ['<text/>'], slug: 's',
  });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"'));
  assert.ok(svg.endsWith('</svg>\n'));
  assert.ok(svg.includes(diagrams.MARKER));
});

test('every refusal carries AGSC-E412, the file and the source line', () => {
  const findings = diagrams.compile('canvas 100 100\nnosuch\n', { slug: 's', file: 'content/diagrams/s.diagram' }).findings;
  for (const f of findings) {
    assert.strictEqual(f.code, 'AGSC-E412');
    assert.strictEqual(f.file, 'content/diagrams/s.diagram');
    assert.strictEqual(f.severity, 'error');
  }
  assert.strictEqual(findings[0].line, 2, 'the finding points at the line a human can see');
});

// --- `check` and `altFrom`, the two entry points the import uses -------------
// `diagram-golden.test.js` proves `check` over the fixtures; these state the
// CODE it reports and the two cases no fixture can reach.

test('AGSC-04-02: a stale SVG is reported as AGSC-E602, and never rewritten', () => {
  const source = 'canvas 200 120\nlabel "T"\nbox a 20 20 80 40 "a" acc\n';
  const fresh = diagrams.compile(source, { slug: 'x' }).svg;
  const checked = diagrams.check(source, `${fresh}<!-- edited -->`,
    { slug: 'x', file: 'content/diagrams/x.diagram' });
  assert.strictEqual(checked.stale, true);
  assert.deepStrictEqual(checked.findings.map((f) => [f.code, f.file]),
    [['AGSC-E602', 'content/diagrams/x.diagram']]);
  assert.strictEqual(checked.svg, fresh, 'check still answers with what the source compiles to');
});

test('a source that does not compile is stale, with the compiler\'s own findings', () => {
  const checked = diagrams.check('box a 0 0 10 10\n', '<svg/>', { slug: 'x' });
  assert.strictEqual(checked.stale, true);
  assert.strictEqual(checked.svg, null);
  assert.deepStrictEqual(checked.findings.map((f) => f.code), ['AGSC-E412']);
});

test('AGSC-02-13: `altFrom` is total — it never answers with the empty string', () => {
  assert.strictEqual(diagrams.altFrom('canvas 100 100\n', { slug: 'empty' }), 'empty diagram.');
  assert.strictEqual(diagrams.altFrom('label "A name"\nbox a 1 1 2 2 "" acc\n', { slug: 'x' }), 'A name.');
  assert.strictEqual(
    diagrams.altFrom('canvas 400 260\nlabel "A name"\nbox a 20 20 80 40 "a" acc\nnote "a note"\n', { slug: 'x' }),
    'A name. a note');
  assert.strictEqual(diagrams.altFrom('', {}), 'diagram diagram.');
});

test('AGSC-02-98: the accent is a class AND a presentation attribute, never CSS alone', () => {
  const svg = diagrams.compile('canvas 200 120\nbox a 20 20 80 40 "a" acc\n', { slug: 'x' }).svg;
  assert.strictEqual(svg.split(`class="${diagrams.ACCENT_CLASS}"`).length - 1, 1);
  assert.ok(svg.includes(`class="${diagrams.ACCENT_CLASS}" stroke-width="${diagrams.ACCENT_STROKE_WIDTH}"`));
  assert.ok(!svg.includes('<style'), 'an attachment cannot be styled from outside (AGSC-E412)');
});
