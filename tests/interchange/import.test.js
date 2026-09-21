'use strict';
// AGSC-01-22 / AGSC-01-23 — `import --from old-site` as a PLAN.
//
// `plan()` is a pure function of its inputs, so AGSC-01-23's three promises are
// properties of this suite rather than of the order a directory happened to be
// read in:
//
//   * DETERMINISTIC — the same inputs give the same bytes, and the plan is in
//     code-point path order whatever order the cards arrive in;
//   * IDEMPOTENT — a second run over unchanged input produces the same plan, and
//     creates no duplicate item;
//   * TOTAL — a malformed record is a Finding, never a refusal of the import.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const interchange = require('../../src/interchange/import.js');
const { compareCodePoint } = require('../../src/shared/ordering.js');

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'old-site-10');
const OPTIONS = Object.freeze({
  base: 'https://example.org/',
  bundleId: 'fixture-node',
  date: '2026-01-01',
  operator: 'human:tester',
  specVersion: '1.0.0-rc.4',
  title: 'Fixture Node',
});

/** The fixture corpus, read once, in a fixed order. */
function corpus() {
  const cardsDir = path.join(FIXTURE, 'content', 'patterns');
  const cards = fs.readdirSync(cardsDir).sort(compareCodePoint).map((f) => ({
    markdown: fs.readFileSync(path.join(cardsDir, f), 'utf8'),
    path: `content/patterns/${f}`,
  }));
  const diagramDir = path.join(FIXTURE, 'diagrams', 'src');
  const diagramSources = Object.create(null);
  for (const f of fs.readdirSync(diagramDir).sort(compareCodePoint)) {
    diagramSources[f.replace(/\.diagram$/u, '')] = fs.readFileSync(path.join(diagramDir, f), 'utf8');
  }
  return {
    cards,
    decks: JSON.parse(fs.readFileSync(path.join(FIXTURE, 'content', 'decks.json'), 'utf8')),
    diagramSources,
    paths: cards.map((c) => c.path),
    selection: fs.readFileSync(path.join(FIXTURE, 'selection.tsv'), 'utf8'),
  };
}

const plan = (extraInput = {}, extraOptions = {}) =>
  interchange.plan({ ...corpus(), ...extraInput }, { ...OPTIONS, ...extraOptions });

test('the plan writes the config, the index, the items, the clusters and the sources', () => {
  const planned = plan();
  const paths = planned.writes.map((w) => w.path);
  assert.ok(paths.includes('agsc.config.json'));
  assert.ok(paths.includes('content/index.md'));
  assert.strictEqual(paths.filter((p) => p.startsWith('content/concepts/')).length, 10);
  assert.strictEqual(paths.filter((p) => p.startsWith('content/clusters/')).length, 2);
  assert.strictEqual(paths.filter((p) => p.startsWith('content/diagrams/')).length, 8);
  assert.strictEqual(paths.filter((p) => p.startsWith('content/attachments/')).length, 0,
    'AGSC-01-07: a compiled .svg is NOT committed unless the operator asks');
  assert.deepStrictEqual(paths, [...paths].sort(compareCodePoint), 'the plan is in code-point order');
});

test('AGSC-01-23: the plan is a total function of its inputs — same bytes twice', () => {
  const a = plan();
  const b = plan();
  assert.deepStrictEqual(b.writes, a.writes);
  assert.deepStrictEqual(b.totals, a.totals);
  assert.deepStrictEqual(b.findings, a.findings);
});

test('AGSC-01-23: the arrival order of the cards changes nothing', () => {
  const forward = plan();
  const reversed = plan({ cards: corpus().cards.reverse() });
  assert.deepStrictEqual(reversed.writes, forward.writes);
});

test('the totals table is derived, and states the D99-shaped counts', () => {
  const totals = plan().totals;
  assert.strictEqual(totals.cards_read, 11);
  assert.strictEqual(totals.chosen, 10);
  assert.strictEqual(totals.items, 10);
  assert.strictEqual(totals.stable + totals.draft, totals.items);
  assert.strictEqual(totals.draft, 3, 'the two B+W records plus the one with an unusable status');
  assert.strictEqual(totals.clusters, 2);
  assert.strictEqual(totals.diagrams, 8);
  assert.strictEqual(totals.attachments, 0);
  assert.strictEqual(totals.deferred, 2);
  assert.strictEqual(totals.excluded, 1);
  assert.strictEqual(totals.excisions, 1);
  assert.strictEqual(totals.files, plan().writes.length);
  assert.strictEqual(totals.dropped_related, 1);
  // rc.5 (FV28-04): a body link to a card that is SELECTED but HELD BACK is
  // de-linked too, because a draft has no route (AGSC-06-30, AGSC-06-01) and a
  // published page linking one ships a 404. The ten new drops are the links to
  // `beta-one`, which the clean-room class holds back.
  assert.strictEqual(totals.dropped_body_links, 20);
});

test('the clean-room class holds a record back as `draft`, and the class is the caller\'s', () => {
  const held = plan().items.filter((i) => i.frontmatter.status === 'draft').map((i) => i.slug);
  assert.deepStrictEqual(held.sort(), ['beta-one', 'foreign-keys', 'odd-status']);
  // With no draft class at all, only the two records whose OWN status is draft or
  // unusable are held: the class is the caller's decision, not the mapper's.
  const open = plan({}, { draftClasses: [] });
  assert.deepStrictEqual(open.items.filter((i) => i.frontmatter.status === 'draft').map((i) => i.slug),
    ['beta-one', 'odd-status']);
  assert.deepStrictEqual([...interchange.DRAFT_CLASSES], ['B+W']);
});

test('AGSC-01-22: a chosen slug the corpus does not hold is AGSC-E901, and the rest imports', () => {
  const planned = plan();
  const ghost = planned.findings.filter((f) => f.slug === 'ghost');
  assert.deepStrictEqual(ghost.map((f) => [f.code, f.severity]), [['AGSC-E901', 'error']]);
  assert.ok(!planned.items.some((i) => i.slug === 'ghost'));
});

test('a record with no diagram source is a WARNING and loses its `diagram` key', () => {
  const planned = plan();
  const item = planned.items.find((i) => i.slug === 'no-deck');
  assert.strictEqual(item.frontmatter.diagram, undefined);
  assert.ok(planned.findings.some((f) => f.code === 'AGSC-E901' && f.severity === 'warn'
    && /no diagram source for "no-deck"/u.test(f.message)));
});

test('AGSC-02-13: a source that does not compile is AGSC-E412 and no `diagram` is claimed', () => {
  const planned = plan();
  assert.ok(planned.findings.some((f) => f.code === 'AGSC-E412' && f.slug === 'bad-sources'));
  assert.strictEqual(planned.items.find((i) => i.slug === 'bad-sources').frontmatter.diagram, undefined);
  assert.ok(!planned.writes.some((w) => w.path === 'content/diagrams/bad-sources.diagram'));
});

test('AGSC-01-14: a `.diagram` written by the import has LF endings and one final LF', () => {
  for (const write of plan().writes.filter((w) => w.path.endsWith('.diagram'))) {
    assert.ok(!write.text.includes('\r'), write.path);
    assert.ok(write.text.endsWith('\n') && !write.text.endsWith('\n\n'), write.path);
  }
});

test('AGSC-02-98 / R59: `--attach-diagrams` adds the SVG and its source, both with alt', () => {
  const planned = plan({}, { attachDiagrams: true });
  const item = planned.items.find((i) => i.slug === 'alpha-one');
  assert.deepStrictEqual(item.frontmatter.attachments.map((a) => [a.file, a.media_type]), [
    ['alpha-one.svg', interchange.SVG_MEDIA_TYPE],
    ['alpha-one.diagram', interchange.DSL_MEDIA_TYPE],
  ]);
  for (const attachment of item.frontmatter.attachments) {
    assert.ok(attachment.alt.length > 0, attachment.file);
  }
  assert.strictEqual(planned.totals.attachments, 16);
  const svg = planned.writes.find((w) => w.path === 'content/attachments/alpha-one/alpha-one.svg');
  assert.ok(svg.text.startsWith('<svg '));
  assert.strictEqual(planned.writes.find((w) => w.path === 'content/attachments/alpha-one/alpha-one.diagram').text,
    planned.writes.find((w) => w.path === 'content/diagrams/alpha-one.diagram').text);
});

test('the configuration the import writes carries only what the rules let it', () => {
  const planned = plan({}, { peers: ['https://b.example/.well-known/knowledge-linkset'], tagline: 'A tagline.' });
  const config = JSON.parse(planned.writes.find((w) => w.path === 'agsc.config.json').text);
  assert.deepStrictEqual(config.bundle, {
    id: 'fixture-node',
    license_prose: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    license_schema: 'CC0-1.0',
    operator: 'human:tester',
  });
  assert.deepStrictEqual(config.build, { out: 'www' }, 'AGSC-01-18: `build.feed` is reserved for 1.1');
  assert.deepStrictEqual(config.site, { base: 'https://example.org/', tagline: 'A tagline.', title: 'Fixture Node' });
  assert.deepStrictEqual(config.peers, ['https://b.example/.well-known/knowledge-linkset']);
  assert.deepStrictEqual(config.tags, { allowed: ['alpha', 'beta', 'mapping'] });
  assert.deepStrictEqual(config.releases, { 'batch-one': true, 'batch-two': true, 'beta-release': true });
  assert.strictEqual(config.spec_version, '1.0.0-rc.4');
  // With no peer declared, no `peers` member is written at all.
  assert.strictEqual(JSON.parse(plan().writes.find((w) => w.path === 'agsc.config.json').text).peers, undefined);
});

test('the index states the counts it can derive and imposes no reading order', () => {
  const index = plan().writes.find((w) => w.path === 'content/index.md').text;
  assert.match(index, /^---\n/u);
  assert.match(index, /origin: imported/u);
  assert.match(index, /7 of the 10 are published/u);
  assert.match(index, /Nothing here is a reading order/u);
  assert.ok(!/^\d+\.\s/mu.test(index), 'no numbered sequence that would read as an order');
});

test('a correction is the caller\'s data: title, status, promote and add', () => {
  const planned = plan({
    corrections: {
      'alpha-one': {
        add: [{ url: 'https://example.org/added', label: 'Added' }],
        promote: ['https://example.org/two'],
        title: 'A Sourced Name',
      },
      'no-kind': { status: 'draft' },
    },
  });
  const alpha = planned.items.find((i) => i.slug === 'alpha-one');
  assert.strictEqual(alpha.frontmatter.title, 'A Sourced Name');
  assert.deepStrictEqual(alpha.frontmatter.sources.map((s) => [s.resource, s.grade]), [
    ['https://example.org/two', 'primary'],
    ['https://example.org/one', 'secondary'],
    ['https://example.org/added', 'secondary'],
  ]);
  assert.strictEqual(planned.items.find((i) => i.slug === 'no-kind').frontmatter.status, 'draft');
  assert.deepStrictEqual(planned.corrections.map((c) => `${c.slug}.${c.member}`).sort(),
    ['alpha-one.add', 'alpha-one.promote', 'alpha-one.title', 'no-kind.status']);
  assert.strictEqual(planned.totals.corrections, 4);
  // A correction never RELEASES a record the clean-room class holds back.
  const forced = plan({ corrections: { 'beta-one': { status: 'stable' } } });
  assert.strictEqual(forced.items.find((i) => i.slug === 'beta-one').frontmatter.status, 'draft');
});

test('AGSC-08-17: an excluded file in the CORPUS is seen, named and not copied', () => {
  const planned = plan({ paths: ['content/book.md', 'content/patterns/alpha-one.md'] });
  const seen = planned.findings.filter((f) => f.code === 'AGSC-E405');
  assert.deepStrictEqual(seen.map((f) => [f.severity, f.file]), [['warn', 'content/book.md']]);
  assert.match(seen[0].message, /was NOT copied/u);
  assert.ok(!planned.writes.some((w) => w.path.endsWith('/book.md')));
  assert.deepStrictEqual([...interchange.EXCLUDED_FILES].sort(),
    ['book.md', 'endorsements.json', 'start-here.json']);
});

test('AGSC-08-17: the rule itself is checked against the PLAN, where it would be real', () => {
  const cleanroom = require('../../src/governance/cleanroom.js');
  // The guard the plan check is: any of the three names among the planned writes
  // is an error about the Bundle being built, not about the corpus being read.
  for (const name of cleanroom.EXCLUDED_FILES) {
    const direct = cleanroom.check({ paths: [`content/${name}`] });
    assert.deepStrictEqual(direct.map((f) => [f.code, f.severity]), [['AGSC-E405', 'error']], name);
  }
  assert.ok(!plan().findings.some((f) => f.code === 'AGSC-E405' && f.severity === 'error'));
});

test('AGSC-01-23: a slug collision is suffixed in discovery order and reported', () => {
  // Two selection rows whose slugs slugify to the same value.
  const selection = 'slug\tclass\tdecision\nalpha-one\tW\tCHOOSE\nAlpha One\tW\tCHOOSE\n';
  const cards = corpus().cards.concat([{
    markdown: fs.readFileSync(path.join(FIXTURE, 'content', 'patterns', 'alpha-one.md'), 'utf8')
      .replace('id: alpha-one', 'id: alpha-one-2'),
    path: 'content/patterns/Alpha One.md',
  }]);
  const planned = interchange.plan({ ...corpus(), cards, selection }, OPTIONS);
  assert.deepStrictEqual(planned.items.map((i) => i.slug), ['alpha-one', 'alpha-one-2']);
  assert.ok(planned.findings.some((f) => f.code === 'AGSC-E206' && /collided and became/u.test(f.message)));
});

test('an empty selection imports nothing and says why', () => {
  const planned = plan({ selection: '' });
  assert.deepStrictEqual(planned.items, []);
  assert.ok(planned.findings.some((f) => f.code === 'AGSC-E003'));
  // The configuration and the index are still planned: the Bundle shape is not
  // a function of how many records were chosen.
  assert.deepStrictEqual(planned.writes.map((w) => w.path), ['agsc.config.json', 'content/index.md']);
});

test('itemFile(): exactly one trailing LF, and the body never doubles the fence gap', () => {
  // A body that already begins with a blank line keeps it; one that does not gets
  // one, so the fence is never glued to the first line of prose.
  assert.strictEqual(interchange.itemFile({ type: 'concept' }, '\nbody\n'), '---\ntype: concept\n---\n\nbody\n');
  assert.strictEqual(interchange.itemFile({ type: 'concept' }, 'body\n\n\n'), '---\ntype: concept\n---\n\nbody\n');
});

test('jsonBytes(): sorted keys, two-space indent, one trailing LF', () => {
  assert.strictEqual(interchange.jsonBytes({ b: 1, a: { d: [2, { f: 3, e: 4 }], c: 5 } }),
    '{\n  "a": {\n    "c": 5,\n    "d": [\n      2,\n      {\n        "e": 4,\n        "f": 3\n      }\n    ]\n  },\n  "b": 1\n}\n');
});

test('byCodePoint(): the one ordering, over a shared prefix and a surrogate pair', () => {
  assert.ok(interchange.byCodePoint('a', 'b') < 0);
  assert.ok(interchange.byCodePoint('ab', 'a') > 0);
  assert.strictEqual(interchange.byCodePoint('a', 'a'), 0);
  assert.ok(interchange.byCodePoint('\u{1f600}', '￿') > 0, 'code point order, not UTF-16 order');
});

test('altFor(): the SVG takes the card\'s alt, the source a sentence derived from it', () => {
  assert.strictEqual(interchange.altFor('svg', 'T', 'An alt.'), 'An alt.');
  assert.match(interchange.altFor('dsl', 'T', 'An alt.'), /^The diagram source for T,.*An alt\.$/u);
});

test('the format this verb reads is named once', () => {
  assert.strictEqual(interchange.FORMAT, 'old-site');
});

test('a `rewrite` correction replaces a phrase, and a stale pair is reported not ignored', () => {
  // The clean-room deny-list catches what it was written for; a phrase three words
  // wide that it does not match is the operator's own correction, carried as DATA
  // (project rule 9). A pair whose `from` is not there is a STALE correction: it is
  // reported, because silently doing nothing is how a correction file rots.
  const planned = plan({
    corrections: {
      'alpha-one': { rewrite: [['Alpha One', 'Alpha the First'], ['not present anywhere', 'x']] },
    },
  });
  const alpha = planned.items.find((i) => i.slug === 'alpha-one');
  assert.ok(!`${alpha.frontmatter.title}\n${alpha.body}`.includes('Alpha One'), alpha.body);
  const stale = planned.findings.filter((f) => f.code === 'AGSC-E901'
    && /rewrite correction/u.test(f.message));
  assert.strictEqual(stale.length, 1, JSON.stringify(planned.findings.map((f) => f.message)));
  assert.match(stale[0].message, /"not present anywhere" matches nothing/u);
  assert.strictEqual(stale[0].slug, 'alpha-one');
  assert.ok(planned.corrections.some((c) => c.slug === 'alpha-one' && c.member === 'rewrite'));
});
