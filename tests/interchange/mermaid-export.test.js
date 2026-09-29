'use strict';
// tests/interchange/mermaid-export.test.js — `export --to mermaid` (AGSC-01-26a).
//
// An export-only adapter: one Mermaid flowchart per published item and one per
// published cluster, drawn from the written Links of AGSC-03-01. What is asserted is
// the exact bytes of one file of each kind, the provenance header of AGSC-01-29, the
// withholding of AGSC-06-30 (a draft and every Link to it stay behind), determinism
// (AGSC-04-01), label and id safety, and the verb end to end in a temporary copy.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const adapter = require('../../src/interchange/adapters/mermaid.js');
const { LINK_KEYS } = require('../../src/knowledge/links.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const EPOCH = '1767225600';
const INSTANT = '2026-01-01T00:00:00Z';
const SPEC = '1.0.0-rc.6';
const OUT = 'dist/export/mermaid';
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

/** A temporary copy of the minimal fixture, with optional extra or replaced files. */
function workspace(extra = {}) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-mermaid-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(extra)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

/** The verb context `cli/main.js` builds, with the pieces the export verb reads. */
function ctxFor(dir) {
  const lines = [];
  return {
    argv: [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: lines,
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: SPEC,
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: { to: 'mermaid' },
    version: '0.0.2',
  };
}

const read = (dir, at) => nodeFs.readFileSync(path.join(dir, at), 'utf8');

/** Every file under `dir`, relative, in code-point order. */
function listing(dir) {
  const out = [];
  const walk = (at) => {
    for (const entry of nodeFs.readdirSync(path.join(dir, at), { withFileTypes: true })) {
      const rel = at === '' ? entry.name : `${at}/${entry.name}`;
      if (entry.isDirectory()) walk(rel); else out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

const HEADER = [
  '%% <!-- agsc:provenance',
  '%% bundle: https://minimal.example/',
  '%% license: LicenseRef-AgenticSystemCore-Content-Use-1.0',
  '%% terms: LicenseRef-AgenticSystemCore-Content-Use-1.0',
  `%% spec_version: ${SPEC}`,
  '%% bundle_version: 0.0.0+20260101T000000Z',
  `%% generated_at: ${INSTANT}`,
  '%% assistance: content may be AI-assisted; each item states its origin in prov.origin'
    + ' and each accepted contribution carries an Assisted-by: trailer',
  '%% -->',
];

/** A draft concept that links to a published item, clustered with the others. */
const DRAFT = `---
type: concept
title: Drafted
description: A concept that is still a draft, so it never leaves the node through any export.
status: draft
clusters:
  - agent-patterns
date: "2026-01-01"
prov:
  origin: human
  operator: human:andreibesleaga
uses:
  - handoff
kind: pattern
---

## Intent

Not yet published.
`;

/** The fixture's supervisor, with one extra written Link to the draft. */
function supervisorLinkingDraft() {
  const authored = read(FIXTURE, 'content/concepts/supervisor.md');
  const linked = authored.replace('uses:\n  - handoff\n', 'uses:\n  - handoff\nrelated:\n  - drafted\n');
  assert.notStrictEqual(linked, authored, 'the fixture changed shape: the Link to the draft was not added');
  return linked;
}

test('AGSC-01-26a: export --to mermaid writes one file per published item and per cluster', () => {
  const dir = workspace();
  const ctx = ctxFor(dir);
  const result = exportVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity !== 'warn'), []);
  assert.deepStrictEqual(listing(path.join(dir, OUT)), [
    'clusters/agent-patterns.mmd',
    'items/agent-patterns.mmd',
    'items/handoff.mmd',
    'items/supervisor.mmd',
  ]);
  // Outside `build.out`: the route set AGSC-06-01 closes is untouched.
  assert.ok(!nodeFs.existsSync(path.join(dir, 'www')), 'the adapter wrote into build.out');
  const notes = ctx.notes.join('');
  for (const file of listing(path.join(dir, OUT))) {
    const digest = new RegExp(`wrote: ${OUT}/${file.replace(/[.]/gu, '\\.')} sha256:([0-9a-f]{64})`, 'u').exec(notes);
    assert.ok(digest, `no digest printed for ${file}`);
    assert.strictEqual(sha256(read(dir, `${OUT}/${file}`)), digest[1]);
    // AGSC-07-15: nothing written is executable or a link.
    const stat = nodeFs.lstatSync(path.join(dir, OUT, file));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `${file} is not a plain file`);
    assert.strictEqual(stat.mode & 0o111, 0, `${file} is executable`);
  }
});

test('the exact bytes of an item file and a cluster file', () => {
  const dir = workspace();
  exportVerb.run(ctxFor(dir));
  assert.strictEqual(read(dir, `${OUT}/items/handoff.mmd`), [...HEADER,
    '%% item: handoff',
    'flowchart LR',
    '  n_handoff["Handoff"]',
    '  n_supervisor["Supervisor"]',
    '  n_supervisor -->|uses| n_handoff',
    ''].join('\n'));
  assert.strictEqual(read(dir, `${OUT}/clusters/agent-patterns.mmd`), [...HEADER,
    '%% cluster: agent-patterns',
    'flowchart LR',
    '  subgraph c_agent_patterns ["Agent patterns"]',
    '    n_handoff["Handoff"]',
    '    n_supervisor["Supervisor"]',
    '  end',
    '  n_supervisor -->|uses| n_handoff',
    ''].join('\n'));
  // A cluster with no written Link of its own is still drawn, alone.
  assert.strictEqual(read(dir, `${OUT}/items/agent-patterns.mmd`), [...HEADER,
    '%% item: agent-patterns',
    'flowchart LR',
    '  n_agent_patterns["Agent patterns"]',
    ''].join('\n'));
});

test('AGSC-01-29: every file carries the provenance header and the terms, LF only, one trailing LF', () => {
  const dir = workspace();
  exportVerb.run(ctxFor(dir));
  for (const file of listing(path.join(dir, OUT))) {
    const text = read(dir, `${OUT}/${file}`);
    assert.ok(text.startsWith(`${HEADER.join('\n')}\n`), `${file}: no provenance header`);
    assert.match(text, /^%% terms: LicenseRef-AgenticSystemCore-Content-Use-1\.0$/mu);
    assert.ok(!text.includes('\r'), `${file}: carries a CR`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${file}: not exactly one trailing LF`);
  }
});

test('AGSC-06-30: a draft item and every Link to or from it never appear', () => {
  const dir = workspace({
    'content/concepts/drafted.md': DRAFT,
    'content/concepts/supervisor.md': supervisorLinkingDraft(),
  });
  exportVerb.run(ctxFor(dir));
  const files = listing(path.join(dir, OUT));
  assert.ok(!files.includes('items/drafted.mmd'), 'the draft was exported');
  for (const file of files) {
    const text = read(dir, `${OUT}/${file}`);
    assert.ok(!text.includes('drafted') && !text.includes('Drafted'), `${file} names the draft`);
    assert.ok(!text.includes('-->|related|'), `${file} carries the Link to the draft`);
  }
  // The same item, published, IS drawn — so the withholding above is the filter's doing.
  const published = workspace({
    'content/concepts/drafted.md': DRAFT.replace('status: draft\n', ''),
    'content/concepts/supervisor.md': supervisorLinkingDraft(),
  });
  exportVerb.run(ctxFor(published));
  assert.match(read(published, `${OUT}/items/drafted.mmd`), /^ {2}n_drafted -->\|uses\| n_handoff$/mu);
  assert.match(read(published, `${OUT}/items/supervisor.mmd`), /^ {2}n_supervisor -->\|related\| n_drafted$/mu);
  // The published graph is unchanged by the draft's presence.
  const clean = workspace();
  exportVerb.run(ctxFor(clean));
  for (const file of files) assert.strictEqual(read(dir, `${OUT}/${file}`), read(clean, `${OUT}/${file}`), file);
});

test('AGSC-04-01: two runs are byte-identical', () => {
  const dir = workspace();
  exportVerb.run(ctxFor(dir));
  const first = listing(path.join(dir, OUT)).map((f) => [f, read(dir, `${OUT}/${f}`)]);
  exportVerb.run(ctxFor(dir));
  assert.deepStrictEqual(listing(path.join(dir, OUT)).map((f) => [f, read(dir, `${OUT}/${f}`)]), first);
});

test('the CLI runs `agsc export --to mermaid` end to end in a temporary copy', () => {
  const dir = workspace();
  const env = { ...process.env, SOURCE_DATE_EPOCH: EPOCH };
  const ran = spawnSync(process.execPath, [AGSC, 'export', '--to', 'mermaid'], { cwd: dir, encoding: 'utf8', env });
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.match(ran.stderr, /wrote: dist\/export\/mermaid\/items\/handoff\.mmd sha256:[0-9a-f]{64}/u);
  assert.match(ran.stderr, /adapter: mermaid \(4 files, outside build\.out/u);
  const text = read(dir, `${OUT}/items/supervisor.mmd`);
  assert.match(text, /^%% <!-- agsc:provenance$/mu);
  assert.match(text, /^ {2}n_supervisor -->\|uses\| n_handoff$/mu);
});

test('labels are quoted and escaped; ids are prefixed and clear of reserved words', () => {
  assert.strictEqual(adapter.label('Say "hi" #1 <b> & `x`\nend'),
    '["Say #quot;hi#quot; #35;1 #lt;b#gt; #amp; #96;x#96; end"]');
  assert.strictEqual(adapter.nodeId('end'), 'n_end');
  assert.strictEqual(adapter.nodeId('class-state-graph'), 'n_class_state_graph');
  assert.strictEqual(adapter.subgraphId('end'), 'c_end');
  const out = adapter.run({
    config: { site: { base: 'https://x.example/' } },
    items: [
      { frontmatter: { title: 'A "quoted" <title>', type: 'concept', requires: ['graph#part'] }, slug: 'end', type: 'concept' },
      { frontmatter: { title: 'Graph', type: 'concept' }, slug: 'graph', type: 'concept' },
      { frontmatter: { title: 'Held', type: 'concept', release: 'next' }, slug: 'held', type: 'concept' },
      { frontmatter: { title: 'Gone', type: 'concept', status: 'retired' }, slug: 'gone', type: 'concept' },
    ],
  }, { instant: INSTANT, sha256, specVersion: SPEC });
  // `releases` does not hold `next` back here, so `held` is published; a retired item never is.
  assert.deepStrictEqual(out.files.map((f) => f.path), ['items/end.mmd', 'items/graph.mmd', 'items/held.mmd']);
  const text = out.files[0].text;
  assert.match(text, /^ {2}n_end\["A #quot;quoted#quot; #lt;title#gt;"\]$/mu);
  // The `#anchor` of a Link value is dropped: the diagram draws items.
  assert.match(text, /^ {2}n_end -->\|requires\| n_graph$/mu);
  for (const file of out.files) assert.strictEqual(file.sha256, sha256(file.text));
});

test('AGSC-06-30: a release-gated item is withheld exactly as the other adapters withhold it', () => {
  const out = adapter.run({
    config: { releases: { next: false } },
    items: [
      { frontmatter: { title: 'Kept', type: 'concept', uses: ['held'] }, slug: 'kept', type: 'concept' },
      { frontmatter: { title: 'Held', type: 'concept', release: 'next' }, slug: 'held', type: 'concept' },
    ],
  }, { instant: INSTANT, sha256, specVersion: SPEC });
  assert.deepStrictEqual(out.files.map((f) => f.path), ['items/kept.mmd']);
  assert.ok(!out.files[0].text.includes('held'));
});

test('AGSC-01-26a: export only — the adapter claims no key for a round trip and reads the Link keys', () => {
  assert.deepStrictEqual([...adapter.CLAIMED_KEYS], []);
  assert.strictEqual(adapter.FORMAT, 'mermaid');
  for (const key of LINK_KEYS) assert.ok(adapter.READS.includes(key), `${key} is not read`);
  assert.strictEqual(exportVerb.adapterOf('mermaid').module, adapter);
  assert.strictEqual(typeof adapter.run, 'function');
});
