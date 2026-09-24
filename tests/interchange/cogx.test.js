'use strict';
// tests/interchange/cogx.test.js — the COGX 0.1 memory adapter (AGSC-01-26a;
// RES1-04). `export --to cogx` / `import --from cogx`.
//
// The format was read from its reference implementation on 2026-09-23
// (`cognee/modules/migration/cogx.py`, topoteretes/cognee@main); the quotes are in
// the report §1.1. What is asserted here is what that source fixes: the file
// names, the members a record always carries, `exclude_none`, the BARE raw-node line,
// the version refusal and the secret `permissions.json`. Then the round trip, through
// the real verbs over the real filesystem with a fixed clock.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');
const cogx = require('../../src/interchange/adapters/cogx.js');
const { TERMS } = require('../../src/knowledge/chunks.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const INSTANT = '2026-01-01T00:00:00Z';
const SPEC = '1.0.0-rc.6';
const ITEM_SCHEMA = readSchemas(ROOT).item;
const OWN_BASE = 'https://own.example/';
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';

/** One item of every type, plus a draft, all lint-normalized, beside the fixture's three. */
const EXTRA = {
  'content/episodes/nightly-refresh.md': `---\ntype: episode\ntitle: Nightly refresh\n${PROV}started: "2026-01-01T00:00:00Z"\nactor: process:refresh\noutcome: partial\n---\n\nIt ran.\n`,
  'content/lessons/name-the-receiver.md': `---\ntype: lesson\ntitle: Name the receiver\ntags:\n  - agents\n  - patterns\n${PROV}derived-from:\n  - nightly-refresh\nseverity: warn\n---\n\n## Context\n\nA handoff went nowhere.\n\n## Lesson\n\nName the receiver before you stop acting.\n`,
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

function workspace(extra = EXTRA) {
  const dir = temp('agsc-cogx-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(extra)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function emptyBundle(from) {
  const dir = temp('agsc-cogx-in-');
  nodeFs.copyFileSync(path.join(from || FIXTURE, 'agsc.config.json'), path.join(dir, 'agsc.config.json'));
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

const tree = (dir) => {
  const out = new Map();
  if (!nodeFs.existsSync(dir)) return out;
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

const errors = (findings) => findings.filter((f) => f.severity !== 'warn');
const linesOf = (text) => text.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));

function exported(dir) {
  const out = exportVerb.run(ctxFor(dir, { verbFlags: { to: 'cogx' } }));
  assert.deepStrictEqual(errors(out.findings), []);
  return tree(path.join(dir, 'dist/export/cogx'));
}

// ------------------------------------------------------------------ the format

test('COGX 0.1: the reference file names, verbatim, and nothing else', () => {
  assert.deepStrictEqual({ ...cogx.RECORD_FILES }, {
    document: 'documents.jsonl', entity: 'entities.jsonl', episode: 'episodes.jsonl',
    fact: 'facts.jsonl', memory: 'memories.jsonl', memory_block: 'memory_blocks.jsonl',
  });
  assert.strictEqual(cogx.MANIFEST_FILE, 'manifest.json');
  assert.strictEqual(cogx.RAW_NODES_FILE, 'nodes.jsonl');
  assert.strictEqual(cogx.PERMISSIONS_FILE, 'permissions.json');
  assert.strictEqual(cogx.COGX_VERSION, '0.1');
  const files = exported(workspace());
  // Every kind is present in this workspace, so every file is written — and never
  // the secret one.
  assert.deepStrictEqual([...files.keys()], ['documents.jsonl', 'entities.jsonl', 'episodes.jsonl',
    'facts.jsonl', 'manifest.json', 'memories.jsonl', 'memory_blocks.jsonl', 'nodes.jsonl']);
});

test('a writer opens a file only for a kind it has a record of', () => {
  const files = exported(workspace({}));
  assert.deepStrictEqual([...files.keys()], ['documents.jsonl', 'entities.jsonl', 'facts.jsonl',
    'manifest.json', 'nodes.jsonl']);
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.deepStrictEqual(manifest.counts, { document: 11, entity: 2, fact: 1, raw_node: 1 });
});

test('the manifest: version, source, instant, counts, and the AGSC-06-15 header as notes', () => {
  const manifest = JSON.parse(exported(workspace()).get('manifest.json'));
  assert.deepStrictEqual(Object.keys(manifest), ['cogx_version', 'counts', 'exported_at', 'notes', 'source_system']);
  assert.strictEqual(manifest.cogx_version, '0.1');
  assert.strictEqual(manifest.source_system, 'agentic-system-core');
  assert.strictEqual(manifest.exported_at, INSTANT);
  assert.strictEqual(manifest.notes[0], '<!-- agsc:provenance');
  assert.ok(manifest.notes.includes(`terms: ${TERMS}`));
  assert.ok(manifest.notes.includes('bundle_version: 0.0.0+20260101T000000Z'));
  assert.strictEqual(manifest.notes[manifest.notes.length - 1], '-->');
});

test('exclude_none: no member is ever null; default-factory members are always written', () => {
  const files = exported(workspace());
  for (const [name, text] of files) {
    if (name === 'manifest.json') continue;
    assert.ok(!/:null[,}]/u.test(text), `${name} carries a null member`);
  }
  const entity = linesOf(files.get('entities.jsonl'))[0];
  for (const member of ['aliases', 'attributes', 'external_id', 'external_system', 'kind', 'metadata', 'scope']) {
    assert.ok(member in entity, `entity lacks ${member}`);
  }
  assert.deepStrictEqual(entity.scope, {});
  assert.ok('turns' in linesOf(files.get('episodes.jsonl'))[0]);
  assert.ok('categories' in linesOf(files.get('memories.jsonl'))[0]);
  assert.ok('provenance' in linesOf(files.get('facts.jsonl'))[0]);
  // Every line is JCS: re-canonicalising it changes nothing.
  const { canonicalize } = require('../../src/knowledge/jcs.js');
  for (const line of files.get('entities.jsonl').split('\n').filter(Boolean)) {
    assert.strictEqual(canonicalize(JSON.parse(line)), line);
  }
});

test('a raw node is the BARE property dictionary: no kind, no metadata, no scope', () => {
  const nodes = linesOf(exported(workspace()).get('nodes.jsonl'));
  assert.deepStrictEqual(nodes.map((n) => n.type), ['cluster', 'gate']);
  for (const node of nodes) {
    assert.ok(!('kind' in node) && !('metadata' in node) && !('scope' in node), JSON.stringify(Object.keys(node)));
    assert.match(node.id, /^https:\/\/minimal\.example\/(clusters|gates)\//u);
    assert.strictEqual(typeof node.agsc.frontmatter, 'object');
  }
});

test('the mapping of §2.1: one primary record per published item, each of its kind', () => {
  const files = exported(workspace());
  const entities = linesOf(files.get('entities.jsonl'));
  assert.deepStrictEqual(entities.map((e) => [e.name, e.entity_type]), [['Handoff', 'pattern'], ['Supervisor', 'pattern']]);
  assert.strictEqual(entities[0].created_at, INSTANT);
  const [episode] = linesOf(files.get('episodes.jsonl'));
  assert.deepStrictEqual(episode.turns, [{ content: '\nIt ran.\n', occurred_at: INSTANT, role: 'process:refresh' }]);
  assert.strictEqual(episode.title, 'Nightly refresh');
  const [memory] = linesOf(files.get('memories.jsonl'));
  assert.strictEqual(memory.content, 'Name the receiver before you stop acting.');
  assert.deepStrictEqual(memory.categories, ['agents', 'patterns']);
  const [block] = linesOf(files.get('memory_blocks.jsonl'));
  assert.deepStrictEqual([block.label, block.value, block.limit], ['hand-over', 'when control must move to another agent', 1024]);
  // Every record carries the terms, the licence and the trust mark (AGSC-01-29, AGSC-08-18).
  for (const record of [...entities, episode, memory, block]) {
    assert.strictEqual(record.metadata.agsc.terms, TERMS);
    assert.strictEqual(record.metadata.agsc.trust, 'untrusted');
    assert.strictEqual(record.metadata.agsc.spec_version, SPEC);
  }
});

test('documents are the chunk records, facts the authored Links to published items', () => {
  const files = exported(workspace());
  const documents = linesOf(files.get('documents.jsonl'));
  assert.ok(documents.every((d) => d.mime_type === 'text/markdown' && /^[0-9a-f]{64}$/u.test(d.metadata.agsc.digest)));
  const facts = linesOf(files.get('facts.jsonl'));
  assert.deepStrictEqual(facts.map((f) => [f.metadata.agsc.subject, f.metadata.agsc.key, f.metadata.agsc.object]), [
    ['name-the-receiver', 'derived-from', 'nightly-refresh'],
    ['supervisor', 'uses', 'handoff'],
  ]);
  assert.strictEqual(facts[1].predicate, 'https://w3id.org/agentic-system-core/ns#uses');
  assert.strictEqual(facts[0].predicate, 'http://www.w3.org/ns/prov#wasDerivedFrom');
});

test('AGSC-06-30: a draft never leaves, and no Link to it becomes a fact', () => {
  for (const [name, text] of exported(workspace())) {
    assert.ok(!text.includes('secret-plan') && !text.includes('Secret plan'), `${name} carries the draft`);
  }
});

test('AGSC-04-01: two exports of one Bundle are byte-identical', () => {
  const dir = workspace();
  const first = exported(dir);
  assert.deepStrictEqual(exported(dir), first);
});

test('a cluster broader is nesting, not a fact, and a Link to an absent item is no fact', () => {
  const produced = cogx.run({
    config: { site: { base: 'https://x.example' } },
    items: [
      { body: '', frontmatter: { broader: ['top'], title: 'Sub', type: 'cluster' }, path: 'content/clusters/sub.md', slug: 'sub', type: 'cluster' },
      { body: '', frontmatter: { title: 'Top', type: 'cluster' }, path: 'content/clusters/top.md', slug: 'top', type: 'cluster' },
      { body: '', frontmatter: { related: ['gone'], title: 'Lone', type: 'concept' }, path: 'content/concepts/lone.md', slug: 'lone', type: 'concept' },
      { body: 'no frontmatter item is ignored' },
    ],
  }, { instant: INSTANT, sha256, specVersion: SPEC });
  assert.deepStrictEqual(produced.files.map((f) => f.path), ['entities.jsonl', 'manifest.json', 'nodes.jsonl']);
  const manifest = JSON.parse(produced.files[1].text);
  assert.deepStrictEqual(manifest.notes.find((n) => n.startsWith('license: ')), `license: ${TERMS}`);
});

test('the small total helpers', () => {
  assert.strictEqual(cogx.timestampOf('2026-01-02'), '2026-01-02T00:00:00Z');
  assert.strictEqual(cogx.timestampOf('2026-01-02T03:04:05+02:00'), '2026-01-02T03:04:05+02:00');
  assert.strictEqual(cogx.timestampOf('yesterday'), null);
  assert.strictEqual(cogx.timestampOf(undefined), null);
  assert.strictEqual(cogx.lessonText('no lesson heading\n'), 'no lesson heading');
  assert.strictEqual(cogx.lessonText(undefined), '');
  assert.deepStrictEqual(cogx.withoutNone({ a: null, b: [1, null], c: { d: undefined } }), { b: [1, null], c: {} });
  assert.strictEqual(cogx.cogxMajor('0.1'), 0);
  assert.strictEqual(cogx.cogxMajor('12'), 12);
  assert.strictEqual(cogx.cogxMajor('v1'), null);
  assert.strictEqual(cogx.cogxMajor(undefined), null);
  assert.strictEqual(cogx.linkKeyOf('uses'), 'uses');
  assert.strictEqual(cogx.linkKeyOf('http://www.w3.org/2004/02/skos/core#related'), 'related');
  assert.strictEqual(cogx.linkKeyOf('knows'), null);
  assert.strictEqual(cogx.linkKeyOf(undefined), null);
});

test('an item with no title, no actor and no when still maps (totality)', () => {
  const produced = cogx.run({
    config: {},
    items: [
      { body: undefined, frontmatter: { type: 'episode', prov: { agent: 'agent:x' } }, path: 'content/episodes/e.md', slug: 'eee', type: 'episode' },
      { body: undefined, frontmatter: { type: 'procedure' }, path: 'content/procedures/p.md', slug: 'ppp', type: 'procedure' },
      { body: undefined, frontmatter: { type: 'lesson' }, path: 'content/lessons/l.md', slug: 'lll', type: 'lesson' },
      { body: '', frontmatter: { type: 'concept', aliases: ['A1'] }, path: 'content/concepts/c.md', slug: 'ccc', type: 'concept' },
    ],
  }, { instant: 'not-an-instant', sha256, specVersion: SPEC });
  const by = Object.fromEntries(produced.files.map((f) => [f.path, f.text]));
  const [episode] = linesOf(by['episodes.jsonl']);
  assert.deepStrictEqual(episode.turns, [{ content: '', role: 'unknown' }]);
  assert.deepStrictEqual(episode.scope, { agent_id: 'agent:x' });
  assert.strictEqual(linesOf(by['memory_blocks.jsonl'])[0].value, 'ppp');
  assert.deepStrictEqual(linesOf(by['memories.jsonl'])[0].categories, []);
  assert.deepStrictEqual(linesOf(by['entities.jsonl'])[0].aliases, ['A1']);
  assert.strictEqual(JSON.parse(by['manifest.json']).exported_at, 'not-an-instant');
});

// ------------------------------------------------------------------ the round trip

test('AGSC-01-26a: export --to cogx then import --from cogx reproduces every published item byte for byte', () => {
  const source = workspace();
  exported(source);
  const target = emptyBundle(source);
  const archive = path.join(source, 'dist/export/cogx');
  const imported = importVerb.run(ctxFor(target, { argv: [archive], verbFlags: { from: 'cogx' } }));
  assert.deepStrictEqual(errors(imported.findings), []);

  const before = tree(path.join(source, 'content'));
  const after = tree(path.join(target, 'content'));
  // AGSC-01-22's RECORD is the one permitted difference, and it is an ADDITION:
  // `prov.source_version` names the exact state the item was taken from.
  const recorded = /^ {2}source_(version|hash): .+\n/gmu;
  const expected = [...before.keys()].filter((k) => k !== 'index.md' && k !== 'concepts/secret-plan.md').sort();
  assert.deepStrictEqual([...after.keys()].sort(), expected);
  for (const at of expected) {
    const written = after.get(at);
    assert.match(written, / {2}source_version: 0\.0\.0\+20260101T000000Z\n/u, `${at}: no prov.source_version`);
    assert.strictEqual(written.replace(recorded, ''), before.get(at), `${at} did not survive the round trip`);
  }

  // AGSC-01-23: the same archive again writes nothing.
  const again = ctxFor(target, { argv: [archive], verbFlags: { from: 'cogx' } });
  importVerb.run(again);
  assert.match(again.notes.join(''), /0 written, 0 replaced, 7 unchanged/u);
  assert.deepStrictEqual(tree(path.join(target, 'content')), after);

  // And the imported Bundle is one this engine's own lint accepts.
  const linted = lintVerb.run(ctxFor(target));
  // `.well-known/security.txt` is a Bundle-root file no import writes; the ITEMS are what is asserted.
  assert.deepStrictEqual(errors(linted.findings).filter((f) => String(f.file).startsWith('content/')), []);
});

test('an archive of an imported Bundle round-trips too: the record is replaced, never stacked', () => {
  const source = workspace();
  exported(source);
  const middle = emptyBundle(source);
  importVerb.run(ctxFor(middle, { argv: [path.join(source, 'dist/export/cogx')], verbFlags: { from: 'cogx' } }));
  exported(middle);
  const last = emptyBundle(source);
  importVerb.run(ctxFor(last, { argv: [path.join(middle, 'dist/export/cogx')], verbFlags: { from: 'cogx' } }));
  assert.deepStrictEqual(tree(path.join(last, 'content')), tree(path.join(middle, 'content')));
});

test('--dry-run writes nothing; a collision writes nothing without --replace (AGSC-01-23)', () => {
  const source = workspace();
  exported(source);
  const archive = path.join(source, 'dist/export/cogx');
  const dry = emptyBundle(source);
  const ctx = ctxFor(dry, { argv: [archive], verbFlags: { from: 'cogx', 'dry-run': true } });
  importVerb.run(ctx);
  assert.ok(!nodeFs.existsSync(path.join(dry, 'content')));
  assert.match(ctx.notes.join(''), /--dry-run: 7 file\(s\) would be written/u);

  // The source Bundle already holds every item, with different bytes (no record).
  const refused = importVerb.run(ctxFor(source, { argv: [archive], verbFlags: { from: 'cogx' } }));
  assert.strictEqual(refused.status, 'fail');
  assert.strictEqual(refused.findings.filter((f) => f.code === 'AGSC-E206').length, 7);
  assert.ok(!nodeFs.readFileSync(path.join(source, 'content/concepts/handoff.md'), 'utf8').includes('source_version'));

  const replaced = importVerb.run(ctxFor(source, { argv: [archive], verbFlags: { from: 'cogx', replace: true } }));
  assert.strictEqual(replaced.findings.filter((f) => f.code === 'AGSC-E506' && /replaced/u.test(f.message)).length, 7);
  assert.ok(nodeFs.readFileSync(path.join(source, 'content/concepts/handoff.md'), 'utf8').includes('source_version'));
});

// ------------------------------------------------------------------ refusals

test('an archive carrying permissions.json is refused before anything is read (AGSC-E403)', () => {
  const source = workspace();
  exported(source);
  const archive = path.join(source, 'dist/export/cogx');
  nodeFs.writeFileSync(path.join(archive, 'permissions.json'), '{"password_hash":"x"}');
  const target = emptyBundle(source);
  const result = importVerb.run(ctxFor(target, { argv: [archive], verbFlags: { from: 'cogx' } }));
  assert.strictEqual(result.status, 'fail');
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E403']);
  assert.match(result.findings[0].message, /password HASHES/u);
  assert.ok(!nodeFs.existsSync(path.join(target, 'content')));
});

test('a port that cannot stat permissions.json is not proof it is absent', () => {
  const target = emptyBundle();
  const ctx = ctxFor(target, { argv: ['anywhere'], verbFlags: { from: 'cogx' } });
  ctx.openRoot = () => ({
    exists: (at) => {
      if (at === 'permissions.json') throw new Error('EACCES');
      return at === 'manifest.json' || at === 'broken.jsonl' || at === 'entities.jsonl';
    },
    readFile: (at) => {
      if (at === 'entities.jsonl') throw new Error('not decodable');
      return '{"cogx_version":"0.1"}';
    },
  });
  const result = importVerb.run(ctx);
  assert.deepStrictEqual(result.findings.map((f) => f.code), ['AGSC-E901', 'AGSC-E403']);
  assert.strictEqual(result.findings[0].severity, 'warn');
});

test('an empty directory is AGSC-E901', () => {
  const target = emptyBundle();
  const result = importVerb.run(ctxFor(target, { argv: [temp('agsc-cogx-empty-')], verbFlags: { from: 'cogx' } }));
  assert.strictEqual(result.status, 'fail');
  assert.strictEqual(result.findings[0].code, 'AGSC-E901');
});

test('the COGX version and the spec_version limits (AGSC-01-22)', () => {
  const opts = { itemSchema: ITEM_SCHEMA, operator: 'human:x', origin: OWN_BASE, toolSpecVersion: SPEC };
  const newer = cogx.plan({ 'manifest.json': '{"cogx_version":"1.0"}' }, opts);
  assert.strictEqual(newer.refused, true);
  assert.strictEqual(newer.findings[0].code, 'AGSC-E004');
  assert.strictEqual(cogx.plan({ 'manifest.json': '{"cogx_version":"1.0"}' }, { ...opts, allowNewer: true }).refused, false);
  assert.strictEqual(cogx.plan({ 'manifest.json': '{"cogx_version":"latest"}' }, opts).findings[0].code, 'AGSC-E004');
  assert.strictEqual(cogx.plan({ 'manifest.json': 'not json' }, opts).findings[0].code, 'AGSC-E201');
  assert.strictEqual(cogx.plan({ 'manifest.json': '[]' }, opts).findings[0].code, 'AGSC-E201');
  assert.strictEqual(cogx.plan({ 'manifest.json': '{}' }, opts).refused, false);
  // Our own records declare the specification version they were written under.
  const own = JSON.stringify({ external_id: 'x', kind: 'entity', metadata: { agsc: { body: '', bundle: OWN_BASE, bundle_version: '1.0.0', frontmatter: { title: 'Abc', type: 'concept' }, slug: 'abc', spec_version: '2.0.0', type: 'concept' } }, name: 'Abc' });
  const tooNew = cogx.plan({ 'entities.jsonl': `${own}\n` }, opts);
  assert.strictEqual(tooNew.refused, true);
  assert.strictEqual(tooNew.findings[0].code, 'AGSC-E004');
  assert.strictEqual(tooNew.findings[0].file, 'manifest.json');
  assert.strictEqual(cogx.plan({ 'entities.jsonl': `${own}\n` }, { ...opts, allowNewer: true }).writes.length, 1);
});

test('the verb refuses a newer archive with exit-2 class AGSC-E004 and writes nothing', () => {
  const archive = temp('agsc-cogx-new-');
  nodeFs.writeFileSync(path.join(archive, 'manifest.json'), '{"cogx_version":"9.0"}');
  const target = emptyBundle();
  const result = importVerb.run(ctxFor(target, { argv: [archive], verbFlags: { from: 'cogx' } }));
  assert.strictEqual(result.status, 'fail');
  assert.strictEqual(result.findings[0].code, 'AGSC-E004');
});

// ------------------------------------------------------------------ foreign archives

const FOREIGN = {
  'manifest.json': JSON.stringify({ cogx_version: '0.1', source_system: 'mem0' }),
  'entities.jsonl': [
    { external_id: 'e1', external_system: 'mem0', kind: 'entity', name: 'Alice Example', entity_type: 'person', description: 'A person who appears in the conversations the memory store was built from.', aliases: ['Al', 'Al', '  '], attributes: { team: 'ops' }, created_at: '2026-02-03T04:05:06Z', scope: { user_id: 'u1' } },
    { external_id: 'e2', kind: 'entity', name: 'Runbook', entity_type: 'spec', description: 'short' },
    { external_id: 'e3', kind: 'entity', name: 'Q' },
    { __proto__: null, external_id: 'e4', kind: 'entity', name: 'Polluter', ['__proto__']: { polluted: true } },
  ].map((r) => JSON.stringify(r)).join('\n'),
  'memories.jsonl': `${JSON.stringify({ external_id: 'm1', kind: 'memory', content: 'Alice prefers written handoffs.\nAlways.', categories: ['preference'] })}\n${JSON.stringify({ external_id: 'm2', kind: 'memory', content: '' })}\n`,
  'memory_blocks.jsonl': `${JSON.stringify({ external_id: 'b1', kind: 'memory_block', label: 'persona', value: 'You are careful.', limit: 2000 })}\n${JSON.stringify({ external_id: 'b2', kind: 'memory_block', label: 'notes', value: 'line one\nline two' })}\n${JSON.stringify({ external_id: 'b3', kind: 'memory_block', label: 'empty', value: '' })}\n`,
  'facts.jsonl': [
    { external_id: 'f1', kind: 'fact', subject_ref: 'e1', predicate: 'uses', object_ref: 'Runbook' },
    { external_id: 'f1b', kind: 'fact', subject_ref: 'e1', predicate: 'https://w3id.org/agentic-system-core/ns#uses', object_ref: 'e2' },
    { external_id: 'f2', kind: 'fact', subject_ref: 'e1', predicate: 'likes', object_ref: 'e2' },
    { external_id: 'f3', kind: 'fact', subject_ref: 'e1', predicate: 'related', object_ref: 'nobody' },
    { external_id: 'f4', kind: 'fact', subject_ref: 'e1', predicate: 'related', object_ref: 'e1' },
  ].map((r) => JSON.stringify(r)).join('\n'),
  'episodes.jsonl': `${JSON.stringify({ external_id: 'ep1', kind: 'episode', turns: [{ role: 'user', content: 'hi' }] })}\n`,
  'documents.jsonl': `${JSON.stringify({ external_id: 'd1', kind: 'document', content: 'raw' })}\nnot json\n[1]\n${JSON.stringify({ external_id: 'x', kind: 'entity', name: 'wrong file' })}\n`,
  'nodes.jsonl': `${JSON.stringify({ id: 'n1', type: 'Widget' })}\n`,
};

test('a foreign archive is imported by kind, and every loss is named', () => {
  const planned = cogx.plan(FOREIGN, { itemSchema: ITEM_SCHEMA, operator: 'human:x', toolSpecVersion: SPEC });
  assert.strictEqual(planned.refused, false);
  const by = Object.fromEntries(planned.writes.map((w) => [w.path, w.text]));
  assert.deepStrictEqual(Object.keys(by), [
    'content/concepts/alice-example.md', 'content/concepts/polluter.md', 'content/concepts/q.md',
    'content/concepts/runbook.md', 'content/lessons/alice-prefers-written-handoffs.md',
    'content/lessons/e-m2.md' in by ? 'content/lessons/e-m2.md' : 'content/lessons/m2.md',
    'content/procedures/empty.md', 'content/procedures/notes.md', 'content/procedures/persona.md',
  ].sort());
  const alice = by['content/concepts/alice-example.md'];
  assert.match(alice, /^---\ntype: concept\ntitle: Alice Example\n/u, alice);
  assert.match(alice, /kind: term\n/u);
  assert.match(alice, /x-cogx-entity-type: person\n/u);
  assert.match(alice, /aliases:\n {2}- Al\n/u);
  assert.match(alice, /date: "2026-02-03"\n/u);
  assert.match(alice, /origin: imported\n {2}operator: human:x\n/u);
  assert.match(alice, /uses:\n {2}- runbook\n/u, 'the fact became a Link');
  assert.match(alice, /x-cogx-rest: .*"team":"ops"/u, 'the unclaimed members were dropped');
  assert.match(alice, /x-cogx-external-id: e1\n/u);
  assert.match(alice, /x-cogx-external-system: mem0\n/u);
  assert.match(alice, /description: A person who appears/u);
  const runbook = by['content/concepts/runbook.md'];
  assert.match(runbook, /kind: spec\n/u);
  assert.doesNotMatch(runbook, /^description:/mu, 'a description outside 40-200 is body only');
  assert.match(runbook, /\nshort\n$/u);
  assert.match(by['content/concepts/q.md'], /title: q\b|title: note-q/u);
  assert.strictEqual(({}).polluted, undefined, 'a foreign __proto__ member reached a prototype');
  const lesson = by['content/lessons/alice-prefers-written-handoffs.md'];
  assert.match(lesson, /severity: info\n/u);
  assert.match(lesson, /x-cogx-categories:\n {2}- preference\n/u);
  assert.match(lesson, /## Lesson\n\nAlice prefers written handoffs\.\nAlways\.\n$/u);
  assert.match(by['content/procedures/persona.md'], /when: You are careful\.\n/u);
  assert.match(by['content/procedures/persona.md'], /x-cogx-rest: '\{"limit":2000\}'|x-cogx-rest: "\{\\"limit\\":2000\}"|x-cogx-rest: \{"limit":2000\}/u);
  assert.doesNotMatch(by['content/procedures/notes.md'], /\nwhen:/u, 'a multi-line value is no when');

  assert.deepStrictEqual(planned.totals, {
    derived_skipped: 0, draft_untrusted: 0, facts_linked: 2, facts_skipped: 3, foreign_skipped: 3, items: 9,
    lines_rejected: 3, records_untrusted: 0,
  });
  const messages = planned.findings.map((f) => f.message).join('\n');
  assert.match(messages, /foreign episode was not imported: AGSC-02-14 requires an outcome/u);
  assert.match(messages, /foreign document was not imported/u);
  assert.match(messages, /foreign raw node was not imported/u);
  assert.match(messages, /predicate "likes" is none of AGSC-03-01's fourteen/u);
  assert.match(messages, /do not both name a distinct item/u);
  assert.match(messages, /documents\.jsonl:2: the line is not a JSON object/u);
  assert.match(messages, /documents\.jsonl:3: the line is not a JSON object/u);
  assert.match(messages, /a "entity" record in the document file/u);
  assert.match(messages, /9 foreign record\(s\) were imported/u);
});

test('the foreign import through the verb passes this node\'s lint with no error', () => {
  const archive = temp('agsc-cogx-foreign-');
  for (const [name, text] of Object.entries(FOREIGN)) nodeFs.writeFileSync(path.join(archive, name), text);
  const target = emptyBundle();
  nodeFs.mkdirSync(path.join(target, 'content'), { recursive: true });
  nodeFs.copyFileSync(path.join(FIXTURE, 'content/index.md'), path.join(target, 'content/index.md'));
  const result = importVerb.run(ctxFor(target, { argv: [archive], verbFlags: { from: 'cogx' } }));
  assert.deepStrictEqual(errors(result.findings), []);
  const linted = lintVerb.run(ctxFor(target));
  assert.deepStrictEqual(errors(linted.findings).filter((f) => String(f.file).startsWith('content/'))
    .map((f) => `${f.code} ${f.file} ${f.message}`), []);
});

test('an over-long line, an invalid own record, and a record with no name are handled', () => {
  const opts = { itemSchema: ITEM_SCHEMA, operator: 'human:x', origin: OWN_BASE, toolSpecVersion: SPEC };
  const ours = { bundle: OWN_BASE, bundle_version: '1.0.0' };
  const big = JSON.stringify({ external_id: 'big', kind: 'memory', content: 'x'.repeat(cogx.MAX_LINE_BYTES) });
  const badOwn = JSON.stringify({ external_id: 'o', kind: 'entity', metadata: { agsc: { ...ours, body: '', frontmatter: {}, slug: 'Not A Slug', type: 'concept' } }, name: 'o' });
  const otherType = JSON.stringify({ external_id: 'o2', kind: 'entity', metadata: { agsc: { ...ours, body: '', frontmatter: {}, slug: 'fine', type: 'widget' } }, name: 'o2' });
  const derived = JSON.stringify({ external_id: 'd', kind: 'entity', metadata: { agsc: { ...ours, iri: `${OWN_BASE}x` } }, name: 'd' });
  const nameless = JSON.stringify({ external_id: 'Some Id', kind: 'entity' });
  const idless = JSON.stringify({ kind: 'memory_block', label: 42, value: 7 });
  const planned = cogx.plan({ 'entities.jsonl': [badOwn, otherType, derived, nameless].join('\n'), 'memories.jsonl': big, 'memory_blocks.jsonl': idless }, opts);
  assert.strictEqual(planned.totals.lines_rejected, 3);
  assert.strictEqual(planned.totals.derived_skipped, 1);
  assert.ok(planned.findings.some((f) => f.code === 'AGSC-E904'));
  assert.ok(planned.findings.some((f) => /"Not A Slug"/u.test(f.message)));
  assert.deepStrictEqual(planned.writes.map((w) => w.path), ['content/concepts/some-id.md', 'content/procedures/note.md']);
  assert.doesNotMatch(planned.writes[1].text, /x-cogx-external-id/u, 'an absent id was invented');
  assert.match(planned.writes[1].text, /x-cogx-rest: .*"label":42.*"value":7/u, 'a non-string member was lost');
});

test('an own archive with a bundle hash records it; a malformed version or hash is not trusted', () => {
  const opts = { itemSchema: ITEM_SCHEMA, origin: OWN_BASE, toolSpecVersion: SPEC };
  const record = (agsc) => JSON.stringify({ external_id: 'x', kind: 'memory', content: 'c', metadata: { agsc: { body: '\nB.\n', bundle: OWN_BASE, frontmatter: { prov: { origin: 'human', operator: 'human:a', source_version: 'old' }, severity: 'info', title: 'Lesson one', type: 'lesson' }, slug: 'lesson-one', type: 'lesson', ...agsc } } });
  const hashed = cogx.plan({ 'memories.jsonl': record({ bundle_hash: 'a'.repeat(64), bundle_version: '1.2.3' }) }, opts);
  assert.match(hashed.writes[0].text, /source_version: 1\.2\.3\n {2}source_hash: a{64}\n/u);
  const bad = cogx.plan({ 'memories.jsonl': [record({ bundle_version: '???' }), record({}), record({ bundle_hash: 'zz', bundle_version: '1' })].join('\n') }, opts);
  assert.strictEqual(bad.totals.records_untrusted, 3);
  assert.strictEqual(bad.totals.draft_untrusted, 3);
  for (const write of bad.writes) {
    // The claimed record is kept verbatim in x-cogx-rest (AGSC-02-05a); it is never the item's prov.
    assert.match(write.text, /^prov:\n {2}origin: imported\n {2}operator: human:unknown\n/mu);
    assert.doesNotMatch(write.text, /^ {2}source_version:/mu, 'a claimed provenance was carried over');
    assert.match(write.text, /^status: draft$/mu);
  }
});

test('export --to cogx is discovered by directory convention (AGSC-01-26a)', () => {
  const found = exportVerb.adapterOf('cogx');
  assert.strictEqual(found.module, cogx);
  assert.strictEqual(typeof cogx.CLAIMED_KEYS.export, 'string');
  assert.ok(cogx.CLAIMED_KEYS.import.includes('name'));
});

test('the adapter\'s own flags are scoped to it on the command line (AGSC-01-26a, AGSC-09-09)', () => {
  // eslint-disable-next-line global-require
  const main = require('../../src/application/cli/main.js');
  assert.deepStrictEqual([...main.adapterFlagsFor('import', ['--from', 'cogx']).keys()], ['--replace', '--allow-newer']);
  assert.deepStrictEqual([...main.adapterFlagsFor('export', ['--to', 'cogx']).keys()], []);
});
