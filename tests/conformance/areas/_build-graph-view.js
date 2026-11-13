'use strict';
// The `build` cases of the graph view (AGSC-06-38):
//
//   build-0032  an item page shows its neighbourhood as a figure with a relations table
//               beside it — one row per relation key that links the item and another
//               published item, in either direction, with the key, the direction, the
//               other item and the meaning of the key — whose incoming rows are the
//               backlinks; a draft and a held-back item are neither drawn nor named; the
//               figure draws at most 24 neighbours and the table says how many more.
//   build-0031  on a node that uses the domain layer, the relations table also shows the
//               other item's domain type and context, and the page shows the item's own
//               domain type, role, context and warrant in a definition list under the
//               table, each with its label; a node without the layer shows none of these.
//               The node of the case: a site vocabulary whose classes are the domain types
//               the items state, each with the label of the case, in the namespace of the
//               item's context; each context a cluster item titled with its label and
//               declared in `domain.contexts`.
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

/** One frontmatter member in the YAML subset: a scalar, a block sequence of scalars, or a map of scalars. */
function yamlLines(key, value) {
  if (Array.isArray(value)) return [`${key}:`, ...value.map((v) => `  - ${JSON.stringify(String(v))}`)];
  if (value !== null && typeof value === 'object') return [`${key}:`, ...Object.entries(value).map(([k, v]) => `  ${k}: ${JSON.stringify(String(v))}`)];
  return [`${key}: ${JSON.stringify(String(value))}`];
}

/**
 * Build the minimal fixture's frame with `items`, the `releases` switchboard and, for a node
 * that uses the domain layer, its `domain` configuration and files; the built site.
 */
function buildItems(root, items, releases, domain) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-build-0032-'));
  try {
    const fixture = path.join(root, 'tests', 'fixtures', 'minimal');
    const config = JSON.parse(nodeFs.readFileSync(path.join(fixture, 'agsc.config.json'), 'utf8'));
    if (releases) config.releases = releases;
    if (domain) config.domain = domain.config;
    nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
    for (const folder of ['concepts', 'clusters']) nodeFs.mkdirSync(path.join(dir, 'content', folder), { recursive: true });
    for (const [rel, text] of Object.entries(domain ? domain.files : {})) {
      nodeFs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      nodeFs.writeFileSync(path.join(dir, rel), text);
    }
    nodeFs.copyFileSync(path.join(fixture, 'content', 'index.md'), path.join(dir, 'content', 'index.md'));
    nodeFs.cpSync(path.join(fixture, '.well-known'), path.join(dir, '.well-known'), { recursive: true });
    for (const { slug, body, ...fields } of items) {
      const lines = ['---', ...Object.entries({ date: '2026-01-01', ...fields }).flatMap(([k, v]) => yamlLines(k, v)),
        'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', body || `${slug}.\n`];
      const folder = fields.type === 'cluster' ? 'clusters' : 'concepts';
      nodeFs.writeFileSync(path.join(dir, 'content', folder, `${slug}.md`), lines.join('\n'));
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

/** The site namespace of the case's vocabulary, and the namespace of each declared context. */
const SITE_NAMESPACE = 'https://minimal.example/ns/domain#';
const contextNamespace = (cluster) => `https://minimal.example/ns/${cluster}#`;

/**
 * The domain layer of a build-0031 case: a site vocabulary with one class per domain type the
 * items state, labelled as the case says, in the namespace of the item's context; and each
 * context a declared cluster item titled with its label. `null` when the case has no labels
 * (the node does not use the layer).
 */
function domainNode(input) {
  if (input.labels === undefined) return null;
  const contexts = [...new Set(input.items.map((i) => i.domain_context).filter((c) => c !== undefined))].sort();
  const classes = input.items.filter((i) => i.domain_type !== undefined).map((i) => [
    `<${i.domain_context === undefined ? SITE_NAMESPACE : contextNamespace(i.domain_context)}${i.domain_type}> a owl:Class ;`,
    `    rdfs:subClassOf asc:Concept ; rdfs:label ${JSON.stringify(input.labels[i.domain_type])} .`].join('\n'));
  const vocabulary = ['@prefix asc: <https://w3id.org/agentic-system-core/ns#> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', '',
    '<https://minimal.example/ns/domain> a owl:Ontology ; rdfs:label "Domain" .', 'asc:Concept a owl:Class .', '', ...classes, ''].join('\n');
  return {
    clusters: contexts.map((slug) => ({ kind: 'explainer', slug, title: input.labels[slug], type: 'cluster' })),
    config: { contexts: contexts.map((cluster) => ({ cluster, namespace: contextNamespace(cluster) })), vocabulary: 'domain/vocabulary.ttl' },
    files: { 'domain/vocabulary.ttl': vocabulary },
  };
}

/** The text of a cell or a definition: its markup without tags. */
const textOf = (html) => html.replace(/<[^>]*>/gu, '');

/** The `{term, value}` entries of the domain definition list of a page; `[]` when there is none. */
function domainList(page) {
  const list = /<dl class="meta domain">([\s\S]*?)<\/dl>/u.exec(page);
  if (list === null) return [];
  return [...list[1].matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/gu)].map((m) => ({ term: textOf(m[1]), value: textOf(m[2]) }));
}

/** The relations table of a page as its column headings and its rows of cell texts and item links. */
function relationsTable(page) {
  const start = page.indexOf('<table class="relations">');
  if (start < 0) return { headings: [], rows: [] };
  const table = page.slice(start, page.indexOf('</table>', start));
  const headings = [...table.matchAll(/<th scope="col">(.*?)<\/th>/gu)].map((m) => m[1]);
  const rows = [...table.matchAll(/<tr>(.*?)<\/tr>/gu)].slice(1).map((m) => [...m[1].matchAll(/<td>(.*?)<\/td>/gu)].map((c) => c[1]));
  return { headings, rows };
}

/** One sub-case of build-0031: the definition list and the relations table of the page of `engine`. */
function domainCase(input, expected, root) {
  const node = domainNode(input);
  const built = buildItems(root, [...input.items, ...(node === null ? [] : node.clusters)], undefined, node);
  const page = String(built.files.get('/concepts/engine/index.html'));
  const list = [[`${input.name} definition list`, deepEqual(domainList(page), expected.definition_list_of_engine), JSON.stringify(domainList(page))]];
  const { headings, rows } = relationsTable(page);
  const column = (heading) => headings.indexOf(heading);
  const cell = (cells, heading) => (column(heading) < 0 ? null : textOf(cells[column(heading)]));
  const domainColumns = column('Domain type') >= 0 || column('Domain context') >= 0;
  if (expected.table_has_domain_columns !== undefined) {
    list.push([`${input.name} domain columns`, domainColumns === expected.table_has_domain_columns, JSON.stringify(headings)]);
  }
  const want = expected.table_row_of_engine;
  if (want !== undefined) {
    const row = rows.find((cells) => cell(cells, 'Relation') === want.key && cell(cells, 'Direction') === want.direction
      && cells[column('Item')].includes(`href="/concepts/${want.other}/"`));
    list.push([`${input.name} row ${want.key} ${want.other}`, row !== undefined
      && cell(row, 'Domain type') === want.other_domain_type && cell(row, 'Domain context') === want.other_context,
    JSON.stringify({ headings, rows })]);
  }
  return list;
}

/** build-0031 (AGSC-06-38, the domain parts). */
function domainPartsCase(vector, ctx) {
  const root = (ctx && ctx.root) || '.';
  const list = [];
  const cases = vector.expected.cases;
  for (const input of vector.input.cases) {
    const expected = cases.find((c) => c.name === input.name);
    if (expected === undefined) list.push([input.name, false, 'no expected sub-case of that name']);
    else list.push([`${input.name} name`, expected.name === input.name, input.name], ...domainCase(input, expected, root));
  }
  list.push(['every expected sub-case ran', cases.every((c) => vector.input.cases.some((i) => i.name === c.name)),
    JSON.stringify(cases.map((c) => c.name))]);
  return checks(list);
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

module.exports = { HANDLERS: { 'build-0031': domainPartsCase, 'build-0032': graphViewCase } };
