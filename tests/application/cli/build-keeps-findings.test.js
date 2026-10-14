'use strict';
// AGSC-09-11 for `build` and `ci`: a fault that stops the build is reported beside
// every finding gathered before it, and never replaces a specific fault by a
// generic one. Before the fix:
//   (a) an attachment entry without `media_type` — `lint` says `AGSC-E202`; `build`
//       said only `AGSC-E601` "value of type undefined is not JSON", with no file;
//   (b) a string holding a lone surrogate written as an escape (`"Hand\uD800off"` in
//       YAML, `"\ud800"` in the configuration) passed `lint` and failed `build` with
//       `AGSC-E601` "lone surrogate in string" and no file or key;
//   (c) any fault thrown with a registered code inside the build discarded every
//       finding the build and its configuration gate had gathered.
// (b) is now `AGSC-E108` with its file and key, from `lint`, `build` and `ci` alike
// (AGSC-01-14 as amended 2026-10-06).
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the minimal fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const HANDOFF = path.join('content', 'concepts', 'handoff.md');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-keep-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function cleanEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
  return { ...env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' };
}

function agsc(dir, args) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--json'], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  return { exit: r.status, envelope: JSON.parse(r.stdout), stderr: r.stderr };
}

function edit(dir, rel, from, to) {
  const file = path.join(dir, rel);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${rel} does not contain ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
}

const codes = (envelope) => envelope.findings.map((f) => f.code);

test('(a) an attachment entry without media_type is AGSC-E202 in build as in lint, never AGSC-E601', (t) => {
  const dir = scratch(t);
  edit(dir, HANDOFF, 'kind: pattern\n', 'kind: pattern\nattachments:\n  - file: note.txt\n    alt: A note\n');
  fs.mkdirSync(path.join(dir, 'content', 'attachments', 'handoff'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'content', 'attachments', 'handoff', 'note.txt'), 'A note.\n');
  const lint = agsc(dir, ['lint']);
  const build = agsc(dir, ['build']);
  assert.equal(lint.exit, 1);
  assert.equal(build.exit, 1);
  assert.ok(codes(lint.envelope).includes('AGSC-E202'), JSON.stringify(lint.envelope.findings));
  const missing = build.envelope.findings.filter((f) => f.code === 'AGSC-E202');
  assert.equal(missing.length, 1, JSON.stringify(build.envelope.findings));
  assert.equal(missing[0].file, 'content/concepts/handoff.md');
  assert.ok(!codes(build.envelope).includes('AGSC-E601'), JSON.stringify(build.envelope.findings));
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'a build with an error writes nothing');
});

test('(b) a lone surrogate in an item value is AGSC-E108 with file and key, in lint, build and ci', (t) => {
  const dir = scratch(t);
  edit(dir, HANDOFF, 'title: Handoff\n', 'title: "Hand\\uD800off"\n');
  for (const verb of ['lint', 'build', 'ci']) {
    const r = agsc(dir, [verb]);
    assert.equal(r.exit, 1, `${verb}: ${r.stderr}`);
    const fault = r.envelope.findings.filter((f) => f.code === 'AGSC-E108');
    assert.equal(fault.length, 1, `${verb}: ${JSON.stringify(r.envelope.findings)}`);
    assert.equal(fault[0].file, 'content/concepts/handoff.md', verb);
    assert.match(fault[0].message, /\/title/u, verb);
    assert.ok(!codes(r.envelope).includes('AGSC-E601'), `${verb}: ${JSON.stringify(r.envelope.findings)}`);
  }
});

test('(b, c) a lone surrogate in the configuration is AGSC-E108 on agsc.config.json, and the gathered warnings stay', (t) => {
  const dir = scratch(t);
  // A gathered warning: a concept without a description is AGSC-E408 (AGSC-02-21).
  edit(dir, path.join('content', 'concepts', 'supervisor.md'),
    'description: A coordinating agent that routes work to specialised workers and collects their results.\n', '');
  edit(dir, 'agsc.config.json', '"title": "Minimal Bundle"', '"title": "Mini\\ud800mal Bundle"');
  const r = agsc(dir, ['build']);
  assert.equal(r.exit, 1, r.stderr);
  const fault = r.envelope.findings.filter((f) => f.code === 'AGSC-E108');
  assert.equal(fault.length, 1, JSON.stringify(r.envelope.findings));
  assert.equal(fault[0].file, 'agsc.config.json');
  assert.match(fault[0].message, /\/site\/title/u);
  assert.ok(codes(r.envelope).includes('AGSC-E408'), JSON.stringify(r.envelope.findings));
  assert.ok(!codes(r.envelope).includes('AGSC-E601'), JSON.stringify(r.envelope.findings));
});

test('(c) a fault thrown with a registered code inside the build keeps every finding gathered before it', (t) => {
  const dir = scratch(t);
  edit(dir, path.join('content', 'concepts', 'supervisor.md'),
    'description: A coordinating agent that routes work to specialised workers and collects their results.\n', '');
  // A warning of the configuration gate: the development placeholder (AGSC-01-19).
  edit(dir, 'agsc.config.json', '"base": "https://minimal.example/"', '"base": "http://localhost/"');
  const site = require('../../../src/distribution/site.js');
  const { main } = require('../../../src/application/cli/main.js');
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const jsonld = require('../../../src/knowledge/jsonld.js');
  const nquads = require('../../../src/knowledge/nquads.js');
  const original = site.build;
  t.after(() => { site.build = original; });
  // The real build, with one emitter that throws a registered code part-way.
  site.build = (bundle, ports, options) => original(bundle, ports, {
    ...options,
    graph: {
      context: (o) => jsonld.context(o.ontologyTerms || [], jsonld.allExternalProperties()),
      jsonld: (items, o) => jsonld.toJsonLd(items, o),
      nquads: (items, o) => nquads.toNQuads(items, o),
      turtle: () => { const e = new Error('blank node in an RDF export'); e.code = 'AGSC-E605'; throw e; },
    },
  });
  let out = '';
  const stdout = { write: (s) => { out += s; } };
  const stderr = { write: () => {} };
  const exit = main(['build', '--json'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir, stderr, stdout,
  });
  assert.equal(exit, 1);
  const envelope = JSON.parse(out);
  assert.ok(codes(envelope).includes('AGSC-E605'), out);
  assert.ok(codes(envelope).includes('AGSC-E408'), `the gathered warning was discarded: ${out}`);
  assert.ok(codes(envelope).includes('AGSC-E506'), `the configuration gate's warning was discarded: ${out}`);
});

test('one broken body reference is one finding: AGSC-E310 from build as from lint, once in ci (AGSC-03-11, AGSC-09-11)', (t) => {
  // Seen in adopt-0009's run for 1.0.0 (package S3): `ci` reported the build's
  // `AGSC-E901` "links …, and this build emits no route for it" beside the lint's
  // `AGSC-E310` for the same reference, and `build` alone reported only the E901.
  const dir = scratch(t);
  edit(dir, HANDOFF, 'for the agent that usually initiates a handoff.\n',
    'for the agent that usually initiates a handoff.\n\nSee [the note](missing.md) and ![a sketch](../assets/nope.png).\n');
  for (const verb of ['lint', 'build', 'ci']) {
    const r = agsc(dir, [verb]);
    assert.equal(r.exit, 1, verb);
    const errors = r.envelope.findings.filter((f) => f.severity === 'error');
    assert.deepEqual(errors.map((f) => f.code), ['AGSC-E310', 'AGSC-E310'], `${verb}: ${JSON.stringify(errors)}`);
    for (const f of errors) assert.equal(f.file, 'content/concepts/handoff.md', verb);
  }
});
