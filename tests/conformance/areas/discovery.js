'use strict';
// Conformance area `discovery` (owner: WP-10-E).
// disc-0003 the RFC 9264 link set at Level ≥ 2, disc-0004 the Level-0 form,
// disc-0005 the two-node mutual peer check, disc-0006 / disc-0007 the byte layout
// of /llms.txt and /llms-full.txt. disc-0001 and disc-0002 are withdrawn and are
// never run (AGSC-00-16).

const discovery = require('../../../src/distribution/discovery.js');
const site = require('../../../src/distribution/site.js');
const llms = require('../../../src/distribution/llms.js');
const { checks, deepEqual } = require('./_assert.js');

/** Every digest a Level-2 document carries; the bytes themselves are not the case. */
function digestsFor(routes) {
  const out = {};
  for (const route of routes) out[route] = discovery.digestOf(route);
  return out;
}

function linksetCase(vector) {
  const expected = vector.expected;
  const doc = discovery.linkset({ site: { base: vector.input.base } }, {
    level: 2,
    ledgerHead: vector.input.ledger_head,
    digests: digestsFor(['/graph.jsonld', '/llms.txt', '/graph.nq', '/graph.ttl',
      '/ns/context.jsonld', '/ns/agsc.ttl', '/now.md', '/skills/index.json', '/ledger.jsonl']),
    counts: discovery.countsOf([]),
    generatedAt: '2026-01-01T00:00:00Z',
    specVersion: vector.options.spec_version,
    bundleHash: discovery.digestOf('bundle'),
  });
  const context = doc.linkset[0];
  const relations = Object.keys(context).filter((k) => k !== 'anchor');
  const anchorLink = context.describedby[0];
  const ledgerLink = context[`${discovery.REL}ledger`][0];
  const everyValueIsArray = relations.every((relation) => context[relation]
    .every((one) => discovery.attributesOf(one).every((name) => Array.isArray(one[name]))));

  return checks([
    ['top-level members', deepEqual(Object.keys(doc), expected.top_level_members),
      `found [${Object.keys(doc).join(', ')}]`],
    ['media type', discovery.MEDIA_TYPE === expected.media_type, discovery.MEDIA_TYPE],
    ['path', discovery.WELLKNOWN_PATH === expected.path, discovery.WELLKNOWN_PATH],
    ['profile', discovery.PROFILE === expected.profile, discovery.PROFILE],
    ['anchor link attributes', deepEqual(discovery.attributesOf(anchorLink), expected.anchor_link_attributes),
      JSON.stringify(discovery.attributesOf(anchorLink))],
    ['ledger link attributes', deepEqual(discovery.attributesOf(ledgerLink), expected.ledger_link_attributes),
      JSON.stringify(discovery.attributesOf(ledgerLink))],
    ['attribute values are arrays', everyValueIsArray === expected.attribute_values_are_arrays, 'a target attribute is not an array'],
    ['relations allowed', relations.every((r) => expected.relations_allowed.includes(r)),
      `unexpected ${JSON.stringify(relations.filter((r) => !expected.relations_allowed.includes(r)))}`],
    ['relations forbidden', expected.relations_forbidden.every((r) => !relations.includes(r)),
      'a forbidden short name is used'],
    ['the document validates', discovery.check(doc, { level: 2 }).length === 0,
      JSON.stringify(discovery.check(doc, { level: 2 }))],
  ]);
}

function level0Case(vector) {
  const expected = vector.expected;
  const doc = vector.input.wellknown;
  const errors = discovery.check(doc, { level: 0 });
  const context = doc.linkset[0];
  const attributes = Object.keys(context)
    .filter((k) => k !== 'anchor')
    .flatMap((relation) => context[relation].flatMap((one) => discovery.attributesOf(one)));
  // The same builder at Level 0 must produce a document of the SAME shape: the
  // route set a publisher offers is its own (a CMS export need not publish
  // `/specs/`), but the structure and the omissions are the rule.
  const built = discovery.linkset({ site: { base: vector.input.base } }, { level: 0 });
  const builtAttributes = Object.keys(built.linkset[0])
    .filter((k) => k !== 'anchor')
    .flatMap((relation) => built.linkset[0][relation].flatMap((one) => discovery.attributesOf(one)));
  return checks([
    ['valid', (errors.length === 0) === expected.valid, JSON.stringify(errors)],
    ['top-level members', deepEqual(Object.keys(doc), expected.top_level_members), JSON.stringify(Object.keys(doc))],
    ['media type', discovery.MEDIA_TYPE === expected.media_type, discovery.MEDIA_TYPE],
    ['path', discovery.WELLKNOWN_PATH === expected.path, discovery.WELLKNOWN_PATH],
    ['profile', discovery.PROFILE === expected.profile, discovery.PROFILE],
    ['attributes omitted', expected.attributes_omitted.every((name) => !attributes.includes(name)),
      JSON.stringify(attributes)],
    ['the Level-0 builder emits the same shape',
      deepEqual(Object.keys(built), ['linkset'])
      && typeof built.linkset[0].anchor === 'string'
      && builtAttributes.length === 0
      && discovery.check(built, { level: 0 }).length === 0,
      JSON.stringify(built)],
  ]);
}

function peerCase(vector) {
  const expected = vector.expected;
  const nodes = vector.input.nodes.map((node) => ({
    url: discovery.wellknownUrl(node.base),
    level: 0,
    doc: discovery.linkset({ site: { base: node.base }, peers: [node.peer] }, { level: 0 }),
  }));
  const result = discovery.peerCheck(nodes);
  return checks([
    ['both resolve', result.both_resolve === expected.both_resolve, String(result.both_resolve)],
    ['each names the other', result.each_names_the_other === expected.each_names_the_other, String(result.each_names_the_other)],
    ['mutual', result.mutual === expected.mutual, String(result.mutual)],
    ['peer relation', result.peer_relation === expected.peer_relation, result.peer_relation],
  ]);
}

function llmsCase(vector) {
  const input = vector.input;
  const bundle = { ...input.bundle, clusters: input.clusters, items: input.items };
  const options = { generatedAt: input.generated_at, specVersion: input.spec_version };
  const index = llms.llmsTxt(bundle, options);
  const list = [];
  const expectedIndex = vector.expected.output === undefined ? vector.expected.llms_txt : vector.expected.output;
  list.push(['/llms.txt bytes', index === expectedIndex, JSON.stringify(index)]);
  if (vector.expected.llms_full_txt !== undefined) {
    const full = llms.llmsFullTxt(bundle, options);
    list.push(['/llms-full.txt bytes', full === vector.expected.llms_full_txt, JSON.stringify(full)]);
  }
  if (vector.expected.draft_excluded !== undefined) {
    list.push(['drafts excluded', vector.expected.draft_excluded.every((slug) => !index.includes(`/${slug}/`)),
      'a draft item reached /llms.txt']);
  }
  if (vector.expected.both_appears_once_under !== undefined) {
    const { order } = llms.sectionBlocks({ ...bundle, base: bundle.base });
    const both = order.filter((it) => it.slug === 'both');
    list.push(['the item appears once, under its primary cluster',
      both.length === 1 && llms.primaryCluster(both[0]) === vector.expected.both_appears_once_under,
      `appeared ${both.length} time(s)`]);
  }
  return checks(list);
}

/**
 * disc-0008 (rc.5, V9A-26) — AGSC-06-14: every published item is reachable from
 * `/llms.txt`, directly or through a LISTED cluster section.
 *
 * Reachability is read off the emitted index itself: an item is reachable when its
 * IRI appears under a section heading. The case no earlier vector covered is an item
 * whose primary cluster is not listed — it belongs under `Other` beside the
 * unclustered item, and a writer that places it nowhere fails this MUST.
 */
function reachabilityCase(vector) {
  const input = vector.input;
  const listed = new Set(input.listed_clusters || []);
  const bundle = {
    ...input.bundle,
    clusters: (input.clusters || []).filter((c) => listed.has(String(c.slug))),
    items: input.items,
  };
  const options = { generatedAt: '2026-01-01T00:00:00Z', specVersion: (vector.options || {}).spec_version };
  const text = llms.llmsTxt(bundle, options);
  const full = llms.llmsFullTxt(bundle, options);
  const list = [];

  // The sections the index carries, in order, and what each one lists.
  const sections = [];
  const sectionOf = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^## (.+)$/u.exec(line);
    if (heading !== null) { current = heading[1]; sections.push(current); continue; }
    const entry = /^- \[[^\]]*\]\(([^)]+)\)/u.exec(line);
    if (entry !== null && current !== null) sectionOf.set(entry[1], current);
  }
  list.push(['sections', deepEqual(vector.expected.sections, sections), JSON.stringify(sections)]);
  const reachable = {};
  for (const [iri, section] of [...sectionOf.entries()].sort()) reachable[iri] = section;
  list.push(['reachable', deepEqual(vector.expected.reachable, reachable), JSON.stringify(reachable)]);

  const published = (input.items || []).filter(llms.isPublished);
  const unreachable = published.map((it) => llms.iriOf(bundle.base, it)).filter((iri) => !sectionOf.has(iri));
  list.push(['unreachable', deepEqual(vector.expected.unreachable, unreachable), JSON.stringify(unreachable)]);
  for (const iri of vector.expected.not_published || []) {
    // AGSC-02-23: a draft is not published, so it is neither reachable nor a fault.
    list.push([`not_published ${iri}`, !text.includes(iri) && !full.includes(iri), 'a draft reached the index']);
  }
  if (vector.expected.llms_full_reachability_identical === true) {
    const fullSections = new Map();
    let heading = null;
    for (const line of full.split('\n')) {
      const h = /^## (.+)$/u.exec(line);
      const entry = /^- \[[^\]]*\]\(([^)]+)\)/u.exec(line);
      if (h !== null && entry === null && !line.startsWith('- ')) heading = h[1];
      if (entry !== null && heading !== null) fullSections.set(entry[1], heading);
    }
    list.push(['llms_full_reachability_identical',
      deepEqual([...sectionOf.entries()].sort(), [...fullSections.entries()].sort()),
      JSON.stringify([...fullSections.entries()])]);
  }
  return checks(list);
}

/**
 * disc-0009 (rc.5, V9A-26) — AGSC-06-19: `sitemap.xml` completeness, URL order and
 * one `lastmod` equal to the BUILD INSTANT for every entry.
 *
 * The XML serialisation is deliberately not asserted (`xml_bytes_asserted: false`):
 * no rule pins it. `jsonld_types_closed_set` asserts only that the rule's closed set
 * of schema.org types is what the writer may emit, not which page takes which.
 */
function sitemapCase(vector) {
  const base = String(vector.input.site.base).replace(/\/+$/u, '');
  const xml = site.sitemap(base, vector.input.published_routes, vector.input.build_instant);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((m) => m[1]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/gu)].map((m) => m[1]);
  const list = [
    ['urls', deepEqual(vector.expected.urls, urls), JSON.stringify(urls)],
    ['every route once', urls.length === vector.input.published_routes.length, JSON.stringify(urls)],
    ['lastmod', lastmods.every((v) => v === vector.expected.lastmod), JSON.stringify(lastmods)],
    ['one lastmod for every entry', lastmods.length === urls.length, JSON.stringify(lastmods)],
    ['xml_bytes_asserted', vector.expected.xml_bytes_asserted === false,
      'no rule pins the XML serialisation of AGSC-06-19'],
  ];
  if (vector.expected.lastmod_is_build_instant === true) {
    // AGSC-04-02/04-09: a per-item date would make the file depend on content dates
    // and break the double build; a second build at another instant moves every
    // entry together and nothing else.
    const other = site.sitemap(base, vector.input.published_routes, '2027-02-03T00:00:00Z');
    const moved = [...other.matchAll(/<lastmod>([^<]+)<\/lastmod>/gu)].map((m) => m[1]);
    list.push(['lastmod_is_build_instant', moved.every((v) => v === '2027-02-03T00:00:00Z'),
      JSON.stringify(moved)]);
    list.push(['the same instant reproduces the same bytes',
      site.sitemap(base, vector.input.published_routes, vector.input.build_instant) === xml, '']);
  }
  for (const type of vector.expected.jsonld_types_closed_set || []) {
    list.push([`jsonld type ${type}`, ['Dataset', 'DefinedTerm', 'TechArticle'].includes(type),
      'AGSC-06-19 names exactly Dataset, DefinedTerm and TechArticle']);
  }
  return checks(list);
}

const HANDLERS = {
  'disc-0003': linksetCase,
  'disc-0004': level0Case,
  'disc-0005': peerCase,
  'disc-0006': llmsCase,
  'disc-0007': llmsCase,
  'disc-0008': reachabilityCase,
  'disc-0009': sitemapCase,
};

module.exports.run = (vector) => {
  const handler = HANDLERS[vector.id];
  if (handler === undefined) return { status: 'fail', detail: `no handler for ${vector.id}` };
  return handler(vector);
};
