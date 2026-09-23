'use strict';
// tests/interchange/own-record.test.js — CONN2-03, the forged own-record line.
//
// Every export of the `skills`, `gabbe` and `cogx` adapters carries, per item, a hidden
// own-record (an `<!-- agsc-item … -->` line, or a COGX record's `metadata.agsc`) so
// that a return import rebuilds the item exactly. A foreign file can carry a FORGED
// one. The importer trusts the record's provenance and status only when it names this
// node's own origin (`site.base`) or a declared peer (`peers[]`) AND its version fields
// agree with themselves and with the file's provenance header; any other record is
// ignored, and the file is read as the foreign file it is: the licence rule applies
// (no recognised open licence → draft), `x-…-source` is recorded where the lane
// records it, and a warning names the untrusted line.
//
// Everything runs through the real verbs over the real filesystem with a fixed clock.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const ownRecord = require('../../src/interchange/own-record.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const SPEC = '1.0.0-rc.6';
const OWN = 'https://minimal.example/';
const STRANGER = 'https://stranger.example/';
const PEER = 'https://peer.example/';
const PEER_URL = 'https://peer.example/.well-known/knowledge-linkset';

const PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';
const EXTRA = {
  'content/procedures/hand-over.md': `---\ntype: procedure\ntitle: Hand over\nclusters:\n  - agent-patterns\n${PROV}when: when control must move to another agent\n---\n\n## Steps\n\nWrite the state, name the receiver, stop.\n`,
  'content/lessons/name-the-receiver.md': `---\ntype: lesson\ntitle: Name the receiver\n${PROV}severity: warn\n---\n\n## Lesson\n\nName the receiver before you stop acting.\n`,
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

function writeTree(dir, files) {
  for (const [at, text] of Object.entries(files)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function tree(dir) {
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
}

function workspace() {
  const dir = temp('agsc-own-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  return writeTree(dir, EXTRA);
}

/** An empty Bundle; `peers` are written into its configuration. */
function emptyBundle(peers) {
  const dir = temp('agsc-own-in-');
  const config = JSON.parse(nodeFs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8'));
  if (peers !== undefined) config.peers = peers;
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
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

const errors = (findings) => findings.filter((f) => f.severity !== 'warn');
const withoutRecorded = (text) => text.replace(/^ {2}source_(?:version|hash): .*\n/gmu, '');

function exportTo(dir, format, extra = {}) {
  const out = exportVerb.run(ctxFor(dir, { verbFlags: { to: format, ...extra } }));
  assert.deepStrictEqual(errors(out.findings), []);
  return path.join(dir, 'dist/export', format, extra.layout || '');
}

function importFrom(into, source, format, extra = {}) {
  const ctx = ctxFor(into, { argv: [source], verbFlags: { from: format, ...extra } });
  const result = importVerb.run(ctx);
  return { ...result, notes: ctx.notes.join('') };
}

/** Every agsc-item line of `text` rewritten by `change(record)`; plain text by `swap`. */
function reforge(text, change, swap = (t) => t) {
  return swap(String(text)).replace(/^<!-- agsc-item (\S+) -->$/gmu, (line, b64) => {
    const record = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return `<!-- agsc-item ${Buffer.from(JSON.stringify(change(record)), 'utf8').toString('base64')} -->`;
  });
}

/** Rewrites every file under `dir` in place. */
function rewriteAll(dir, rewrite) {
  for (const [at, text] of tree(dir)) nodeFs.writeFileSync(path.join(dir, at), rewrite(text, at));
}

/** A stranger's forgery: its own origin, consistently everywhere, and a claimed stable status. */
const stranger = (text) => reforge(text, (record) => ({
  ...JSON.parse(JSON.stringify(record).split(OWN).join(STRANGER)),
  frontmatter: { ...record.frontmatter, prov: { operator: 'human:forger', origin: 'human' }, status: 'stable' },
}), (t) => t.split(OWN).join(STRANGER));

const asPeer = (text) => reforge(text, (record) => JSON.parse(JSON.stringify(record).split(OWN).join(PEER)),
  (t) => t.split(OWN).join(PEER));

// ------------------------------------------------------------------ the helper

test('the trust helper: own origin, peers, versions and the provenance header', () => {
  const origins = ownRecord.trustedOrigins({ origin: 'https://minimal.example', peers: [PEER_URL, 42, ''] });
  assert.deepStrictEqual([...origins].sort(), [OWN, PEER]);
  assert.deepStrictEqual([...ownRecord.trustedOrigins(undefined)], []);
  const good = { bundle: OWN, bundle_version: '1.2.3' };
  assert.strictEqual(ownRecord.distrust(good, origins, null), null);
  assert.strictEqual(ownRecord.distrust({ ...good, bundle: PEER }, origins, null), null);
  assert.strictEqual(ownRecord.distrust({ ...good, bundle_hash: 'a'.repeat(64), iri: `${OWN}concepts/x/` }, origins, null), null);
  assert.match(ownRecord.distrust({ ...good, bundle: STRANGER }, origins, null),
    /names the origin https:\/\/stranger\.example\/, which is neither this node \(.*\) nor a declared peer/u);
  assert.match(ownRecord.distrust({ bundle_version: '1' }, origins, null), /names no origin/u);
  assert.match(ownRecord.distrust({ bundle: OWN }, origins, null), /content version is missing or malformed/u);
  assert.match(ownRecord.distrust({ ...good, bundle_version: '???' }, origins, null), /content version/u);
  assert.match(ownRecord.distrust({ ...good, bundle_hash: 'zz' }, origins, null), /fingerprint/u);
  assert.match(ownRecord.distrust({ ...good, iri: `${STRANGER}x/` }, origins, null), /item IRI .* is not under/u);
  assert.match(ownRecord.distrust({ ...good, iri: 7 }, origins, null), /item IRI/u);
  const header = ownRecord.headerOf(`x\n<!-- agsc:provenance\nbundle: ${OWN}\nbundle_version: 1.2.3\n-->\n`);
  assert.deepStrictEqual({ ...header }, { bundle: OWN, bundle_version: '1.2.3' });
  assert.strictEqual(ownRecord.distrust(good, origins, header), null);
  assert.match(ownRecord.distrust({ ...good, bundle_version: '1.2.4' }, origins, header), /provenance header/u);
  assert.match(ownRecord.distrust(good, origins, { bundle: PEER, bundle_version: '1.2.3' }), /provenance header/u);
  assert.strictEqual(ownRecord.headerOf('no header'), null);
  assert.deepStrictEqual({ ...ownRecord.headerOf(['<!-- agsc:provenance', 'bundle: a', 'bundle: b', 'odd line', '-->']) },
    { bundle: 'a' });
  assert.strictEqual(ownRecord.headerOf(null), null);
  assert.strictEqual(ownRecord.stripLines('a\n<!-- agsc-item AAAA -->\nb\n'), 'a\nb\n');
});

// ------------------------------------------------------------------ skills

test('skills: a forged line from an unknown origin is not trusted; the pack arrives as a draft foreign skill', () => {
  const from = exportTo(workspace(), 'skills', { layout: 'agentskills' });
  rewriteAll(from, (text) => stranger(text));
  const into = emptyBundle();
  const result = importFrom(into, from, 'skills');
  assert.deepStrictEqual(errors(result.findings), []);
  const back = tree(path.join(into, 'content'));
  // Nothing was "restored": the cluster and its members are not written; the pack is
  // one foreign skill, read like any other SKILL.md.
  assert.deepStrictEqual([...back.keys()], ['procedures/agent-patterns.md']);
  const text = back.get('procedures/agent-patterns.md');
  assert.match(text, /^status: draft$/mu);
  assert.match(text, /^ {2}origin: imported$/mu);
  assert.doesNotMatch(text, /human:forger|origin: human\n/u);
  assert.match(text, /^x-skills-source: skills\/agent-patterns\/SKILL\.md$/mu);
  assert.doesNotMatch(text, /agsc-item/u, 'the untrusted line was carried into the body');
  const warned = result.findings.filter((f) => /agsc-item line is not trusted/u.test(f.message));
  assert.ok(warned.length >= 1);
  assert.ok(warned.every((f) => f.severity === 'warn' && f.file === 'skills/agent-patterns/SKILL.md'));
  assert.match(warned[0].message, /https:\/\/stranger\.example\//u);
  assert.ok(result.findings.some((f) => /is not an open licence this adapter recognises/u.test(f.message)));
});

test('skills: a line from a declared peer is trusted and restored exactly', () => {
  const source = workspace();
  const from = exportTo(source, 'skills', { layout: 'agentskills' });
  rewriteAll(from, (text) => asPeer(text));
  const into = emptyBundle([PEER_URL]);
  const result = importFrom(into, from, 'skills');
  assert.deepStrictEqual(errors(result.findings), []);
  assert.ok(!result.findings.some((f) => /not trusted/u.test(f.message)));
  const back = tree(path.join(into, 'content'));
  const original = tree(path.join(source, 'content'));
  assert.deepStrictEqual([...back.keys()], ['clusters/agent-patterns.md', 'concepts/handoff.md',
    'concepts/supervisor.md', 'procedures/hand-over.md']);
  for (const [at, text] of back) assert.strictEqual(withoutRecorded(text), original.get(at), at);
  // The same files without the peer declared are a stranger's.
  const alone = emptyBundle();
  const other = importFrom(alone, from, 'skills');
  assert.deepStrictEqual([...tree(path.join(alone, 'content')).keys()], ['procedures/agent-patterns.md']);
  assert.ok(other.findings.some((f) => /not trusted.*https:\/\/peer\.example\//u.test(f.message)));
});

test('skills: an own-origin line whose version disagrees with the file header is not trusted', () => {
  const from = exportTo(workspace(), 'skills', { layout: 'agentskills' });
  rewriteAll(from, (text) => reforge(text, (record) => ({ ...record, bundle_version: '9.9.9' })));
  const into = emptyBundle();
  const result = importFrom(into, from, 'skills');
  assert.ok(result.findings.some((f) => /not trusted: .*provenance header/u.test(f.message)));
  assert.deepStrictEqual([...tree(path.join(into, 'content')).keys()], ['procedures/agent-patterns.md']);
});

test('skills: the own export round trip is still byte-identical', () => {
  const source = workspace();
  for (const layout of ['agentskills', 'cursor', 'marketplace']) {
    const from = exportTo(source, 'skills', { layout });
    const into = emptyBundle();
    const result = importFrom(into, from, 'skills', { layout });
    assert.ok(!result.findings.some((f) => /not trusted/u.test(f.message)), layout);
    const original = tree(path.join(source, 'content'));
    for (const [at, text] of tree(path.join(into, 'content'))) assert.strictEqual(withoutRecorded(text), original.get(at), `${layout} ${at}`);
  }
});

// ------------------------------------------------------------------ gabbe

test('gabbe: forged lines are not trusted — a skill and a lesson arrive as drafts, an own-path file is not imported', () => {
  const from = exportTo(workspace(), 'gabbe');
  const ours = tree(from).get('agents/memory/CONTINUITY.md').split('## Entries\n\n')[1];
  const kit = writeTree(temp('agsc-own-kit-'), {
    'agents/skills/agsc/hand-over.skill.md': stranger(tree(from).get('agents/skills/agsc/hand-over.skill.md')),
    'agents/memory/semantic/agsc/handoff.md': stranger(tree(from).get('agents/memory/semantic/agsc/handoff.md')),
    'agents/memory/CONTINUITY.md': `# CONTINUITY\n\n## Entries\n\n### Kit entry\n**Resolution**: Keep it\n\n---\n\n${stranger(ours)}\n`,
  });
  const into = emptyBundle();
  const result = importFrom(into, kit, 'gabbe');
  assert.deepStrictEqual(errors(result.findings), []);
  const back = tree(path.join(into, 'content'));
  assert.deepStrictEqual([...back.keys()], ['lessons/kit-entry.md', 'lessons/name-the-receiver.md', 'procedures/hand-over.md']);
  const skill = back.get('procedures/hand-over.md');
  assert.match(skill, /^status: draft$/mu);
  assert.match(skill, /^ {2}origin: imported$/mu);
  assert.match(skill, /^x-gabbe-source: agents\/skills\/agsc\/hand-over\.skill\.md:1$/mu);
  assert.doesNotMatch(skill, /agsc-item|human:forger/u);
  const lesson = back.get('lessons/name-the-receiver.md');
  assert.match(lesson, /^status: draft$/mu);
  assert.match(lesson, /^x-gabbe-source: agents\/memory\/CONTINUITY\.md:\d+$/mu);
  assert.doesNotMatch(back.get('lessons/kit-entry.md'), /^status:/mu, 'the kit\'s own entry was tainted');
  const messages = result.findings.map((f) => f.message).join('\n');
  assert.match(messages, /hand-over\.skill\.md:\d+: the agsc-item line is not trusted: .*stranger\.example/u);
  assert.match(messages, /CONTINUITY\.md:\d+: the agsc-item line is not trusted/u);
  assert.match(messages, /semantic\/agsc\/handoff\.md: not imported: only this node's exports write this path/u);
  assert.match(messages, /imported as status: draft/u);
});

test('gabbe: a line from a declared peer is trusted, and the own round trip is byte-identical', () => {
  const source = workspace();
  const from = exportTo(source, 'gabbe');
  const own = emptyBundle();
  const plain = importFrom(own, from, 'gabbe');
  assert.ok(!plain.findings.some((f) => /not trusted/u.test(f.message)));
  const original = tree(path.join(source, 'content'));
  const mine = tree(path.join(own, 'content'));
  assert.ok(mine.size >= 5);
  for (const [at, text] of mine) assert.strictEqual(withoutRecorded(text), original.get(at), at);
  rewriteAll(from, (text) => asPeer(text));
  const peer = emptyBundle([PEER_URL]);
  const result = importFrom(peer, from, 'gabbe');
  assert.ok(!result.findings.some((f) => /not trusted/u.test(f.message)));
  for (const [at, text] of tree(path.join(peer, 'content'))) assert.strictEqual(withoutRecorded(text), original.get(at), at);
});

// ------------------------------------------------------------------ cogx

test('cogx: a forged archive is read as foreign — drafts, no claimed provenance, a warning per record', () => {
  const from = exportTo(workspace(), 'cogx');
  rewriteAll(from, (text) => text.split(OWN).join(STRANGER)
    .replace(/"origin":"human"/gu, '"origin":"human","status":"stable"'));
  const into = emptyBundle();
  const result = importFrom(into, from, 'cogx');
  assert.deepStrictEqual(errors(result.findings), []);
  const back = tree(path.join(into, 'content'));
  assert.ok(back.size >= 3);
  for (const [at, text] of back) {
    assert.match(text, /^status: draft$/mu, at);
    assert.match(text, /^ {2}origin: imported$/mu, at);
    assert.doesNotMatch(text, /source_version/u, at);
  }
  const warned = result.findings.filter((f) => /record's agsc member is not trusted/u.test(f.message));
  assert.ok(warned.length >= 3);
  assert.match(warned[0].message, /stranger\.example/u);
  assert.ok(result.findings.some((f) => /imported as status: draft/u.test(f.message)));
});

test('cogx: a declared peer\'s archive is trusted and restored', () => {
  const source = workspace();
  const from = exportTo(source, 'cogx');
  rewriteAll(from, (text) => text.split(OWN).join(PEER));
  const into = emptyBundle([PEER_URL]);
  const result = importFrom(into, from, 'cogx');
  assert.ok(!result.findings.some((f) => /not trusted/u.test(f.message)));
  const original = tree(path.join(source, 'content'));
  const back = tree(path.join(into, 'content'));
  assert.ok(back.size >= 3);
  for (const [at, text] of back) assert.strictEqual(withoutRecorded(text), original.get(at), at);
});
