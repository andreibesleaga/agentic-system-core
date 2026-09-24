'use strict';
// AGSC-01-22 / AGSC-02 — the field mapping table, old key by old key.
//
// The claim the table makes is that EVERY foreign key is accounted for: mapped,
// renamed, folded, moved into the vendor namespace, or dropped with a reason.
// The first test below is that claim, checked mechanically against the fixture
// corpus rather than asserted in prose.
//
// The two rules with teeth are AGSC-03-02/AGSC-11-12 (a Link value naming no
// imported item is DROPPED and never rewritten as a URL, because a URL-valued
// Link is AGSC-E311 and makes the file invalid) and AGSC-04-19 (the emitted key
// order is the schema's).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mapping = require('../../src/interchange/mapping.js');
const oldsite = require('../../src/interchange/oldsite.js');

const CARDS = path.resolve(__dirname, '..', 'fixtures', 'old-site-10', 'content', 'patterns');
const PROV = Object.freeze({ origin: 'imported', operator: 'human:tester' });

function card(name) {
  return oldsite.readCard({
    path: `content/patterns/${name}.md`,
    markdown: fs.readFileSync(path.join(CARDS, `${name}.md`), 'utf8'),
  });
}

function mapOne(name, options = {}) {
  return mapping.mapCard(card(name), { inSet: new Set(['alpha-one', 'beta-one']), prov: PROV, ...options });
}

test('every foreign key of the fixture corpus is accounted for by the table', () => {
  const seen = new Set();
  for (const file of fs.readdirSync(CARDS)) {
    for (const key of card(file.replace(/\.md$/u, '')).keys) seen.add(key.split('.')[0]);
  }
  const unaccounted = [...seen].filter((k) => !mapping.KNOWN_OLD_KEYS.includes(k)).sort();
  // The fixture carries exactly one deliberately unknown key, to prove the
  // vendor-namespace path; anything else means the table has fallen behind.
  assert.deepStrictEqual(unaccounted, ['inventedKey']);
});

test('the fully-populated card maps every member of the table', () => {
  const mapped = mapOne('alpha-one');
  const fm = mapped.frontmatter;
  assert.strictEqual(mapped.path, 'content/concepts/alpha-one.md');
  assert.strictEqual(fm.type, 'concept');
  assert.strictEqual(fm.kind, 'pattern');
  assert.strictEqual(fm.title, 'Alpha One');
  assert.match(fm.description, /^A record that carries every key/u);
  assert.strictEqual(fm.status, 'stable');
  assert.strictEqual(fm.release, 'batch-one');
  assert.deepStrictEqual(fm.tags, ['alpha', 'mapping']);
  assert.deepStrictEqual(fm.aliases, ['a-one', 'the first']);
  assert.deepStrictEqual(fm.clusters, ['alpha']);
  assert.strictEqual(fm.date, '2026-01-01');
  assert.strictEqual(fm.modified, '2026-02-01');
  assert.deepStrictEqual(fm.prov, PROV);
  assert.strictEqual(fm.id, 'alpha-one');
  assert.deepStrictEqual(fm.related, ['beta-one'], 'the out-of-set value and the self-link are gone');
  assert.strictEqual(fm.evidence, 'explicit');
  assert.strictEqual(fm.maturity, 'established');
  assert.strictEqual(fm.mapping, 'explicit');
  assert.deepStrictEqual(fm.domains, ['general', 'testing']);
  assert.deepStrictEqual(fm.modality, ['text']);
  assert.deepStrictEqual(fm.deployment, ['server']);
  assert.deepStrictEqual(fm.implementations, [{ label: 'A reference implementation', url: 'https://example.org/impl' }]);
  assert.strictEqual(fm.sources.length, 2);
  assert.strictEqual(fm.sources[0].grade, 'primary');
  // AGSC-02-13: `diagram.file` is rewritten to `<slug>.svg` and the rewrite reported.
  assert.strictEqual(fm.diagram.file, 'alpha-one.svg');
  assert.strictEqual(fm.diagram.caption, 'The two parts and the one arrow between them.');
  assert.ok(mapped.findings.some((f) => f.code === 'AGSC-E204' && /alpha-one-old\.svg/u.test(f.message)));
  // AGSC-02-05a: the vendor namespace, verbatim.
  assert.strictEqual(fm['x-oldsite-subdeck'], 'First Things');
  assert.deepStrictEqual(fm['x-oldsite-owasp-ids'], ['ASI01', 'LLM01'],
    'the 2025 agentic ids do not fit the owasp_ids pattern and are never coerced into it');
  assert.strictEqual(fm.owasp_ids, undefined);
  assert.deepStrictEqual(mapped.releaseKeys, ['batch-one']);
});

test('AGSC-04-19: the emitted frontmatter is in the schema\'s key order', () => {
  const keys = Object.keys(mapOne('alpha-one').frontmatter);
  const position = (k) => keys.indexOf(k);
  assert.strictEqual(keys[0], 'type');
  assert.ok(position('title') < position('description'));
  assert.ok(position('description') < position('status'));
  assert.ok(position('sources') < position('prov'));
  assert.ok(position('prov') < position('related'));
  assert.ok(position('related') < position('kind'), 'the branch keys come after the top-level ones');
  assert.ok(position('kind') < position('diagram'));
  assert.ok(position('diagram') < position('x-oldsite-owasp-ids'), 'an unknown key comes last');
  assert.ok(position('x-oldsite-owasp-ids') < position('x-oldsite-subdeck'), 'unknown keys in code-point order');
});

test('AGSC-03-02 / AGSC-11-12: an out-of-set `related` value is DROPPED, never a URL', () => {
  const result = mapping.filterLinks(['beta-one', 'not-chosen', 'Not A Slug', '', 'beta-one'],
    new Set(['beta-one']), { key: 'related', slug: 'alpha-one' });
  assert.deepStrictEqual(result.values, ['beta-one']);
  assert.deepStrictEqual(result.dropped, ['not-chosen', 'Not A Slug']);
  assert.deepStrictEqual(result.findings.map((f) => [f.code, f.severity]), [['AGSC-E301', 'warn']]);
  assert.ok(!result.findings[0].message.includes('http'), 'the fix is never a URL');
  // A self-link is dropped without being called unresolved.
  assert.deepStrictEqual(mapping.filterLinks(['self'], new Set(['self']), { slug: 'self' }).values, []);
  assert.deepStrictEqual(mapping.filterLinks(undefined, new Set()).values, []);
});

test('AGSC-01-35 / AGSC-03-11: a body link is rewritten in-set and DE-LINKED out of set', () => {
  // rc.5: the rewritten form is AGSC-03-12's normal form — the form
  // `lint --fix` normalises a wikilink to — and the target must be PUBLISHED, not
  // merely selected: a draft has no route (AGSC-06-30) and a published page linking
  // one ships a 404 (AGSC-06-01).
  const result = mapping.rewriteBodyLinks(
    'See [in](/patterns/kept/) and [out](/patterns/gone/).\n', new Set(['kept']),
    { slug: 'x', publishedSet: new Set(['kept']) });
  assert.strictEqual(result.body, 'See [in](../concepts/kept.md) and out.\n');
  assert.deepStrictEqual(result.rewritten, ['kept']);
  assert.deepStrictEqual(result.delinked, ['gone']);
  assert.deepStrictEqual(result.findings.map((f) => [f.code, f.severity]), [['AGSC-E301', 'warn']]);
  assert.deepStrictEqual(mapping.rewriteBodyLinks(undefined, new Set()).body, '');
  assert.deepStrictEqual(mapping.rewriteBodyLinks('no links\n', new Set()).findings, []);
});

test('a body link to a SELECTED but HELD-BACK card is de-linked too', () => {
  const result = mapping.rewriteBodyLinks(
    'See [held](/patterns/held/) and [live](/patterns/live/).\n',
    new Set(['held', 'live']), { slug: 'x', publishedSet: new Set(['live']) });
  assert.strictEqual(result.body, 'See held and [live](../concepts/live.md).\n');
  assert.deepStrictEqual(result.rewritten, ['live']);
  assert.deepStrictEqual(result.delinked, ['held']);
  assert.match(result.findings[0].message, /held/u);
  // With no `publishedSet` the whole selected set is treated as published, which is
  // what a caller that imports nothing as a draft means.
  const all = mapping.rewriteBodyLinks(
    'See [held](/patterns/held/).\n', new Set(['held']), { slug: 'x' });
  assert.strictEqual(all.body, 'See [held](../concepts/held.md).\n');
});

test('a card with no summary, no kind and no deck reports each absence once', () => {
  const noSummary = mapOne('no-summary');
  assert.strictEqual(noSummary.frontmatter.description, undefined);
  assert.ok(noSummary.findings.some((f) => f.code === 'AGSC-E408' && /no summary/u.test(f.message)));
  const noKind = mapOne('no-kind');
  assert.strictEqual(noKind.frontmatter.kind, 'explainer');
  assert.ok(noKind.findings.some((f) => f.code === 'AGSC-E202' && /imported as explainer/u.test(f.message)));
  const noDeck = mapOne('no-deck');
  assert.strictEqual(noDeck.frontmatter.clusters, undefined);
  assert.ok(noDeck.findings.some((f) => f.code === 'AGSC-E305'));
});

test('AGSC-02-24: a description outside 40–200 code points is reported, never cut', () => {
  const long = 'x'.repeat(mapping.DESCRIPTION_MAX + 1);
  const record = Object.create(null);
  record.title = 'T';
  record.summary = long;
  record.references = [{ url: 'https://example.org/a' }];
  const mapped = mapping.mapCard({ slug: 's', record, body: '' }, { inSet: new Set(), prov: PROV });
  assert.strictEqual(mapped.frontmatter.description, long);
  assert.ok(mapped.findings.some((f) => f.code === 'AGSC-E204' && /outside AGSC-02-24/u.test(f.message)));
});

test('AGSC-01-11: an id that disagrees with the file stem loses, and is reported', () => {
  const mapped = mapOne('wrong-id');
  assert.strictEqual(mapped.frontmatter.id, 'wrong-id');
  assert.ok(mapped.findings.some((f) => f.code === 'AGSC-E206' && f.severity === 'error'));
});

test('AGSC-02-12: `signatureElements` becomes snake_case with `signature` set', () => {
  const mapped = mapOne('foreign-keys');
  assert.strictEqual(mapped.frontmatter.signature, 'true');
  assert.deepStrictEqual(mapped.frontmatter.signature_elements, ['one', 'two']);
  assert.strictEqual(mapped.frontmatter['x-oldsite-inventedkey'], 'kept verbatim');
  assert.ok(mapped.findings.some((f) => f.code === 'AGSC-E207' && /inventedKey/u.test(f.message)));
  // A scalar `signatureElements` is admitted as a one-element list.
  const record = Object.create(null);
  record.title = 'T';
  record.summary = 'A description long enough to satisfy the forty-code-point minimum of the rule.';
  record.references = [{ url: 'https://example.org/a' }];
  record.signatureElements = 'only one';
  const one = mapping.mapCard({ slug: 's', record, body: '' }, { inSet: new Set(), prov: PROV });
  assert.deepStrictEqual(one.frontmatter.signature_elements, ['only one']);
});

test('AGSC-01-20: `release` is taken from the key, else from the first `batch-*` tag', () => {
  assert.strictEqual(mapOne('foreign-keys').frontmatter.release, 'beta-release');
  assert.strictEqual(mapOne('alpha-one').frontmatter.release, 'batch-one');
  // Both present: the explicit key wins and the tag is still switchboarded.
  const record = Object.create(null);
  record.title = 'T';
  record.summary = 'A description long enough to satisfy the forty-code-point minimum of the rule.';
  record.references = [{ url: 'https://example.org/a' }];
  record.release = 'explicit';
  record.tags = ['a', 'b', 'batch-x'];
  const mapped = mapping.mapCard({ slug: 's', record, body: '' }, { inSet: new Set(), prov: PROV });
  assert.strictEqual(mapped.frontmatter.release, 'explicit');
  assert.deepStrictEqual(mapped.releaseKeys, ['explicit', 'batch-x']);
});

test('a title correction is the CALLER\'s, and no rename happens without one', () => {
  assert.strictEqual(mapOne('alpha-one').frontmatter.title, 'Alpha One');
  assert.strictEqual(mapOne('alpha-one', { title: 'A Sourced Name' }).frontmatter.title, 'A Sourced Name');
  assert.strictEqual(mapOne('alpha-one', { title: '   ' }).frontmatter.title, 'Alpha One');
});

test('a missing title is AGSC-E202 and no title member is written', () => {
  const record = Object.create(null);
  record.references = [{ url: 'https://example.org/a' }];
  const mapped = mapping.mapCard({ slug: 's', record, body: '' }, { inSet: new Set(), prov: PROV });
  assert.strictEqual(mapped.frontmatter.title, undefined);
  assert.ok(mapped.findings.some((f) => f.code === 'AGSC-E202' && /title is missing/u.test(f.message)));
});

test('a card whose citations all fail is AGSC-E202: no source survived', () => {
  const record = Object.create(null);
  record.title = 'T';
  record.summary = 'A description long enough to satisfy the forty-code-point minimum of the rule.';
  record.references = [{ label: 'no url' }];
  const mapped = mapping.mapCard({ slug: 's', record, body: '' }, { inSet: new Set(), prov: PROV });
  assert.strictEqual(mapped.frontmatter.sources, undefined);
  assert.ok(mapped.findings.some((f) => f.code === 'AGSC-E202' && /no source survived/u.test(f.message)));
});

test('the diagram alt falls back to the caller\'s, and a caption is kept only when present', () => {
  const record = Object.create(null);
  record.title = 'T';
  record.summary = 'A description long enough to satisfy the forty-code-point minimum of the rule.';
  record.references = [{ url: 'https://example.org/a' }];
  record.diagram = Object.create(null);
  record.diagram.file = 's.svg';
  const mapped = mapping.mapCard({ slug: 's', record, body: '' },
    { diagramAlt: 'A derived sentence.', inSet: new Set(), prov: PROV });
  assert.deepStrictEqual(mapped.frontmatter.diagram, { alt: 'A derived sentence.', file: 's.svg' });
  assert.ok(!mapped.findings.some((f) => /was rewritten/u.test(f.message)), 'the right file name is not a finding');
  // With neither a card `alt` nor a caller one, the slug still yields a sentence.
  const bare = mapping.mapCard({ slug: 's', record, body: '' }, { inSet: new Set(), prov: PROV });
  assert.strictEqual(bare.frontmatter.diagram.alt, 's diagram');
});

test('ordered(): an undefined member is omitted and an unknown key lands last', () => {
  const out = mapping.ordered({ zebra: '1', kind: 'pattern', type: 'concept', gone: undefined, apple: '2' });
  assert.deepStrictEqual(Object.keys(out), ['type', 'kind', 'apple', 'zebra']);
});

// ------------------------------------------------------------------

test('AGSC-02-24: neutraliseSingleLine replaces every forbidden code point, and only those', () => {
  const clean = mapping.neutraliseSingleLine({
    title: 'A Clean Title',
    tags: ['one', 'two'],
    prov: { operator: 'human:a', origin: 'imported' },
    count: 12,
    flag: true,
    nothing: null,
  });
  assert.deepStrictEqual(clean.substituted, [], 'a conforming frontmatter must not move');
  assert.strictEqual(clean.frontmatter.count, 12);
  assert.strictEqual(clean.frontmatter.flag, true);
  assert.strictEqual(clean.frontmatter.nothing, null);

  const dirty = mapping.neutraliseSingleLine({
    title: 'N\u0000UL',
    description: 'a b',
    tags: ['ok', 'b\u0085d'],
    prov: { operator: 'human:\u0007a' },
  });
  assert.strictEqual(dirty.frontmatter.title, 'N UL');
  assert.strictEqual(dirty.frontmatter.description, 'a b');
  assert.deepStrictEqual(dirty.frontmatter.tags, ['ok', 'b d']);
  assert.strictEqual(dirty.frontmatter.prov.operator, 'human: a');
  assert.deepStrictEqual(dirty.substituted.sort(),
    ['/description', '/prov/operator', '/tags/1', '/title']);
  // The input's prototype is preserved, both ways.
  const bare = Object.create(null);
  bare.title = 'x';
  assert.strictEqual(Object.getPrototypeOf(mapping.neutraliseSingleLine(bare).frontmatter), null);
  assert.strictEqual(Object.getPrototypeOf(mapping.neutraliseSingleLine({ title: 'x' }).frontmatter),
    Object.prototype);
  assert.deepStrictEqual(mapping.neutraliseSingleLine(null),
    { frontmatter: {}, substituted: [] });
});

test('AGSC-02-24: a card carrying a control character is neutralised and REPORTED', () => {
  const mapped = mapping.mapCard(
    { slug: 'ctrl', record: { id: 'ctrl', title: 'Bad\u0000Title', summary: 'x'.repeat(60) }, body: '' },
    { inSet: new Set(), prov: PROV },
  );
  assert.strictEqual(mapped.frontmatter.title, 'Bad Title');
  const reported = mapped.findings.filter((f) => f.code === 'AGSC-E506' && /single-line/u.test(f.message));
  assert.strictEqual(reported.length, 1, JSON.stringify(mapped.findings.map((f) => f.message)));
  assert.strictEqual(reported[0].severity, 'warn');
  assert.match(reported[0].message, /\/title/u);
});
