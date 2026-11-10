'use strict';
// Requirement: PRD-077 (docs/PRD.md).
// verifies AGSC-06-38, AGSC-06-30, AGSC-02-13, AGSC-01-07, AGSC-06-21, AGSC-06-03
// The graph view of item and cluster pages (AGSC-06-38, src/distribution/graph-view.js):
// a figure of the neighbourhood drawn from published items only, with a relations table
// beside it as its text equivalent — key, direction, the other item linked, and the
// meaning of the key from the table of AGSC-03-01 — whose incoming rows are the
// backlinks. Pure functions first, then whole builds of small Bundles written to a
// scratch folder. Deterministic: fixed build instant, no network.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { RELATIONS, LINK_KEYS } = require('../../src/knowledge/relations.js');
const lint = require('../../src/governance/lint.js');
const site = require('../../src/distribution/site.js');
const html = require('../../src/distribution/html.js');
const graphView = require('../../src/distribution/graph-view.js');

const MEANING = new Map(RELATIONS.map((r) => [r.key, r.meaning]));
const hrefOf = (item) => `/${item.type === 'cluster' ? 'clusters' : 'concepts'}/${item.slug}/`;
const concept = (slug, fields = {}) => ({ slug, title: `Title ${slug}`, type: 'concept', ...fields });

// ------------------------------------------------------------------ reading a page

/** The rows of the relations table under `#links`: `{key, direction, href}`. */
function tableRows(page, anchor = 'links') {
  const start = page.indexOf(`id="${anchor}"`);
  if (start < 0) return [];
  const table = page.slice(page.indexOf('<table class="relations">', start), page.indexOf('</table>', start));
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gu)].slice(1).map((m) => [...m[1].matchAll(/<td>(.*?)<\/td>/gu)].map((c) => c[1]));
}

/** The SVG figures of a page, in document order. */
function svgs(page) {
  return [...page.matchAll(/<svg[\s\S]*?<\/svg>/gu)].map((m) => m[0]);
}

/** Every `id` attribute of a page. */
function ids(page) {
  return [...page.matchAll(/\sid="([^"]*)"/gu)].map((m) => m[1]);
}

// ------------------------------------------------------------------ a scratch Bundle

const { buildNode } = require('./_scratch-node.js');

const page = (built, route) => String(built.files.get(route));

/** The five items of build-0032: a requires b and d (a draft); c uses a; e, held back, uses a. */
const VECTOR_ITEMS = [
  { slug: 'a', type: 'concept', kind: 'explainer', title: 'Alpha', requires: ['b', 'd'] },
  { slug: 'b', type: 'concept', kind: 'explainer', title: 'Bravo' },
  { slug: 'c', type: 'concept', kind: 'explainer', title: 'Charlie', uses: ['a'] },
  { slug: 'd', type: 'concept', kind: 'explainer', title: 'Draft Delta', status: 'draft' },
  { slug: 'e', type: 'concept', kind: 'explainer', title: 'Held Echo', release: 'later', uses: ['a'] },
];

// ------------------------------------------------------------------ the rows

test('rows: outgoing first, then the backlinks, each with its key and meaning; no self-link, no unpublished item', () => {
  const items = [concept('a', { requires: ['b', 'b#part', 'gone'], related: ['a'] }), concept('b', { uses: ['a'] }), concept('c', { related: ['a'] })];
  const index = graphView.index(items, hrefOf);
  const rows = graphView.relationRows(items[0], index).map((r) => [r.direction, r.key, r.other.slug]);
  assert.deepStrictEqual(rows, [['outgoing', 'requires', 'b'], ['incoming', 'related', 'c'], ['incoming', 'uses', 'b']]);
  assert.deepStrictEqual(graphView.relationRows(concept('lonely'), index), []);
});

test('a symmetric key stated by both items is one row, one arc and one overview count, read from the item first in code-point order', () => {
  // `related` is symmetric (AGSC-03-01): a related b and b related a state one relation.
  const k = { slug: 'k', title: 'Kilo', type: 'cluster' };
  const l = { slug: 'l', title: 'Lima', type: 'cluster' };
  const items = [k, l, concept('a', { clusters: ['k'], related: ['b', 'c'], uses: ['b'] }), concept('b', { clusters: ['k'], related: ['a'], uses: ['a'] }),
    concept('c', { clusters: ['l'], related: ['a'] })];
  const index = graphView.index(items, hrefOf);
  const rowsOf = (slug) => graphView.relationRows(index.bySlug.get(slug), index).map((r) => [r.direction, r.key, r.other.slug]);
  assert.deepStrictEqual(rowsOf('a'), [['outgoing', 'related', 'b'], ['outgoing', 'related', 'c'], ['outgoing', 'uses', 'b'], ['incoming', 'uses', 'b']]);
  assert.deepStrictEqual(rowsOf('b'), [['outgoing', 'related', 'a'], ['outgoing', 'uses', 'a'], ['incoming', 'uses', 'a']],
    'a non-symmetric key stated both ways stays two rows');
  const map = graphView.clusterSection(k, index).html;
  assert.deepStrictEqual(tableRows(map, 'member_links').map((r) => r.slice(0, 3).map((c) => c.replace(/<[^>]+>/gu, ''))),
    [['Title a', 'related', 'Title b'], ['Title a', 'uses', 'Title b'], ['Title b', 'uses', 'Title a']]);
  assert.deepStrictEqual(graphView.overviewRows([k, l], index).map((r) => [r.source.slug, r.key, r.target.slug, r.count]), [['k', 'related', 'l', 1]]);
});

test('the figure draws exactly the relations the table lists, in the table order (keys in the order of AGSC-03-01)', () => {
  const items = [concept('a', { requires: ['b'], uses: ['c'] }), concept('b'), concept('c', { related: ['a'] }), concept('d', { covers: ['a'] })];
  const index = graphView.index(items, hrefOf);
  const view = graphView.itemSection(items[0], index);
  assert.deepStrictEqual(view.findings, []);
  const rows = tableRows(view.html);
  assert.deepStrictEqual(rows.map((r) => [r[0], r[1], r[2].replace(/<[^>]+>/gu, '')]), [
    ['uses', 'outgoing', 'Title c'], ['requires', 'outgoing', 'Title b'],
    ['related', 'incoming', 'Title c'], ['covers', 'incoming', 'Title d']]);
  for (const r of rows) assert.strictEqual(r[3], MEANING.get(r[0]), 'the meaning of the key, verbatim');
  const [svg] = svgs(view.html);
  // One box per row (plus the item itself, highlighted) and one arrow per row.
  const boxTexts = [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/gu)].map((m) => m[1]);
  assert.deepStrictEqual(boxTexts, ['Title a', 'uses', 'Title c', 'requires', 'Title b', 'related', 'Title c', 'covers', 'Title d']);
  assert.strictEqual((svg.match(/marker-end=/gu) || []).length, rows.length);
  assert.strictEqual((svg.match(/class="agsc-accent"/gu) || []).length, 1, 'the item itself carries the accent');
  // Each arrow carries the class of its row's key (AGSC-01-42 `rel=KEY`), in the table order.
  const arrowClasses = [...svg.matchAll(/marker-end="[^"]*" class="agsc-rel-([a-z-]+)"\/>/gu)].map((m) => m[1]);
  assert.deepStrictEqual(arrowClasses, rows.map((r) => r[0]));
});

test('an arrow runs from the item that states the relation to its target', () => {
  const items = [concept('a', { requires: ['b'] }), concept('b'), concept('c', { uses: ['a'] })];
  const source = graphView.itemFigureSource(items[0], graphView.relationRows(items[0], graphView.index(items, hrefOf)));
  assert.match(source, /^arrow item r1 via=/mu, 'outgoing: from the item to the row');
  assert.match(source, /^arrow r2 item via=/mu, 'incoming: from the row to the item');
});

test('cap: the figure and the table hold the first 24 rows and say how many more exist', () => {
  const linking = Array.from({ length: 30 }, (_, n) => concept(`n${String(n).padStart(2, '0')}`, { uses: ['a'] }));
  const index = graphView.index([concept('a'), ...linking], hrefOf);
  const view = graphView.itemSection(concept('a'), index);
  assert.strictEqual(graphView.NEIGHBOURS_DRAWN, 24);
  assert.strictEqual(tableRows(view.html).length, 24);
  assert.strictEqual((svgs(view.html)[0].match(/marker-end=/gu) || []).length, 24);
  assert.match(view.html, /<p class="relations-more">6 more relations of this item are not drawn or listed here;/u);
  assert.doesNotMatch(view.html, /n24|n29/u, 'a row past the cap is not named');
  const one = Array.from({ length: 25 }, (_, n) => concept(`m${String(n).padStart(2, '0')}`, { uses: ['a'] }));
  assert.match(graphView.itemSection(concept('a'), graphView.index([concept('a'), ...one], hrefOf)).html, /1 more relation of this item is not drawn/u);
});

test('an item with no relation gets no section, so its page keeps the 1.0 shape', () => {
  assert.deepStrictEqual(graphView.itemSection(concept('a'), graphView.index([concept('a')], hrefOf)), { findings: [], html: '' });
});

test('hostile titles: the table escapes them, the figure stays inside the SVG rules and names them as text', () => {
  const evil = '<script>alert("1")</script> # | & "acc"';
  const items = [concept('a', { title: 'acc', requires: ['b'] }), concept('b', { title: evil })];
  const view = graphView.itemSection(items[0], graphView.index(items, hrefOf));
  assert.doesNotMatch(view.html, /<script>/u);
  assert.match(tableRows(view.html)[0][2], /&lt;script&gt;alert\(&quot;1&quot;\)&lt;\/script&gt; # \| &amp; &quot;acc&quot;/u);
  const [svg] = svgs(view.html);
  assert.deepStrictEqual(lint.svgViolations(svg), []);
  assert.strictEqual((svg.match(/class="agsc-accent"/gu) || []).length, 1, 'a title equal to a flag word sets no flag');
  assert.doesNotMatch(svg, /stroke-dasharray/u);
  // A blank title leaves no empty argument for the next token (a flag) to fill.
  assert.match(graphView.itemFigureSource(concept('a', { title: '  ' }), []), /^box item [\d. ]+ "\u00A0" acc$/mu);
});

test('property: every generated figure compiles inside the SVG rules, and the view is a pure function', () => {
  const title = fc.string({ maxLength: 120 });
  fc.assert(fc.property(fc.array(fc.tuple(title, fc.constantFrom(...LINK_KEYS), fc.boolean()), { maxLength: 30 }), title, (rows, own) => {
    const items = [concept('a', { title: own })];
    rows.forEach(([t, key, outgoing], n) => {
      const other = concept(`o${n}`, { title: t, ...(outgoing ? {} : { [key]: ['a'] }) });
      items.push(other);
      if (outgoing) items[0][key] = [...(items[0][key] || []), other.slug];
    });
    const index = graphView.index(items, hrefOf);
    const view = graphView.itemSection(items[0], index);
    assert.deepStrictEqual(view.findings, []);
    for (const svg of svgs(view.html)) assert.deepStrictEqual(lint.svgViolations(svg), []);
    assert.strictEqual(graphView.itemSection(items[0], graphView.index([...items].reverse(), hrefOf)).html, view.html,
      'the order the items arrive in changes nothing');
  }), { numRuns: 150 });
});

test('a refused figure is AGSC-E412 and no figure, and the table still stands', () => {
  const items = [concept('a', { requires: ['b'] }), concept('b')];
  const view = graphView.itemSection(items[0], graphView.index(items, hrefOf), { svgViolations: () => ['a <script> element'] });
  assert.deepStrictEqual(view.findings.map((f) => f.code), ['AGSC-E412']);
  assert.doesNotMatch(view.html, /<svg/u);
  assert.strictEqual(tableRows(view.html).length, 1);
});

test('the table takes further columns through its column list (the domain layer adds its own)', () => {
  const items = [concept('a', { requires: ['b'] }), concept('b')];
  const index = graphView.index(items, hrefOf);
  const columns = [...graphView.ITEM_COLUMNS, { heading: 'Extra', cell: (row) => `x-${row.other.slug}` }];
  const table = graphView.relationsTable(graphView.relationRows(items[0], index), columns, index);
  assert.match(table, /<th scope="col">Extra<\/th>/u);
  assert.match(table, /<td>x-b<\/td><\/tr>/u);
  assert.deepStrictEqual(graphView.ITEM_COLUMNS.map((c) => c.heading), ['Relation', 'Direction', 'Item', 'Meaning']);
});

// ------------------------------------------------------------------ the cluster map

test('a cluster map draws the members and the links among them, with the same links in its table', () => {
  const k = { slug: 'k', title: 'Kilo', type: 'cluster' };
  const members = [concept('a', { clusters: ['k'], requires: ['b', 'outside'], uses: ['b'] }),
    concept('b', { clusters: ['k'], related: ['a'] }), concept('c', { clusters: ['k'] }), concept('outside')];
  const index = graphView.index([k, ...members], hrefOf);
  const view = graphView.clusterSection(k, index);
  assert.deepStrictEqual(view.findings, []);
  const rows = tableRows(view.html, 'member_links').map((r) => r.slice(0, 3).map((c) => c.replace(/<[^>]+>/gu, '')));
  assert.deepStrictEqual(rows, [['Title a', 'uses', 'Title b'], ['Title a', 'requires', 'Title b'], ['Title b', 'related', 'Title a']]);
  const [svg] = svgs(view.html);
  assert.deepStrictEqual(lint.svgViolations(svg), []);
  const texts = [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/gu)].map((m) => m[1]);
  assert.deepStrictEqual(texts, ['Kilo', 'Title a', 'Title b', 'Title c', 'uses, requires', 'related'],
    'the cluster, its members, then one label per arc naming its keys');
  assert.strictEqual((svg.match(/marker-end=/gu) || []).length, 2, 'one arc per ordered pair');
  assert.deepStrictEqual(graphView.clusterSection({ slug: 'z', type: 'cluster' }, index), { findings: [], html: '' }, 'no link among the members, no map');
});

test('a cluster map draws at most 24 links and 24 members, the linked ones first, and says what it left out', () => {
  const k = { slug: 'k', title: 'Kilo', type: 'cluster' };
  const slugs = Array.from({ length: 30 }, (_, n) => `m${String(n).padStart(2, '0')}`);
  const members = slugs.map((slug, n) => concept(slug, { clusters: ['k'], related: [slugs[(n + 1) % 30], slugs[(n + 2) % 30]] }));
  const view = graphView.clusterSection(k, graphView.index([k, ...members], hrefOf));
  const [svg] = svgs(view.html);
  assert.deepStrictEqual([graphView.MEMBERS_DRAWN, graphView.MEMBER_LINKS_DRAWN], [24, 24]);
  assert.strictEqual((svg.match(/<rect /gu) || []).length, 1 + graphView.MEMBERS_DRAWN, 'the cluster and 24 members');
  assert.strictEqual(tableRows(view.html, 'member_links').length, graphView.MEMBER_LINKS_DRAWN);
  assert.match(view.html, /The map draws 24 of the 30 members\./u);
  assert.match(view.html, /36 more links among the members are not drawn or listed here;/u);
  // A large cluster whose first members link to nothing still shows the links further on.
  const quiet = Array.from({ length: 40 }, (_, n) => concept(`q${String(n).padStart(2, '0')}`, { clusters: ['k'] }));
  const late = [concept('y1', { clusters: ['k'], requires: ['y2'] }), concept('y2', { clusters: ['k'] })];
  const map = graphView.clusterSection(k, graphView.index([k, ...quiet, ...late], hrefOf)).html;
  assert.deepStrictEqual(tableRows(map, 'member_links').map((r) => r[0].replace(/<[^>]+>/gu, '')), ['Title y1']);
  assert.match(svgs(map)[0], />Title y1</u);
  assert.match(map, /The map draws 24 of the 42 members\./u);
});

test('the cluster table takes further columns through its column list (the domain layer adds its own)', () => {
  const k = { slug: 'k', title: 'Kilo', type: 'cluster' };
  const items = [k, concept('a', { clusters: ['k'], requires: ['b'] }), concept('b', { clusters: ['k'] })];
  const columns = [...graphView.CLUSTER_COLUMNS, { heading: 'Extra', cell: (row) => `x-${row.target.slug}` }];
  const view = graphView.clusterSection(k, graphView.index(items, hrefOf), { columns });
  assert.match(view.html, /<th scope="col">Extra<\/th>/u);
  assert.match(view.html, /<td>x-b<\/td><\/tr>/u);
  assert.deepStrictEqual(graphView.CLUSTER_COLUMNS.map((c) => c.heading), ['From', 'Relation', 'To', 'Meaning']);
});

// ------------------------------------------------------------------ whole builds

test('build-0032 by hand: the page of a has two rows, and names neither the draft nor the held-back item', () => {
  const built = buildNode(VECTOR_ITEMS, { releases: { later: false } });
  const a = page(built, '/concepts/a/index.html');
  assert.deepStrictEqual(tableRows(a).map((r) => [r[0], r[1], r[2]]), [
    ['requires', 'outgoing', '<a href="/concepts/b/">Bravo</a>'],
    ['uses', 'incoming', '<a href="/concepts/c/">Charlie</a>']]);
  assert.doesNotMatch(a, /Draft Delta|Held Echo|\/concepts\/[de]\//u);
  assert.match(page(built, '/concepts/b/index.html'), /<td>requires<\/td><td>incoming<\/td><td><a href="\/concepts\/a\/">Alpha<\/a><\/td>/u,
    'the backlink on the target');
  assert.deepStrictEqual(built.findings.filter((f) => f.severity === 'error'), []);
});

test('a page with the author\'s diagram, the neighbourhood figure and the cluster map repeats no id', () => {
  const built = buildNode([
    { slug: 'k', type: 'cluster', title: 'Kilo', requires: ['a'], diagram: { file: 'k.svg', alt: 'The cluster drawn by its author.' } },
    { slug: 'a', type: 'concept', kind: 'explainer', title: 'Alpha', clusters: ['k'], uses: ['b'] },
    { slug: 'b', type: 'concept', kind: 'explainer', title: 'Bravo', clusters: ['k'] },
  ], { diagrams: { k: 'box a 20 20 120 40 "a" acc\nbox b 300 20 120 40 "b"\narrow a b\n' } });
  assert.deepStrictEqual(built.findings.filter((f) => f.severity === 'error'), []);
  const full = page(built, '/clusters/k/index.html');
  assert.strictEqual(svgs(full).length, 3, 'the author\'s diagram, the neighbourhood and the cluster map');
  const all = ids(full);
  assert.deepStrictEqual(all.filter((id, n) => all.indexOf(id) !== n), [], 'a repeated id');
  for (const svg of svgs(full)) assert.deepStrictEqual(lint.svgViolations(svg), []);
  for (const svg of svgs(full)) {
    const own = ids(svg);
    for (const [, target] of svg.matchAll(/url\(#([^)]+)\)/gu)) assert.ok(own.includes(target), `an arrow points at another figure's marker: ${target}`);
  }
});

test('a retired item is neither drawn nor named, not even on its own page, which keeps its notice', () => {
  const built = buildNode([
    { slug: 'a', type: 'concept', kind: 'explainer', title: 'Alpha', requires: ['r'] },
    { slug: 'r', type: 'concept', kind: 'explainer', title: 'Retired Romeo', status: 'retired', uses: ['a'] },
  ]);
  assert.doesNotMatch(page(built, '/concepts/a/index.html'), /Retired Romeo|id="links"/u);
  const own = page(built, '/concepts/r/index.html');
  assert.doesNotMatch(own, /id="links"|<svg/u);
  assert.match(own, /class="retired"/u);
});

test('a retired cluster keeps its page and its notice, and draws no map of its members', () => {
  const built = buildNode([
    { slug: 'k', type: 'cluster', title: 'Retired Kilo', description: 'A cluster retired from the node, kept for its address.', status: 'retired' },
    { slug: 'a', type: 'concept', kind: 'explainer', title: 'Alpha', requires: ['b'], clusters: ['k'] },
    { slug: 'b', type: 'concept', kind: 'explainer', title: 'Bravo', clusters: ['k'] },
  ]);
  const own = page(built, '/clusters/k/index.html');
  assert.match(own, /class="retired"/u);
  assert.doesNotMatch(own, /id="member_links"|<svg|Links among the members/u);
});

test('a body heading that takes the id of a section leaves no id repeated on the page', () => {
  const built = buildNode([
    { slug: 'k', type: 'cluster', title: 'Kilo', description: 'A cluster whose body has a heading named Member links.', body: 'Intro.\n\n## Member links\n\nText.' },
    { slug: 'a', type: 'concept', kind: 'explainer', title: 'Alpha', requires: ['b'], clusters: ['k'], body: 'A.\n\n## Links\n\nMy own links.' },
    { slug: 'b', type: 'concept', kind: 'explainer', title: 'Bravo', clusters: ['k'], body: 'B.\n\n## Links\n\nOnly backlinks reach this item.' },
  ]);
  assert.deepStrictEqual(built.findings.filter((f) => f.severity === 'error'), []);
  for (const route of ['/clusters/k/index.html', '/concepts/a/index.html', '/concepts/b/index.html']) {
    const all = ids(page(built, route));
    assert.deepStrictEqual(all.filter((id, n) => all.indexOf(id) !== n), [], `a repeated id on ${route}`);
  }
  // The section is still there, under the author's own `#links`.
  assert.match(page(built, '/concepts/b/index.html'), /<h2>Relations<\/h2>/u);
  assert.match(page(built, '/clusters/k/index.html'), /<h3 id="member_links">Links among the members<\/h3>/u);
});

test('two builds are byte-identical, and no page carries a phrase the reading-order rule refuses (AGSC-06-03)', () => {
  const first = buildNode(VECTOR_ITEMS, { releases: { later: false } });
  const second = buildNode(VECTOR_ITEMS, { releases: { later: false } });
  assert.deepStrictEqual([...first.files.keys()], [...second.files.keys()]);
  for (const [route, bytes] of first.files) assert.ok(String(bytes) === String(second.files.get(route)), route);
  // The same refusal as tests/standard/rules.test.js (AGSC-06-03); the two refused words are assembled.
  const framing = new RegExp(`start here|reading order|${['chap', 'ter'].join('')} \\d|\\b${['compan', 'ion'].join('')}\\b`, 'iu');
  for (const [route, bytes] of first.files) {
    if (route.endsWith('.html')) assert.ok(!framing.test(String(bytes).replace(/<[^>]+>/gu, ' ')), route);
  }
});

test('page budget: at 10,000 items a hub page and a cluster page stay under 100 KB (AGSC-06-21)', () => {
  const k = { slug: 'k', title: 'A cluster whose title is long enough to be cut in the figure', type: 'cluster', description: 'All of them.' };
  const items = [k, concept('hub', { title: 'The hub every item links to', clusters: ['k'] })];
  for (let n = 0; n < 10000; n += 1) {
    const slug = `item-${String(n).padStart(5, '0')}`;
    items.push(concept(slug, {
      // The shape of bench/gen-bundle.js, whose 500-member cluster page is the measured worst case.
      title: `Bench Item ${n + 1}`,
      description: 'Agent memory bundle item link cluster gate harness provenance ledger proposal review.',
      clusters: ['k'], related: [`item-${String((n + 1) % 10000).padStart(5, '0')}`], uses: ['hub'], requires: [`item-${String((n + 7) % 10000).padStart(5, '0')}`],
    }));
  }
  const index = graphView.index(items, hrefOf);
  const options = { render: () => ({ html: '<p>Body.</p>' }) };
  const hub = html.itemPage({ ...items[1], body: '' }, { ...options, relations: graphView.itemSection(items[1], index).html });
  const members = graphView.membersOfCluster(k, index).slice(0, site.CLUSTER_MEMBERS_SHOWN)
    .map((m) => ({ href: hrefOf(m), title: m.title, description: m.description }));
  const cluster = html.itemPage({ ...k, body: '' }, {
    ...options, members, membersTotal: 10001, relations: '', clusterMap: graphView.clusterSection(k, index).html,
  });
  for (const [name, bytes] of [['hub', hub], ['cluster', cluster]]) {
    assert.ok(Buffer.byteLength(bytes) <= site.BUDGET_HTML_BYTES, `${name}: ${Buffer.byteLength(bytes)} bytes`);
  }
  assert.ok(Buffer.byteLength(graphView.clusterSection(k, index).html) <= 20000, 'the cluster map and its table stay small');
});

// ------------------------------------------------------------------ the overview of /clusters/

/** Two clusters and a third; members of k link to members of l and m, and among themselves. */
function overviewItems() {
  const k = { slug: 'k', title: 'Kilo', type: 'cluster' };
  const l = { slug: 'l', title: 'Lima', type: 'cluster' };
  const m = { slug: 'm', title: 'Mike', type: 'cluster' };
  return [k, l, m,
    concept('a', { clusters: ['k'], requires: ['b', 'c'], uses: ['c', 'd'] }),
    concept('b', { clusters: ['k'] }),
    concept('c', { clusters: ['l', 'm'], related: ['a'] }),
    concept('d', { clusters: ['l'] }),
    concept('loose', { uses: ['a'] })];
}

test('the overview counts the links between the members of two different clusters, by relation', () => {
  const items = overviewItems();
  const index = graphView.index(items, hrefOf);
  const rows = graphView.overviewRows(items.filter((i) => i.type === 'cluster'), index)
    .map((r) => [r.source.slug, r.key, r.target.slug, r.count]);
  // a (k) uses c and d (both l) and c (m); requires c (l, m); c (l, m) related a (k). The
  // link a requires b stays inside k, and `loose` is in no cluster: neither is a row.
  assert.deepStrictEqual(rows, [
    ['k', 'uses', 'l', 2], ['k', 'uses', 'm', 1], ['k', 'requires', 'l', 1], ['k', 'requires', 'm', 1],
    ['l', 'related', 'k', 1], ['m', 'related', 'k', 1]]);
});

test('the overview section: figure, filter, table and meanings; the filter needs no script', () => {
  const items = overviewItems();
  const index = graphView.index(items, hrefOf);
  const view = graphView.overviewSection(items.filter((i) => i.type === 'cluster'), index);
  assert.deepStrictEqual(view.findings, []);
  assert.match(view.html, /^<h2 id="overview">How the clusters connect<\/h2>/u);
  const [svg] = svgs(view.html);
  assert.deepStrictEqual(lint.svgViolations(svg), []);
  assert.match(svg, /aria-labelledby="overview_clusters-title overview_clusters-desc"/u);
  const texts = [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/gu)].map((t) => t[1]);
  assert.deepStrictEqual(texts.slice(0, 4), ['Clusters', 'Kilo', 'Lima', 'Mike']);
  assert.ok(texts.includes('uses ×2, requires'), texts.join(' | '));
  // The filter: one radio per relation the table holds, plus "every relation", checked.
  const radios = [...view.html.matchAll(/<input type="radio" name="relation-filter" id="relation-filter-([a-z-]*)"[^>]*>/gu)];
  assert.deepStrictEqual(radios.map((r) => r[1]), ['all', 'related', 'uses', 'requires'], 'in the order of AGSC-03-01');
  assert.match(radios[0][0], / checked>$/u);
  assert.ok(view.html.indexOf('class="relation-filter"') < view.html.indexOf('<div class="table-wrap">'), 'the filter comes before the table it filters');
  const rows = [...view.html.matchAll(/<tr data-relation="([a-z-]+)"><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gu)]
    .map((r) => [r[1], r[2].replace(/<[^>]+>/gu, ''), r[3], r[4].replace(/<[^>]+>/gu, ''), r[5], r[6]]);
  assert.deepStrictEqual(rows[0], ['uses', 'Kilo', 'uses', 'Lima', '2', MEANING.get('uses')]);
  assert.strictEqual(rows.length, 6);
  assert.doesNotMatch(view.html, /style=|<script|on[a-z]+=/u, 'no inline style, no script, no handler (AGSC-06-17)');
});

test('the overview says so when no relation crosses two clusters, and is empty without clusters', () => {
  const k = { slug: 'k', title: 'Kilo', type: 'cluster' };
  const items = [k, concept('a', { clusters: ['k'], requires: ['b'] }), concept('b', { clusters: ['k'] })];
  const view = graphView.overviewSection([k], graphView.index(items, hrefOf));
  assert.match(view.html, /No relation joins the members of two different clusters/u);
  assert.deepStrictEqual(svgs(view.html), []);
  assert.deepStrictEqual(graphView.overviewSection([], graphView.index([], hrefOf)), { findings: [], html: '' });
});

test('the overview draws at most 24 rows and says how many more there are', () => {
  const clusters = Array.from({ length: 30 }, (_, n) => ({ slug: `c${String(n).padStart(2, '0')}`, title: `Cluster ${n}`, type: 'cluster' }));
  const items = [...clusters, ...clusters.map((c, n) => concept(`i${String(n).padStart(2, '0')}`, {
    clusters: [c.slug], related: [`i${String((n + 1) % 30).padStart(2, '0')}`], uses: [`i${String((n + 3) % 30).padStart(2, '0')}`],
  }))];
  const view = graphView.overviewSection(clusters, graphView.index(items, hrefOf));
  assert.strictEqual((view.html.match(/<tr data-relation=/gu) || []).length, 24);
  assert.match(view.html, /36 more relations between clusters are not drawn or listed here;/u);
  assert.deepStrictEqual(lint.svgViolations(svgs(view.html)[0]), []);
});

test('the overview figure draws at most 24 clusters and says how many it left out', () => {
  const clusters = Array.from({ length: 30 }, (_, n) => ({ slug: `c${String(n).padStart(2, '0')}`, title: `Cluster ${n}`, type: 'cluster' }));
  const items = [...clusters, concept('i29', { clusters: ['c29'], uses: ['i28'] }), concept('i28', { clusters: ['c28'] })];
  const view = graphView.overviewSection(clusters, graphView.index(items, hrefOf));
  const [svg] = svgs(view.html);
  assert.strictEqual((svg.match(/<rect /gu) || []).length, 1 + graphView.MEMBERS_DRAWN, 'the header and 24 clusters');
  assert.match(svg, />Cluster 29</u, 'the linked clusters are drawn first');
  assert.match(view.html, /<p class="relations-more">The figure draws 24 of the 30 clusters; the list of clusters names every one\.<\/p>/u);
  assert.strictEqual((view.html.match(/<tr data-relation=/gu) || []).length, 1, 'the table is not cut');
  // Every cluster drawn: no sentence.
  const few = graphView.overviewSection(clusters.slice(28), graphView.index(items, hrefOf)).html;
  assert.doesNotMatch(few, /The figure draws/u);
});

test('the legend lists the fourteen keys in the order of AGSC-03-01, each with its inverse and meaning', () => {
  const legend = graphView.legendSection();
  assert.match(legend, /^<h2 id="legend">The fourteen relations<\/h2>/u);
  const rows = [...legend.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gu)].map((r) => r.slice(1));
  assert.deepStrictEqual(rows.map((r) => r[0]), [...LINK_KEYS]);
  assert.deepStrictEqual(rows.map((r) => r[2]), RELATIONS.map((r) => r.meaning));
  assert.deepStrictEqual(rows.find((r) => r[0] === 'uses')[1], 'used-by');
  assert.deepStrictEqual(rows.find((r) => r[0] === 'related')[1], 'related (both ways)');
});
