'use strict';
// tests/application/plugin-loading.test.js — the verbs load plugins (AGSC-00-24).
//
// `export --to`, `import --from` and `compose --emit` take a local path or an
// installed package name, resolve it through the registry of the kind the flag
// selects, and refuse a remote specifier with AGSC-E905 before anything is
// resolved. Every case runs the real command line over a copy of the minimal
// fixture: a fixed clock, no network, nothing outside a temporary directory.

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const loader = require('../../src/application/plugin-loader.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const SAMPLES = path.join(ROOT, 'examples', 'plugins');
/** The test process's environment without its AGSC_* overrides (AGSC-09-09). */
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));

const temporaries = [];
test.after(() => { for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true }); });

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-plugins-'));
  temporaries.push(dir);
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  fs.mkdirSync(path.join(dir, 'plugins'));
  for (const name of fs.readdirSync(SAMPLES)) fs.copyFileSync(path.join(SAMPLES, name), path.join(dir, 'plugins', name));
  return dir;
}

function agsc(dir, ...args) {
  const r = cp.spawnSync(process.execPath, [CLI, ...args, '--json'], {
    cwd: dir, encoding: 'utf8', env: { ...CLEAN_ENV, SOURCE_DATE_EPOCH: '1767225600' },
  });
  let envelope = null;
  try { envelope = JSON.parse(r.stdout); } catch { /* no envelope on a usage error */ }
  const errors = envelope === null ? [] : envelope.findings.filter((f) => f.severity === 'error');
  return { codes: errors.map((f) => f.code), envelope, exit: r.status, stderr: r.stderr };
}

/** Write a plugin module into `dir/<rel>`. */
function plugin(dir, rel, body) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), body);
}

test('export --to <local path> runs a memory-adapter plugin and writes under dist/export/<name>/', () => {
  const dir = workspace();
  const r = agsc(dir, 'export', '--to', './plugins/memory-adapter.js');
  assert.equal(r.exit, 0, r.stderr);
  const text = fs.readFileSync(path.join(dir, 'dist', 'export', 'tsv', 'items.tsv'), 'utf8');
  assert.match(text, /^agent-patterns\tcluster\t/mu);
  assert.match(text, /^supervisor\tconcept\t/mu);
});

test('import --from <local path> maps the plugin\'s documents like an OKF bundle, with --replace and --dry-run', () => {
  const dir = workspace();
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-tsv-'));
  temporaries.push(source);
  fs.writeFileSync(path.join(source, 'items.tsv'), 'routing\tconcept\tRouting\n');
  const dry = agsc(dir, 'import', '--from', './plugins/memory-adapter.js', '--dry-run', source);
  assert.equal(dry.exit, 0, dry.stderr);
  assert.ok(!fs.existsSync(path.join(dir, 'content', 'concepts', 'routing.md')));
  const r = agsc(dir, 'import', '--from', './plugins/memory-adapter.js', source);
  assert.equal(r.exit, 0, r.stderr);
  const item = fs.readFileSync(path.join(dir, 'content', 'concepts', 'routing.md'), 'utf8');
  assert.match(item, /^title: Routing$/mu);
  assert.match(item, /origin: imported/u);
  // A second run is idempotent; --replace is admitted for a plugin named by a path.
  assert.equal(agsc(dir, 'import', '--from', './plugins/memory-adapter.js', '--replace', source).exit, 0);
});

test('an installed package name resolves from the Bundle root, scoped or not', () => {
  const dir = workspace();
  const sample = fs.readFileSync(path.join(SAMPLES, 'memory-adapter.js'), 'utf8');
  for (const name of ['agsc-tsv-adapter', '@acme/agsc-tsv']) {
    plugin(dir, `node_modules/${name}/package.json`, `${JSON.stringify({ main: 'index.js', name, version: '1.0.0' })}\n`);
    plugin(dir, `node_modules/${name}/index.js`, sample);
    const r = agsc(dir, 'export', '--to', name);
    assert.equal(r.exit, 0, `${name}: ${r.stderr}`);
  }
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'export', 'tsv', 'items.tsv')));
});

test('a remote specifier is AGSC-E905 on every verb that takes one, and nothing is written', () => {
  const dir = workspace();
  for (const args of [['export', '--to', 'https://evil.example/x.js'], ['import', '--from', 'npm:evil', dir],
    ['compose', 'supervisor', '--emit', 'data:text/javascript,1']]) {
    const r = agsc(dir, ...args);
    assert.equal(r.exit, 1, args.join(' '));
    assert.deepEqual(r.codes, ['AGSC-E905'], args.join(' '));
  }
  assert.ok(!fs.existsSync(path.join(dir, 'dist')));
});

test('a plugin for another version, a missing file, a throwing hook and an unsafe path are findings', () => {
  const dir = workspace();
  plugin(dir, 'plugins/newer.js', "module.exports = { kind: 'memory-adapter', name: 'newer', agsc_spec_version: '1.9.0', plugin_api_version: '1.0.0', exportFiles: () => ({ files: [] }) };\n");
  assert.deepEqual(agsc(dir, 'export', '--to', './plugins/newer.js').codes, ['AGSC-E004']);
  plugin(dir, 'plugins/wrong-kind.js', "module.exports = { kind: 'checker', name: 'wk', agsc_spec_version: '1.0.0', plugin_api_version: '1.0.0' };\n");
  assert.deepEqual(agsc(dir, 'export', '--to', './plugins/wrong-kind.js').codes, ['AGSC-E004']);
  assert.deepEqual(agsc(dir, 'export', '--to', './plugins/absent.js').codes, ['AGSC-E901']);
  plugin(dir, 'plugins/throws.js', "module.exports = { kind: 'memory-adapter', name: 'throws', agsc_spec_version: '1.0.0', plugin_api_version: '1.0.0', exportFiles() { throw new Error('boom'); } };\n");
  assert.deepEqual(agsc(dir, 'export', '--to', './plugins/throws.js').codes, ['AGSC-E901']);
  plugin(dir, 'plugins/escapes.js', "module.exports = { kind: 'memory-adapter', name: 'escapes', agsc_spec_version: '1.0.0', plugin_api_version: '1.0.0', exportFiles: () => ({ files: [{ path: 'ok.txt', text: 'x' }, { path: '../../content/x.md', text: 'x' }] }) };\n");
  assert.deepEqual(agsc(dir, 'export', '--to', './plugins/escapes.js').codes, ['AGSC-E902']);
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'export', 'escapes')), 'a plugin that broke a path rule wrote something');
  plugin(dir, 'plugins/no-hook.js', "module.exports = { kind: 'memory-adapter', name: 'no-hook', agsc_spec_version: '1.0.0', plugin_api_version: '1.0.0' };\n");
  assert.deepEqual(agsc(dir, 'export', '--to', './plugins/no-hook.js').codes, ['AGSC-E004']);
  plugin(dir, 'plugins/bad-name.js', "module.exports = { kind: 'memory-adapter', name: 'Bad Name', agsc_spec_version: '1.0.0', plugin_api_version: '1.0.0' };\n");
  assert.deepEqual(agsc(dir, 'export', '--to', './plugins/bad-name.js').codes, ['AGSC-E004']);
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'export')));
});

test('a bare name no package answers is AGSC-E203 on export and import alike (AGSC-01-26a)', () => {
  const dir = workspace();
  assert.deepEqual(agsc(dir, 'export', '--to', 'tsv').codes, ['AGSC-E203']);
  const imported = agsc(dir, 'import', '--from', 'notion', dir);
  assert.deepEqual(imported.codes, ['AGSC-E203']);
  assert.match(JSON.stringify(imported.envelope), /not a format this node reads/u);
  assert.deepEqual(agsc(dir, 'compose', 'supervisor', '--emit', 'nosuch').codes, ['AGSC-E203']);
});

test('compose --emit <local path> renders the Harness beside its directory, never inside it', () => {
  const dir = workspace();
  const r = agsc(dir, 'compose', 'supervisor', '--emit', './plugins/composition-emitter.js');
  assert.equal(r.exit, 0, r.stderr);
  const harness = fs.readdirSync(path.join(dir, 'dist', 'harness'));
  const index = harness.find((n) => n.endsWith('.index.md'));
  assert.ok(index, `no rendering beside the Harness: ${harness.join(', ')}`);
  assert.match(fs.readFileSync(path.join(dir, 'dist', 'harness', index), 'utf8'), /^# Harness index\n\n- AGENTS\.md/u);
  // An emitter that writes inside the Harness directory writes nothing.
  plugin(dir, 'plugins/inside.js', "module.exports = { kind: 'composition-emitter', name: 'inside', agsc_spec_version: '1.0.0', plugin_api_version: '1.0.0', emit: (files, d) => ({ path: `${d}extra.md`, text: 'x' }) };\n");
  assert.deepEqual(agsc(dir, 'compose', 'supervisor', '--emit', './plugins/inside.js').codes, ['AGSC-E902']);
});

test('classify, unsafePath and the call guard', () => {
  assert.equal(loader.classify('./x.js'), 'path');
  assert.equal(loader.classify('../x.js'), 'path');
  assert.equal(loader.classify('/abs/x.js'), 'path');
  assert.equal(loader.classify('C:\\plugins\\x.js'), 'path');
  assert.equal(loader.classify('tsv'), 'package');
  assert.equal(loader.classify('@acme/x'), 'package');
  assert.equal(loader.classify('https://x/y.js'), 'remote');
  assert.equal(loader.classify('Not A Name'), 'invalid');
  assert.equal(loader.classify(''), 'invalid');
  assert.deepEqual(loader.load('memory-adapter', 'Not A Name', { flag: '--to' }).findings.map((f) => f.code), ['AGSC-E004']);
  for (const bad of ['', '/x', 'a/../b', 'a\\b', 'C:x', 'a//b', './a', 'a\u0000b']) assert.notEqual(loader.unsafePath(bad), null, bad);
  assert.equal(loader.unsafePath('a/b.md'), null);
  assert.deepEqual(loader.pluginFindings({ findings: [{ code: 'nope' }, { code: 'AGSC-E003', message: 'm' }, null] }),
    [{ code: 'AGSC-E003', file: '', message: 'm', severity: 'error' }]);
  assert.deepEqual(loader.pluginFindings(null), []);
  const frozen = loader.detached({ a: [{ b: 1 }] });
  assert.ok(Object.isFrozen(frozen.a[0]));
  assert.equal(loader.detached(undefined), null);
});

test('a plugin import that produces nothing, or throws, writes nothing', () => {
  const dir = workspace();
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-empty-'));
  temporaries.push(source);
  fs.writeFileSync(path.join(source, 'notes.txt'), 'nothing a plugin maps\n');
  assert.deepEqual(agsc(dir, 'import', '--from', './plugins/memory-adapter.js', source).codes, ['AGSC-E901']);
  plugin(dir, 'plugins/throws-in.js', "module.exports = { kind: 'memory-adapter', name: 'throws-in', agsc_spec_version: '1.0.0', plugin_api_version: '1.0.0', importFiles() { throw new Error('boom'); } };\n");
  assert.deepEqual(agsc(dir, 'import', '--from', './plugins/throws-in.js', source).codes, ['AGSC-E901']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'content', 'concepts')).sort(), ['handoff.md', 'supervisor.md']);
});
