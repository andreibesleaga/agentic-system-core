'use strict';
// AGSC-09-13, AGSC-09-13a, AGSC-09-14b and AGSC-09-16: two tools that answered a
// wrong input as if it were right.
//
//   (a) `compose {"selection": "sourdough"}` answered `{"selection": [], "valid": true}`:
//       a selection that is not an array was read as an empty one. The tool table of
//       AGSC-09-13 says `selection` is an array of slugs; the call is now `AGSC-E201`.
//       `agsc compose` with no slug and no `--from` wrote an empty Harness and passed;
//       the per-verb table of AGSC-09-07 gives `<slug>…`, or none with `--from`, so it
//       is now `AGSC-E003` (missing argument), exit 2, and nothing is written.
//   (b) `remember` returned items that the next `lint` refused, with `findings: []`:
//       an unknown `kind` became a concept (AGSC-09-14b accepts five kinds: anything
//       else is `AGSC-E203`), and an `about` naming no item became a `related` Link
//       that `lint` reports as `AGSC-E301` (now refused with that code).
//
// Both transports answer alike (AGSC-09-16): every case runs on the local server, on
// the page tools as the module exports them, and on the EMITTED page script.
// Deterministic: a fixed clock, no network, the fixture through the FileSystem port.

const test = require('node:test');
const assert = require('node:assert/strict');
const fsNode = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const mcpTools = require('../../src/distribution/mcp-tools.js');
const pageTools = require('../../src/distribution/page-tools.js');
const compose = require('../../src/composition/compose.js');
const { main } = require('../../src/application/cli/main.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant of the fixture. */
const EPOCH = '1767225600';
const OPERATOR = 'human:tester';

function built() {
  const fs = createFileSystem(FIXTURE);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return { bundle, ...site.build(bundle, { clock, fs }, { specVersion: '1.0.0', version: '0.0.2' }) };
}

/** The three hosts of the one tool contract: local server, module page tools, emitted page script. */
function transports() {
  const { bundle, files } = built();
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(String(files.get('/compose/agsc-core.js')), context, { filename: 'agsc-core.js' });
  vm.runInContext(String(files.get('/compose/agsc-page-tools.js')), context, { filename: 'agsc-page-tools.js' });
  const api = vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context);
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  return {
    emitted: api.pageToolset(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID }), core),
    local: mcpTools.tools(bundle, {}),
    module: pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId: bundle.config.bundle.id }), { compose: compose.compose }),
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('(a) a compose selection that is not an array is AGSC-E201 on both transports', () => {
  const hosts = transports();
  for (const selection of ['supervisor', 5, { 0: 'supervisor' }, true]) {
    const local = plain(hosts.local.call('compose', { selection }));
    assert.equal(local.type, 'error', JSON.stringify(selection));
    assert.equal(local.body.code, 'AGSC-E201', JSON.stringify(selection));
    assert.deepEqual(plain(hosts.module.call('compose', { selection })), local, `module ${JSON.stringify(selection)}`);
    assert.deepEqual(plain(hosts.emitted.call('compose', { selection })), local, `emitted ${JSON.stringify(selection)}`);
  }
  // An array is still a selection, the empty one included (supplied, not missing).
  for (const selection of [['supervisor'], []]) {
    const local = plain(hosts.local.call('compose', { selection }));
    assert.equal(local.type, 'verdict', JSON.stringify(selection));
    assert.deepEqual(plain(hosts.emitted.call('compose', { selection })), local);
  }
});

test('(b) remember refuses a kind outside the five with AGSC-E203, on both transports', () => {
  const hosts = transports();
  for (const kind of ['note', 'pattern', 'explainer', 'constructor', '__proto__', 'Concept', '']) {
    const args = { body: 'x', kind, operator: OPERATOR, title: 'A Plain Note' };
    const local = plain(hosts.local.call('remember', args));
    assert.equal(local.type, 'error', kind);
    assert.equal(local.body.code, 'AGSC-E203', kind);
    assert.deepEqual(plain(hosts.module.call('remember', args)), local, `module ${kind}`);
    assert.deepEqual(plain(hosts.emitted.call('remember', args)), local, `emitted ${kind}`);
  }
  // The five kinds are still accepted.
  for (const kind of ['concept', 'lesson', 'procedure', 'task']) {
    const r = hosts.local.call('remember', { body: 'x', kind, operator: OPERATOR, title: 'A Plain Note' });
    assert.equal(r.type, 'proposal', kind);
  }
});

test('(b) remember refuses an about that names no item with AGSC-E301, on both transports', () => {
  const hosts = transports();
  for (const about of ['nope', 'no-such-item', 'Not A Slug']) {
    const args = { about, body: 'x', kind: 'concept', operator: OPERATOR, title: 'A Comment' };
    const local = plain(hosts.local.call('remember', args));
    assert.equal(local.type, 'error', about);
    assert.equal(local.body.code, 'AGSC-E301', about);
    assert.deepEqual(plain(hosts.module.call('remember', args)), local, `module ${about}`);
    assert.deepEqual(plain(hosts.emitted.call('remember', args)), local, `emitted ${about}`);
  }
  const ok = hosts.local.call('remember', { about: 'handoff', body: 'x', kind: 'concept', operator: OPERATOR, title: 'A Comment' });
  assert.equal(ok.type, 'proposal');
  assert.deepEqual(plain(ok.body.frontmatter.related), ['handoff']);
});

test('(b) what remember returns for the fixture passes lint with no error', () => {
  const schemas = validate.schemas(readSchemas(ROOT));
  const local = transports().local;
  const r = local.call('remember', { about: 'supervisor', body: 'x', cluster: 'agent-patterns', kind: 'task', operator: OPERATOR, title: 'Follow Up' });
  assert.equal(r.type, 'proposal');
  const errors = validate.item(r.body.frontmatter, { schemas }).filter((f) => f.severity !== 'warn');
  assert.deepEqual(errors, []);
});

/** `agsc compose …` on a scratch copy of the fixture, under --json. */
function composeCli(argv) {
  const dir = fsNode.mkdtempSync(path.join(os.tmpdir(), 'agsc-g4-'));
  try {
    fsNode.cpSync(FIXTURE, dir, { recursive: true });
    const out = [];
    const err = [];
    const stream = (sink) => ({ write: (s) => { sink.push(String(s)); return true; } });
    const exit = main(['compose', ...argv, '--json'], {
      env: { SOURCE_DATE_EPOCH: EPOCH },
      ports: { fs: createFileSystem(dir) },
      root: dir,
      stderr: stream(err),
      stdout: stream(out),
    });
    return { dist: fsNode.existsSync(path.join(dir, 'dist')), err: err.join(''), exit, out: out.join('') };
  } finally {
    fsNode.rmSync(dir, { force: true, recursive: true });
  }
}

test('(a) agsc compose with no slug and no --from is AGSC-E003, exit 2, and writes nothing', () => {
  const got = composeCli([]);
  assert.equal(got.exit, 2, got.err);
  assert.match(`${got.out}${got.err}`, /AGSC-E003/u);
  assert.equal(got.dist, false, 'a Harness was written for an empty selection');
  // One slug is still a selection.
  const one = composeCli(['supervisor']);
  assert.equal(one.exit, 0, one.err);
  assert.equal(one.dist, true);
});
