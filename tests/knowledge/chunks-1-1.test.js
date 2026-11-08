'use strict';
// The chunk record of 1.1 beyond chk-0009…chk-0016: the `abstract`, `license_url` and
// `content_digest` members (AGSC-06-29, AGSC-06-44), the text that never begins with a
// line feed (AGSC-06-45), the count and set commitment of the chunks surface link
// (AGSC-06-44), and a reader of 1.0 that ignores the new members (AGSC-00-21).

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fc = require('fast-check');
const chunks = require('../../src/knowledge/chunks.js');

const BASE = 'https://a.example/';
const CONCEPT = (body, extra = {}) => ({ type: 'concept', slug: 'c', title: 'C', body, ...extra });
const recordsOf = (items, options = {}) => chunks.records(items, { base: BASE, ...options }).records;

/** The members of a chunk line at 1.0 (AGSC-06-29 before its 1.1 amendment). */
const MEMBERS_1_0 = ['digest', 'id', 'iri', 'item', 'kind', 'license', 'links', 'ordinal', 'section', 'subkind',
  'terms', 'text', 'title', 'trust', 'type'];

test('every chunk of an item with a description carries it as abstract, unchanged (AGSC-06-29)', () => {
  const description = '  Routes work — to workers.  ';
  const list = recordsOf([CONCEPT('Intro.\n\n## A\n\nText.\n', { description })]);
  assert.equal(list.length, 2);
  for (const record of list) assert.equal(record.abstract, description);
});

test('no abstract where the description is absent or empty (AGSC-06-29)', () => {
  for (const extra of [{}, { description: '' }]) {
    for (const record of recordsOf([CONCEPT('Intro.\n', extra)])) assert.equal('abstract' in record, false);
  }
});

test('license_url is the node\'s licence URL on every chunk, and absent when there is none (AGSC-06-44)', () => {
  const url = 'https://creativecommons.org/licenses/by/4.0/';
  for (const record of recordsOf([CONCEPT('A.\n\n## B\n\nC.\n')], { licenseUrl: url })) assert.equal(record.license_url, url);
  for (const record of recordsOf([CONCEPT('A.\n')], { licenseUrl: null })) assert.equal('license_url' in record, false);
});

test('content_digest is written only on the switch, and names the hash digest names (AGSC-06-29)', () => {
  const [off] = recordsOf([CONCEPT('A.\n')]);
  assert.equal('content_digest' in off, false);
  const [on] = recordsOf([CONCEPT('A.\n')], { contentDigest: true });
  const hex = Buffer.from(on.content_digest.slice('sha-256=:'.length, -1), 'base64').toString('hex');
  assert.equal(hex, on.digest);
});

test('chunk 0 starts at its first line that is not blank; U+00A0 is not blank (AGSC-06-45)', () => {
  assert.equal(recordsOf([CONCEPT('\n \t\n\nIntro.\n\n## A\n\nText.\n')])[0].text, 'Intro.\n');
  assert.equal(recordsOf([CONCEPT('\u00a0\nIntro.\n')])[0].text, '\u00a0\nIntro.\n');
  assert.equal(recordsOf([CONCEPT('Intro.\n\n\nMore.\n')])[0].text, 'Intro.\n\n\nMore.\n', 'blank lines inside stay');
});

test('fromFirstLine, as src/REFERENCE.md gives it: the text from its first line that is not blank (AGSC-06-45)', () => {
  assert.equal(chunks.fromFirstLine('\n \t\n\nIntro.\n\nMore.\n'), 'Intro.\n\nMore.\n', 'leading blank lines go, inner ones stay');
  assert.equal(chunks.fromFirstLine('Intro.\n'), 'Intro.\n', 'a text that starts on a line with text is unchanged');
  assert.equal(chunks.fromFirstLine(' \nIntro.\n'), ' \nIntro.\n', 'U+00A0 is not blank');
  assert.equal(chunks.fromFirstLine('\n \t\n'), '', 'a text of blank lines only is the empty string');
  assert.equal(chunks.fromFirstLine(''), '');
});

test('a piece that Cut 2 starts on a blank line starts after it, and the ids do not move (AGSC-06-45)', () => {
  // After the paragraph boundary comes a line of one space: in 1.0 the second piece began
  // with that blank line.
  const body = `${'a'.repeat(10)}\n\n \n${'b'.repeat(10)}\n`;
  const list = recordsOf([CONCEPT(body)], { maxBytes: 14 });
  assert.deepEqual(list.map((r) => r.text), [`${'a'.repeat(10)}\n`, `${'b'.repeat(10)}\n`]);
  assert.deepEqual(list.map((r) => r.id), [0, 1].map((n) => chunks.chunkId(`${BASE}concepts/c/`, '', n)));
});

test('property: no text begins with a line feed or is empty, and the chunks of a body are deterministic', () => {
  fc.assert(fc.property(fc.stringMatching(/^[a#b \t\n]{0,300}$/u), fc.integer({ min: 8, max: 64 }), (body, maxBytes) => {
    const list = recordsOf([CONCEPT(body)], { maxBytes });
    for (const record of list) {
      assert.ok(record.text !== '' && !record.text.startsWith('\n'), JSON.stringify(record.text));
      assert.ok(!/^[ \t]*\n/u.test(record.text), `a blank first line: ${JSON.stringify(record.text)}`);
    }
    assert.deepEqual(recordsOf([CONCEPT(body)], { maxBytes }), list);
  }), { numRuns: 300, seed: 20261107 });
});

test('the count and the set commitment of the chunks surface (AGSC-06-44)', () => {
  const list = recordsOf([CONCEPT('A.\n\n## B\n\nC.\n')]);
  const expected = crypto.createHash('sha256').update(list.map((r) => `${r.id}\n`).join('')).digest('base64');
  assert.deepEqual(chunks.commitment(list), { count: '2', set: `sha-256=:${expected}:` });
  assert.deepEqual(chunks.commitment([]), { count: '0', set: 'sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:' });
});

test('property: the commitment finds a dropped, an added or a moved line', () => {
  const list = recordsOf(['a', 'b', 'c', 'd'].map((slug) => ({ ...CONCEPT(`${slug}.\n\n## X\n\nY.\n`), slug })));
  const whole = chunks.commitment(list).set;
  fc.assert(fc.property(fc.integer({ min: 0, max: list.length - 1 }), fc.integer({ min: 1, max: list.length - 1 }), (i, j) => {
    assert.notEqual(chunks.commitment(list.filter((_, k) => k !== i)).set, whole);
    assert.notEqual(chunks.commitment([...list, list[i]]).set, whole);
    const moved = [...list];
    [moved[0], moved[j]] = [moved[j], moved[0]];
    assert.notEqual(chunks.commitment(moved).set, whole);
  }), { numRuns: 50, seed: 20261107 });
});

test('a reader of 1.0 ignores the new members: the 1.0 members keep their values (AGSC-00-21)', () => {
  const item = CONCEPT('Intro.\n\n## A\n\nText.\n', { description: 'D.', kind: 'pattern' });
  const plain = recordsOf([{ ...item, description: undefined }]);
  const full = recordsOf([item], { contentDigest: true, licenseUrl: 'https://a.example/legal/' });
  full.forEach((record, i) => {
    const kept = Object.fromEntries(Object.entries(record).filter(([key]) => MEMBERS_1_0.includes(key)));
    assert.deepEqual(kept, plain[i]);
    // What a 1.0 reader checks — the digest over the text, the id over IRI, section and ordinal — still holds.
    assert.equal(record.digest, chunks.digestOf(record.text));
    assert.equal(record.id, chunks.chunkId(record.iri, record.section, record.ordinal));
  });
  // The citation record a tool gives (AGSC-09-13) reads no abstract and no content_digest.
  const cite = chunks.citationRecord(full[0], 'v1');
  assert.equal('abstract' in cite || 'content_digest' in cite, false);
  assert.equal(cite.license_url, 'https://a.example/legal/');
});
