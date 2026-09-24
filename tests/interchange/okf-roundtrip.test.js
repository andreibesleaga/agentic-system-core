'use strict';
// tests/interchange/okf-roundtrip.test.js — AGSC-01-22 (the foreign OKF reader) and
// AGSC-10-09's claim that an export following AGSC-01-26…29 is one "the reference
// engine … imports losslessly". The round trip is asserted over the real fixture,
// through the real verbs, over the real filesystem, with a fixed clock.
//
// The format was read from its primary source on 2026-09-21:
// https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const okf = require('../../src/interchange/okf.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const ITEM_SCHEMA = readSchemas(ROOT).item;

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
  const dir = temp('agsc-okf-');
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
    specVersion: '1.0.0-rc.5',
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

const tree = (dir) => {
  const out = new Map();
  const walk = (at, prefix) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(at, entry.name);
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, rel);
      else out.set(rel, nodeFs.readFileSync(full, 'utf8'));
    }
  };
  walk(dir, '');
  return out;
};

test('AGSC-10-09: export --okf then import --from okf reproduces every item byte for byte', () => {
  const source = workspace();
  const out = exportVerb.run(ctxFor(source, { verbFlags: { okf: true } }));
  assert.deepStrictEqual(out.findings.filter((f) => f.severity !== 'warn'), []);

  // A fresh Bundle with the same identity and nothing in it.
  const target = temp('agsc-okf-in-');
  nodeFs.copyFileSync(path.join(source, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  nodeFs.mkdirSync(path.join(target, 'content'), { recursive: true });

  const imported = importVerb.run(ctxFor(target, {
    argv: [path.join(source, 'dist/export/okf')], verbFlags: { from: 'okf' },
  }));
  assert.deepStrictEqual(imported.findings.filter((f) => f.severity !== 'warn'), []);

  const before = tree(path.join(source, 'content'));
  const after = tree(path.join(target, 'content'));
  // AGSC-01-22 as amended at rc.6: tolerance has one LIMIT and one RECORD.
  // The record is `prov.source_version`/`prov.source_hash`, written by `import`
  // alone onto every item it writes, so that an imported item names the exact state
  // it was taken from. That is the one difference the round trip may show, and it is
  // an ADDITION: nothing the author wrote is changed or lost, which is what
  // AGSC-10-09's "imports losslessly" asks. The source here is an `export --okf` of
  // a Bundle with no git history, so its content version is AGSC-04-25's branch 4
  // and it publishes no bundle hash, hence no `source_hash`.
  const recorded = /^ {2}source_(version|hash): .+\n/gmu;
  for (const [at, text] of before) {
    if (at === 'index.md') continue; // the root document is not an item (AGSC-01-04)
    const written = String(after.get(at));
    assert.match(written, / {2}source_version: 0\.0\.0\+\d{8}T\d{6}Z\n/u,
      `${at} carries no prov.source_version (AGSC-01-22)`);
    assert.strictEqual(written.replace(recorded, ''), text,
      `${at} did not survive the round trip`);
  }
  assert.deepStrictEqual([...after.keys()].sort(), [...before.keys()].filter((k) => k !== 'index.md').sort());
});

test('AGSC-01-23: importing the same tree twice writes nothing the second time', () => {
  const source = workspace();
  exportVerb.run(ctxFor(source, { verbFlags: { okf: true } }));
  const target = temp('agsc-okf-idem-');
  nodeFs.copyFileSync(path.join(source, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  const argv = [path.join(source, 'dist/export/okf')];
  importVerb.run(ctxFor(target, { argv, verbFlags: { from: 'okf' } }));
  const first = tree(path.join(target, 'content'));
  const ctx = ctxFor(target, { argv, verbFlags: { from: 'okf' } });
  importVerb.run(ctx);
  assert.deepStrictEqual(tree(path.join(target, 'content')), first);
  assert.match(ctx.notes.join(''), /0 written, 0 replaced, 3 unchanged/u);
});

test('--dry-run reports the plan and writes nothing (AGSC-01-26a)', () => {
  const source = workspace();
  exportVerb.run(ctxFor(source, { verbFlags: { okf: true } }));
  const target = temp('agsc-okf-dry-');
  nodeFs.copyFileSync(path.join(source, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
  const ctx = ctxFor(target, {
    argv: [path.join(source, 'dist/export/okf')], verbFlags: { from: 'okf', 'dry-run': true },
  });
  importVerb.run(ctx);
  assert.ok(!nodeFs.existsSync(path.join(target, 'content')), 'a dry run wrote something');
  assert.match(ctx.notes.join(''), /--dry-run: 3 file\(s\) would be written/u);
});

test('AGSC-01-22: a foreign bundle with an unknown type, unknown keys and no index.md', () => {
  const plan = okf.plan([
    { path: 'playbooks/dataplex.md', text: '---\ntype: playbook\ntitle: Dataplex\nresource: https://example.org/x\nweird: kept\n---\n\n# Dataplex\n' },
    { path: 'index.md', text: '---\nokf_version: "0.2"\n---\n' },
    { path: 'log.md', text: '# Log\n' },
    { path: 'README.md', text: '# Readme\n' },
    { path: 'notes.txt', text: 'not markdown' },
  ], { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.deepStrictEqual(plan.writes.map((w) => w.path), ['content/concepts/dataplex.md']);
  const text = plan.writes[0].text;
  assert.match(text, /^---\ntype: concept\n/u, text);
  assert.match(text, /x-okf-type: playbook/u, 'the foreign type was not preserved');
  assert.match(text, /weird: kept/u, 'an unknown key was dropped');
  assert.match(text, /resource: https:\/\/example\.org\/x/u);
  assert.match(text, /origin: imported/u);
  assert.strictEqual(plan.totals.items, 1);
  assert.ok(plan.findings.some((f) => f.code === 'AGSC-E506' && /playbook/u.test(f.message)));
});

test('AGSC-01-22: a document with no type, no title and a broken link is still imported', () => {
  const plan = okf.plan([
    { path: 'a.md', text: '---\nresource: https://example.org/a\n---\n\n[nowhere](./gone.md)\n' },
  ], { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.strictEqual(plan.writes.length, 1);
  assert.match(plan.writes[0].text, /title: note-a/u, plan.writes[0].text);
  assert.ok(plan.findings.some((f) => /declares no type/u.test(f.message)));
  assert.ok(plan.findings.some((f) => /no title/u.test(f.message)));
});

test('AGSC-01-22: frontmatter outside the failsafe subset is imported, not refused', () => {
  const plan = okf.plan([
    { path: 'a.md', text: '---\ntype: concept\nx: &anchor 1\ny: *anchor\n---\n\nBODY KEPT.\n' },
  ], { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.strictEqual(plan.writes.length, 1);
  assert.match(plan.writes[0].text, /BODY KEPT\./u);
  assert.strictEqual(plan.totals.unreadable_frontmatter, 1);
  assert.ok(plan.findings.some((f) => /AGSC-02-02/u.test(f.message)));
});

test('AGSC-01-23: colliding slugs take -2, -3 in discovery order', () => {
  const plan = okf.plan([
    { path: 'z/one.md', text: '---\ntype: concept\ntitle: Z\n---\n' },
    { path: 'a/one.md', text: '---\ntype: concept\ntitle: A\n---\n' },
    { path: 'm/one.md', text: '---\ntype: concept\ntitle: M\n---\n' },
  ], { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.deepStrictEqual(plan.writes.map((w) => w.path), ['content/concepts/one-2.md',
    'content/concepts/one-3.md', 'content/concepts/one.md']);
  // Discovery order is code-point path order, so `a/one.md` took the bare slug.
  assert.match(plan.writes.find((w) => w.path === 'content/concepts/one.md').text, /title: A/u);
});

test('AGSC-02-91 is total: a file name with nothing usable in it still becomes an item', () => {
  const plan = okf.plan([{ path: '...md', text: '---\ntype: concept\ntitle: T\n---\n' }],
    { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.deepStrictEqual(plan.writes.map((w) => w.path), ['content/concepts/note.md']);
  assert.strictEqual(plan.totals.items, 1);
});

test('a slug the file name already satisfies is used verbatim', () => {
  const plan = okf.plan([{ path: 'deep/already-a-slug.md', text: '---\ntype: lesson\ntitle: T\nseverity: info\n---\n' }],
    { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.deepStrictEqual(plan.writes.map((w) => w.path), ['content/lessons/already-a-slug.md']);
});

test('a document with no frontmatter at all keeps its body', () => {
  const read = okf.readDocument('# Just prose\n');
  assert.strictEqual(read.reason, 'no frontmatter block');
  assert.strictEqual(read.body, '# Just prose\n');
  const seq = okf.readDocument('---\n- a\n---\nbody\n');
  assert.match(String(seq.reason), /not a mapping/u);
});

test('the reserved documents of OKF §8/§9 and AGSC-01-05 are never items', () => {
  assert.deepStrictEqual([...okf.RESERVED], ['index.md', 'log.md', '_index.md', 'README.md']);
  for (const name of okf.RESERVED) assert.ok(okf.isReserved(`deep/nested/${name}`), name);
  assert.ok(!okf.isReserved('deep/indexed.md'));
});

test('an empty source directory is AGSC-E901 and writes nothing', () => {
  const target = workspace();
  const empty = temp('agsc-okf-empty-');
  const result = importVerb.run(ctxFor(target, { argv: [empty], verbFlags: { from: 'okf' } }));
  assert.strictEqual(result.status, 'fail');
  assert.strictEqual(result.findings[0].code, 'AGSC-E901');
});

test('AGSC-01-26a: --selection is the old-site adapter flag, not a verb requirement', () => {
  assert.deepStrictEqual([...importVerb.FORMATS], ['okf', 'old-site', 'cogx', 'gabbe', 'skills', 'board']);
  assert.deepStrictEqual([...importVerb.SELECTION_REQUIRED], ['old-site']);
});

test('AGSC-01-22: a file the port cannot decode is named and skipped, never fatal', () => {
  const target = workspace();
  const source = temp('agsc-okf-binary-');
  nodeFs.writeFileSync(path.join(source, 'ok.md'), '---\ntype: concept\ntitle: Fine\n---\n');
  nodeFs.writeFileSync(path.join(source, 'bad.md'), Buffer.from([0xff, 0xfe, 0x00]));
  const ctx = ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } });
  // The Bundle-rooted port refuses a path outside its root, so the source is read
  // through its own port; a file it cannot hand back as text is a warning.
  ctx.openRoot = () => ({
    exists: () => true,
    readFile: (at) => {
      if (String(at).endsWith('bad.md')) throw new Error('not decodable');
      return '---\ntype: concept\ntitle: Fine\n---\n';
    },
    walk: () => ['ok.md', 'bad.md'],
  });
  const result = importVerb.run(ctx);
  const warn = result.findings.find((f) => f.code === 'AGSC-E901');
  assert.strictEqual(warn.severity, 'warn');
  assert.match(warn.message, /bad\.md/u);
  assert.ok(nodeFs.existsSync(path.join(target, 'content/concepts/ok.md')));
});

test('AGSC-01-26a: --selection is still required for the old-site adapter', () => {
  const target = workspace();
  const result = importVerb.run(ctxFor(target, {
    argv: [target], verbFlags: { from: 'old-site' },
  }));
  assert.strictEqual(result.status, 'fail');
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E003' && /--selection/u.test(f.message)));
});

// AGSC-01-22 (rc.6): a foreign record whose licence the importer cannot establish as
// permitting publication is written `status: draft` — never published (AGSC-06-30) —
// and reported (AGSC-E506). The licence is established by the record's own `license`,
// the source root's index.md `license`, or a licence file at the source root. And a
// document mapped to `concept` gets `kind: explainer`, the adoption default of
// AGSC-02-90, so the imported item passes the node's own lint (AGSC-02-12).
test('AGSC-01-22: an unestablished licence imports as draft; a mapped concept gets kind explainer', () => {
  const doc = { path: 'playbooks/dataplex.md', text: '---\ntype: playbook\ntitle: Dataplex\n---\n\n# Dataplex\n' };
  const none = okf.plan([doc], { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.match(none.writes[0].text, /^status: draft$/mu, none.writes[0].text);
  assert.match(none.writes[0].text, /^kind: explainer$/mu);
  assert.ok(none.findings.some((f) => f.code === 'AGSC-E506' && /licen[cs]e/u.test(f.message) && /draft/u.test(f.message)));

  const byIndex = okf.plan([doc, { path: 'index.md', text: '---\nokf_version: "0.2"\nlicense: CC-BY-4.0\n---\n' }],
    { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.doesNotMatch(byIndex.writes[0].text, /^status: draft$/mu);
  const byFile = okf.plan([doc], { itemSchema: ITEM_SCHEMA, licenceFiles: { LICENSE: 'MIT License\n\nPermission is hereby granted, free of charge' }, operator: 'human:x' });
  assert.doesNotMatch(byFile.writes[0].text, /^status: draft$/mu);
  const own = okf.plan([{ path: 'a.md', text: '---\ntype: concept\nkind: pattern\ntitle: A thing\nlicense: Proprietary\n---\n\nA.\n' }],
    { itemSchema: ITEM_SCHEMA, operator: 'human:x' });
  assert.match(own.writes[0].text, /^status: draft$/mu, 'a licence that is not open is not established');
  assert.match(own.writes[0].text, /^kind: pattern$/mu, 'an authored kind is kept');
});
