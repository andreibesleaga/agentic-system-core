'use strict';
// verifies PRD-070, AGSC-01-26a, AGSC-00-22, AGSC-01-22, AGSC-01-23, AGSC-01-29, AGSC-06-30
// tests/interchange/memory-adapters.test.js — the six direct memory adapters there and back
// (`mem0`, `letta`, `zep`, `csv`, `basic-memory`, `claude-code`), through the real verbs over
// the real file system, with a fixed clock and the network trapped: a memory adapter never
// reaches the network (AGSC-00-24), so any socket or fetch fails the test.
//
// What every adapter must do, asserted once for all six:
//   * export writes published items only (AGSC-06-30), carries the provenance header and the
//     Content Use Terms (AGSC-01-29), writes nothing executable, and is byte-identical twice;
//   * our own export comes back item for item, byte for byte (plus prov.source_version), and a
//     second import writes nothing (AGSC-00-22, AGSC-01-23); the result lints clean;
//   * an own record naming another origin is not trusted: it is read as foreign, as a draft;
//   * a record of another specification MAJOR is refused unless --allow-newer (AGSC-01-22).

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');
const { trapNetwork } = require('./_memory-network-trap.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const SPEC = '1.0.0';
const ADAPTERS = Object.freeze(['mem0', 'letta', 'zep', 'csv', 'basic-memory', 'claude-code']);

const PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';

/** One item of every other type, plus a draft, beside the fixture's three. */
const EXTRA = {
  'content/episodes/nightly-refresh.md': `---\ntype: episode\ntitle: Nightly refresh\n${PROV}started: "2026-01-01T00:00:00Z"\nactor: process:refresh\noutcome: partial\n---\n\nIt ran.\n`,
  'content/lessons/name-the-receiver.md': `---\ntype: lesson\ntitle: Name the receiver\ntags:\n  - agents\n  - patterns\n${PROV}derived-from:\n  - nightly-refresh\nseverity: warn\n---\n\n## Context\n\nA handoff went nowhere, "quoted", with a comma.\n\n## Lesson\n\nName the receiver before you stop acting.\n`,
  'content/procedures/hand-over.md': `---\ntype: procedure\ntitle: Hand over\n${PROV}when: when control must move to another agent\n---\n\n## Steps\n\nWrite the state, name the receiver, stop.\n`,
  'content/gates/handoff-recorded.md': `---\ntype: gate\ntitle: Handoff recorded\n${PROV}level: L1\n---\n\nEvery handoff leaves a record.\n`,
  'content/concepts/secret-plan.md': `---\ntype: concept\ntitle: Secret plan\ndescription: A draft that must never leave the node through any export at all.\nstatus: draft\ntags:\n  - agents\n  - patterns\n${PROV}related:\n  - handoff\nkind: pattern\n---\n\nNot yet.\n`,
};

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
  const dir = temp('agsc-memory-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(EXTRA)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function emptyBundle(config) {
  const dir = temp('agsc-memory-in-');
  const base = JSON.parse(nodeFs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8'));
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), JSON.stringify({ ...base, ...config }, null, 2));
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
    specVersion: SPEC,
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

function tree(dir) {
  const out = new Map();
  if (!nodeFs.existsSync(dir)) return out;
  const walk = (at, prefix) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(at, entry.name), rel);
      else out.set(rel, nodeFs.readFileSync(path.join(at, entry.name), 'utf8'));
    }
  };
  walk(dir, '');
  return out;
}

const errors = (findings) => findings.filter((f) => f.severity !== 'warn');
const withoutSourceVersion = (text) => text.replace(/^ {2}source_version: .*\n/mu, '');

function exported(dir, name) {
  const out = trapNetwork(() => exportVerb.run(ctxFor(dir, { verbFlags: { to: name } })));
  assert.deepStrictEqual(errors(out.findings), [], name);
  return tree(path.join(dir, `dist/export/${name}`));
}

function imported(into, source, name, verbFlags = {}) {
  const ctx = ctxFor(into, { argv: [source], verbFlags: { from: name, ...verbFlags } });
  const result = trapNetwork(() => importVerb.run(ctx));
  return { ...result, notes: ctx.notes.join('') };
}

/** Every text an export wrote, joined: what a reader of the folder can see. */
const allText = (files) => [...files.values()].join('\n');

for (const name of ADAPTERS) {
  test(`${name}: export writes published items only, with the provenance header and the terms, the same bytes twice`, () => {
    const dir = workspace();
    const files = exported(dir, name);
    assert.ok(files.size > 0, name);
    const text = allText(files);
    // AGSC-06-30: the draft never leaves.
    assert.doesNotMatch(text, /Secret plan|secret-plan/u);
    for (const title of ['Handoff', 'Supervisor', 'Nightly refresh', 'Name the receiver', 'Hand over', 'Handoff recorded']) {
      assert.ok(text.includes(title), `${name}: ${title}`);
    }
    // AGSC-01-29: the header and the terms travel with the prose.
    assert.match(text, /agsc:provenance/u, name);
    assert.match(text, /LicenseRef-AgenticSystemCore-Content-Use-1\.0/u, name);
    // AGSC-07-15: data and text only.
    for (const at of files.keys()) assert.match(at, /\.(json|csv|md)$/u, `${name}: ${at}`);
    assert.doesNotMatch(text, /allowed-tools/u);
    assert.deepStrictEqual(exported(dir, name), files, `${name}: AGSC-01-23 determinism`);
  });

  test(`${name}: our own export comes back byte for byte, and a second import writes nothing`, () => {
    const source = workspace();
    exported(source, name);
    const into = emptyBundle();
    const result = imported(into, path.join(source, `dist/export/${name}`), name);
    assert.deepStrictEqual(errors(result.findings), [], name);
    const back = tree(path.join(into, 'content'));
    const original = tree(path.join(source, 'content'));
    const published = [...original.keys()].filter((at) => at !== 'index.md' && !at.includes('secret-plan'));
    assert.deepStrictEqual([...back.keys()].sort(), published.sort(), name);
    for (const at of published) {
      assert.match(back.get(at), /^ {2}source_version: 0\.0\.0\+20260101T000000Z$/mu, `${name}: ${at}`);
      assert.strictEqual(withoutSourceVersion(back.get(at)), original.get(at), `${name}: ${at}`);
    }
    // No own item is a draft, and none is reported as foreign.
    assert.ok(!result.findings.some((f) => /status: draft/u.test(f.message)), name);
    const again = imported(into, path.join(source, `dist/export/${name}`), name);
    assert.deepStrictEqual(errors(again.findings), [], name);
    assert.match(again.notes, /import: 0 written, 0 replaced, 7 unchanged/u, name);
    assert.deepStrictEqual(tree(path.join(into, 'content')), back, name);
    assert.deepStrictEqual(errors(lintVerb.run(ctxFor(into)).findings)
      .filter((f) => f.file !== '.well-known/security.txt' && f.file !== 'content/index.md'), [], name);
  });

  test(`${name}: an own record naming another origin is not trusted; what carries it arrives as a draft`, () => {
    const source = workspace();
    exported(source, name);
    const into = emptyBundle({ site: { base: 'https://another.example/', title: 'Another', tagline: 'Another node.' } });
    const result = imported(into, path.join(source, `dist/export/${name}`), name);
    assert.deepStrictEqual(errors(result.findings), [], name);
    assert.ok(result.findings.some((f) => f.code === 'AGSC-E506' && /not trusted/u.test(f.message)), name);
    const back = tree(path.join(into, 'content'));
    assert.ok(back.size > 0, name);
    for (const [at, text] of back) {
      assert.match(text, /^status: draft$/mu, `${name}: ${at}`);
      assert.match(text, /^ {2}origin: imported$/mu, `${name}: ${at}`);
    }
  });

  test(`${name}: an own record of another MAJOR is refused unless --allow-newer (AGSC-01-22)`, () => {
    const source = workspace();
    exported(source, name);
    const dir = path.join(source, `dist/export/${name}`);
    rewriteSpecVersion(dir, '2.0.0');
    const into = emptyBundle();
    const refused = imported(into, dir, name);
    assert.strictEqual(refused.status, 'fail', name);
    assert.deepStrictEqual(refused.findings.map((f) => f.code), ['AGSC-E004'], name);
    assert.strictEqual(tree(path.join(into, 'content')).size, 0, name);
    const taken = imported(into, dir, name, { 'allow-newer': true });
    assert.deepStrictEqual(errors(taken.findings), [], name);
  });
}

/** Put `version` into every own record of an export folder, whatever its form (JSON, a CSV cell, base64). */
function rewriteSpecVersion(dir, version) {
  for (const [at, text] of tree(dir)) {
    const file = path.join(dir, at);
    let next = text.replace(/"spec_version": "1\.0\.0"/gu, `"spec_version": "${version}"`)
      .replace(/""spec_version"":""1\.0\.0""/gu, `""spec_version"":""${version}""`);
    const reencoded = (b64) => {
      const record = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return Buffer.from(JSON.stringify({ ...record, spec_version: version }), 'utf8').toString('base64');
    };
    next = next.replace(/<!-- agsc-item ([A-Za-z0-9+/=]+) -->/gu, (line, b64) => `<!-- agsc-item ${reencoded(b64)} -->`)
      .replace(/"agsc": "([A-Za-z0-9+/=]+)"/gu, (member, b64) => `"agsc": "${reencoded(b64)}"`);
    if (next !== text) nodeFs.writeFileSync(file, next);
  }
}

test('an adapter name outside the closed list is still AGSC-E203 on both verbs', () => {
  const dir = workspace();
  const out = exportVerb.run(ctxFor(dir, { verbFlags: { to: 'mem1' } }));
  assert.deepStrictEqual(out.findings.map((f) => f.code), ['AGSC-E203']);
  const into = emptyBundle();
  const back = importVerb.run(ctxFor(into, { argv: [dir], verbFlags: { from: 'mem1' } }));
  assert.deepStrictEqual(back.findings.map((f) => f.code), ['AGSC-E203']);
  for (const name of ADAPTERS) assert.ok(importVerb.FORMATS.includes(name), name);
});

test('a source folder that holds none of the adapter\'s files is AGSC-E901 and writes nothing', () => {
  const empty = temp('agsc-memory-empty-');
  nodeFs.writeFileSync(path.join(empty, 'notes.txt'), 'nothing to read\n');
  for (const name of ADAPTERS) {
    const into = emptyBundle();
    const result = imported(into, empty, name);
    assert.strictEqual(result.status, 'fail', name);
    assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E901'], name);
  }
});

test('a source folder that does not exist, or a file given as the folder, is AGSC-E901, never an internal error', () => {
  for (const name of ADAPTERS) {
    const into = emptyBundle();
    for (const source of [path.join(into, 'no-such-folder'), path.join(into, 'agsc.config.json')]) {
      const result = imported(into, source, name);
      assert.strictEqual(result.status, 'fail', `${name}: ${source}`);
      assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E901'], `${name}: ${source}`);
    }
  }
});

test('--source-version is checked against the content-version grammar (AGSC-04-25)', () => {
  const into = emptyBundle();
  const result = imported(into, temp('agsc-memory-sv-'), 'mem0', { 'source-version': 'bad version' });
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E204']);
});
