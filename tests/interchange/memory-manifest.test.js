'use strict';
// Requirement: PRD-083 (docs/PRD.md).
// verifies AGSC-09-17, AGSC-01-22, AGSC-01-26a
// tests/interchange/memory-manifest.test.js — an `import` of a memory tool's folder that holds
// `export-manifest.json` recomputes the digest of each listed file and reports a difference as an
// `AGSC-E506` warning, as the import of an OKF folder does (AGSC-09-17 (a)); the import goes on.
// Deterministic: fixed instant, no network, scratch directories only.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
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

/** The environment of a started command: this one without any AGSC_ name (AGSC-01-37), and a fixed instant. */
function childEnv() {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('AGSC_')) env[name] = value;
  return { ...env, SOURCE_DATE_EPOCH: EPOCH };
}

function temp(prefix) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

function ctxFor(dir, options = {}) {
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: [],
    openRoot: (at) => createFileSystem(path.resolve(dir, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0',
    stderr: { write: () => {} },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

const BIN = path.join(ROOT, 'bin', 'agsc.js');

/** Export the fixture to `adapter` with a manifest, let `tamper` change the folder, and import it. */
function exportThenImport(adapter, tamper = () => {}) {
  const source = temp('agsc-memory-manifest-');
  nodeFs.cpSync(FIXTURE, source, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(source, 'LICENSE-CONTENT'));
  const exported = exportVerb.run(ctxFor(source, { verbFlags: { manifest: true, to: adapter } }));
  assert.deepStrictEqual(exported.findings.filter((f) => f.severity === 'error'), []);
  const folder = path.join(source, 'dist', 'export', adapter);
  assert.ok(nodeFs.existsSync(path.join(folder, manifest.FILE)), 'the export wrote no manifest');
  tamper(folder);
  const target = temp('agsc-memory-manifest-in-');
  nodeFs.copyFileSync(path.join(source, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  const imported = importVerb.run(ctxFor(target, { argv: [folder], verbFlags: { from: adapter } }));
  return { folder, imported, target };
}

const manifestWarnings = (result) => result.imported.findings.filter((f) => f.file === manifest.FILE);

const ADAPTERS = ['mem0', 'letta', 'zep', 'csv', 'basic-memory', 'claude-code'];

/** The manifest of an export folder, changed by `change` (an object in, an object out). */
function rewriteManifest(folder, change) {
  const file = path.join(folder, manifest.FILE);
  nodeFs.writeFileSync(file, `${JSON.stringify(change(JSON.parse(nodeFs.readFileSync(file, 'utf8'))))}\n`);
}

for (const adapter of ADAPTERS) {
  test(`AGSC-09-17: ${adapter} import of a clean export reports nothing about the manifest`, () => {
    assert.deepStrictEqual(manifestWarnings(exportThenImport(adapter)), []);
  });

  test(`AGSC-09-17: ${adapter} import names a file changed after the export, and goes on`, () => {
    const result = exportThenImport(adapter, (folder) => {
      const listed = manifest.listedPaths(nodeFs.readFileSync(path.join(folder, manifest.FILE), 'utf8'));
      assert.ok(listed.length > 0, 'the manifest lists no file');
      nodeFs.appendFileSync(path.join(folder, listed[0]), ' ');
    });
    const found = manifestWarnings(result);
    assert.strictEqual(found.length, 1, JSON.stringify(found));
    assert.strictEqual(found[0].code, 'AGSC-E506');
    assert.match(found[0].message, /differs from the manifest/u);
    assert.strictEqual(found[0].severity, 'warn');
    assert.ok(!result.imported.findings.some((f) => f.severity === 'error'));
  });
}

test('AGSC-09-17: a file listed many times is read and reported once', () => {
  const result = exportThenImport('claude-code', (folder) => {
    rewriteManifest(folder, (m) => ({ ...m, files: Array.from({ length: 3000 }, () => m.files[0]) }));
    nodeFs.appendFileSync(path.join(folder, manifest.listedPaths(nodeFs.readFileSync(path.join(folder, manifest.FILE), 'utf8'))[0]), ' ');
  });
  assert.strictEqual(manifestWarnings(result).length, 1);
});

test('AGSC-09-17: only a fixed number of listed files is checked, and one warning says so', () => {
  const result = exportThenImport('claude-code', (folder) => {
    rewriteManifest(folder, (m) => ({
      ...m,
      files: Array.from({ length: manifest.MAX_LISTED_PATHS + 7 }, (_, n) => ({ content_digest: 'x', path: `gone-${n}.md` })),
    }));
  });
  const found = manifestWarnings(result);
  assert.strictEqual(found.length, manifest.MAX_LISTED_PATHS + 1);
  assert.match(found[found.length - 1].message, new RegExp(`only the first ${manifest.MAX_LISTED_PATHS} listed files were checked; 7 more`, 'u'));
});

test('AGSC-09-17: a manifest that cannot be read gives one warning and the import goes on', () => {
  const cases = {
    'a directory': (file) => { nodeFs.rmSync(file); nodeFs.mkdirSync(file); },
    'larger than 1 MiB': (file) => nodeFs.writeFileSync(file, `{"files":[],"pad":"${'x'.repeat(1048576)}"}`),
    'not UTF-8': (file) => nodeFs.writeFileSync(file, Buffer.from([0x7b, 0xff, 0xfe, 0x7d])),
    'not JSON': (file) => nodeFs.writeFileSync(file, 'this is not JSON'),
  };
  for (const [name, spoil] of Object.entries(cases)) {
    const result = exportThenImport('claude-code', (folder) => spoil(path.join(folder, manifest.FILE)));
    assert.strictEqual(manifestWarnings(result).length, 1, name);
    assert.ok(!result.imported.findings.some((f) => f.severity === 'error'), name);
  }
});

test('AGSC-09-17: a path in a warning shows control characters as escapes and is cut at 200 characters', () => {
  const result = exportThenImport('claude-code', (folder) => {
    rewriteManifest(folder, (m) => ({
      ...m,
      files: [
        { content_digest: 'x', path: '\u001b[31mRED\u001b]0;pwned\u0007\nforged.md' },
        { content_digest: 'x', path: `${'p'.repeat(3000)}.md` },
        { content_digest: 'x', path: 'plain/ordinary name.md' },
      ],
    }));
  });
  const messages = manifestWarnings(result).map((f) => f.message);
  assert.strictEqual(messages.length, 3);
  for (const message of messages) assert.doesNotMatch(message, /[\u0000-\u001f\u007f]/u);
  assert.match(messages[0], /\\u001b\[31mRED/u);
  assert.match(messages[0], /\\u000aforged\.md is listed and is absent/u);
  assert.ok(messages[1].length < 330, `${messages[1].length}`);
  assert.strictEqual(messages[2], 'export-manifest.json: plain/ordinary name.md is listed and is absent from the folder (AGSC-09-17)');
});

test('AGSC-09-17: an entry without a text path is reported as such, once', () => {
  const result = exportThenImport('claude-code', (folder) => {
    rewriteManifest(folder, (m) => ({ ...m, files: [null, 1, { content_digest: 'x', path: { a: 1 } }, { content_digest: 'x' }] }));
  });
  const messages = manifestWarnings(result).map((f) => f.message);
  assert.strictEqual(messages.length, 1, messages.join('\n'));
  assert.match(messages[0], /4 listed entries name no file/u);
  assert.doesNotMatch(messages[0], /undefined|null|object/u);
});

test('AGSC-09-17: a listed directory is reported and never read', () => {
  const result = exportThenImport('claude-code', (folder) => {
    rewriteManifest(folder, (m) => ({ ...m, files: [{ content_digest: 'x', path: 'memory' }] }));
  });
  const messages = manifestWarnings(result).map((f) => f.message);
  assert.strictEqual(messages.length, 1);
  assert.match(messages[0], /memory is listed and is not a regular file/u);
});

const HAS_MKFIFO = process.platform !== 'win32' && spawnSync('mkfifo', ['--version']).error === undefined;

test('AGSC-09-17: a named pipe listed in the manifest is reported and never opened', { skip: !HAS_MKFIFO }, () => {
  const folder = path.join(exportThenImport('claude-code').folder);
  const pipe = path.join(folder, 'pipe');
  assert.strictEqual(spawnSync('mkfifo', [pipe]).status, 0);
  rewriteManifest(folder, (m) => ({ ...m, files: [{ content_digest: 'x', path: 'pipe' }] }));
  const target = temp('agsc-memory-manifest-fifo-');
  nodeFs.copyFileSync(path.join(FIXTURE, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  const run = spawnSync(process.execPath, [BIN, 'import', folder, '--from', 'claude-code', '--dry-run'],
    { cwd: target, env: childEnv(), encoding: 'utf8', timeout: 20000 });
  assert.strictEqual(run.error, undefined, 'the import did not return (it opened the pipe)');
  assert.strictEqual(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout + run.stderr, /pipe is listed and is not a regular file/u);
});

// ---------------------------------------------------------------- what a warning may print, and what a manifest may cost

/** Run `agsc import <folder> --from <adapter> --dry-run` in a fresh target and return the process result. */
function runImport(folder, adapter) {
  const target = temp('agsc-memory-manifest-run-');
  nodeFs.copyFileSync(path.join(FIXTURE, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  return spawnSync(process.execPath, [BIN, 'import', folder, '--from', adapter, '--dry-run'],
    { cwd: target, env: childEnv(), encoding: 'utf8', timeout: 60000 });
}

for (const adapter of ADAPTERS) {
  test(`AGSC-09-17: ${adapter} import ends normally when a listed path holds emoji, a lone surrogate or a bidi control`, () => {
    const { folder } = exportThenImport(adapter);
    rewriteManifest(folder, (m) => ({
      ...m,
      files: [
        { content_digest: 'x', path: `a${'\u{1F600}'.repeat(150)}.md` },
        { content_digest: 'x', path: 'x\ud800y.md' },
        { content_digest: 'x', path: 'bidi‮gnp.md' },
      ],
    }));
    const run = runImport(folder, adapter);
    assert.strictEqual(run.status, 0, run.stderr + run.stdout);
    assert.doesNotMatch(run.stdout + run.stderr, /AGSC-E601/u);
    assert.match(run.stdout + run.stderr, /x\\ud800y\.md/u);
    assert.match(run.stdout + run.stderr, /bidi\\u202egnp\.md/u);
    assert.doesNotMatch(run.stdout + run.stderr, /[‮\ud800]/u);
  });
}

test('AGSC-09-17: a path is cut by code point, so an emoji is never split', () => {
  const shown = manifest.check(JSON.stringify({
    files: [{ content_digest: 'x', path: `${'\u{1F600}'.repeat(250)}.md` }], item_count: 0, items_digest: 'x',
  }), { files: new Map(), itemIris: undefined })[0].message;
  assert.ok(shown.includes(`${'\u{1F600}'.repeat(200)}... is listed`), shown);
  assert.doesNotMatch(shown, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u);
});

for (const [adapter, record] of [['mem0', 'getall-page.json'], ['letta', 'passages.json'], ['zep', 'episodes.json']]) {
  test(`AGSC-01-22: ${adapter} records in a file named export-manifest.json are imported as they were`, () => {
    const fixture = path.join(ROOT, 'tests', 'fixtures', `memory-${adapter}`);
    const trees = {};
    for (const [label, rename] of [['plain', false], ['named', true]]) {
      const folder = temp(`agsc-memory-named-${label}-`);
      nodeFs.cpSync(fixture, folder, { recursive: true });
      if (rename) nodeFs.renameSync(path.join(folder, record), path.join(folder, manifest.FILE));
      const target = temp(`agsc-memory-named-in-${label}-`);
      nodeFs.copyFileSync(path.join(FIXTURE, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
      const imported = importVerb.run(ctxFor(target, { argv: [folder], verbFlags: { from: adapter } }));
      assert.deepStrictEqual(imported.findings.filter((f) => f.severity === 'error'), [], label);
      const list = [];
      const walk = (dir, prefix) => {
        for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}${e.name}/`);
          else list.push([`${prefix}${e.name}`, nodeFs.readFileSync(path.join(dir, e.name), 'utf8')]);
        }
      };
      walk(path.join(target, 'content'), '');
      trees[label] = list;
    }
    assert.ok(trees.plain.length >= 1);
    assert.deepStrictEqual(trees.named.map(([name]) => name), trees.plain.map(([name]) => name));
  });
}

test('AGSC-09-17: different spellings of one listed file are not read, and cost nothing', () => {
  const result = exportThenImport('claude-code', (folder) => {
    nodeFs.writeFileSync(path.join(folder, 'big.dat'), 'x'.repeat(1040000));
    rewriteManifest(folder, (m) => ({
      ...m,
      files: [
        ...Array.from({ length: 5000 }, (_, n) => ({ content_digest: 'x', path: `d${n}/../big.dat` })),
        { content_digest: 'x', path: './big.dat' }, { content_digest: 'x', path: '/big.dat' },
        { content_digest: 'x', path: 'a//b.dat' }, { content_digest: 'x', path: 'a\\b.dat' }, { content_digest: 'x', path: '' },
      ],
    }));
  });
  const messages = manifestWarnings(result).map((f) => f.message);
  assert.strictEqual(messages.length, 1, messages.slice(0, 3).join('\n'));
  assert.match(messages[0], /5005 listed paths are not in normal form and were not checked/u);
});

test('AGSC-09-17: the same file listed under one spelling many times is read once (time)', () => {
  const started = Date.now();
  exportThenImport('claude-code', (folder) => {
    nodeFs.writeFileSync(path.join(folder, 'big.dat'), 'x'.repeat(1040000));
    rewriteManifest(folder, (m) => ({ ...m, files: Array.from({ length: 5000 }, (_, n) => ({ content_digest: String(n % 3), path: 'big.dat' })) }));
  });
  assert.ok(Date.now() - started < 15000, `${Date.now() - started} ms`);
});

for (const adapter of ADAPTERS) {
  test(`AGSC-09-17: ${adapter} import of an unreadable manifest is one warning, and the import goes on`, () => {
    const cases = {
      'a directory': (file) => { nodeFs.rmSync(file); nodeFs.mkdirSync(file); },
      'over 1 MiB': (file) => nodeFs.writeFileSync(file, `{"files":[],"pad":"${'x'.repeat(1048576)}"}`),
      'not UTF-8': (file) => nodeFs.writeFileSync(file, Buffer.from([0x7b, 0xff, 0xfe, 0x7d])),
    };
    for (const [name, spoil] of Object.entries(cases)) {
      const result = exportThenImport(adapter, (folder) => spoil(path.join(folder, manifest.FILE)));
      assert.strictEqual(manifestWarnings(result).length, 1, `${adapter} ${name}`);
      assert.ok(!result.imported.findings.some((f) => f.severity === 'error'), `${adapter} ${name}`);
    }
  });
}

test('AGSC-09-17: the total of bytes read for the check is bounded, and one warning says so', () => {
  const started = Date.now();
  let skipped = false;
  const result = exportThenImport('claude-code', (folder) => {
    nodeFs.writeFileSync(path.join(folder, 'big.dat'), 'x'.repeat(1048576));
    try {
      for (let n = 0; n < 5000; n += 1) nodeFs.symlinkSync('big.dat', path.join(folder, `link-${n}.dat`));
    } catch (e) {
      skipped = true;
    }
    rewriteManifest(folder, (m) => ({ ...m, files: Array.from({ length: 5000 }, (_, n) => ({ content_digest: 'x', path: `link-${n}.dat` })) }));
  });
  if (skipped) return; // no symbolic links on this platform
  const messages = manifestWarnings(result).map((f) => f.message);
  const note = messages.filter((m) => /read up to a total of 256 MiB/u.test(m));
  assert.strictEqual(note.length, 1, messages.slice(-2).join('\n'));
  assert.match(note[0], /4744 more were not checked/u);
  assert.strictEqual(messages.filter((m) => /differs from the manifest/u.test(m)).length, 256);
  assert.ok(Date.now() - started < 60000, `${Date.now() - started} ms`);
});
