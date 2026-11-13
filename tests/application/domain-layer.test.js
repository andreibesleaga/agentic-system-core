'use strict';
// verifies AGSC-01-41, AGSC-05-38
// The domain layer through the verbs: the loader reads the file `domain.vocabulary` names
// (AGSC-01-41), `lint` and `build` judge it (AGSC-05-38), and the build publishes its
// triples in the three graph files and in no per-item view. A Bundle with no `domain`
// object, or with one that names no vocabulary, writes every graph byte as 1.0 does.
// Each run works on a scratch copy of `tests/fixtures/minimal`; the clock is fixed at
// 2026-01-01T00:00:00Z and nothing reaches the network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const N3 = require('n3');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { main } = require('../../src/application/cli/main.js');
const site = require('../../src/distribution/site.js');
const { captureStream } = require('../conformance/areas/_shared.js');
const { FAULTS, VALID } = require('../knowledge/_domain-fixtures.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const SCHEMAS = validate.schemas(readSchemas(ROOT));
const GRAPH_ROUTES = ['/graph.nq', '/graph.ttl', '/graph.jsonld'];

/** A scratch copy of the fixture whose configuration gains `domain` (or keeps none), with `files` added. */
function scratch(domain, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-domain-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const configFile = path.join(dir, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (domain !== undefined) fs.writeFileSync(configFile, `${JSON.stringify({ ...config, domain }, null, 2)}\n`);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}

/** The routes of one build of the Bundle at `dir`, as `site.build` returns them. */
function built(dir) {
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: SCHEMAS });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0', version: '0.0.2' }).files;
}

/** `agsc <verb> --json` over the Bundle at `dir`: the exit code and the findings. */
function run(dir, verb) {
  const stdout = captureStream();
  const exit = main([verb, '--json', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: EPOCH }, ports: { fs: createFileSystem(dir) }, root: dir,
    specVersion: '1.0.0', stderr: captureStream(), stdout, version: '1.0.0',
  });
  return { exit, findings: JSON.parse(stdout.text() || '{}').findings || [] };
}

const pagesOf = (files) => [...files.keys()].filter((route) => route.startsWith('/pages/') && route.endsWith('.jsonld'));

test('a domain object that names no vocabulary changes no byte of the graph files or the per-item views', () => {
  const plain = built(scratch(undefined));
  for (const domain of [{}, { contexts: [] }]) {
    const files = built(scratch(domain));
    for (const route of [...GRAPH_ROUTES, ...pagesOf(plain)]) assert.strictEqual(files.get(route), plain.get(route), route);
  }
});

test('a site vocabulary adds exactly its own triples to graph.nq, and nothing to a per-item view', () => {
  const plain = built(scratch(undefined));
  const files = built(scratch({ vocabulary: 'domain/vocabulary.ttl' }, { 'domain/vocabulary.ttl': VALID }));
  const lines = (text) => text.split('\n').filter(Boolean);
  const added = lines(files.get('/graph.nq')).filter((line) => !lines(plain.get('/graph.nq')).includes(line));
  assert.strictEqual(added.length, 21);
  assert.ok(added.every((line) => line.endsWith(' <https://minimal.example/> .')), 'every triple is in the Bundle graph');
  assert.deepStrictEqual(lines(plain.get('/graph.nq')).filter((line) => !lines(files.get('/graph.nq')).includes(line)), []);
  for (const route of pagesOf(plain)) assert.strictEqual(files.get(route), plain.get(route), route);
  const triples = (text, format) => new N3.Parser({ format }).parse(text).length;
  assert.strictEqual(triples(files.get('/graph.ttl'), 'Turtle'), triples(files.get('/graph.nq'), 'N-Quads'));
  assert.ok(!files.has('/domain/vocabulary.ttl'), 'the file is an input, never a route (AGSC-01-41)');
  // AGSC-05-39: the files that change are the graph files and those that carry their digests.
  const changed = [...new Set([...plain.keys(), ...files.keys()])].filter((route) => plain.get(route) !== files.get(route)).sort();
  assert.deepStrictEqual(changed, ['/.well-known/knowledge-linkset', '/graph.jsonld', '/graph.nq', '/graph.ttl', '/now.md', '/now/index.html']);
});

test('the loader reads the vocabulary, and a named file that is absent is AGSC-E901', () => {
  const dir = scratch({ vocabulary: 'domain/vocabulary.ttl', shapes: 'domain/shapes.ttl' }, { 'domain/vocabulary.ttl': VALID });
  const bundle = loadBundle(createFileSystem(dir), { schemas: SCHEMAS });
  assert.strictEqual(bundle.domain.vocabulary, VALID);
  assert.deepStrictEqual(bundle.findings.map((f) => [f.code, f.file]), [['AGSC-E901', 'domain/shapes.ttl']]);
  assert.strictEqual(loadBundle(createFileSystem(scratch(undefined)), { schemas: SCHEMAS }).domain, undefined);
});

test('lint and build refuse a vocabulary outside the rules; lint runs the configuration checks of the domain object', () => {
  const faulty = scratch({ vocabulary: 'domain/vocabulary.ttl' }, { 'domain/vocabulary.ttl': FAULTS[0].text });
  const linted = run(faulty, 'lint');
  assert.strictEqual(linted.exit, 1);
  assert.deepStrictEqual(linted.findings.map((f) => f.code), ['AGSC-E420', 'AGSC-E420']);
  const builtFaulty = run(faulty, 'build');
  assert.strictEqual(builtFaulty.exit, 1);
  assert.deepStrictEqual(builtFaulty.findings.map((f) => f.code), ['AGSC-E420', 'AGSC-E420']);
  assert.ok(!fs.existsSync(path.join(faulty, 'www')), 'a build with an error writes nothing (AGSC-09-08)');
  const misplaced = scratch({ vocabulary: 'content/vocabulary.ttl' }, { 'content/vocabulary.ttl': VALID });
  assert.deepStrictEqual(run(misplaced, 'lint').findings.map((f) => f.code), ['AGSC-E204']);
});

test('a valid vocabulary lints and builds clean, and the vocabulary file is no route', () => {
  const dir = scratch({ vocabulary: 'domain/vocabulary.ttl' }, { 'domain/vocabulary.ttl': VALID });
  assert.deepStrictEqual(run(dir, 'lint'), { exit: 0, findings: [] });
  assert.strictEqual(run(dir, 'build').exit, 0);
  assert.ok(fs.readFileSync(path.join(dir, 'www', 'graph.nq'), 'utf8').includes('<https://minimal.example/ns/domain#Engine>'));
  assert.ok(!fs.existsSync(path.join(dir, 'www', 'domain')));
});

// ---------------------------------------------------------------- the item keys (AGSC-02-25, AGSC-03-27)

const HANDOFF = fs.readFileSync(path.join(FIXTURE, 'content', 'concepts', 'handoff.md'), 'utf8');
/** `handoff.md` with the front-matter lines `keys` added after its last key. */
const handoffWith = (keys) => ({ 'content/concepts/handoff.md': HANDOFF.replace('kind: pattern\n', `kind: pattern\n${keys}\n`) });
const VOCABULARY = { 'domain/vocabulary.ttl': VALID };

test('an item that states the domain keys with names the vocabulary defines lints clean and builds its triples', () => {
  const dir = scratch({ vocabulary: 'domain/vocabulary.ttl' }, { ...VOCABULARY,
    ...handoffWith('domain_type: Engine\ndomain_role: aggregate-root\ndomain_links:\n  controlled-by:\n    - supervisor') });
  assert.deepStrictEqual(run(dir, 'lint'), { exit: 0, findings: [] });
  assert.strictEqual(run(dir, 'build').exit, 0);
  const graph = fs.readFileSync(path.join(dir, 'www', 'graph.nq'), 'utf8');
  assert.ok(graph.includes('<https://minimal.example/concepts/handoff/> <https://minimal.example/ns/domain#controlled-by> <https://minimal.example/concepts/supervisor/>'));
  assert.ok(graph.includes('<https://minimal.example/concepts/supervisor/> <https://minimal.example/ns/domain#controls> <https://minimal.example/concepts/handoff/>'));
});

test('lint and build refuse a domain type or member the vocabulary does not define (AGSC-E418, AGSC-E317)', () => {
  const dir = scratch({ vocabulary: 'domain/vocabulary.ttl' }, { ...VOCABULARY,
    ...handoffWith('domain_type: Turbine\ndomain_links:\n  controls:\n    - supervisor') });
  const linted = run(dir, 'lint');
  assert.strictEqual(linted.exit, 1);
  assert.deepStrictEqual(linted.findings.map((f) => [f.code, f.file, f.key]), [
    ['AGSC-E317', 'content/concepts/handoff.md', 'controls'], ['AGSC-E418', 'content/concepts/handoff.md', 'domain_type']]);
  const builtFaulty = run(dir, 'build');
  assert.strictEqual(builtFaulty.exit, 1);
  assert.deepStrictEqual(builtFaulty.findings.map((f) => f.code).sort(), ['AGSC-E317', 'AGSC-E418']);
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'a build with an error writes nothing (AGSC-09-08)');
});

test('a domain type on a node with no vocabulary file is AGSC-E418; domain links there are the warning AGSC-E207, as in 1.0', () => {
  const dir = scratch(undefined, handoffWith('domain_type: Engine\ndomain_links:\n  owns:\n    - supervisor'));
  const linted = run(dir, 'lint');
  assert.strictEqual(linted.exit, 1);
  assert.deepStrictEqual(linted.findings.map((f) => [f.code, f.key, f.severity]), [
    ['AGSC-E207', 'domain_links', 'warn'], ['AGSC-E418', 'domain_type', 'error']]);
  const linksOnly = scratch(undefined, handoffWith('domain_links:\n  owns:\n    - supervisor'));
  for (const verb of ['lint', 'build']) {
    const got = run(linksOnly, verb);
    assert.deepStrictEqual(got.findings.map((f) => [f.code, f.key, f.severity]), [['AGSC-E207', 'domain_links', 'warn']], verb);
    assert.strictEqual(got.exit, 0, `${verb}: a warning changes no exit code`);
  }
});
