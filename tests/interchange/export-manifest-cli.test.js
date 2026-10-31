'use strict';
// verifies AGSC-09-17, AGSC-09-08, AGSC-01-26
// tests/interchange/export-manifest-cli.test.js — `export --manifest` and the check `import`
// runs on the folder it wrote (AGSC-09-17 (a)), through the real verbs over the real
// filesystem with a fixed clock. The bytes of the manifest are pinned by `export-0003` and
// `export-0004`; the pure module is tested in `export-manifest.test.js`.
//
// Deterministic: fixed instant, no network, scratch directories only.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const manifest = require('../../src/interchange/export-manifest.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function temp(prefix) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

function workspace() {
  const dir = temp('agsc-manifest-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  return dir;
}

function ctxFor(dir, options = {}) {
  const lines = [];
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: lines,
    openRoot: (at) => createFileSystem(path.resolve(dir, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0',
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

/** Export the fixture with the flags, and import the folder it wrote into an empty Bundle of the same identity. */
function exportThenImport(flags, tamper = () => {}) {
  const source = workspace();
  const exported = exportVerb.run(ctxFor(source, { verbFlags: flags }));
  assert.deepStrictEqual(exported.findings.filter((f) => f.severity === 'error'), []);
  const folder = path.join(source, 'dist', 'export', 'okf');
  tamper(folder);
  const target = temp('agsc-manifest-in-');
  nodeFs.copyFileSync(path.join(source, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  const imported = importVerb.run(ctxFor(target, { argv: [folder], verbFlags: { from: 'okf' } }));
  return { folder, imported, source, target };
}

const manifestWarnings = (result) => result.imported.findings.filter((f) => f.file === manifest.FILE);

test('AGSC-09-17: export --okf --manifest lists every other file of the root, and a clean import reports nothing about it', () => {
  const { folder, imported } = exportThenImport({ manifest: true, okf: true });
  const text = nodeFs.readFileSync(path.join(folder, manifest.FILE), 'utf8');
  const parsed = JSON.parse(text);
  assert.ok(parsed.files.length >= 5 && parsed.files.every((f) => f.path !== manifest.FILE));
  assert.deepStrictEqual(imported.findings.filter((f) => f.file === manifest.FILE), []);
  assert.strictEqual(imported.status, undefined, JSON.stringify(imported.findings.filter((f) => f.severity === 'error')));
});

test('AGSC-09-17: without --manifest an export writes no manifest (the files of 1.0)', () => {
  const { folder } = exportThenImport({ okf: true });
  assert.ok(!nodeFs.existsSync(path.join(folder, manifest.FILE)));
});

test('AGSC-09-17: a file changed after the export is one warning naming it, and the import goes on', () => {
  const result = exportThenImport({ manifest: true, okf: true }, (folder) => {
    nodeFs.appendFileSync(path.join(folder, 'content/concepts/supervisor.md'), 'edited later\n');
  });
  const found = manifestWarnings(result);
  assert.strictEqual(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, /content\/concepts\/supervisor\.md differs/u);
  assert.strictEqual(found[0].severity, 'warn');
  assert.ok(nodeFs.existsSync(path.join(result.target, 'content/concepts/supervisor.md')), 'imported as it would be without a manifest');
});

test('AGSC-09-17: a file removed, and an item added, after the export are reported (digest, count, items digest)', () => {
  const removed = exportThenImport({ manifest: true, okf: true }, (folder) => {
    nodeFs.rmSync(path.join(folder, 'content/concepts/handoff.md'));
  });
  const messages = manifestWarnings(removed).map((f) => f.message);
  assert.ok(messages.some((m) => /handoff\.md is listed and is absent/u.test(m)), messages.join('\n'));
  assert.ok(messages.some((m) => /item_count is 3 and the folder holds 2/u.test(m)), messages.join('\n'));
  assert.ok(messages.some((m) => /items_digest differs/u.test(m)), messages.join('\n'));

  const added = exportThenImport({ manifest: true, okf: true }, (folder) => {
    nodeFs.writeFileSync(path.join(folder, 'content/concepts/extra.md'), '---\ntype: concept\nkind: pattern\ntitle: Extra\n---\n\nX.\n');
  });
  assert.ok(manifestWarnings(added).some((f) => /item_count is 3 and the folder holds 4/u.test(f.message)));
});

test('AGSC-09-17: a manifest that lists a path outside the folder reads nothing outside it', () => {
  const result = exportThenImport({ manifest: true, okf: true }, (folder) => {
    const file = path.join(folder, manifest.FILE);
    const parsed = JSON.parse(nodeFs.readFileSync(file, 'utf8'));
    parsed.files.push({ content_digest: 'sha-256=:AAAA:', path: '../../../../etc/passwd' });
    nodeFs.writeFileSync(file, `${JSON.stringify(parsed)}\n`);
  });
  const found = manifestWarnings(result);
  assert.strictEqual(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, /etc\/passwd is listed and is absent/u);
});

test('AGSC-09-17 and AGSC-01-27: --jsonl --manifest puts the manifest beside items.jsonl and lists that file alone', () => {
  const source = workspace();
  const out = exportVerb.run(ctxFor(source, { verbFlags: { jsonl: true, manifest: true } }));
  assert.deepStrictEqual(out.findings.filter((f) => f.severity === 'error'), []);
  const parsed = JSON.parse(nodeFs.readFileSync(path.join(source, 'dist/export', manifest.FILE), 'utf8'));
  assert.deepStrictEqual(parsed.files.map((f) => f.path), ['items.jsonl']);
  assert.strictEqual(parsed.files[0].content_digest,
    manifest.contentDigest(nodeFs.readFileSync(path.join(source, 'dist/export/items.jsonl'), 'utf8')));
});

test('AGSC-09-17 and AGSC-09-08: the bundle hash is the SHA-256 of the graph.nq of the same build', () => {
  const source = workspace();
  exportVerb.run(ctxFor(source, { verbFlags: { jsonl: true, manifest: true } }));
  const { createHash } = require('node:crypto');
  const { main } = require('../../src/application/cli/main.js');
  assert.strictEqual(main(['build', '--json', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: EPOCH }, ports: { fs: createFileSystem(source) }, root: source,
    specVersion: '1.0.0', stderr: { write: () => {} }, stdout: { write: () => {} }, version: '0.0.2',
  }), 0);
  const out = JSON.parse(nodeFs.readFileSync(path.join(source, 'agsc.config.json'), 'utf8')).build.out;
  const graph = nodeFs.readFileSync(path.join(source, out, 'graph.nq'));
  const parsed = JSON.parse(nodeFs.readFileSync(path.join(source, 'dist/export', manifest.FILE), 'utf8'));
  assert.strictEqual(parsed.bundle_hash, createHash('sha256').update(graph).digest('hex'));
});

test('AGSC-09-17: --manifest with a --zip carries the manifest into the archive', () => {
  const source = workspace();
  const out = exportVerb.run(ctxFor(source, { verbFlags: { manifest: true, okf: true, zip: true } }));
  assert.deepStrictEqual(out.findings.filter((f) => f.severity === 'error'), []);
  const archives = nodeFs.readdirSync(path.join(source, 'dist/export')).filter((n) => n.endsWith('.zip'));
  assert.strictEqual(archives.length, 1);
  assert.ok(nodeFs.readFileSync(path.join(source, 'dist/export', archives[0])).includes(manifest.FILE));
});

test('AGSC-09-17 and AGSC-09-08: a build with no graph.nq has no hash to state, so --manifest writes nothing', () => {
  const source = workspace();
  const out = exportVerb.run(ctxFor(source, { verbFlags: { level: '0', manifest: true, okf: true } }));
  assert.deepStrictEqual(out.findings.filter((f) => f.severity === 'error').map((f) => f.code), ['AGSC-E001']);
  assert.ok(!nodeFs.existsSync(path.join(source, 'dist')), 'a refused run wrote something');
});
