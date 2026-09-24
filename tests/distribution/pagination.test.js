'use strict';
// AGSC-06-21: the budgets are per-scale, not absolute. Above 500 items a writer
// MUST shard `/search.json` into `/search-<nn>.json` with `/search.json` as the
// manifest, MUST shard `/chunks.jsonl` on the same trigger (AGSC-06-31), and
// MUST paginate any index route carrying more than 500 entries as
// `/<route>/page-<n>/` with page 1 the route itself.
//
// The bundle here is SYNTHETIC — 501 items built in memory — because the
// fixture is deliberately three items and nothing in the repository is large
// enough to cross the bound. Fixed clock, no network, no wall clock.

const test = require('node:test');
const assert = require('node:assert');

const site = require('../../src/distribution/site.js');
const { createClock } = require('../../src/adapters/node-clock.js');

/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';

function synthetic(count) {
  const items = Array.from({ length: count }, (_, i) => {
    const slug = `c${String(i).padStart(4, '0')}`;
    return {
      body: `## Intent\n\nItem ${slug}.\n`,
      frontmatter: {
        date: '2026-01-01',
        description: `A synthetic concept used to cross the five-hundred-item bound of AGSC-06-21 (${slug}).`,
        prov: { operator: 'human:test', origin: 'human' },
        tags: ['agents'],
        title: `Concept ${slug}`,
        type: 'concept',
      },
      path: `content/concepts/${slug}.md`,
      slug,
      type: 'concept',
    };
  });
  return {
    config: { bundle: { id: 'synthetic' }, site: { base: 'https://synthetic.example/', title: 'Synthetic' } },
    findings: [],
    index: { body: '', frontmatter: { description: 'A synthetic Bundle.', title: 'Synthetic' } },
    items,
    root: '',
  };
}

const PORTS = { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }) };
const OPTIONS = { specVersion: '1.0.0-rc.4', version: '0.0.2' };

test('AGSC-06-21: 500 items need no shard and no page-2', () => {
  const { files } = site.build(synthetic(500), PORTS, OPTIONS);
  assert.ok(files.has('/search.json'));
  assert.ok(![...files.keys()].some((r) => /^\/search-\d\d\.json$/u.test(r)), 'a shard was emitted at the bound');
  assert.ok(![...files.keys()].some((r) => r.includes('/page-')), 'a page was emitted at the bound');
  assert.ok(files.has('/concepts/index.html'));
});

test('AGSC-06-21 / AGSC-06-31: 501 items shard the index and paginate every index route', () => {
  const { files } = site.build(synthetic(501), PORTS, OPTIONS);

  // The index becomes the manifest, and the entries move into the shards.
  const manifest = JSON.parse(files.get('/search.json'));
  assert.deepStrictEqual(Object.keys(manifest).sort(), ['docs_total', 'shards']);
  assert.strictEqual(manifest.docs_total, 501);
  assert.deepStrictEqual(manifest.shards, ['/search-01.json', '/search-02.json']);
  for (const shard of manifest.shards) assert.ok(files.has(shard), `${shard} is missing`);

  // AGSC-06-31: `/chunks.jsonl` shards on the same trigger, in the same shape.
  const chunks = JSON.parse(files.get('/chunks.jsonl'));
  // AGSC-06-31 as amended at rc.6: the shard manifest carries the content
  // version of AGSC-04-25 beside its two members, and JCS sorts it first.
  assert.deepStrictEqual(Object.keys(chunks).sort(), ['bundle_version', 'lines_total', 'shards']);
  assert.match(chunks.bundle_version, /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u);
  assert.deepStrictEqual(chunks.shards, ['/chunks-01.jsonl', '/chunks-02.jsonl']);

  // Page 1 is the route itself; the overflow is `/page-2/`, and only that.
  for (const route of ['/', '/concepts/', '/search/', '/tags/agents/']) {
    assert.ok(files.has(`${route}index.html`), `${route} lost its page 1`);
    assert.ok(files.has(`${route}page-2/index.html`), `${route} was not paginated`);
    assert.ok(!files.has(`${route}page-3/index.html`), `${route} paginated too far`);
  }
  // AGSC-06-02: an empty type folder is left out of the navigation but still resolves,
  // on one page and no more.
  assert.ok(files.has('/clusters/index.html'), 'an empty type index does not resolve');
  assert.ok(!files.has('/clusters/page-2/index.html'), 'an empty type index was paginated');
  assert.ok(!files.get('/index.html').includes('href="/clusters/"'), 'an empty type folder is in the navigation');
});

test('the 501-item build is byte-reproducible (AGSC-04-02)', () => {
  assert.deepStrictEqual(site.verify(synthetic(501), PORTS, OPTIONS), []);
});
