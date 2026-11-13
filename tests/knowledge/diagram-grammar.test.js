'use strict';
// Requirement: PRD-077 (docs/PRD.md).
// tests/knowledge/diagram-grammar.test.js — the diagram grammar of AGSC-01-42, one
// statement at a time, byte for byte.
//
// The conformance cases bundle-0018 (all twelve statements in one source) and
// bundle-0019 (the `rel=KEY` token) pin the grammar as a whole. This suite gives each
// statement its own small source and the exact document the rule derives for it, so a
// change to one statement's bytes names that statement. The document frame below is
// written from the rule's paragraph "The document", not from the compiler, and every
// draw and text element is spelled out by hand from the rule's table "Elements".
// It also holds the refusals 1.1 adds (`acc` with `thick`, a `rel=` value that is no
// Link key), the line each refusal names, and two properties of the `rel` token: it
// adds one class and changes no other byte, and it never lets a value into the page
// that is not one of the fourteen keys.

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');

const diagrams = require('../../src/knowledge/diagrams.js');
const { LINK_KEYS } = require('../../src/knowledge/relations.js');
const { svgViolations } = require('../../src/governance/lint.js');

const SLUG = 's';
const MARK = `url(#${SLUG}-arrow)`;
/**
 * The accent box most examples carry, since a source needs exactly one `acc`. It has a
 * label: a box's fifth argument is its text, so `acc` written there would be the label.
 */
const ACCENT = 'box k 10 10 40 20 "K" acc';
const ACCENT_RECT = '<rect x="10" y="10" width="40" height="20" rx="6" class="agsc-accent" stroke-width="2.2"/>';
const ACCENT_TEXT = '<text x="30" y="24" font-size="12">K</text>';

/** The document of AGSC-01-42 around the draw and text elements of one source. */
function documentOf({ width = 460, height = 260, label = `${SLUG} diagram`, note = null, draw = [], texts = [] }) {
  const desc = note === null ? `${label}. A line drawing; the highlighted element carries the accent.` : note;
  const block = (elements) => (elements.length === 0 ? ['    '] : elements.map((e) => `    ${e}`));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${SLUG}-title ${SLUG}-desc" font-family="system-ui, sans-serif" font-size="14">`,
    `  <title id="${SLUG}-title">${label}</title>`,
    `  <desc id="${SLUG}-desc">${desc}</desc>`,
    `  <defs><marker id="${SLUG}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>`,
    '  <g fill="none" stroke="currentColor" stroke-width="1.5">',
    ...block(draw),
    '  </g>',
    '  <g fill="currentColor" text-anchor="middle">',
    ...block(texts),
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

/** Compile a source for the slug of this suite; the caller states what it expects. */
function compiled(lines) {
  return diagrams.compile(`${lines.join('\n')}\n`, { slug: SLUG });
}

/** Refuse a source: no SVG, only AGSC-E412, and the lines the findings name. */
function refusedAt(lines) {
  const result = compiled(lines);
  assert.equal(result.svg, null, 'a refused source must emit no SVG');
  assert.deepEqual([...new Set(result.findings.map((f) => f.code))], ['AGSC-E412']);
  return result.findings.map((f) => f.line);
}

/** One example per statement of AGSC-01-42, with the document the rule derives for it. */
const EXAMPLES = [
  {
    statement: 'canvas',
    source: ['canvas 300 120', ACCENT],
    expected: { width: 300, height: 120, draw: [ACCENT_RECT], texts: [ACCENT_TEXT] },
  },
  {
    statement: 'label',
    source: ['label "First"', 'label "Second <one>"', ACCENT],
    expected: { label: 'Second &lt;one&gt;', draw: [ACCENT_RECT], texts: [ACCENT_TEXT] },
  },
  {
    statement: 'box',
    source: ['box a 100 60 200 40 "Twenty-three characters" acc dashed'],
    expected: {
      draw: ['<rect x="100" y="60" width="200" height="40" rx="6" class="agsc-accent" stroke-width="2.2" stroke-dasharray="4 3"/>'],
      texts: ['<text x="200" y="84" font-size="11">Twenty-three characters</text>'],
    },
  },
  {
    statement: 'circle',
    source: ['circle c 100 100 30 "Store|DB" acc dashed'],
    expected: {
      draw: ['<circle cx="100" cy="100" r="30" class="agsc-accent" stroke-width="2.2" stroke-dasharray="4 3"/>'],
      texts: ['<text x="100" y="96.5" font-size="11">Store</text>', '<text x="100" y="111.5" font-size="11">DB</text>'],
    },
  },
  {
    statement: 'region',
    source: [ACCENT, 'region z 60 50 200 100 "Zone"'],
    expected: {
      draw: [ACCENT_RECT, '<rect x="60" y="50" width="200" height="100" rx="8" stroke-dasharray="6 4"/>'],
      texts: [ACCENT_TEXT, '<text x="160" y="42" font-size="11">Zone</text>'],
    },
  },
  {
    statement: 'arrow',
    source: ['box a 20 100 60 40 "A"', 'box b 200 100 60 40 "B"', 'arrow a b both dashed acc rel=uses'],
    expected: {
      draw: ['<rect x="20" y="100" width="60" height="40" rx="6"/>',
        '<rect x="200" y="100" width="60" height="40" rx="6"/>',
        `<path d="M84 120 L196 120" marker-end="${MARK}" marker-start="${MARK}" stroke-dasharray="4 3" class="agsc-accent agsc-rel-uses" stroke-width="2.2"/>`],
      texts: ['<text x="50" y="124" font-size="12">A</text>', '<text x="230" y="124" font-size="12">B</text>'],
    },
  },
  {
    statement: 'line',
    source: [ACCENT, 'line 20 200 300 200 dashed thick rel=requires'],
    expected: {
      draw: [ACCENT_RECT, '<path d="M20 200 L300 200" class="agsc-rel-requires" stroke-dasharray="6 5" stroke-width="5"/>'],
      texts: [ACCENT_TEXT],
    },
  },
  {
    statement: 'path',
    source: ['path "M10 50 Q50 10 90 50" arrow acc dashed'],
    expected: { draw: [`<path d="M10 50 Q50 10 90 50" marker-end="${MARK}" class="agsc-accent" stroke-width="2.2" stroke-dasharray="4 3"/>`] },
  },
  {
    statement: 'text',
    source: [ACCENT, 'text 20 150 "R&D <x>" left rel=derived-from', 'text 300 170 "Right" size=13.04 right'],
    expected: {
      draw: [ACCENT_RECT],
      texts: [ACCENT_TEXT, '<text x="20" y="150" font-size="11" text-anchor="start" class="agsc-rel-derived-from">R&amp;D &lt;x&gt;</text>',
        '<text x="300" y="170" font-size="13" text-anchor="end">Right</text>'],
    },
  },
  {
    statement: 'cross',
    source: [ACCENT, 'cross 100 100'],
    expected: { draw: [ACCENT_RECT, '<path d="M92 92 L108 108 M108 92 L92 108" stroke-width="2"/>'], texts: [ACCENT_TEXT] },
  },
  {
    statement: 'note',
    source: [ACCENT, 'note "First note."', 'note "Short note."'],
    expected: {
      note: 'Short note.',
      draw: [ACCENT_RECT],
      texts: [ACCENT_TEXT, '<text x="230" y="248" font-size="11">First note.</text>', '<text x="230" y="248" font-size="11">Short note.</text>'],
    },
  },
  {
    statement: 'bar',
    source: [ACCENT, 'bar -0.04 80 100.29 thick', 'bar 50 120 10'],
    expected: {
      draw: [ACCENT_RECT, '<path d="M0 80 L100.3 80" stroke-width="5"/>', '<path d="M50 120 L60 120"/>'],
      texts: [ACCENT_TEXT],
    },
  },
];

test('AGSC-01-42: the examples name each of the twelve statements once', () => {
  assert.deepEqual(EXAMPLES.map((e) => e.statement).sort(), [...diagrams.STATEMENTS].sort());
});

for (const example of EXAMPLES) {
  test(`AGSC-01-42: \`${example.statement}\` compiles to the bytes the rule derives`, () => {
    const result = compiled(example.source);
    assert.deepEqual(result.findings, []);
    assert.equal(result.svg, documentOf(example.expected));
    assert.deepEqual(svgViolations(result.svg), []);
  });
}

test('AGSC-01-42: `rel=KEY` on an arrow without the accent is the whole class attribute', () => {
  const result = compiled(['box a 20 20 60 30 "A" acc', 'box b 120 20 60 30 "B"', 'arrow a b dashed rel=blocked-by']);
  assert.ok(result.svg.includes(`<path d="M84 35 L116 35" marker-end="${MARK}" stroke-dasharray="4 3" class="agsc-rel-blocked-by"/>`));
});

test('AGSC-01-42: `rel=KEY` with the accent on a line is one class attribute, the accent first', () => {
  const result = compiled(['line 10 10 50 50 acc dashed rel=covers']);
  assert.ok(result.svg.includes('<path d="M10 10 L50 50" class="agsc-accent agsc-rel-covers" stroke-width="2.2" stroke-dasharray="6 5"/>'));
});

test('AGSC-01-42: every one of the fourteen Link keys is a class, and nothing else is', () => {
  for (const key of LINK_KEYS) {
    const result = compiled([ACCENT, `text 200 100 "k" rel=${key}`]);
    assert.ok(result.svg.includes(` class="agsc-rel-${key}">k</text>`), key);
  }
  for (const value of ['friend', 'Uses', 'uses ', '', 'agsc-accent', '"><script>alert(1)</script>', 'domain:owns']) {
    assert.deepEqual(refusedAt([ACCENT, `text 200 100 "k" "rel=${value}"`]), [2], JSON.stringify(value));
  }
});

test('AGSC-01-42: REL_CLASS_PREFIX, as src/REFERENCE.md names it, is the prefix of every rel class', () => {
  assert.equal(diagrams.REL_CLASS_PREFIX, 'agsc-rel-');
  const result = compiled([ACCENT, 'line 20 200 300 200 rel=uses', 'text 20 150 "t" rel=covers']);
  const classes = [...result.svg.matchAll(/class="([^"]+)"/gu)].flatMap((m) => m[1].split(' '))
    .filter((c) => c !== 'agsc-accent');
  assert.deepEqual(classes, [`${diagrams.REL_CLASS_PREFIX}uses`, `${diagrams.REL_CLASS_PREFIX}covers`]);
});

test('AGSC-01-42: a `rel=` value that is no Link key is refused on arrow, line and text, naming its line', () => {
  assert.deepEqual(refusedAt(['box a 20 20 60 30 "A" acc', 'box b 120 20 60 30 "B"', 'arrow a b rel=friend']), [3]);
  assert.deepEqual(refusedAt([ACCENT, 'line 10 100 50 100 rel=friend']), [2]);
  assert.deepEqual(refusedAt([ACCENT, 'text 100 100 "k" rel=friend']), [2]);
  const finding = compiled([ACCENT, 'line 10 100 50 100 rel=friend']).findings[0];
  assert.match(finding.message, /rel=friend/u);
  assert.match(finding.message, /AGSC-01-42/u);
});

test('AGSC-01-42: every `rel=` token of a statement is checked, not only the first', () => {
  const boxes = ['box a 20 20 60 30 "A" acc', 'box b 120 20 60 30 "B"'];
  assert.deepEqual(refusedAt([...boxes, 'arrow a b rel=uses rel=bogus']), [3]);
  assert.deepEqual(refusedAt([...boxes, 'arrow a b rel=bogus rel=uses']), [3]);
  assert.deepEqual(refusedAt([ACCENT, 'line 10 100 50 100 rel=covers rel="><x>']), [2]);
  // Two known keys: the first is the class, as with every other repeated token.
  const result = compiled([...boxes, 'arrow a b rel=uses rel=requires']);
  assert.deepEqual(result.findings, []);
  assert.ok(result.svg.includes(' class="agsc-rel-uses"/>'));
  assert.equal(result.svg.includes('agsc-rel-requires'), false);
});

test('AGSC-01-42: `rel=` is a token of arrow, line and text only; a box reads it as its label text', () => {
  const result = compiled(['box a 20 20 120 30 rel=uses acc']);
  assert.ok(result.svg.includes('<text x="80" y="39" font-size="12">rel=uses</text>'));
  assert.equal(result.svg.includes('agsc-rel-'), false);
});

test('AGSC-01-42: `acc` with `thick` on one statement is refused, naming its line', () => {
  assert.deepEqual(refusedAt(['box a 100 100 20 20 "A" acc', 'line 10 10 50 50 acc thick']), [2]);
  assert.match(compiled(['line 10 10 50 50 thick acc']).findings[0].message, /acc.*thick/u);
});

test('AGSC-01-42: a `via` that is not a list of number pairs is refused, naming its line', () => {
  const two = ['box a 20 20 60 30 "A" acc', 'box b 200 20 60 30 "B"'];
  assert.deepEqual(refusedAt([...two, 'arrow a b via=100,90,5']), [3]);
  assert.deepEqual(refusedAt([...two, 'arrow a b via=100,90;140']), [3]);
  assert.match(compiled([...two, 'arrow a b via=100,90,5']).findings[0].message, /number pairs/u);
  assert.deepEqual(compiled([...two, 'arrow a b via=100,90;140,90']).findings, []);
});

test('AGSC-01-42: the accent count names the line of the second accent, or line 1 when there is none', () => {
  assert.deepEqual(refusedAt(['box a 1 1 10 10 acc', 'canvas 100 100', 'box b 50 50 10 10 acc']), [3]);
  assert.deepEqual(refusedAt(['box a 1 1 10 10']), [1]);
});

test('AGSC-01-42: an overlap and the note band name the line of the shape that breaks them', () => {
  assert.deepEqual(refusedAt([ACCENT, '# a comment', 'box b 20 15 40 20']), [3]);
  assert.deepEqual(refusedAt([ACCENT, 'box low 100 230 40 10', 'note "n"']), [2]);
});

/** A small source with one statement that may carry `rel=KEY`, and an accent elsewhere. */
const withRel = () => fc.tuple(
  fc.constantFrom('arrow', 'line', 'text'),
  fc.constantFrom(...LINK_KEYS),
  fc.integer({ min: 0, max: 100 }),
  fc.boolean(),
  fc.boolean(),
).map(([statement, key, offset, dashed, wantAccent]) => {
  const accented = wantAccent && statement !== 'text'; // a text takes no `acc`
  const flags = `${dashed ? ' dashed' : ''}${accented ? ' acc' : ''}`;
  const lines = [`box a 20 ${20 + offset} 60 30 "A"${accented ? '' : ' acc'}`, `box b 200 ${20 + (100 - offset)} 60 30 "B"`];
  if (statement === 'arrow') lines.push(`arrow a b${flags}`);
  if (statement === 'line') lines.push(`line 10 200 ${100 + offset} 210${flags}`);
  if (statement === 'text') lines.push(`text 300 ${100 + offset} "label"${dashed ? ' left' : ''}`);
  return { key, plain: `${lines.join('\n')}\n`, accented };
});

test('property: `rel=KEY` adds its class and changes no other byte', () => {
  fc.assert(fc.property(withRel(), ({ key, plain, accented }) => {
    const before = diagrams.compile(plain, { slug: SLUG });
    const after = diagrams.compile(plain.replace(/\n$/u, ` rel=${key}\n`), { slug: SLUG });
    assert.deepEqual(after.findings, []);
    const added = accented ? ` agsc-rel-${key}` : ` class="agsc-rel-${key}"`;
    assert.equal(after.svg.split(added).length, 2, 'the class is written once');
    assert.equal(after.svg.replace(added, ''), before.svg);
    assert.deepEqual(svgViolations(after.svg), []);
  }), { numRuns: 300, seed: 42 });
});

test('property: compiling a source with `rel=KEY` twice gives the same bytes', () => {
  fc.assert(fc.property(withRel(), ({ key, plain }) => {
    const text = plain.replace(/\n$/u, ` rel=${key}\n`);
    assert.equal(diagrams.compile(text, { slug: SLUG }).svg, diagrams.compile(text, { slug: SLUG }).svg);
  }), { numRuns: 100, seed: 42 });
});
