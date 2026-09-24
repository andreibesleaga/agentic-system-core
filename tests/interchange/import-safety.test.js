'use strict';
// tests/interchange/import-safety.test.js —.
//
// TWO defects of the import lane, both measured on the real fixtures.
//
// `import` seeded its taken-slug set from the INCOMING set only, never from
// the Bundle already on disk, so a foreign bundle naming a slug the node had authored
// itself REPLACED that file — silently, exit 0, zero findings. The operator's own
// published content was gone, recoverable only from git. AGSC-01-23 asks for a
// deterministic and idempotent import and says nothing that licenses destroying an
// existing item; the safe reading, and the one implemented here, is that a collision
// with an item already on disk writes NOTHING and fails, naming every collision.
// AGSC-01-26a and §9.3's adapter-flag sentence let an adapter define flags of its
// own, so `--replace` is the explicit, documented way to ask for replacement — and
// even then the write goes through the Bundle's own port, which refuses a path
// outside the root and a path that leaves it through a link (AGSC-E902).
//
// An imported single-line string carrying a control character was written
// out as the YAML escape `"N\0UL"`, which parses back to U+0000 — so the importer
// created a file its own `lint` rejects with AGSC-E204 while reporting `status: pass`.
// AGSC-02-24 as amended at rc.5 fixes the class and `knowledge/unicode.js#singleLine`
// is the neutralisation every other writer already applies.
//
// Both adapters are covered: `old-site` and `okf`.
// Deterministic: a fixed clock, no network, no wall clock, no randomness.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');
const okf = require('../../src/interchange/okf.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const OLD_SITE = path.join(ROOT, 'tests', 'fixtures', 'old-site-10');
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
  const dir = temp('agsc-safety-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  return dir;
}

function ctxFor(dir, options = {}) {
  const notes = [];
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes,
    openRoot: (at) => createFileSystem(path.resolve(dir, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0-rc.5',
    stderr: { write: (text) => notes.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

/** A foreign OKF bundle: one file per `[name, text]` pair. */
function foreign(files) {
  const dir = temp('agsc-foreign-');
  for (const [name, text] of Object.entries(files)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

const read = (dir, at) => nodeFs.readFileSync(path.join(dir, at), 'utf8');
const codes = (result) => result.findings.map((f) => f.code).sort();

// ------------------------------------------------: the OKF adapter

test('AGSC-01-23: a foreign OKF item naming an existing slug writes NOTHING and fails', () => {
  const target = workspace();
  const before = read(target, 'content/concepts/supervisor.md');
  const source = foreign({
    'supervisor.md': '---\ntype: concept\ntitle: Hijacked Supervisor\n---\n\nTAKEOVER.\n',
    'handoff.md': '---\ntype: concept\ntitle: Hijacked Handoff\n---\n\nTAKEOVER.\n',
    'brand-new.md': '---\ntype: concept\ntitle: A Brand New Item\n---\n\nFresh.\n',
  });
  const result = importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
  assert.strictEqual(result.status, 'fail', 'the import did not fail on a collision');
  const collisions = result.findings.filter((f) => f.code === 'AGSC-E206');
  assert.deepStrictEqual(collisions.map((f) => f.file).sort(),
    ['content/concepts/handoff.md', 'content/concepts/supervisor.md'],
    'every collision must be named, not just the first');
  // NOTHING was written: not the colliding files, and not the innocent one either.
  assert.strictEqual(read(target, 'content/concepts/supervisor.md'), before);
  assert.ok(!nodeFs.existsSync(path.join(target, 'content/concepts/brand-new.md')),
    'a partial import left a new file behind');
  // The message tells the operator what to do.
  assert.match(collisions[0].message, /--replace/u);
  assert.match(collisions[0].message, /--dry-run/u);
});

test('--dry-run reports exactly the same collisions and writes nothing', () => {
  const target = workspace();
  const source = foreign({ 'supervisor.md': '---\ntype: concept\ntitle: Hijacked\n---\n\nX.\n' });
  const before = read(target, 'content/concepts/supervisor.md');
  const dry = importVerb.run(ctxFor(target,
    { argv: [source], verbFlags: { 'dry-run': true, from: 'okf' } }));
  assert.strictEqual(dry.status, 'fail');
  assert.deepStrictEqual(codes(dry).filter((c) => c === 'AGSC-E206'), ['AGSC-E206']);
  assert.strictEqual(read(target, 'content/concepts/supervisor.md'), before);
});

test('AGSC-01-26a: the documented --replace flag is the only way to replace an item', () => {
  const target = workspace();
  const source = foreign({ 'supervisor.md': '---\ntype: concept\ntitle: Replaced Supervisor\n---\n\nNew body.\n' });
  const result = importVerb.run(ctxFor(target,
    { argv: [source], verbFlags: { from: 'okf', replace: true } }));
  assert.deepStrictEqual(result.findings.filter((f) => f.severity !== 'warn').map((f) => f.code), []);
  assert.match(read(target, 'content/concepts/supervisor.md'), /Replaced Supervisor/u);
  // Every replacement is NAMED, so nothing is lost in silence (AGSC-01-22's rule for
  // the other direction).
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E506' && f.severity === 'warn'
    && /replaced/u.test(f.message) && f.file === 'content/concepts/supervisor.md'),
  JSON.stringify(result.findings.map((f) => [f.code, f.message])));
});

test('AGSC-01-23: re-importing an UNCHANGED tree is still idempotent and still passes', () => {
  const target = workspace();
  const source = foreign({ 'brand-new.md': '---\ntype: concept\ntitle: A Brand New Item\n---\n\nFresh.\n' });
  const first = importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
  assert.notStrictEqual(first.status, 'fail', JSON.stringify(codes(first)));
  const bytes = read(target, 'content/concepts/brand-new.md');
  const second = importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
  assert.notStrictEqual(second.status, 'fail',
    'a byte-identical re-import must not read as a collision');
  assert.deepStrictEqual(codes(second).filter((c) => c === 'AGSC-E206'), []);
  assert.strictEqual(read(target, 'content/concepts/brand-new.md'), bytes);
});

test('AGSC-10-09 + AGSC-01-22: the round trip adds the source record and nothing else', () => {
  // Until rc.6 an export re-imported into its own Bundle wrote byte-identical files
  // and was therefore not a collision. added the RECORD — `prov.source_version`
  // and `prov.source_hash`, written by `import` alone — so the re-import now writes
  // one line the item did not have, and's rule that an import never writes
  // over an existing item applies: it is refused, by name, until the operator says
  // `--replace`. Both halves are asserted here, because the losslessness AGSC-10-09
  // asks for is that nothing is LOST, not that nothing is added.
  const source = workspace();
  exportVerb.run(ctxFor(source, { verbFlags: { okf: true } }));
  const target = temp('agsc-safety-rt-');
  nodeFs.cpSync(FIXTURE, target, { recursive: true });
  const argv = [path.join(source, 'dist/export/okf')];

  const refused = importVerb.run(ctxFor(target, { argv, verbFlags: { from: 'okf' } }));
  assert.strictEqual(refused.status, 'fail');
  assert.ok(codes(refused).filter((c) => c === 'AGSC-E206').length > 0);

  const before = read(target, 'content/concepts/supervisor.md');
  const result = importVerb.run(ctxFor(target, { argv, verbFlags: { from: 'okf', replace: true } }));
  assert.deepStrictEqual(result.findings.filter((f) => f.severity !== 'warn').map((f) => f.code), []);
  const after = read(target, 'content/concepts/supervisor.md');
  assert.match(after, / {2}source_version: 0\.0\.0\+\d{8}T\d{6}Z\n/u);
  assert.strictEqual(after.replace(/^ {2}source_(version|hash): .+\n/gmu, ''), before);
});

// --------------------------------------------: the old-site adapter

test('AGSC-01-23: the old-site adapter refuses a collision too, and --replace opens it', () => {
  const target = temp('agsc-safety-old-');
  nodeFs.writeFileSync(path.join(target, 'agsc.config.json'), `${JSON.stringify({
    bundle: { id: 'fixture-node', operator: 'human:tester' },
    site: { base: 'https://example.org/', title: 'Fixture Node' },
    spec_version: '1.0.0-rc.5',
  }, null, 2)}\n`);
  const argv = [OLD_SITE];
  const flags = { corrections: undefined, from: 'old-site', selection: path.join(OLD_SITE, 'selection.tsv') };
  // The fixture corpus carries its own mapping findings (unresolved links and the
  // like); what matters here is that the first run WROTE the items.
  importVerb.run(ctxFor(target, { argv, verbFlags: { ...flags } }));
  const written = nodeFs.readdirSync(path.join(target, 'content', 'concepts'));
  assert.ok(written.length > 0, 'the old-site import wrote nothing to collide with');
  // The operator then EDITS one of the imported items, as an operator does.
  const edited = path.join(target, 'content', 'concepts', written[0]);
  nodeFs.writeFileSync(edited, `${nodeFs.readFileSync(edited, 'utf8')}\nA sentence the operator added.\n`);
  const mine = nodeFs.readFileSync(edited, 'utf8');
  const second = importVerb.run(ctxFor(target, { argv, verbFlags: { ...flags } }));
  assert.strictEqual(second.status, 'fail', 'the second import silently overwrote an edited item');
  assert.ok(second.findings.some((f) => f.code === 'AGSC-E206'), JSON.stringify(codes(second)));
  assert.strictEqual(nodeFs.readFileSync(edited, 'utf8'), mine, 'the operator’s edit was destroyed');
  const forced = importVerb.run(ctxFor(target, { argv, verbFlags: { ...flags, replace: true } }));
  assert.notStrictEqual(forced.status, 'fail', JSON.stringify(codes(forced)));
  assert.notStrictEqual(nodeFs.readFileSync(edited, 'utf8'), mine);
  assert.ok(forced.findings.some((f) => f.code === 'AGSC-E506' && /replaced/u.test(f.message)),
    'a replacement was not reported');
});

// ---------------------------------: never outside the root, never a link

test('AGSC-01-16/01-35: --replace never writes outside the Bundle root or through a link', () => {
  const target = workspace();
  const outside = temp('agsc-safety-out-');
  nodeFs.writeFileSync(path.join(outside, 'victim.md'), 'PRISTINE\n');
  // A symlink planted INSIDE the Bundle, pointing at a file outside it: the classic
  // way a write escapes a root that `path.resolve` alone cannot see.
  const link = path.join(target, 'content', 'concepts', 'linked.md');
  nodeFs.symlinkSync(path.join(outside, 'victim.md'), link);
  const source = foreign({ 'linked.md': '---\ntype: concept\ntitle: Through The Link\n---\n\nX.\n' });
  const result = importVerb.run(ctxFor(target,
    { argv: [source], verbFlags: { from: 'okf', replace: true } }));
  assert.strictEqual(nodeFs.readFileSync(path.join(outside, 'victim.md'), 'utf8'), 'PRISTINE\n',
    'the import wrote through a symlink and out of the Bundle root');
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E902'), JSON.stringify(codes(result)));
});

// ------------------------------------------: what the import writes lints

test('AGSC-02-24: a control character in an imported single-line value is neutralised', () => {
  const target = workspace();
  const source = foreign({
    'nul.md': '---\ntype: concept\ntitle: "N\\u0000UL"\ndescription: "A description with a line\\nseparator inside it that is long enough to pass."\n---\n\nBody.\n',
  });
  const result = importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
  assert.notStrictEqual(result.status, 'fail', JSON.stringify(codes(result)));
  const written = read(target, 'content/concepts/nul.md');
  assert.ok(!/\\0|\\u0000|\\n/u.test(written.split('\n---\n')[0]),
    `the frontmatter still carries an escape: ${JSON.stringify(written.slice(0, 200))}`);
  assert.match(written, /^title: N UL$/mu);
  // The substitution is REPORTED, never silent (AGSC-01-22's own principle).
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E506' && /single/u.test(f.message)),
    JSON.stringify(result.findings.map((f) => [f.code, f.message])));
});

test('what an import writes always passes the node’s own lint', () => {
  const target = workspace();
  const source = foreign({
    'nul.md': '---\ntype: concept\nkind: explainer\ntitle: "N\\u0000UL"\ndescription: "A description long enough to satisfy the forty-code-point minimum of the schema."\n---\n\nBody.\n',
    'sep.md': '---\ntype: concept\nkind: explainer\ntitle: "Line\\u2028separator"\ndescription: "A second description\\u0085also long enough to satisfy that forty-code-point minimum."\n---\n\nBody.\n',
    'bell.md': '---\ntype: concept\nkind: explainer\ntitle: "Bell\\u0007ring"\ndescription: "A description long enough to satisfy the forty-code-point minimum of the schema."\n---\n\nBody.\n',
  });
  const imported = importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
  assert.notStrictEqual(imported.status, 'fail', JSON.stringify(codes(imported)));
  // The very next command an operator runs, on the tree the import just wrote —
  // the WHOLE lint, including the parse/schema findings `loadBundle` collects, which
  // is where a NUL in a `title` lands (AGSC-E204 against the single-line pattern).
  const ctx = ctxFor(target);
  const bundle = loadBundle(ctx.ports.fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const lane = lintVerb.lane(ctx, bundle);
  const errors = [...(bundle.findings || []), ...lane.findings].filter((f) => f.severity !== 'warn');
  assert.deepStrictEqual(errors.map((f) => [f.code, f.file]), [],
    'the import wrote a Bundle its own lint rejects');
});

test('the neutraliser is the identity on every conforming value, so no byte moves', () => {
  const plan = okf.plan([{
    path: 'clean.md',
    text: '---\ntype: concept\ntitle: A Clean Title\ndescription: A description with nothing forbidden in it at all, comfortably long.\n---\n\nBody.\n',
  }], { itemSchema: readSchemas(ROOT).item, operator: 'human:tester' });
  assert.match(plan.writes[0].text, /^title: A Clean Title$/mu);
  assert.deepStrictEqual(plan.findings.filter((f) => /single/u.test(f.message)), []);
});
