'use strict';
// The `build` case of the graph view (AGSC-06-38):
//
//   build-0032  an item page shows its neighbourhood as a figure with a relations table
//               beside it — one row per relation key that links the item and another
//               published item, in either direction, with the key, the direction, the
//               other item and the meaning of the key — whose incoming rows are the
//               backlinks; a draft and a held-back item are neither drawn nor named; the
//               figure draws at most 24 neighbours and the table says how many more.
//
// Each sub-case is a Bundle written to a scratch folder: the minimal fixture's
// configuration, front page and `security.txt`, and the case's items (with the date and
// provenance every item needs), built by the writer at the fixed instant. The page is
// read as markup: the rows of `<table class="relations">`, the `<svg>` before it, and the
// note after it.

const path = require('node:path');
const nodeFs = require('node:fs');
const os = require('node:os');
const { createFileSystem, readSchemas } = require('../../../src/adapters/node-fs.js');
const { createClock } = require('../../../src/adapters/node-clock.js');
const validate = require('../../../src/knowledge/validate.js');
const { loadBundle } = require('../../../src/application/bundle.js');
const { RELATIONS } = require('../../../src/knowledge/relations.js');
const site = require('../../../src/distribution/site.js');
const { checks, deepEqual } = require('./_assert.js');

const MEANING = new Map(RELATIONS.map((r) => [r.key, r.meaning]));

/** One frontmatter member in the YAML subset: a scalar or a block sequence of scalars. */
function yamlLines(key, value) {
  if (Array.isArray(value)) return [`${key}:`, ...value.map((v) => `  - ${JSON.stringify(String(v))}`)];
  return [`${key}: ${JSON.stringify(String(value))}`];
}

/** Build the minimal fixture's frame with `items` and the `releases` switchboard; the built site. */
function buildItems(root, items, releases) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-build-0032-'));
  try {
    const fixture = path.join(root, 'tests', 'fixtures', 'minimal');
    const config = JSON.parse(nodeFs.readFileSync(path.join(fixture, 'agsc.config.json'), 'utf8'));
    if (releases) config.releases = releases;
    nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
    nodeFs.mkdirSync(path.join(dir, 'content', 'concepts'), { recursive: true });
    nodeFs.copyFileSync(path.join(fixture, 'content', 'index.md'), path.join(dir, 'content', 'index.md'));
    nodeFs.cpSync(path.join(fixture, '.well-known'), path.join(dir, '.well-known'), { recursive: true });
    for (const { slug, body, ...fields } of items) {
      const lines = ['---', ...Object.entries({ date: '2026-01-01', ...fields }).flatMap(([k, v]) => yamlLines(k, v)),
        'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', body || `${slug}.\n`];
      nodeFs.writeFileSync(path.join(dir, 'content', 'concepts', `${slug}.md`), lines.join('\n'));
    }
    const fs = createFileSystem(dir);
    const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(root)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    return site.build(bundle, { clock, fs }, { specVersion: '1.0.0', version: '0.0.2' });
  } finally {
    nodeFs.rmSync(dir, { force: true, recursive: true });
  }
}

/** The relations section of a page: its table rows as `{key, direction, other, meaning}`, its figure and its note. */
function readSection(page) {
  const start = page.indexOf('id="links"');
  if (start < 0) return { figure: '', more: '', rows: [] };
  const table = page.slice(page.indexOf('<table class="relations">', start), page.indexOf('</table>', start));
  const rows = [...table.matchAll(/<tr>(.*?)<\/tr>/gu)].slice(1).map((m) => {
    const cells = [...m[1].matchAll(/<td>(.*?)<\/td>/gu)].map((c) => c[1]);
    const href = /href="\/concepts\/([^/"]+)\/"/u.exec(cells[2]);
    return { direction: cells[1], key: cells[0], meaning: cells[3], other: href ? href[1] : cells[2] };
  });
  const figure = (/<svg[\s\S]*?<\/svg>/u.exec(page.slice(start)) || [''])[0];
  const more = (/<p class="relations-more">(\d+) more/u.exec(page.slice(start)) || [null, ''])[1];
  return { figure, more, rows };
}

/** The sub-case `rows-and-exclusions`: the rows of a, and the names that must not appear. */
function rowsCase(input, expected, root) {
  const built = buildItems(root, input.items, input.releases);
  const page = String(built.files.get('/concepts/a/index.html'));
  const { figure, rows } = readSection(page);
  const got = rows.map(({ direction, key, other }) => ({ direction, key, other }))
    .sort((x, y) => `${x.direction}${x.key}${x.other}`.localeCompare(`${y.direction}${y.key}${y.other}`));
  const list = [['rows of a', deepEqual(got, expected.rows_of_a), JSON.stringify(got)]];
  list.push(['a figure, with the table as its text equivalent',
    (figure !== '' && rows.length > 0) === expected.figure_has_text_equivalent, `${figure.length} bytes of figure, ${rows.length} rows`]);
  list.push(['the meaning of the key in every row',
    rows.every((r) => r.meaning === MEANING.get(r.key)) === expected.meaning_in_every_row, JSON.stringify(rows.map((r) => r.meaning))]);
  for (const slug of expected.not_named_on_the_page_of_a) {
    const item = input.items.find((i) => i.slug === slug);
    const named = page.includes(`/concepts/${slug}/`) || page.includes(`>${item.title}<`);
    list.push([`${slug} is not named`, !named, `the page of a names ${slug}`]);
  }
  return list;
}

/** A sub-case with `linking_items` (`cap-at-24`): that many items link to the target; the figure draws 24. */
function capCase(input, expected, root) {
  const target = { body: 'Target.\n', kind: 'explainer', slug: input.target, title: 'Target', type: 'concept' };
  const linking = Array.from({ length: input.linking_items }, (_, n) => ({
    ...input.items_template, slug: `n${String(n + 1).padStart(2, '0')}`, title: `N ${n + 1}`,
  }));
  const built = buildItems(root, [target, ...linking]);
  const { figure, more, rows } = readSection(String(built.files.get(`/concepts/${input.target}/index.html`)));
  const drawn = (figure.match(/marker-end=/gu) || []).length;
  return [
    ['neighbours drawn', drawn === expected.figure_neighbours && rows.length === drawn, `${drawn} arrows, ${rows.length} rows`],
    ['more neighbours stated', Number(more) === expected.more_neighbours_stated, `the note says ${JSON.stringify(more)}`],
  ];
}

/** build-0032 (AGSC-06-38). */
function graphViewCase(vector, ctx) {
  const root = (ctx && ctx.root) || '.';
  const list = [];
  const cases = vector.expected.cases;
  for (const input of vector.input.cases) {
    const expected = cases.find((c) => c.name === input.name);
    if (expected === undefined) {
      list.push([input.name, false, 'no expected sub-case of that name']);
      continue;
    }
    list.push(...(input.linking_items === undefined ? rowsCase(input, expected, root) : capCase(input, expected, root)));
  }
  list.push(['every expected sub-case ran', cases.every((c) => vector.input.cases.some((i) => i.name === c.name)),
    JSON.stringify(cases.map((c) => c.name))]);
  return checks(list);
}

module.exports = { HANDLERS: { 'build-0032': graphViewCase } };
