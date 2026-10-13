'use strict';
// five input refusals the security-floor score (BENCH-1b, `bench/security.js`)
// found stopped under the wrong code, or not stopped at all. Driven as an operator
// drives the engine: the real CLI over a scratch copy of the reference fixture.
//
// `build` alone published an SVG attachment carrying a script and wrote
//               a `../../../` attachment path into the page; `ci` refused both. A node
//               published by `build` must not be weaker than one published by `ci`
//               (AGSC-02-98, AGSC-01-35; owner default: yes).
// a `.md` file that is not valid UTF-8 was decoded with U+FFFD and
//               accepted; AGSC-01-14 requires UTF-8, and the fault is AGSC-E108.
// `import --from okf <file>.zip` died with an internal error; AGSC-01-16
//               refuses an archive with AGSC-E903.
// an attachment over the cap, an archive attachment, an attachment
//               directory that is a link out of the Bundle, an oversized import file and
//               an oversized `agsc.config.json` were stopped under AGSC-E901/E201 while
//               the FileSystem port had already raised the code AGSC-01-16/01-35 name
//               (E904, E903, E902) — the caller swallowed it.
//   (found on the way) the lint verb handed `governance/lint.js` a presence map of
//               booleans where the function reads byte lengths, so neither the
//               attachment cap (AGSC-E904) nor an absent attachment (AGSC-E413) was
//               ever reported through the CLI.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'minimal');
const CAP = 1024 * 1024;

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-refuse-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  process.on('exit', () => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}

function agsc(dir, args) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'bin', 'agsc.js'), ...args, '--json'], {
    cwd: dir, encoding: 'utf8', env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = (r.stdout || '').split('\n').filter(Boolean).pop();
  const envelope = line ? JSON.parse(line) : { findings: [] };
  return { codes: [...new Set(envelope.findings.map((f) => f.code))].sort(), envelope, err: r.stderr, exit: r.status };
}

/** Give `handoff` one attachment, and write the file when `bytes` is given. */
function attach(dir, entry, bytes) {
  const item = path.join(dir, 'content', 'concepts', 'handoff.md');
  const lines = ['attachments:', `  - file: ${JSON.stringify(entry.file)}`, `    media_type: ${entry.media_type}`, `    alt: ${entry.alt || 'An attachment'}`];
  fs.writeFileSync(item, fs.readFileSync(item, 'utf8').replace('kind: pattern\n', `kind: pattern\n${lines.join('\n')}\n`));
  if (bytes !== undefined) {
    const at = path.join(dir, 'content', 'attachments', 'handoff', entry.file);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, bytes);
  }
}

test('build alone refuses an SVG attachment carrying a script (AGSC-E412) and writes nothing', () => {
  const dir = workspace();
  attach(dir, { file: 'x.svg', media_type: 'image/svg+xml' },
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>\n');
  const r = agsc(dir, ['build']);
  assert.strictEqual(r.exit, 1, JSON.stringify(r.envelope.findings));
  assert.ok(r.codes.includes('AGSC-E412'), r.codes.join(','));
  assert.ok(!r.codes.includes('AGSC-E901'), 'the refused attachment is not also reported as a missing route');
  assert.strictEqual(fs.existsSync(path.join(dir, 'www')), false);
  // `ci` reports the fault once (its lint lane), never twice.
  const ci = agsc(dir, ['ci']);
  assert.strictEqual(ci.envelope.findings.filter((f) => f.code === 'AGSC-E412').length, 1);
});

test('build alone refuses an attachment path that leaves its directory (AGSC-E902)', () => {
  const dir = workspace();
  attach(dir, { file: '../../../agsc.config.json', media_type: 'application/json' });
  const r = agsc(dir, ['build']);
  assert.strictEqual(r.exit, 1);
  assert.ok(r.codes.includes('AGSC-E902'), r.codes.join(','));
  assert.ok(!r.codes.includes('AGSC-E901'));
  assert.strictEqual(fs.existsSync(path.join(dir, 'www')), false);
});

test('an attachment over the cap is AGSC-E904 and an archive attachment AGSC-E903, never E901', () => {
  const big = workspace();
  attach(big, { file: 'big.txt', media_type: 'text/plain' }, 'b'.repeat(CAP + 1));
  const r1 = agsc(big, ['ci']);
  assert.strictEqual(r1.exit, 1);
  assert.ok(r1.codes.includes('AGSC-E904'), r1.codes.join(','));
  assert.ok(!r1.codes.includes('AGSC-E901'), r1.codes.join(','));

  const arc = workspace();
  attach(arc, { file: 'data.tgz', media_type: 'application/gzip' }, Buffer.from('H4sIAA==', 'base64'));
  const r2 = agsc(arc, ['ci']);
  assert.strictEqual(r2.exit, 1);
  assert.ok(r2.codes.includes('AGSC-E903'), r2.codes.join(','));
  assert.ok(!r2.codes.includes('AGSC-E901'), r2.codes.join(','));
});

test('an attachment directory that links out of the Bundle is AGSC-E902, never E901', () => {
  const dir = workspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-outside-'));
  fs.writeFileSync(path.join(outside, 'hosts'), 'secret\n');
  attach(dir, { file: 'hosts', media_type: 'text/plain' });
  fs.mkdirSync(path.join(dir, 'content', 'attachments'), { recursive: true });
  fs.symlinkSync(outside, path.join(dir, 'content', 'attachments', 'handoff'));
  const r = agsc(dir, ['ci']);
  fs.rmSync(outside, { force: true, recursive: true });
  assert.strictEqual(r.exit, 1);
  assert.ok(r.codes.includes('AGSC-E902'), r.codes.join(','));
  assert.ok(!r.codes.includes('AGSC-E901'), r.codes.join(','));
});

test('the lint verb reports an absent attachment (AGSC-E413) — the presence map carries sizes', () => {
  const dir = workspace();
  attach(dir, { file: 'absent.txt', media_type: 'text/plain' });
  const r = agsc(dir, ['lint']);
  assert.ok(r.codes.includes('AGSC-E413'), r.codes.join(','));
});

test('an item that is not valid UTF-8 is AGSC-E108 (AGSC-01-14)', () => {
  const dir = workspace();
  const item = path.join(dir, 'content', 'concepts', 'handoff.md');
  const text = fs.readFileSync(item);
  fs.writeFileSync(item, Buffer.concat([text.subarray(0, 30), Buffer.from([0xc3, 0x28, 0xff]), text.subarray(30)]));
  const r = agsc(dir, ['lint']);
  assert.strictEqual(r.exit, 1);
  const e108 = r.envelope.findings.filter((f) => f.code === 'AGSC-E108');
  assert.strictEqual(e108.length, 1, JSON.stringify(r.envelope.findings));
  assert.strictEqual(e108[0].file, 'content/concepts/handoff.md');
  assert.doesNotMatch(r.err, /internal error/u);
});

test('an oversized agsc.config.json is AGSC-E904, not a JSON error', () => {
  const dir = workspace();
  const at = path.join(dir, 'agsc.config.json');
  fs.writeFileSync(at, `${fs.readFileSync(at, 'utf8').trimEnd()}${' '.repeat(CAP)}\n`);
  const r = agsc(dir, ['lint']);
  assert.strictEqual(r.exit, 1);
  assert.ok(r.codes.includes('AGSC-E904'), r.codes.join(','));
  assert.ok(!r.codes.includes('AGSC-E201'), r.codes.join(','));
});

test('import of an archive is AGSC-E903, and nothing is written', (t) => {
  const dir = workspace();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-zip-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const source = path.join(scratch, 'bundle.zip');
  fs.writeFileSync(source, Buffer.from('UEsDBHN0dWI=', 'base64'));
  const before = fs.readdirSync(path.join(dir, 'content'), { recursive: true }).sort();
  for (const from of ['okf', 'cogx', 'gabbe']) {
    const r = agsc(dir, ['import', '--from', from, source]);
    assert.strictEqual(r.exit, 1, from);
    assert.deepStrictEqual(r.codes, ['AGSC-E903'], `${from}: ${JSON.stringify(r.envelope.findings)}`);
    assert.doesNotMatch(r.err, /internal error/u);
  }
  // A genuinely unknown adapter is still refused as one — AGSC-E203, the closed-list
  // code, not the usage code AGSC-E002 — before any path is
  // looked at: the archive check does not hide the refusal.
  const unknown = agsc(dir, ['import', '--from', 'no-such-adapter', source]);
  assert.strictEqual(unknown.exit, 1);
  assert.deepStrictEqual(unknown.codes, ['AGSC-E203']);
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'content'), { recursive: true }).sort(), before);
});

test('an import file over the cap is AGSC-E904, not "could not be read"', (t) => {
  const dir = workspace();
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-big-'));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.writeFileSync(path.join(source, 'big.md'),
    `---\ntype: concept\ntitle: Big Item\n---\n\n${'x'.repeat(CAP + 1)}\n`);
  const r = agsc(dir, ['import', '--from', 'okf', source]);
  assert.strictEqual(r.exit, 1);
  assert.ok(r.codes.includes('AGSC-E904'), r.codes.join(','));
  assert.ok(!r.codes.includes('AGSC-E901'), r.codes.join(','));
});

// A frontmatter of nested block maps that `lint` passes used to stop `build`, `ci`
// and `lint --fix` with an internal error (the writer's stack overflowed), and the
// same shape in a foreign file stopped `import --from okf` the same way. Every verb
// now finishes or refuses under a registered code, AGSC-E105, the code the reader
// gives the same input when its own stack overflows (AGSC-02-02, AGSC-09-11). The
// depth below sits between the writer's limit and the reader's on the default stack,
// so each verb takes one of three roads, every one of them clean: the reader refuses
// the file, the writer refuses it, or both hold it and the verb succeeds.
const DEEP_LEVELS = 800;

function nestedBlockMaps(levels) {
  let text = 'x:\n';
  for (let i = 1; i <= levels; i += 1) text += `${' '.repeat(i)}k${i === levels ? ': leaf\n' : ':\n'}`;
  return text;
}

function deepItem(dir) {
  const item = path.join(dir, 'content', 'concepts', 'handoff.md');
  fs.writeFileSync(item, fs.readFileSync(item, 'utf8').replace('kind: pattern\n', `kind: pattern\n${nestedBlockMaps(DEEP_LEVELS)}`));
}

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile()).map((d) => path.join(d.parentPath || d.path, d.name)).sort();
}

/** The invariant of every road: a registered outcome, never an internal error. */
function assertClean(r, label) {
  assert.doesNotMatch(r.err, /internal error/u, `${label}: ${r.err.slice(0, 200)}`);
  assert.ok(r.exit === 0 || r.exit === 1, `${label}: exit ${r.exit}`);
  assert.ok(Array.isArray(r.envelope.findings), `${label}: no envelope on standard output`);
  const errors = [...new Set(r.envelope.findings.filter((f) => f.severity === 'error').map((f) => f.code))].sort();
  if (r.exit === 1) {
    assert.ok(errors.includes('AGSC-E105'), `${label}: ${errors.join(',')}`);
    // The reader's own refusal also leaves the item without a type (AGSC-E205).
    assert.ok(errors.every((code) => code === 'AGSC-E105' || code === 'AGSC-E205'), `${label}: ${errors.join(',')}`);
  } else {
    assert.deepStrictEqual(errors, [], label);
  }
}

test('build, ci and lint --fix finish or refuse a deeply nested frontmatter under AGSC-E105, never an internal error', () => {
  for (const argv of [['build'], ['ci'], ['lint', '--fix']]) {
    const dir = workspace();
    deepItem(dir);
    const before = filesUnder(path.join(dir, 'content'));
    const r = agsc(dir, argv);
    assertClean(r, argv.join(' '));
    if (r.exit === 1) assert.deepStrictEqual(filesUnder(path.join(dir, 'www')), [], `${argv.join(' ')}: a refused build wrote files`);
    assert.deepStrictEqual(filesUnder(path.join(dir, 'content')), before, `${argv.join(' ')}: the source tree changed`);
    const named = r.envelope.findings.filter((f) => f.code === 'AGSC-E105');
    for (const f of named) assert.strictEqual(f.file, 'content/concepts/handoff.md', `${argv.join(' ')}: the finding names the item`);
  }
});

test('lint alone keeps passing the item whose writer road is the one that refuses it', () => {
  const dir = workspace();
  deepItem(dir);
  const r = agsc(dir, ['lint']);
  assertClean(r, 'lint');
});

test('import --from okf finishes or refuses a deeply nested foreign frontmatter under AGSC-E105, and a refusal writes nothing', (t) => {
  for (const extra of [[], ['--dry-run']]) {
    const dir = workspace();
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-deep-'));
    t.after(() => fs.rmSync(source, { recursive: true, force: true }));
    fs.writeFileSync(path.join(source, 'deep.md'),
      `---\ntype: concept\ntitle: Deep Item\ndescription: A foreign item whose frontmatter is nested very deep.\n${nestedBlockMaps(DEEP_LEVELS)}---\n\nBody.\n`);
    const before = filesUnder(path.join(dir, 'content'));
    const r = agsc(dir, ['import', '--from', 'okf', source, ...extra]);
    assertClean(r, `import ${extra.join(' ')}`);
    if (r.exit === 1 || extra.length > 0) {
      assert.deepStrictEqual(filesUnder(path.join(dir, 'content')), before, `import ${extra.join(' ')}: wrote under content/`);
    }
    for (const f of r.envelope.findings.filter((x) => x.code === 'AGSC-E105')) {
      assert.match(f.file, /deep\.md$/u, `import ${extra.join(' ')}: the finding names the foreign file`);
    }
  }
});
