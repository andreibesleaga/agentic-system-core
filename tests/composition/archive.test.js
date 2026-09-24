'use strict';
// tests/composition/archive.test.js — the archive of a multi-file result
// proved rather than promised.
//
// Four things have to hold, and each is measured here against something outside the
// module under test:
//
//   1. the ENCODING and the CHECKSUM are the standard ones — compared with
//      `Buffer`/`TextEncoder` and with `node:zlib`'s own `crc32`, never asserted;
//   2. the CONTAINER is a real ZIP — unpacked by `fflate@0.8.3`, the pinned
//      third-party reader of the library table (`src/README.md`), entry for
//      entry and byte for byte;
//   3. the bytes are REPRODUCIBLE — identical twice, and identical under two very
//      different `TZ`/`LC_ALL` settings, which is the one property no published zip
//      library has (they all fill the MS-DOS fields of APPNOTE.TXT §4.4.6 with
//      local-time `Date` accessors);
//   4. the PAGE and the CLI agree — the archive built by the emitted browser bundle,
//      evaluated in a context that holds the language and nothing else, is byte-
//      identical to the archive this process builds (AGSC-07-13).
//
// Deterministic throughout: a fixed clock, no network, no wall clock, no randomness.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const zlib = require('node:zlib');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { unzipSync } = require('fflate');

const archive = require('../../src/composition/archive.js');
const browser = require('../../src/composition/browser.js');
const harness = require('../../src/composition/harness.js');
const { compose } = require('../../src/composition/compose.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const composeVerb = require('../../src/application/cli/verbs/compose.js');
const skillsVerb = require('../../src/application/cli/verbs/skills.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const archiveWriter = require('../../src/application/cli/verbs/_archive.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant of `tests/fixtures/minimal/README.md`. */
const EPOCH = '1767225600';
const INSTANT = '2026-01-01T00:00:00Z';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function workspace() {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-eng7-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  return dir;
}

function ctxFor(dir, verbFlags, argv) {
  const lines = [];
  return {
    argv: argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: lines,
    ports: {
      clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }),
      fs: createFileSystem(dir),
    },
    root: dir,
    specVersion: '1.0.0-rc.6',
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: verbFlags || {},
    version: '0.0.2',
  };
}

/** The archive files of a directory, read with `node:fs` — the FileSystem port
 *  REFUSES to read an archive (`AGSC-E903`, AGSC-01-16), which is the point. */
function zipsIn(dir, at) {
  const full = path.join(dir, at);
  if (!nodeFs.existsSync(full)) return [];
  return nodeFs.readdirSync(full).filter((name) => name.endsWith('.zip')).sort();
}

// ------------------------------------------------------- 1. encoding + checksum

test('utf8Bytes is UTF-8, measured against Buffer and TextEncoder', () => {
  const samples = ['', 'hello', 'é', '中', '😀', 'á', ' ——', 'x'.repeat(300),
    'line\nline\r\n', '\u{10FFFF}'];
  for (const sample of samples) {
    assert.deepStrictEqual(Buffer.from(archive.utf8Bytes(sample)), Buffer.from(sample, 'utf8'), sample);
    assert.deepStrictEqual(archive.utf8Bytes(sample), new TextEncoder().encode(sample), sample);
  }
  // An unpaired surrogate is U+FFFD in both, which is what makes the two agree.
  assert.deepStrictEqual(archive.utf8Bytes('\ud800'), new TextEncoder().encode('\ud800'));
  assert.deepStrictEqual(archive.utf8Bytes(null), Uint8Array.from([]));
});

test('crc32 is CRC-32/ISO-HDLC, measured against node:zlib', () => {
  const samples = ['', 'a', 'hello world', 'é中😀', 'z'.repeat(5000), '\u0000\u0001ÿ'];
  for (const sample of samples) {
    const bytes = Buffer.from(sample, 'utf8');
    assert.strictEqual(archive.crc32(bytes), zlib.crc32(bytes), JSON.stringify(sample).slice(0, 24));
  }
  // The published check value of the algorithm: CRC-32 of "123456789".
  assert.strictEqual(archive.crc32(Buffer.from('123456789', 'utf8')), 0xcbf43926);
});

// ------------------------------------------------------------- 2. the timestamp

test('AGSC-04-09: the entry timestamp is the build instant in UTC, and no clock is read', () => {
  // 2026-01-01T00:00:00Z: year 46 since 1980, month 1, day 1, 00:00:00.
  assert.deepStrictEqual(archive.dosTimestamp(INSTANT), { date: (46 << 9) | (1 << 5) | 1, time: 0 });
  // A second instant, digit for digit: 2026-09-22T17:04:07Z. DOS seconds are halved.
  assert.deepStrictEqual(archive.dosTimestamp('2026-09-22T17:04:07Z'), {
    date: (46 << 9) | (9 << 5) | 22,
    time: (17 << 11) | (4 << 5) | 3,
  });
  // AGSC-04-09's default instant is epoch 0, which the format cannot represent:
  // 1980-01-01T00:00:00 is the floor, stated rather than silently wrapped.
  assert.deepStrictEqual(archive.dosTimestamp('1970-01-01T00:00:00Z'), { date: (1 << 5) | 1, time: 0 });
  assert.deepStrictEqual(archive.dosTimestamp('not an instant'), { date: (1 << 5) | 1, time: 0 });
  assert.deepStrictEqual(archive.dosTimestamp(undefined), { date: (1 << 5) | 1, time: 0 });
  // And the ceiling of the seven-bit year field.
  assert.deepStrictEqual(archive.dosTimestamp('2200-01-01T00:00:00Z'),
    { date: (127 << 9) | (12 << 5) | 31, time: (23 << 11) | (59 << 5) | 29 });
});

test('the archive module constructs no Date and reads no local-time accessor', () => {
  // The structural half of the reproducibility claim: every published zip library
  // fills the MS-DOS fields with `new Date(mtime).getHours()` and friends, so its
  // output depends on TZ. This module may not, and the check is on the source text
  // so that it cannot be reintroduced by a later edit.
  const source = nodeFs.readFileSync(path.join(ROOT, 'src', 'composition', 'archive.js'), 'utf8');
  for (const forbidden of ['new Date', 'Date.now', 'getFullYear', 'getMonth', 'getDate',
    'getHours', 'getMinutes', 'getSeconds', 'getTimezoneOffset']) {
    assert.ok(!source.split('\n').some((line) => !line.trim().startsWith('*')
      && !line.trim().startsWith('//') && line.includes(forbidden)),
    `src/composition/archive.js uses ${forbidden} outside a comment (AGSC-04-02)`);
  }
});

// --------------------------------------------------------------- 3. the container

test('a third-party reader unpacks the archive to exactly the input (fflate@0.8.3)', () => {
  const files = new Map([
    ['harness.jsonld', '{"@id":"x"}\n'],
    ['AGENTS.md', '# Agents\n\nprose é中😀\n'],
    ['skills/deep/SKILL.md', '---\nname: deep\n---\n'],
    ['', 'dropped: an empty path is not an entry'],
  ]);
  const built = archive.archiveBytes(files, { instant: INSTANT });
  assert.deepStrictEqual(built.violations, []);
  const back = unzipSync(built.bytes);
  assert.deepStrictEqual(Object.keys(back).sort(),
    ['AGENTS.md', 'harness.jsonld', 'skills/deep/SKILL.md']);
  for (const [at, bytes] of Object.entries(back)) {
    assert.strictEqual(Buffer.from(bytes).toString('utf8'), files.get(at), at);
  }
});

test('AGSC-07-09: entries are stored in code-point order of their path, and nothing else', () => {
  const built = archive.archiveBytes([
    { path: 'b.md', text: 'b' }, { path: 'A.md', text: 'A' },
    { path: 'a/b.md', text: 'ab' }, { path: '/leading.md', text: 'L' },
  ], { instant: INSTANT });
  assert.deepStrictEqual(built.entries.map((e) => e.path), ['A.md', 'a/b.md', 'b.md', 'leading.md']);
  // The order is in the BYTES, not only in the record list: the central directory
  // lists the same names in the same order.
  assert.deepStrictEqual(Object.keys(unzipSync(built.bytes)),
    ['A.md', 'a/b.md', 'b.md', 'leading.md']);
});

test('the container carries no optional field: no extra, no comment, no attributes', () => {
  const built = archive.archiveBytes([{ path: 'a', text: 'a' }], { instant: INSTANT });
  const bytes = Buffer.from(built.bytes);
  // Local header: 30 bytes + a one-byte name; the file byte; then the directory.
  assert.strictEqual(bytes.readUInt32LE(0), 0x04034b50);
  assert.strictEqual(bytes.readUInt16LE(6), 0x0800, 'only the UTF-8 name bit is set (APPNOTE §4.4.4)');
  assert.strictEqual(bytes.readUInt16LE(8), 0, 'the method is STORE');
  assert.strictEqual(bytes.readUInt16LE(28), 0, 'the local extra field is empty');
  const directory = 30 + 1 + 1;
  assert.strictEqual(bytes.readUInt32LE(directory), 0x02014b50);
  assert.strictEqual(bytes.readUInt16LE(directory + 30), 0, 'the central extra field is empty');
  assert.strictEqual(bytes.readUInt16LE(directory + 32), 0, 'the file comment is empty');
  assert.strictEqual(bytes.readUInt32LE(directory + 38), 0, 'no external attributes are claimed');
  assert.strictEqual(bytes.readUInt16LE(bytes.length - 2), 0, 'the archive comment is empty');
  assert.strictEqual(bytes.length, 30 + 1 + 1 + 46 + 1 + 22);
});

test('the same input gives the same bytes, twice', () => {
  const files = [['a.md', 'a'], ['b/c.md', 'c']];
  const first = archive.archiveBytes(files, { instant: INSTANT }).bytes;
  const second = archive.archiveBytes(files, { instant: INSTANT }).bytes;
  assert.deepStrictEqual(Buffer.from(first), Buffer.from(second));
  // …and a different instant gives different bytes, so the stamp is really in them.
  const later = archive.archiveBytes(files, { instant: '2026-09-22T00:00:00Z' }).bytes;
  assert.ok(!Buffer.from(first).equals(Buffer.from(later)));
});

// ------------------------------------------------------------- the refusals

test('AGSC-E903/AGSC-E902: what cannot become a conforming archive is a Finding, not a throw', () => {
  const escaping = archive.archiveBytes([{ path: '../outside.md', text: 'x' },
    { path: 'a\\b.md', text: 'x' }], { instant: INSTANT });
  assert.deepStrictEqual(escaping.violations.map((v) => v.code), ['AGSC-E902', 'AGSC-E902']);

  const twice = archive.archiveViolations([{ bytes: Uint8Array.from([]), path: 'a' },
    { bytes: Uint8Array.from([]), path: 'a' }]);
  assert.deepStrictEqual(twice.map((v) => v.code), ['AGSC-E903']);
  assert.match(twice[0].message, /stored twice/u);

  const many = [];
  for (let i = 0; i < 65536; i += 1) many.push({ bytes: Uint8Array.from([]), path: `f${i}` });
  assert.deepStrictEqual(archive.archiveViolations(many).map((v) => v.code), ['AGSC-E903']);

  // Every code used here is registered in spec/09 §9.4; this module mints none.
  const registry = nodeFs.readFileSync(path.join(ROOT, 'spec', '09-conformance.md'), 'utf8');
  for (const code of ['AGSC-E902', 'AGSC-E903']) {
    assert.ok(registry.includes(`\`${code}\``), `${code} is not registered`);
  }
});

test('AGSC-E903: the two 32-bit bounds of the format are checked, not assumed unreachable', () => {
  // The size fields of APPNOTE.TXT §4.3.7 are 32 bits, and ZIP64 is not emitted.
  // The check reads `bytes.length` and nothing else, so the bound is exercised with
  // a record that STATES a length rather than by allocating four gigabytes — which
  // is the only way to reach the branch at all on an ordinary machine.
  const huge = archive.archiveViolations([{ bytes: { length: 4294967296 }, path: 'big.bin' }]);
  // One entry over the bound is also a total over the bound: both are reported, so
  // a reader is told which entry AND that the archive as a whole cannot be written.
  assert.deepStrictEqual(huge.map((v) => v.code), ['AGSC-E903', 'AGSC-E903']);
  assert.match(huge[0].message, /"big\.bin" is 4294967296 bytes/u);
  assert.match(huge[1].message, /4294967296 bytes in all/u);

  const together = archive.archiveViolations([
    { bytes: { length: 3000000000 }, path: 'a.bin' },
    { bytes: { length: 3000000000 }, path: 'b.bin' },
  ]);
  assert.deepStrictEqual(together.map((v) => v.code), ['AGSC-E903']);
  assert.match(together[0].message, /6000000000 bytes in all/u);

  assert.deepStrictEqual(archive.archiveViolations(undefined), []);
  assert.deepStrictEqual(archive.archiveViolations([{ path: 'no-bytes' }]), []);
});

test('a file set the format cannot carry writes no archive at all', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, {});
  const result = archiveWriter.writeArchive(ctx, {
    files: [{ path: '../outside.md', text: 'x' }],
    instant: INSTANT,
    stem: 'dist/harness/x',
  });
  assert.strictEqual(result.path, null);
  assert.strictEqual(result.sha256, null);
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E902']);
  assert.ok(!nodeFs.existsSync(path.join(dir, 'dist')), 'a partial archive was written');
});

test('the content version is read defensively: a context with no ports is not a crash', () => {
  // `buildOptions` reaches the ProcessRunner port for the git-log file of
  // AGSC-08-20b. A verb that never builds must not fail over its absence, so the
  // reader answers `undefined` and `archiveName` falls back to `unversioned`.
  assert.strictEqual(archiveWriter.bundleVersionOf(null), undefined);
  assert.strictEqual(archive.archiveName('dist/skills', archiveWriter.bundleVersionOf(null)),
    'dist/skills-unversioned.zip');
  // A context that HAS no git history still derives AGSC-04-25's branch 4 from the
  // build instant, so the ordinary path never falls back to `unversioned`.
  assert.match(archiveWriter.bundleVersionOf({}), /^0\.0\.0\+\d{8}T\d{6}Z$/u);
});

test('the archive name carries the content version, and refuses one outside the grammar', () => {
  assert.strictEqual(archive.archiveName('dist/harness/abc/', 'v1.4.0+3.ga1b2c3d4e5f6'),
    'dist/harness/abc-v1.4.0+3.ga1b2c3d4e5f6.zip');
  assert.strictEqual(archive.archiveName('dist/skills', '0.0.0+20260101T000000Z'),
    'dist/skills-0.0.0+20260101T000000Z.zip');
  for (const bad of ['', undefined, 'has space', '../escape', 'a/b', 'x'.repeat(65)]) {
    assert.strictEqual(archive.archiveName('dist/skills', bad), 'dist/skills-unversioned.zip',
      String(bad));
  }
});

// ---------------------------------------------- 4. AGSC-07-13: the page and the CLI

test('AGSC-07-13: the page builds the same archive bytes as the CLI, for the same selection', () => {
  const items = [
    { description: 'The first concept of the fixture, long enough to be a description.', produces: ['p'], requires: ['b'], slug: 'a', title: 'A', type: 'concept' },
    { consumes: ['p'], description: 'The second concept, required by the first and consuming its port.', slug: 'b', title: 'B', type: 'concept' },
    { body: '## Steps\n\n1. Run.\n', description: 'A procedure with a body, so the skill file has prose to fence.', slug: 'p-run', title: 'Run it', type: 'procedure' },
  ];
  const selection = ['a', 'p-run'];
  const result = compose(items, selection);
  const options = {
    base: 'https://minimal.example/',
    instant: INSTANT,
    items,
    licenseProse: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    name: 'fixture',
    selectionDigest: createHash('sha256').update(harness.selectionDigestInput(result), 'utf8').digest('hex'),
    specVersion: '1.0.0-rc.6',
  };
  const emission = harness.emit(result, options);
  assert.ok(emission.emitted && emission.files.size >= 5);

  // The page host: the language and nothing else — no require, no fs, no TextEncoder.
  const context = vm.createContext(Object.create(null));
  vm.runInContext(browser.bundle({ specVersion: '1.0.0-rc.6' }), context, { filename: 'agsc-core.js' });
  const core = vm.runInContext('globalThis.AGSC_CORE', context);
  assert.strictEqual(vm.runInContext('typeof TextEncoder', context), 'undefined');

  // The page recomputes the Harness from the graph-shaped items, exactly as the
  // "download all" link does, and then archives it.
  const thereResult = core.compose(structuredClone(items), selection);
  const thereEmission = core.emit(thereResult, structuredClone(options));
  const there = core.archiveBytes(thereEmission.files, { instant: INSTANT });
  const here = archive.archiveBytes(emission.files, { instant: INSTANT });
  assert.deepStrictEqual(Buffer.from(there.bytes), Buffer.from(here.bytes));
  assert.deepStrictEqual([...Object.keys(unzipSync(here.bytes))].sort(),
    [...emission.files.keys()].sort());
  assert.strictEqual(core.archiveName('dist/harness/fixture', '0.0.0+20260101T000000Z'),
    archive.archiveName('dist/harness/fixture', '0.0.0+20260101T000000Z'));
});

test('every archive function is in the emitted bundle, in dependency order', () => {
  const names = browser.exportedNames();
  for (const name of archive.PORTABLE) assert.ok(names.includes(name), `${name} is not emitted`);
  assert.ok(names.indexOf('compareCodePoint') < names.indexOf('archiveEntries'),
    'archiveEntries reads compareCodePoint and must be emitted after it');
});

// --------------------------------------------------------------- 5. the three verbs

test('compose --zip writes one archive BESIDE the Harness directory, never inside it', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { zip: true }, ['supervisor', 'handoff']);
  const result = composeVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity === 'error'), []);

  const harnessDirs = nodeFs.readdirSync(path.join(dir, 'dist', 'harness'))
    .filter((name) => nodeFs.statSync(path.join(dir, 'dist', 'harness', name)).isDirectory());
  assert.strictEqual(harnessDirs.length, 1);
  // AGSC-07-12 closes the Harness at seven file kinds "and no others".
  assert.deepStrictEqual(zipsIn(dir, path.join('dist', 'harness', harnessDirs[0])), []);

  const archives = zipsIn(dir, path.join('dist', 'harness'));
  assert.strictEqual(archives.length, 1, 'exactly one archive beside the directory');
  assert.strictEqual(archives[0], `${harnessDirs[0]}-0.0.0+20260101T000000Z.zip`);

  const bytes = nodeFs.readFileSync(path.join(dir, 'dist', 'harness', archives[0]));
  const back = unzipSync(new Uint8Array(bytes));
  const written = nodeFs.readdirSync(path.join(dir, 'dist', 'harness', harnessDirs[0]),
    { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(path.join(dir, 'dist', 'harness', harnessDirs[0]), path.join(e.parentPath, e.name)).split(path.sep).join('/'));
  assert.deepStrictEqual(Object.keys(back).sort(), written.sort());
  for (const at of written) {
    assert.deepStrictEqual(Buffer.from(back[at]),
      nodeFs.readFileSync(path.join(dir, 'dist', 'harness', harnessDirs[0], at)), at);
  }
  assert.match(ctx.notes.join(''),
    /wrote: dist\/harness\/[0-9a-f]{16}-0\.0\.0\+20260101T000000Z\.zip sha256:[0-9a-f]{64} \(7 entries/u);
});

test('AGSC-07-17: an invalid composition emits no Harness, and --zip adds no archive', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { zip: true }, ['no-such-slug']);
  composeVerb.run(ctx);
  assert.ok(!nodeFs.existsSync(path.join(dir, 'dist', 'harness')), 'a Harness directory was written');
  assert.match(ctx.notes.join(''), /harness missing: the archive of --zip/u);
});

test('compose --from an item with no selection fence is an error, and nothing is written', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { from: 'supervisor', zip: true });
  const result = composeVerb.run(ctx);
  assert.ok(result.findings.some((f) => f.severity === 'error'), 'the missing selection is an error');
  assert.ok(!nodeFs.existsSync(path.join(dir, 'dist')), 'a Harness or an archive was written after an error');
  assert.match(ctx.notes.join(''), /harness_emitted: false/u);
  assert.match(ctx.notes.join(''), /harness missing: every file: the run found an error, so nothing was written/u);
});

test('a Harness whose emission breaks a rule is not written at all', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { zip: true }, ['supervisor', 'handoff']);
  const original = harness.emit;
  harness.emit = (...args) => ({ ...original(...args), violations: [{ code: 'AGSC-E801', message: 'forced' }] });
  let result;
  try {
    result = composeVerb.run(ctx);
  } finally {
    harness.emit = original;
  }
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E801' && f.severity === 'error'));
  assert.ok(!nodeFs.existsSync(path.join(dir, 'dist')), 'files were written after a violation');
  assert.match(ctx.notes.join(''), /harness missing: every file: the emission broke a rule/u);
});

test('skills --zip writes the packs and their lockfile as one archive beside dist/skills/', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { zip: true });
  const result = skillsVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity === 'error'), []);
  assert.deepStrictEqual(zipsIn(dir, 'dist'), ['skills-0.0.0+20260101T000000Z.zip']);
  const back = unzipSync(new Uint8Array(
    nodeFs.readFileSync(path.join(dir, 'dist', 'skills-0.0.0+20260101T000000Z.zip'))));
  assert.ok(Object.keys(back).includes('index.json'), 'the lockfile of AGSC-07-20 is in the archive');
  for (const [at, bytes] of Object.entries(back)) {
    assert.deepStrictEqual(Buffer.from(bytes), nodeFs.readFileSync(path.join(dir, 'dist', 'skills', at)), at);
  }
});

test('skills --zip has no meaning beside install or import', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { zip: true }, ['install']);
  const result = skillsVerb.run(ctx);
  assert.strictEqual(result.status, 'fail');
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E003']);
  assert.ok(!nodeFs.existsSync(path.join(dir, '.agents')), 'install ran anyway');
});

test('export --zip writes one archive per multi-file export root', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { markdown: true, steer: true, zip: true });
  const result = exportVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity === 'error'), []);
  assert.deepStrictEqual(zipsIn(dir, path.join('dist', 'export')),
    ['markdown-0.0.0+20260101T000000Z.zip', 'steer-0.0.0+20260101T000000Z.zip']);
  const back = unzipSync(new Uint8Array(
    nodeFs.readFileSync(path.join(dir, 'dist', 'export', 'markdown-0.0.0+20260101T000000Z.zip'))));
  for (const [at, bytes] of Object.entries(back)) {
    assert.deepStrictEqual(Buffer.from(bytes),
      nodeFs.readFileSync(path.join(dir, 'dist', 'export', 'markdown', at)), at);
  }
  assert.ok(Object.keys(back).includes('LICENSE-CONTENT'), 'the export root of AGSC-01-26 is packaged');
});

test('export --zip has no meaning over the two single-file graph exports', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { jsonld: true, zip: true });
  const result = exportVerb.run(ctx);
  assert.strictEqual(result.status, 'fail');
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E003']);
  assert.ok(!nodeFs.existsSync(path.join(dir, 'dist')), 'the export ran anyway');
});

// ------------------------------------------------- 6. the time zone and the locale

test('AGSC-04-02: two hosts with different TZ and LC_ALL write the same archive bytes', () => {
  const digests = [];
  for (const environment of [{ LC_ALL: 'C', TZ: 'UTC' },
    { LC_ALL: 'tr_TR.UTF-8', TZ: 'Pacific/Kiritimati' }]) {
    const dir = workspace();
    execFileSync(process.execPath, [CLI, 'compose', '--zip', '--quiet', 'supervisor', 'handoff'], {
      cwd: dir,
      encoding: 'utf8',
      env: { HOME: dir, PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const at = zipsIn(dir, path.join('dist', 'harness'));
    assert.strictEqual(at.length, 1, `no archive under ${environment.TZ}`);
    digests.push(`${at[0]} ${createHash('sha256')
      .update(nodeFs.readFileSync(path.join(dir, 'dist', 'harness', at[0]))).digest('hex')}`);
  }
  assert.strictEqual(digests[0], digests[1],
    'the MS-DOS timestamp fields of the archive followed the host time zone (AGSC-04-02)');
});

test('emitHarness called directly with an invalid composition writes nothing, archive included', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { zip: true }, []);
  const invalid = { conflicts: [{ code: 'AGSC-E802' }], selection: [], warnings: [] };
  const emission = composeVerb.emitHarness(ctx, { config: ctx.config, items: [] }, invalid, []);
  assert.strictEqual(emission.emitted, false);
  assert.deepStrictEqual(emission.files, []);
  assert.match(ctx.notes.join(''), /harness missing: the archive of --zip/u);
  assert.ok(!nodeFs.existsSync(path.join(dir, 'dist')));
});
