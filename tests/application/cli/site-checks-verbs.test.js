'use strict';
// verifies AGSC-09-20, AGSC-05-41
// The check of a site's invariants and competency questions through the command line
// (AGSC-09-20): `verify` and `ci` run it where the Bundle declares `domain.shapes` or
// `domain.questions`; a finding of severity error makes the verb exit 1 and fails the gate of
// `ci`, a warning changes no exit code; `lint` and `build` never run it; a claim of a Level
// below 3 does not run it (AGSC-10-19); a Bundle with neither key exits as 1.0 does. Each run
// works on a scratch copy of `tests/fixtures/minimal` with the files of vector lint-0057 and
// lint-0059 added; the clock is fixed at 2026-01-01T00:00:00Z and nothing reaches the network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { main } = require('../../../src/application/cli/main.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const VECTORS = path.join(ROOT, 'tests', 'vectors', 'lint');
/**
 * The files of a vector with one change: its vocabulary declares the inverse pair in one direction
 * only (`controls owl:inverseOf controlled-by`), so `controls`, which `ctl` authors, is not the
 * computed member of the pair (AGSC-03-27) and the node is clean for `lint` too. The vectors run
 * `verify` alone and declare the pair both ways, which makes `controls` computed.
 */
function lintClean(file) {
  const files = { ...require(path.join(VECTORS, file)).input.add_files };
  const vocabulary = files['domain/vocabulary.ttl'];
  files['domain/vocabulary.ttl'] = vocabulary.replace('    owl:inverseOf dom:controls ;\n', '');
  assert.notStrictEqual(files['domain/vocabulary.ttl'], vocabulary);
  return files;
}
const INVARIANT = lintClean('lint-0057-invariant-violation-is-an-error.json');
const QUESTIONS = lintClean('lint-0059-competency-question-answers-are-checked.json');
const SITE_CODES = ['AGSC-E420', 'AGSC-E421', 'AGSC-E422'];

/** A scratch copy of the fixture with `files` added (each `{path: text}`). */
function scratch(...fileSets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-site-checks-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [file, text] of Object.entries(Object.assign({}, ...fileSets))) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}

/** The configuration of `files` with its `domain` object replaced. */
const withDomain = (files, domain) => ({
  'agsc.config.json': `${JSON.stringify({ ...JSON.parse(files['agsc.config.json']), domain }, null, 2)}\n`,
});

/** `agsc <argv> --json` over the Bundle at `dir`: the exit code and the findings. */
function run(dir, ...argv) {
  const stdout = captureStream();
  const exit = main([...argv, '--json', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir,
    specVersion: '1.0.0', stderr: captureStream(), stdout, version: '1.0.0',
  });
  return { exit, findings: JSON.parse(stdout.text() || '{}').findings || [] };
}

const siteFindings = (findings) => findings.filter((f) => SITE_CODES.includes(f.code)).map((f) => [f.code, f.severity, f.slug]);
const gateOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'gate.json'), 'utf8'));

test('verify: a violated invariant is the error AGSC-E421 and the verb exits 1', () => {
  const got = run(scratch(INVARIANT), 'verify');
  assert.deepStrictEqual(siteFindings(got.findings), [['AGSC-E421', 'error', 'engine-a']]);
  assert.strictEqual(got.exit, 1);
});

test('verify: an invariant of sh:Warning severity is a warning and changes no exit code', () => {
  const shapes = INVARIANT['domain/shapes.ttl'].replace('sh:severity sh:Violation', 'sh:severity sh:Warning');
  const got = run(scratch(INVARIANT, { 'domain/shapes.ttl': shapes }), 'verify');
  assert.deepStrictEqual(siteFindings(got.findings), [['AGSC-E421', 'warn', 'engine-a']]);
  assert.strictEqual(got.exit, 0);
});

test('ci: a violated invariant exits 1 and fails the verify check of the gate verdict', () => {
  const dir = scratch(INVARIANT);
  const got = run(dir, 'ci');
  assert.strictEqual(got.exit, 1);
  assert.deepStrictEqual(siteFindings(got.findings), [['AGSC-E421', 'error', 'engine-a']]);
  const gate = gateOf(dir);
  assert.strictEqual(gate.status, 'fail');
  const verifyCheck = gate.checks.find((c) => c.name === 'verify');
  assert.strictEqual(verifyCheck.status, 'fail');
  assert.deepStrictEqual(verifyCheck.findings.map((f) => f.code), ['AGSC-E421']);
});

test('ci: the same node passes when the invariant holds and the questions agree', () => {
  const shapes = INVARIANT['domain/shapes.ttl'].replace('sh:targetClass dom:Engine', 'sh:targetNode <https://minimal.example/concepts/engine-b/>');
  const questions = JSON.parse(QUESTIONS['domain/questions.json']).map((q) => (q.id === 'engines'
    ? { ...q, expected: { rows: [['<https://minimal.example/concepts/engine-a/>'], ['<https://minimal.example/concepts/engine-b/>']] } } : q));
  const dir = scratch(INVARIANT, QUESTIONS, { 'domain/questions.json': JSON.stringify(questions), 'domain/shapes.ttl': shapes },
    withDomain(INVARIANT, { questions: 'domain/questions.json', shapes: 'domain/shapes.ttl', vocabulary: 'domain/vocabulary.ttl' }));
  const got = run(dir, 'ci');
  assert.deepStrictEqual(got.findings.filter((f) => f.severity === 'error'), []);
  assert.strictEqual(got.exit, 0);
  assert.strictEqual(gateOf(dir).status, 'pass');
});

test('ci: a competency question that differs is AGSC-E422 naming its id, and ci exits 1', () => {
  const got = run(scratch(QUESTIONS), 'ci');
  assert.deepStrictEqual(siteFindings(got.findings), [['AGSC-E422', 'error', 'engines']]);
  assert.strictEqual(got.exit, 1);
});

test('ci: the invariants and the questions together, with both files declared', () => {
  const files = { ...INVARIANT, ...QUESTIONS, ...withDomain(INVARIANT, {
    questions: 'domain/questions.json', shapes: 'domain/shapes.ttl', vocabulary: 'domain/vocabulary.ttl',
  }) };
  const got = run(scratch(files), 'ci');
  assert.deepStrictEqual(siteFindings(got.findings), [['AGSC-E421', 'error', 'engine-a'], ['AGSC-E422', 'error', 'engines']]);
  assert.strictEqual(got.exit, 1);
});

test('lint and build never run the check: the same Bundle passes them', () => {
  const dir = scratch(INVARIANT, QUESTIONS, withDomain(INVARIANT, {
    questions: 'domain/questions.json', shapes: 'domain/shapes.ttl', vocabulary: 'domain/vocabulary.ttl',
  }));
  for (const verb of ['lint', 'build']) {
    const got = run(dir, verb);
    assert.deepStrictEqual(siteFindings(got.findings), [], verb);
    assert.strictEqual(got.exit, 0, `${verb}: ${JSON.stringify(got.findings)}`);
  }
});

test('ci --level 2 does not run the check of AGSC-09-20, which belongs to the full engine of Level 3', () => {
  const dir = scratch(INVARIANT);
  assert.deepStrictEqual(siteFindings(run(dir, 'ci', '--level', '2').findings), []);
  assert.deepStrictEqual(siteFindings(run(dir, 'ci', '--level', '3').findings), [['AGSC-E421', 'error', 'engine-a']]);
});

test('a shapes file outside the subset is AGSC-E420 on the file, and verify exits 1', () => {
  const shapes = INVARIANT['domain/shapes.ttl'].replace('sh:minCount 1 ;', 'sh:minCount 1 ;\n    sh:sparql shp:Anything ;');
  const got = run(scratch(INVARIANT, { 'domain/shapes.ttl': shapes }), 'verify');
  assert.deepStrictEqual(got.findings.filter((f) => SITE_CODES.includes(f.code)).map((f) => [f.code, f.file]), [['AGSC-E420', 'domain/shapes.ttl']]);
  assert.strictEqual(got.exit, 1);
});

test('a named file that is absent is the loader\'s AGSC-E901 and the check of that file is not run', () => {
  const dir = scratch(INVARIANT, withDomain(INVARIANT, { questions: 'domain/questions.json', vocabulary: 'domain/vocabulary.ttl' }));
  const got = run(dir, 'verify');
  assert.deepStrictEqual(got.findings.map((f) => [f.code, f.file]), [['AGSC-E901', 'domain/questions.json']]);
  assert.strictEqual(got.exit, 1);
});

test('a named path outside the path grammar is AGSC-E204 in verify, which exits 1 and checks nothing it could not read', () => {
  for (const shapes of ['./domain/shapes.ttl', '../shapes.ttl']) {
    const dir = scratch(INVARIANT, withDomain(INVARIANT, { shapes, vocabulary: 'domain/vocabulary.ttl' }));
    const got = run(dir, 'verify');
    assert.deepStrictEqual(got.findings.map((f) => [f.code, f.file, f.severity]), [['AGSC-E204', 'agsc.config.json', 'error']], shapes);
    assert.match(got.findings[0].message, /domain\.shapes/);
    assert.strictEqual(got.exit, 1, shapes);
  }
});

test('shapes and questions without a site vocabulary run on the graph with no site classes (AGSC-01-41)', () => {
  const question = [{ expected: true, id: 'any-concept', query: 'ASK { ?x a <https://w3id.org/agentic-system-core/ns#Concept> }', question: 'Is there a concept?' }];
  const dir = scratch({ 'domain/questions.json': JSON.stringify(question) }, withDomain(INVARIANT, { questions: 'domain/questions.json' }));
  const got = run(dir, 'verify');
  assert.deepStrictEqual(siteFindings(got.findings), []);
  assert.strictEqual(got.exit, 0);
});

test('a Bundle with no domain keys: verify and ci exit as 1.0 does and raise none of the three codes', () => {
  const dir = scratch();
  for (const verb of ['verify', 'ci']) {
    const got = run(dir, verb);
    assert.strictEqual(got.exit, 0, `${verb}: ${JSON.stringify(got.findings)}`);
    assert.deepStrictEqual(siteFindings(got.findings), [], verb);
  }
  assert.deepStrictEqual(gateOf(dir).checks.map((c) => c.name), ['lint', 'build', 'verify', 'forge']);
});
