'use strict';
// tests/distribution/dataset-block.test.js — AGSC-06-41: the Dataset block of the home page (PRD-072).
//
//   * The block is plain data; the pinned `jsonld` library expands it against the official
//     schema.org context (the extract below) and loses no member, so every member is a term a
//     dataset reader understands, the PROV-O terms included.
//   * `creator` comes from `bundle.creator`, else `site.author` with `site.author_orcid`, and the
//     same Person is `prov:wasAttributedTo`; the licence URL is that of AGSC-06-44.
//   * A restricted node names no download and claims no free access.
//   * A description under 50 characters is the warning AGSC-E202, and a Bundle with no root
//     document gets the root error alone, not a warning about the file that is not there.
//   * fast-check: the block is a pure function of its input, whatever order the served routes
//     come in, and building it twice gives the same bytes.
//
// Deterministic: fixed instant, fixed seed, no network (the context is a local extract).

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fc = require('fast-check');
const jsonld = require('jsonld');

const { catalogBlock, creatorOf, datasetBlock, datasetFindings } = require('../../src/distribution/front-page.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');

/**
 * The terms this block uses, copied verbatim from the official schema.org JSON-LD context
 * (https://schema.org/docs/jsonldcontext.jsonld, fetched 2026-11-07, 210,636 bytes, SHA-256
 * 65d0c5d17def9b171b7697bb0929eed17aa32f19af539e15302b6c20479b8930). The full file is not
 * vendored; these entries are its own.
 */
const SCHEMA_ORG_CONTEXT = Object.freeze({
  '@context': {
    '@vocab': 'http://schema.org/',
    DataDownload: { '@id': 'schema:DataDownload' },
    Dataset: { '@id': 'schema:Dataset' },
    Person: { '@id': 'schema:Person' },
    contentUrl: { '@id': 'schema:contentUrl' },
    creator: { '@id': 'schema:creator' },
    description: { '@id': 'schema:description' },
    distribution: { '@id': 'schema:distribution' },
    encodingFormat: { '@id': 'schema:encodingFormat' },
    isAccessibleForFree: { '@id': 'schema:isAccessibleForFree' },
    license: { '@id': 'schema:license' },
    name: { '@id': 'schema:name' },
    prov: 'http://www.w3.org/ns/prov#',
    sameAs: { '@id': 'schema:sameAs' },
    schema: 'http://schema.org/',
    url: { '@id': 'schema:url' },
    xsd: 'http://www.w3.org/2001/XMLSchema#',
  },
});

const documentLoader = async (url) => {
  if (url !== 'https://schema.org' && url !== 'https://schema.org/') throw new Error(`no network: ${url}`);
  return { contextUrl: null, document: SCHEMA_ORG_CONTEXT, documentUrl: url };
};

const SERVED = ['/graph.jsonld', '/graph.ttl', '/graph.nq', '/chunks.jsonl', '/.well-known/knowledge-linkset'];
const CONFIGURED = {
  bundle: { id: 'example', license_url: 'https://creativecommons.org/licenses/by/4.0/' },
  site: { author: 'Josiah Carberry', author_orcid: '0000-0002-1825-0097', base: 'https://a.example/', title: 'Example Node' },
};
const DESCRIPTION = 'Recurring shapes for arranging agents and the work that passes between them.';
const block = (config, served = SERVED) => datasetBlock({
  config, description: DESCRIPTION, instant: '2026-01-01T00:00:00Z', name: config.site.title, served,
});

/** Every member of the compact block, as the IRIs it must expand to, depth first. */
function members(node, out = []) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@')) continue;
    out.push(key.startsWith('prov:') ? `http://www.w3.org/ns/prov#${key.slice(5)}` : `http://schema.org/${key}`);
    for (const child of [].concat(value)) if (child !== null && typeof child === 'object' && child['@value'] === undefined) members(child, out);
  }
  return out;
}

/** Every property IRI of the expanded form, depth first. */
function expandedMembers(node, out = []) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@')) continue;
    out.push(key);
    for (const child of [].concat(value)) if (child !== null && typeof child === 'object' && child['@value'] === undefined) expandedMembers(child, out);
  }
  return out;
}

test('AGSC-06-41: the jsonld library expands the block against schema.org and loses no member', async () => {
  for (const config of [CONFIGURED, { ...CONFIGURED, visibility: 'restricted' }, { bundle: { id: 'x' }, site: CONFIGURED.site }]) {
    const value = block(config);
    const [expanded] = await jsonld.expand(value, { documentLoader });
    assert.deepEqual(expandedMembers(expanded).sort(), members(value).sort(), JSON.stringify(expanded));
    assert.deepEqual(expanded['@type'], ['http://schema.org/Dataset']);
  }
  const [expanded] = await jsonld.expand(block(CONFIGURED), { documentLoader });
  assert.deepEqual(expanded['http://www.w3.org/ns/prov#generatedAtTime'],
    [{ '@type': 'http://www.w3.org/2001/XMLSchema#dateTime', '@value': '2026-01-01T00:00:00Z' }]);
  assert.equal(expanded['http://schema.org/distribution'].length, 5);
});

test('AGSC-06-41: creator from bundle.creator, else site.author with site.author_orcid; none is invented', () => {
  const base = 'https://a.example/';
  assert.deepEqual(creatorOf({ bundle: { creator: { name: 'A', orcid: '0000-0001-2345-6789' } }, site: { author: 'B', author_orcid: '0000-0002-1825-0097' } }, base),
    { '@id': 'https://orcid.org/0000-0001-2345-6789', '@type': 'Person', name: 'A', sameAs: 'https://orcid.org/0000-0001-2345-6789' });
  assert.deepEqual(creatorOf({ bundle: { creator: { name: 'A' } }, site: { author: 'B', author_orcid: '0000-0002-1825-0097' } }, base),
    { '@id': 'https://a.example/#creator', '@type': 'Person', name: 'A' }, 'bundle.creator wins whole: its missing orcid is not taken from site');
  assert.deepEqual(creatorOf({ site: { author: 'B' } }, base), { '@id': 'https://a.example/#creator', '@type': 'Person', name: 'B' });
  assert.equal(creatorOf({ site: { author_orcid: '0000-0002-1825-0097' } }, base), null);
});

test('AGSC-06-41 as amended 2026-11-10: the block is the Bundle IRI and its RDF holds one Person, the creator and the attributed agent', async () => {
  for (const config of [CONFIGURED, { bundle: { creator: { name: 'A' }, id: 'x' }, site: CONFIGURED.site }]) {
    const quads = await jsonld.toRDF(block(config), { documentLoader, format: 'application/n-quads' });
    const people = new Set(quads.split('\n').filter((line) => line.includes('<http://schema.org/Person>')).map((line) => line.split(' ')[0]));
    assert.equal(people.size, 1, quads);
    const [person] = [...people];
    assert.ok(!person.startsWith('_:'), 'the Person is a named node');
    assert.ok(quads.includes(`<https://a.example/> <http://www.w3.org/ns/prov#wasAttributedTo> ${person} .`), quads);
    assert.ok(quads.includes(`<https://a.example/> <http://schema.org/creator> ${person} .`), quads);
    assert.ok(!/^_:\S+ <http:\/\/schema\.org\/name>/mu.test(quads), 'the name of the Bundle and of the Person are on named nodes');
  }
});

test('AGSC-06-41 with AGSC-06-44: the licence is the versioned URL, else /legal/ under the Content Use Terms, else none', () => {
  assert.equal(block(CONFIGURED).license, 'https://creativecommons.org/licenses/by/4.0/');
  const terms = { bundle: { id: 'x' }, site: { base: 'https://a.example', title: 'T' } };
  assert.equal(datasetBlock({ config: terms, hasLegal: true, instant: 'i', served: [] }).license, 'https://a.example/legal/');
  assert.equal(datasetBlock({ config: terms, hasLegal: false, instant: 'i', served: [] }).license, undefined);
  const prose = { bundle: { id: 'x', license_prose: 'CC0-1.0' }, site: terms.site };
  assert.equal(datasetBlock({ config: prose, hasLegal: true, instant: 'i', served: [] }).license, undefined);
});

test('AGSC-06-41: a restricted node names no download and claims no free access; a public one names what it serves, in order', () => {
  const gated = block({ ...CONFIGURED, visibility: 'restricted' });
  assert.equal(gated.distribution, undefined);
  assert.equal(gated.isAccessibleForFree, undefined);
  const some = block(CONFIGURED, ['/.well-known/knowledge-linkset', '/graph.nq']);
  assert.deepEqual(some.distribution.map((d) => d.contentUrl), ['https://a.example/graph.nq', 'https://a.example/.well-known/knowledge-linkset']);
  assert.equal(block(CONFIGURED, []).distribution, undefined, 'no empty list');
});

test('AGSC-06-41: a description shorter than 50 characters is the warning AGSC-E202, counted in characters', () => {
  assert.deepEqual(datasetFindings('x'.repeat(49)).map((f) => [f.code, f.severity]), [['AGSC-E202', 'warn']]);
  assert.deepEqual(datasetFindings('x'.repeat(50)), []);
  assert.deepEqual(datasetFindings('é'.repeat(50)), [], 'characters, not bytes');
  assert.equal(datasetFindings(undefined).length, 1, 'no description at all');
});

test('AGSC-06-41: with no content/index.md, build reports the missing root and no description warning', () => {
  const root = path.resolve(__dirname, '..', '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-no-root-'));
  try {
    fs.cpSync(path.join(root, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
    fs.rmSync(path.join(dir, 'content', 'index.md'));
    const env = {};
    for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('AGSC_')) env[name] = value;
    env.SOURCE_DATE_EPOCH = '1767225600';
    const r = spawnSync(process.execPath, [path.join(root, 'bin', 'agsc.js'), 'build'], { cwd: dir, encoding: 'utf8', env });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /AGSC-E901 content\/index\.md, the Bundle root, is not there/u);
    assert.doesNotMatch(r.stderr, /AGSC-06-41/u, 'a warning about a file that does not exist');
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

test('property: the block depends on the served set, not on its order, and is the same bytes twice', () => {
  fc.assert(fc.property(fc.shuffledSubarray(SERVED), fc.boolean(), (served, restricted) => {
    const config = { ...CONFIGURED, visibility: restricted ? 'restricted' : 'public' };
    const once = canonicalize(block(config, served));
    assert.equal(canonicalize(block(config, [...served].reverse())), once);
    assert.equal(canonicalize(block(config, new Set(served))), once);
  }), { numRuns: 60, seed: 20261107 });
});

test('AGSC-06-41 as amended 2026-11-10: the DCAT block is written only on the switch, and it repeats the facts of the Dataset block', () => {
  const facts = (dcat) => ({ config: { ...CONFIGURED, discovery: { dcat } }, description: 'd'.repeat(60), instant: '2026-01-01T00:00:00Z', name: 'T', served: ['/graph.nq', '/chunks.jsonl'] });
  assert.equal(catalogBlock(facts(false)), null);
  assert.equal(catalogBlock({ ...facts(true), config: { ...CONFIGURED } }), null, 'off by default');
  const catalog = catalogBlock(facts(true));
  const dataset = datasetBlock(facts(true));
  assert.equal(catalog['dcat:dataset']['@id'], dataset['@id']);
  assert.deepEqual(catalog['dcat:dataset']['dcat:distribution'].map((d) => d['dcat:downloadURL']['@id']), dataset.distribution.map((d) => d.contentUrl));
  assert.deepEqual(catalog['dcat:dataset']['dcat:distribution'][1], { '@type': 'dcat:Distribution', 'dcat:downloadURL': { '@id': 'https://a.example/chunks.jsonl' }, 'dcterms:format': 'application/jsonl' });
  const gated = catalogBlock({ ...facts(true), config: { ...CONFIGURED, discovery: { dcat: true }, visibility: 'restricted' } });
  assert.equal(gated['dcat:dataset']['dcat:distribution'], undefined, 'a restricted node names no download');
});

test('AGSC-06-41 as amended 2026-11-10: a build with discovery.dcat writes both blocks into the one script of /', () => {
  const root = path.resolve(__dirname, '..', '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-dcat-'));
  try {
    fs.cpSync(path.join(root, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
    const configFile = path.join(dir, 'agsc.config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    fs.writeFileSync(configFile, `${JSON.stringify({ ...config, discovery: { dcat: true } }, null, 2)}\n`);
    const env = {};
    for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('AGSC_')) env[name] = value;
    env.SOURCE_DATE_EPOCH = '1767225600';
    const r = spawnSync(process.execPath, [path.join(root, 'bin', 'agsc.js'), 'build'], { cwd: dir, encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr);
    const page = fs.readFileSync(path.join(dir, 'www', 'index.html'), 'utf8');
    const scripts = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gsu)].map((m) => JSON.parse(m[1]));
    assert.equal(scripts.length, 1);
    assert.deepEqual(scripts[0].map((value) => value['@type']), ['Dataset', 'dcat:Catalog']);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
