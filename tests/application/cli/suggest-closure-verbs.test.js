'use strict';
// verifies AGSC-05-35, AGSC-05-37, AGSC-09-09
// tests/application/cli/suggest-closure-verbs.test.js — the two verb paths of the ontology
// pipeline's reasoning stage: `lint --suggest` (AGSC-05-35) and `export --closure`
// (AGSC-05-37), each driven through its own module over a copy of `tests/fixtures/minimal`.
// The whole-file bytes are the vectors lint-0046..0050, graph-0041 and graph-0042.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { createClock } = require('../../../src/adapters/node-clock.js');
const lintVerb = require('../../../src/application/cli/verbs/lint.js');
const exportVerb = require('../../../src/application/cli/verbs/export.js');
const buildVerb = require('../../../src/application/cli/verbs/build.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const temporaries = [];
test.after(() => { for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true }); });

function workspace(extra = {}) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-suggest-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(extra)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function ctxFor(dir, verbFlags = {}) {
  const notes = [];
  return {
    argv: [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes,
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0',
    stderr: { write: (text) => notes.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags,
    version: '0.0.2',
  };
}

const read = (dir, at) => nodeFs.readFileSync(path.join(dir, at), 'utf8');
const exists = (dir, at) => nodeFs.existsSync(path.join(dir, at));

/** `{ path: sha256 }` of every file under `dir/sub`, to prove a folder was not touched. */
function treeHash(dir, sub) {
  const out = {};
  const walk = (at) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name);
      if (entry.isDirectory()) walk(file);
      else out[path.relative(dir, file)] = createHash('sha256').update(nodeFs.readFileSync(file)).digest('hex');
    }
  };
  walk(path.join(dir, sub));
  return out;
}

const linked = {
  'content/concepts/alpha.md': ['---', 'type: concept', 'kind: principle', 'title: Alpha note',
    'description: A concept that links to another in its body, for the suggestion tests.',
    'tags:', '  - agents', '  - patterns', 'clusters:', '  - agent-patterns',
    'prov:', '  origin: human', '  operator: human:tester', '---', '', 'Builds on [beta](beta).', ''].join('\n'),
  'content/concepts/beta.md': ['---', 'type: concept', 'kind: principle', 'title: Beta note',
    'description: A concept that another links to in its body, for the suggestion tests.',
    'tags:', '  - agents', '  - patterns', 'clusters:', '  - agent-patterns',
    'prov:', '  origin: human', '  operator: human:tester', '---', '', 'A short body.', ''].join('\n'),
};

// ---------------------------------------------------------------- lint --suggest

test('AGSC-05-35: lint --suggest writes dist/suggestions.json and leaves content/ byte for byte as it was', () => {
  const dir = workspace(linked);
  const before = treeHash(dir, 'content');
  const ctx = ctxFor(dir, { suggest: true });
  lintVerb.run(ctx);
  assert.deepStrictEqual(treeHash(dir, 'content'), before, 'the content tree changed');
  const text = read(dir, 'dist/suggestions.json');
  assert.ok(text.endsWith('}\n') && !text.endsWith('\n\n'));
  const parsed = JSON.parse(text);
  assert.deepStrictEqual(parsed.suggestions.map((s) => [s.generator, s.source, s.target, s.key]), [['G1', 'alpha', 'beta', 'related']]);
  assert.match(ctx.notes.join(''), /wrote: dist\/suggestions\.json sha256:[0-9a-f]{64}/u);
});

test('AGSC-05-35: lint without --suggest writes nothing, and a second --suggest gives the same bytes', () => {
  const dir = workspace(linked);
  lintVerb.run(ctxFor(dir));
  assert.ok(!exists(dir, 'dist'));
  lintVerb.run(ctxFor(dir, { suggest: true }));
  const first = read(dir, 'dist/suggestions.json');
  lintVerb.run(ctxFor(dir, { suggest: true }));
  assert.strictEqual(read(dir, 'dist/suggestions.json'), first);
});

test('AGSC-05-35: the suggestions are never part of a build', () => {
  const dir = workspace(linked);
  lintVerb.run(ctxFor(dir, { suggest: true }));
  buildVerb.run(ctxFor(dir));
  assert.ok(!exists(dir, 'www/suggestions.json'));
  assert.ok(!nodeFs.readdirSync(path.join(dir, 'www'), { recursive: true }).some((f) => /suggestions/u.test(f)));
});

// ---------------------------------------------------------------- export --closure

test('AGSC-05-37: export --closure writes dist/export/closure.nt, the closure of the graph.nq of the same build', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { closure: true });
  const result = exportVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity === 'error'), []);
  buildVerb.run(ctxFor(dir));
  const closure = require('../../../src/knowledge/closure.js');
  const ontology = nodeFs.readFileSync(path.join(ROOT, 'ontology', 'agsc.ttl'), 'utf8');
  assert.strictEqual(read(dir, 'dist/export/closure.nt'), closure.closure(read(dir, 'www/graph.nq'), [ontology]).text);
  assert.match(read(dir, 'dist/export/closure.nt'), /skos\/core#Concept> <https:\/\/minimal\.example\/> \.\n/u);
  assert.match(ctx.notes.join(''), /wrote: dist\/export\/closure\.nt sha256:[0-9a-f]{64}/u);
});

test('AGSC-05-37: a second export --closure gives the same bytes, and the closure is in no published surface', () => {
  const dir = workspace();
  exportVerb.run(ctxFor(dir, { closure: true }));
  const first = read(dir, 'dist/export/closure.nt');
  exportVerb.run(ctxFor(dir, { closure: true }));
  assert.strictEqual(read(dir, 'dist/export/closure.nt'), first);
  buildVerb.run(ctxFor(dir));
  assert.ok(!nodeFs.readdirSync(path.join(dir, 'www'), { recursive: true }).some((f) => /closure/u.test(f)));
});

test('AGSC-05-37: the closure reads the site vocabulary named by domain.vocabulary', () => {
  const vocabulary = ['@prefix asc: <https://w3id.org/agentic-system-core/ns#> .',
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .', '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '<https://minimal.example/ns/domain> a owl:Ontology .',
    '<https://minimal.example/ns/domain#Engine> a owl:Class ; rdfs:label "Engine" ; rdfs:subClassOf asc:Lesson .', ''].join('\n');
  const dir = workspace({ 'domain/vocabulary.ttl': vocabulary });
  const config = JSON.parse(read(dir, 'agsc.config.json'));
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify({ ...config, domain: { vocabulary: 'domain/vocabulary.ttl' } }, null, 2)}\n`);
  const ctx = ctxFor(dir, { closure: true });
  assert.deepStrictEqual(exportVerb.run(ctx).findings.filter((f) => f.severity === 'error'), []);
  assert.ok(exists(dir, 'dist/export/closure.nt'));
});

test('AGSC-05-37: a domain.vocabulary that names no file is one honest finding, and nothing is written', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { closure: true });
  ctx.config = { ...ctx.config, domain: { vocabulary: 'domain/missing.ttl' } };
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(ctx.config, null, 2)}\n`);
  const result = exportVerb.run(ctx);
  // AGSC-01-41: the loader reports the absent file, once, as AGSC-E901.
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E901']);
  assert.match(result.findings[0].message, /domain\/missing\.ttl/u);
  assert.ok(!exists(dir, 'dist/export/closure.nt'));
});

test('AGSC-05-37: a vocabulary that is not Turtle is AGSC-E420, and nothing is written', () => {
  const dir = workspace({ 'domain/vocabulary.ttl': 'this is not turtle <<<\n' });
  const config = JSON.parse(read(dir, 'agsc.config.json'));
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify({ ...config, domain: { vocabulary: 'domain/vocabulary.ttl' } }, null, 2)}\n`);
  const result = exportVerb.run(ctxFor(dir, { closure: true }));
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E420' && f.severity === 'error'));
  assert.ok(!exists(dir, 'dist/export/closure.nt'));
});

test('AGSC-05-37: an irreflexive use is a warning, written beside the file, and the run still succeeds', () => {
  const dir = workspace({ 'content/concepts/loner.md': ['---', 'type: concept', 'kind: principle', 'title: Loner note',
    'description: A concept that excludes itself, for the closure warning test.', 'tags:', '  - agents', '  - patterns',
    'clusters:', '  - agent-patterns', 'excludes:', '  - loner', 'prov:', '  origin: human', '  operator: human:tester',
    '---', '', 'A short body.', ''].join('\n') });
  const result = exportVerb.run(ctxFor(dir, { closure: true }));
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E313' && f.severity === 'warn'));
  assert.ok(exists(dir, 'dist/export/closure.nt'));
});

test('AGSC-05-37: a build with no graph.nq (Level 0) gives one honest finding and no closure.nt', () => {
  const dir = workspace();
  const result = exportVerb.run(ctxFor(dir, { level: '0', closure: true }));
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E001' && /no \/graph\.nq/u.test(f.message)));
  assert.ok(!exists(dir, 'dist/export/closure.nt'));
});
