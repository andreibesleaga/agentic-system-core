'use strict';
// AGSC-09-11 for `ci`: a fault that the build throws part-way, with a registered code,
// is reported beside every finding the lint lane and the configuration gate gathered
// before it. `build` has the same rule, tested in build-keeps-findings.test.js; this
// file walks the `ci` lane, where the build runs after lint.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; a scratch copy of the minimal
// fixture, removed afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const site = require('../../../src/distribution/site.js');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const jsonld = require('../../../src/knowledge/jsonld.js');
const nquads = require('../../../src/knowledge/nquads.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-ci-keep-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function edit(dir, rel, from, to) {
  const file = path.join(dir, rel);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${rel} does not contain ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
}

/** The real build, with one emitter that throws a registered code part-way. */
function throwingBuild(t, code) {
  const original = site.build;
  t.after(() => { site.build = original; });
  site.build = (bundle, ports, options) => original(bundle, ports, {
    ...options,
    graph: {
      context: (o) => jsonld.context(o.ontologyTerms || [], jsonld.allExternalProperties()),
      jsonld: (items, o) => jsonld.toJsonLd(items, o),
      nquads: (items, o) => nquads.toNQuads(items, o),
      turtle: () => { const e = new Error('blank node in an RDF export'); e.code = code; throw e; },
    },
  });
}

function run(dir, verb) {
  let out = '';
  let err = '';
  const stdout = { write: (s) => { out += s; } };
  const stderr = { write: (s) => { err += s; } };
  const exit = main([verb, '--json'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir, stderr, stdout,
  });
  return { envelope: out === '' ? null : JSON.parse(out), err, exit, out };
}

const codes = (envelope) => envelope.findings.map((f) => f.code);

test('AGSC-09-11: ci keeps the lint and configuration findings gathered before a coded fault of the build', (t) => {
  const dir = scratch(t);
  // A lint warning: a concept without a description is AGSC-E408 (AGSC-02-21).
  edit(dir, path.join('content', 'concepts', 'supervisor.md'),
    'description: A coordinating agent that routes work to specialised workers and collects their results.\n', '');
  // A warning of the configuration gate: the development placeholder (AGSC-01-19).
  edit(dir, 'agsc.config.json', '"base": "https://minimal.example/"', '"base": "http://localhost/"');
  throwingBuild(t, 'AGSC-E605');
  const r = run(dir, 'ci');
  assert.equal(r.exit, 1, r.out);
  assert.ok(codes(r.envelope).includes('AGSC-E605'), r.out);
  assert.ok(codes(r.envelope).includes('AGSC-E408'), `the lint lane's warning was discarded: ${r.out}`);
  assert.ok(codes(r.envelope).includes('AGSC-E506'), `the configuration gate's warning was discarded: ${r.out}`);
});

test('AGSC-09-11: a fault without a registered code is not given the gathered findings', (t) => {
  const dir = scratch(t);
  edit(dir, path.join('content', 'concepts', 'supervisor.md'),
    'description: A coordinating agent that routes work to specialised workers and collects their results.\n', '');
  const original = site.build;
  t.after(() => { site.build = original; });
  let seen = null;
  site.build = () => { const e = new Error('not a coded fault'); seen = e; throw e; };
  const r = run(dir, 'ci');
  assert.ok(seen !== null, 'the build ran');
  assert.equal(seen.findings, undefined, 'an uncoded fault is passed on as it was thrown');
  // The command line reports it as an internal error, not as a finding of the Bundle.
  assert.equal(r.exit, 1);
  assert.equal(r.envelope, null, r.out);
  assert.match(r.err, /internal error: ci: not a coded fault/u);
});
