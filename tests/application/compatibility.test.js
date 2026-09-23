'use strict';
// tests/application/compatibility.test.js — D112 §(3): FORWARD and BACKWARD
// compatibility, end to end, through the real CLI over a real Bundle.
//
// Forward: a 1.1-shaped Bundle — one carrying the names AGSC-00-25 reserves to a
// later version — is READ by this 1.0 engine. `lint` warns with the fitting code
// and nothing else, `build` succeeds, and the reserved members come back byte for
// byte through `lint --fix`, `export --markdown` and `import --from okf`
// (AGSC-00-21, AGSC-00-22).
//
// Backward: a Bundle at an older `spec_version` the rules admit is read with the
// documented behaviour — the same MAJOR is accepted (AGSC-00-15), a MAJOR this tool
// does not implement is refused, and an import of a newer MINOR is refused before
// anything is written unless the operator passes the adapter's `--allow-newer`
// (AGSC-01-22).
//
// The vector `lint-0027` pins the BYTES of the fix and the export for one item;
// this file pins the BEHAVIOUR of the whole invocation around them, which no vector
// can: exit codes, the build succeeding, and the round trip through a second
// Bundle.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { main } = require('../../src/application/cli/main.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

/** An item carrying BOTH a reserved 1.1 key and a vendor key (AGSC-02-05a). */
const RESERVED_ITEM = `---
type: concept
kind: pattern
title: Router
description: A pattern that routes work to the worker that fits it, carried here to prove that a reserved 1.1 key survives a 1.0 engine.
prov:
  origin: human
  operator: human:andreibesleaga
uses:
  - supervisor
weights:
  uses:
    supervisor: 0.8
x-acme-note: keep me
---

## Intent

Route work.
`;

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function workspace(extra = {}) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-compat-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  for (const [at, text] of Object.entries(extra)) {
    if (text === null) { nodeFs.rmSync(path.join(dir, at), { force: true, recursive: true }); continue; }
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function run(argv, dir) {
  const out = [];
  const err = [];
  const exit = main(argv, {
    env: { SOURCE_DATE_EPOCH: EPOCH },
    ports: { fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0-rc.6',
    stderr: { write: (t) => err.push(String(t)) },
    stdout: { write: (t) => out.push(String(t)) },
    version: '0.0.2',
  });
  const text = out.join('');
  return {
    envelope: text.startsWith('{') ? JSON.parse(text) : null,
    exit,
    stderr: err.join(''),
    stdout: text,
  };
}

const at = (dir, file) => nodeFs.readFileSync(path.join(dir, file), 'utf8');
const configOf = (dir, over) => {
  const config = JSON.parse(at(dir, 'agsc.config.json'));
  return `${JSON.stringify({ ...config, ...over }, null, 2)}\n`;
};

// ---------------------------------------------------------------------- forward

test('AGSC-00-21: a 1.1-shaped item lints with ONE warning and no error', () => {
  const dir = workspace({ 'content/concepts/router.md': RESERVED_ITEM });
  const result = run(['lint', '--json', '--quiet'], dir);
  const mine = result.envelope.findings.filter((f) => f.file === 'content/concepts/router.md');
  // Nothing about this item is an ERROR: an unknown key is tolerated, so a 1.1-shaped
  // Bundle is READ rather than refused (AGSC-00-21).
  assert.deepStrictEqual(mine.filter((f) => f.severity === 'error'), [], JSON.stringify(mine));
  // Exactly one diagnostic is about a KEY, and it is the reserved one. (The item's
  // body also draws the AGSC-02-21 section warnings of a `pattern`, which are about
  // the prose and not about this rule.)
  const aboutKeys = mine.filter((f) => f.key !== undefined
    || /weights|x-acme-note/u.test(String(f.message)));
  assert.deepStrictEqual(aboutKeys.map((f) => [f.code, f.severity, f.key]),
    [['AGSC-E207', 'warn', 'weights']], JSON.stringify(aboutKeys));
  // AGSC-02-05a: the vendor key gets no diagnostic at all.
  assert.ok(!result.envelope.findings.some((f) => String(f.message).includes('x-acme-note')),
    JSON.stringify(result.envelope.findings));
});

test('AGSC-00-21: the build SUCCEEDS over a Bundle carrying reserved members', () => {
  const dir = workspace({ 'content/concepts/router.md': RESERVED_ITEM });
  const built = run(['build', '--json', '--quiet'], dir);
  assert.strictEqual(built.exit, 0, built.stdout);
  assert.strictEqual(built.envelope.status, 'pass');
  assert.ok(nodeFs.existsSync(path.join(dir, 'www', 'pages', 'router.md')));
  // The published Markdown view is the lint-normalised SOURCE, so it carries both.
  const view = at(dir, 'www/pages/router.md');
  assert.match(view, /\nweights:\n {2}uses:\n {4}supervisor: 0\.8\n/u);
  assert.match(view, /\nx-acme-note: keep me\n/u);
});

test('AGSC-00-22: the reserved members survive lint --fix, byte for byte', () => {
  const dir = workspace({ 'content/concepts/router.md': RESERVED_ITEM });
  const fixed = run(['lint', '--fix', '--json', '--quiet'], dir);
  assert.notStrictEqual(fixed.exit, 2, fixed.stdout);
  const after = at(dir, 'content/concepts/router.md');
  assert.match(after, /\nweights:\n {2}uses:\n {4}supervisor: 0\.8\n/u);
  assert.match(after, /\nx-acme-note: keep me\n/u);
  // Idempotent: a second `--fix` moves nothing, so the preservation is stable and
  // not a value that drifts one step per run.
  run(['lint', '--fix', '--json', '--quiet'], dir);
  assert.strictEqual(at(dir, 'content/concepts/router.md'), after);
});

test('AGSC-00-22: export --markdown gives back exactly what lint --fix wrote', () => {
  const dir = workspace({ 'content/concepts/router.md': RESERVED_ITEM });
  run(['lint', '--fix', '--quiet'], dir);
  const normalised = at(dir, 'content/concepts/router.md');
  const exported = run(['export', '--markdown', '--json', '--quiet'], dir);
  assert.notStrictEqual(exported.exit, 2, exported.stdout);
  assert.strictEqual(at(dir, 'dist/export/markdown/content/concepts/router.md'), normalised);
});

test('AGSC-00-22: the export → import round trip preserves both members', () => {
  const source = workspace({ 'content/concepts/router.md': RESERVED_ITEM });
  run(['lint', '--fix', '--quiet'], source);
  run(['export', '--okf', '--quiet'], source);
  const exported = at(source, 'dist/export/okf/content/concepts/router.md');

  const target = workspace({ 'content/concepts': null, 'content/clusters': null });
  const imported = run(['import', '--from', 'okf',
    path.join(source, 'dist/export/okf'), '--json', '--quiet'], target);
  assert.notStrictEqual(imported.exit, 2, imported.stdout);
  const written = at(target, 'content/concepts/router.md');
  // AGSC-01-22's record is the ONE addition; everything else is byte for byte.
  assert.strictEqual(written.replace(/^ {2}source_(version|hash): .+\n/gmu, ''), exported);
  assert.match(written, /\nweights:\n {2}uses:\n {4}supervisor: 0\.8\n/u);
  assert.match(written, /\nx-acme-note: keep me\n/u);
});

test('AGSC-00-25: `routing` in the configuration is AGSC-E004 and exit 2', () => {
  const dir = workspace();
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'),
    configOf(dir, { routing: { default: 'example-model-1' } }));
  const result = run(['lint', '--json', '--quiet'], dir);
  assert.strictEqual(result.exit, 2, result.stdout);
  const one = result.envelope.findings.find((f) => f.code === 'AGSC-E004');
  assert.ok(one !== undefined, result.stdout);
  assert.match(one.message, /^routing: /u);
  assert.match(one.message, /RESERVED to a later version/u);
});

test('AGSC-02-05a: a vendor key in the configuration is accepted in silence', () => {
  const dir = workspace();
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'),
    configOf(dir, { 'x-acme-thing': { anything: true } }));
  const result = run(['lint', '--json', '--quiet'], dir);
  assert.ok(!result.envelope.findings.some((f) => f.code === 'AGSC-E004'), result.stdout);
  assert.strictEqual(
    JSON.parse(at(dir, 'agsc.config.json'))['x-acme-thing'].anything, true,
    'the vendor key must be preserved verbatim',
  );
});

test('AGSC-00-23: a closed operator list refuses a reserved value with AGSC-E203, exit 1', () => {
  const dir = workspace();
  const refused = run(['export', '--steer', '--target', 'wombat', '--json', '--quiet'], dir);
  assert.strictEqual(refused.exit, 1, refused.stdout);
  assert.ok(refused.envelope.findings.some((f) => f.code === 'AGSC-E203'), refused.stdout);
  assert.ok(!refused.envelope.findings.some((f) => f.code === 'AGSC-E002'),
    'AGSC-E002 is a usage error; this is a finding (AGSC-09-08)');
  assert.ok(!nodeFs.existsSync(path.join(dir, 'dist')), 'a refused target wrote something');
});

// --------------------------------------------------------------------- backward

test('AGSC-00-15: an older spec_version of the same MAJOR is read normally', () => {
  for (const older of ['1.0.0', '1.0.0-rc.2']) {
    const dir = workspace();
    nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), configOf(dir, { spec_version: older }));
    const result = run(['lint', '--json', '--quiet'], dir);
    assert.notStrictEqual(result.exit, 2, `${older}: ${result.stdout}`);
    assert.ok(!result.envelope.findings.some((f) => f.code === 'AGSC-E004'),
      `${older}: ${result.stdout}`);
  }
});

test('AGSC-01-22: a source of a newer MINOR is refused before anything is written', () => {
  const source = workspace();
  run(['export', '--okf', '--quiet'], source);
  // The source declares a MINOR this tool does not implement.
  const index = path.join(source, 'dist/export/okf/content/index.md');
  nodeFs.writeFileSync(index,
    nodeFs.readFileSync(index, 'utf8').replace(/spec_version: .*/u, 'spec_version: "1.1.0"'));

  const target = workspace({ 'content/concepts': null, 'content/clusters': null });
  const argv = ['import', '--from', 'okf', path.join(source, 'dist/export/okf'), '--json', '--quiet'];

  for (const extra of [[], ['--dry-run']]) {
    const refused = run([...argv, ...extra], target);
    assert.strictEqual(refused.exit, 2, JSON.stringify(extra) + refused.stdout);
    const one = refused.envelope.findings.find((f) => f.code === 'AGSC-E004');
    assert.ok(one !== undefined, refused.stdout);
    assert.match(one.message, /--allow-newer/u);
    assert.ok(!nodeFs.existsSync(path.join(target, 'content', 'concepts')),
      'the refusal wrote something');
  }

  // The operator, not the tool, takes the risk.
  const taken = run([...argv, '--allow-newer'], target);
  assert.notStrictEqual(taken.exit, 2, taken.stdout);
  assert.ok(nodeFs.existsSync(path.join(target, 'content', 'concepts', 'supervisor.md')));
});
