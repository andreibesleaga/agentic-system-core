'use strict';
// AGSC-02-10 — the old `references[]` become the one citation array, `sources[]`.
// The rules under test: `resource` is REQUIRED and follows the schema's grammar;
// a malformed `year` or `verified` is DROPPED rather than emitted invalid; the
// array has an ORDER and `grade` is what makes that order a claim; and the
// member order is the schema's, because AGSC-04-19 pins it.

const test = require('node:test');
const assert = require('node:assert');

const sources = require('../../src/interchange/sources.js');

test('a full entry maps member by member, in the schema order', () => {
  const { source, findings } = sources.one({
    label: 'A title', url: 'https://example.org/a', org: 'An author', year: 2024, verified: '2026-01-01',
  }, { index: 0, grade: 'primary' });
  assert.deepStrictEqual(findings, []);
  assert.deepStrictEqual(Object.keys(source), ['resource', 'title', 'author', 'year', 'verified', 'grade']);
  assert.deepStrictEqual(source, {
    resource: 'https://example.org/a', title: 'A title', author: 'An author',
    year: '2024', verified: '2026-01-01', grade: 'primary',
  });
});

test('AGSC-02-10: an entry with no resource is AGSC-E202 and is dropped', () => {
  const { source, findings } = sources.one({ label: 'No URL' }, { index: 3 });
  assert.strictEqual(source, null);
  assert.deepStrictEqual(findings.map((f) => f.code), ['AGSC-E202']);
  assert.match(findings[0].message, /sources\[3\] carries no resource/u);
  assert.strictEqual(sources.one(undefined, { index: 0 }).source, null);
});

test('AGSC-02-10: a resource outside the grammar is AGSC-E204 and is dropped', () => {
  for (const url of ['mailto:a@example.org', 'ftp://example.org/x', 'https://exa mple.org/x', 'not a url']) {
    const { source, findings } = sources.one({ url }, { index: 0 });
    assert.strictEqual(source, null, url);
    assert.deepStrictEqual(findings.map((f) => f.code), ['AGSC-E204'], url);
  }
  // The channel form of AGSC-01-33 is inside the grammar.
  assert.ok(sources.one({ url: 'urn:agsc:channel:inbox:abc' }, { index: 0 }).source !== null);
  assert.ok(sources.one({ url: 'http://example.org/x' }, { index: 0 }).source !== null);
});

test('a malformed year or verified date is a WARNING and the member is dropped', () => {
  const { source, findings } = sources.one({
    url: 'https://example.org/a', year: '24', verified: 'last Tuesday',
  }, { index: 0 });
  assert.deepStrictEqual(findings.map((f) => [f.code, f.severity]), [['AGSC-E204', 'warn'], ['AGSC-E204', 'warn']]);
  assert.strictEqual(source.year, undefined);
  assert.strictEqual(source.verified, undefined);
  assert.strictEqual(source.resource, 'https://example.org/a', 'the entry itself survives');
});

test('an empty label, org, year or verified adds no member at all', () => {
  const { source } = sources.one({ url: 'https://example.org/a', label: '', org: '', year: '', verified: '' },
    { index: 0 });
  assert.deepStrictEqual(Object.keys(source), ['resource', 'grade']);
});

test('AGSC-02-10: the FIRST surviving entry is `primary`, the rest `secondary`', () => {
  const { sources: list, findings } = sources.map([
    { label: 'gone', org: 'x' },
    { url: 'https://example.org/first' },
    { url: 'https://example.org/second' },
  ]);
  assert.deepStrictEqual(findings.map((f) => f.code), ['AGSC-E202']);
  assert.deepStrictEqual(list.map((s) => [s.resource, s.grade]), [
    ['https://example.org/first', 'primary'],
    ['https://example.org/second', 'secondary'],
  ]);
});

test('`promote` reorders and never invents; an unknown URL is simply not found', () => {
  const { sources: list } = sources.map([
    { url: 'https://example.org/own' },
    { url: 'https://example.org/authority' },
  ], { promote: ['https://example.org/authority', 'https://example.org/absent'] });
  assert.deepStrictEqual(list.map((s) => [s.resource, s.grade]), [
    ['https://example.org/authority', 'primary'],
    ['https://example.org/own', 'secondary'],
  ]);
});

test('`add` appends further entries, and a malformed added entry is reported', () => {
  const { sources: list, findings } = sources.map([{ url: 'https://example.org/a' }], {
    add: [{ url: 'https://example.org/b', label: 'Added' }, { label: 'no url' }],
  });
  assert.deepStrictEqual(list.map((s) => s.resource), ['https://example.org/a', 'https://example.org/b']);
  assert.deepStrictEqual(findings.map((f) => f.code), ['AGSC-E202']);
});

test('map() over nothing is an empty array, never a fault', () => {
  assert.deepStrictEqual(sources.map(undefined), { sources: [], findings: [] });
  assert.deepStrictEqual(sources.map('not a list').sources, []);
});

test('referenceList(): the dotted-key object becomes an array in numeric order', () => {
  const record = Object.create(null);
  record.references = Object.create(null);
  record.references['10'] = { url: 'https://example.org/ten' };
  record.references['2'] = { url: 'https://example.org/two' };
  record.references.notANumber = { url: 'https://example.org/skip' };
  assert.deepStrictEqual(sources.referenceList(record).map((r) => r.url),
    ['https://example.org/two', 'https://example.org/ten']);
  assert.deepStrictEqual(sources.referenceList({ references: [{ url: 'a' }, null] }).map((r) => r.url), ['a']);
  assert.deepStrictEqual(sources.referenceList({}), []);
  assert.deepStrictEqual(sources.referenceList(undefined), []);
});

test('the grammars are the schema\'s, and carry no literal control character', () => {
  assert.ok(sources.RESOURCE.test('https://example.org/a'));
  assert.ok(!sources.RESOURCE.test('https://example.org/a b'));
  assert.ok(sources.YEAR.test('2024') && !sources.YEAR.test('24'));
  assert.ok(sources.DATE.test('2026-01-01') && !sources.DATE.test('2026-1-1'));
  assert.ok(!/\u0000/u.test(sources.RESOURCE.source.replace(/\\u0000/gu, '')),
    'the source must spell the escape, never the character');
});
