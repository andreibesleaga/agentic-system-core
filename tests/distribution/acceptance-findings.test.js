'use strict';
// verifies AGSC-04-02, AGSC-09-14
// Engine defects that executing the acceptance scenarios and the tests of the
// standard brought to light, each pinned by the rule it broke: adoption moving a
// file before copying it, ci passing what build refuses, ci comparing byte arrays
// by identity, the same-day stale item, verify --ledger never reading what was
// published, and the memory:// and https forms refused where a slug is accepted.
// Deterministic: fixed build instants, no network, scratch directories under the
// system temporary directory, removed afterwards.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const now = require('../../src/distribution/now.js');
const init = require('../../src/distribution/init.js');
const mcpTools = require('../../src/distribution/mcp-tools.js');
const pageTools = require('../../src/distribution/page-tools.js');

const ROOT = path.resolve(__dirname, '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const MINIMAL = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true });
});

function temp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

const HOME = temp('agsc-findings-home-');
fs.writeFileSync(path.join(HOME, '.gitconfig-empty'), '');

function env(extra = {}) {
  return {
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
    GIT_AUTHOR_EMAIL: 'operator@example.org',
    GIT_AUTHOR_NAME: 'Operator',
    GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    GIT_COMMITTER_EMAIL: 'operator@example.org',
    GIT_COMMITTER_NAME: 'Operator',
    GIT_CONFIG_GLOBAL: path.join(HOME, '.gitconfig-empty'),
    GIT_CONFIG_NOSYSTEM: '1',
    HOME,
    NO_COLOR: '1',
    PATH: process.env.PATH,
    SOURCE_DATE_EPOCH: EPOCH,
    ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
    ...extra,
  };
}

function agsc(cwd, argv, extra = {}) {
  const r = spawnSync(process.execPath, [AGSC, ...argv], { cwd, encoding: 'utf8', env: env(extra) });
  return { exit: r.status, stderr: r.stderr, stdout: r.stdout };
}

function git(cwd, argv) {
  const r = spawnSync('git', argv, { cwd, encoding: 'utf8', env: env() });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout;
}

test('AGSC-02-95: adoption copies a referenced file even when that file is itself adopted and moved', () => {
  const dir = temp('agsc-findings-adopt-');
  fs.mkdirSync(path.join(dir, 'notes'));
  fs.writeFileSync(path.join(dir, 'ideas.md'), 'Ideas\n\nSee [agents](notes/agents.md).\n');
  fs.writeFileSync(path.join(dir, 'notes', 'agents.md'), '# Agents\n\nAgents. ![sketch](sketch.png)\n');
  // A binary asset: the copy is byte for byte, never a UTF-8 decode (AGSC-01-14 would refuse it).
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]);
  fs.writeFileSync(path.join(dir, 'notes', 'sketch.png'), png);
  const r = agsc(dir, ['init', '--json']);
  assert.strictEqual(r.exit, 0, r.stderr);
  const envelope = JSON.parse(r.stdout);
  const e507 = envelope.findings.filter((f) => f.code === 'AGSC-E507');
  assert.deepStrictEqual(e507.map((f) => f.file).sort(), ['content/concepts/agents.md', 'content/concepts/ideas.md']);
  assert.ok(e507.every((f) => f.severity === 'warn'));
  // The original bytes of both referenced files, under content/assets/<original path>.
  assert.strictEqual(fs.readFileSync(path.join(dir, 'content', 'assets', 'notes', 'agents.md'), 'utf8'),
    '# Agents\n\nAgents. ![sketch](sketch.png)\n');
  assert.deepStrictEqual(fs.readFileSync(path.join(dir, 'content', 'assets', 'notes', 'sketch.png')), png);
  // AGSC-02-93: the adopted file moved; its body bytes are unchanged.
  assert.ok(!fs.existsSync(path.join(dir, 'notes', 'agents.md')));
  assert.match(fs.readFileSync(path.join(dir, 'content', 'concepts', 'agents.md'), 'utf8'),
    /\n---\n\n# Agents\n\nAgents\. !\[sketch\]\(sketch\.png\)\n$/u);
});

test('AGSC-02-95: init.run reads every copy source before any adopted file is moved', () => {
  const store = new Map([['a.md', 'A'], ['b.md', 'B']]);
  const port = {
    exists: (p) => store.has(p),
    mkdirp: () => {},
    readFile: (p) => {
      if (!store.has(p)) throw new Error(`ENOENT ${p}`);
      return store.get(p);
    },
    remove: (p) => store.delete(p),
    writeFile: (p, data) => store.set(p, data),
  };
  const planned = {
    copies: [{ from: 'b.md', to: 'content/assets/b.md' }],
    findings: [],
    writes: [
      { from: 'a.md', path: 'content/concepts/a.md', text: 'A2' },
      { from: 'b.md', path: 'content/concepts/b.md', text: 'B2' },
    ],
  };
  const applied = init.run({ fs: port }, planned);
  assert.strictEqual(store.get('content/assets/b.md'), 'B');
  assert.ok(!store.has('b.md'));
  assert.deepStrictEqual(applied.written, ['content/concepts/a.md', 'content/concepts/b.md', 'content/assets/b.md']);
});

test('AGSC-09-08: ci fails wherever build fails — the TDM reservation fault is not lost between lanes', () => {
  const dir = temp('agsc-findings-parity-');
  fs.cpSync(MINIMAL, dir, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  delete config.site.tdm_crawlers;
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  const build = agsc(dir, ['build', '--json']);
  const ci = agsc(dir, ['ci', '--json']);
  assert.strictEqual(build.exit, 1, build.stdout);
  assert.strictEqual(ci.exit, 1, `ci passed a Bundle build refuses: ${ci.stdout}`);
  const codes = (r) => JSON.parse(r.stdout).findings.filter((f) => f.severity === 'error').map((f) => f.code).sort();
  assert.deepStrictEqual(codes(ci), codes(build));
  // AGSC-09-11: one fault is still counted once — the lint lane's own findings are not doubled.
  assert.strictEqual(JSON.parse(ci.stdout).findings.filter((f) => /tdm_crawlers/u.test(f.message)).length, 1);
  // And with the crawlers named, both lanes agree again.
  config.site.tdm_crawlers = ['CCBot'];
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  assert.strictEqual(agsc(dir, ['ci']).exit, 0);
  assert.strictEqual(agsc(dir, ['build']).exit, 0);
});

test('AGSC-02-11: an item is stale when stale_after is earlier than the build instant, on the same day too', () => {
  const items = [
    { slug: 'earlier-that-day', stale_after: '2026-03-01T06:00:00Z' },
    { slug: 'the-day-before', stale_after: '2026-02-28T23:59:59Z' },
    { slug: 'at-the-instant', stale_after: '2026-03-01T12:00:00Z' },
    { slug: 'later-that-day', stale_after: '2026-03-01T18:00:00Z' },
    { slug: 'no-date' },
  ];
  assert.deepStrictEqual(now.staleItems(items, '2026-03-01T12:00:00Z'), ['earlier-that-day', 'the-day-before']);
});

test('AGSC-08-23: verify --ledger compares the recomputation with the published ledger and head', () => {
  const dir = temp('agsc-findings-ledger-');
  fs.cpSync(MINIMAL, dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'first']);
  const run = (argv) => {
    const e = env();
    delete e.SOURCE_DATE_EPOCH;
    const r = spawnSync(process.execPath, [AGSC, ...argv], { cwd: dir, encoding: 'utf8', env: e });
    return { exit: r.status, json: r.stdout.startsWith('{') ? JSON.parse(r.stdout) : null, stdout: r.stdout };
  };
  assert.strictEqual(run(['build']).exit, 0);
  const at = path.join(dir, 'www', 'ledger.jsonl');
  const original = fs.readFileSync(at, 'utf8');
  assert.strictEqual(run(['verify', '--ledger']).exit, 0);

  // A clone: the published file must equal the recomputation (AGSC-E702).
  fs.writeFileSync(at, original.replace('"commit"', '"release"'));
  let r = run(['verify', '--ledger', '--json']);
  assert.strictEqual(r.exit, 1);
  assert.deepStrictEqual(r.json.findings.map((f) => f.code), ['AGSC-E702']);
  assert.strictEqual(r.json.findings[0].line, 1);

  // A downloaded node (no history): the published file is re-verified, and a
  // truncated tail is caught by the published head (AGSC-E701).
  fs.renameSync(path.join(dir, '.git'), path.join(dir, '.git-away'));
  fs.writeFileSync(at, original);
  r = run(['verify', '--ledger', '--json']);
  assert.ok(!r.json.findings.some((f) => f.severity === 'error'), r.stdout);
  fs.writeFileSync(at, `${original.split('\n').filter((l) => l !== '').slice(0, -1).join('\n')}\n`);
  r = run(['verify', '--ledger', '--json']);
  assert.strictEqual(r.exit, 1);
  assert.ok(r.json.findings.some((f) => f.code === 'AGSC-E701' && /truncated/u.test(f.message)), r.stdout);
  fs.renameSync(path.join(dir, '.git-away'), path.join(dir, '.git'));

  // A published well-known head that is not the recomputed one is AGSC-E701 in a clone too.
  fs.writeFileSync(at, original);
  const wk = path.join(dir, 'www', '.well-known', 'knowledge-linkset');
  const document = JSON.parse(fs.readFileSync(wk, 'utf8'));
  document.linkset[0]['https://w3id.org/agentic-system-core/rel#ledger'][0]['agsc-ledger-head'] = ['0'.repeat(64)];
  fs.writeFileSync(wk, JSON.stringify(document));
  r = run(['verify', '--ledger', '--json']);
  assert.strictEqual(r.exit, 1);
  assert.ok(r.json.findings.some((f) => f.code === 'AGSC-E701'), r.stdout);
});

test('AGSC-05-04b: a memory:// alias is accepted wherever a slug is, on both transports alike', () => {
  const fsPort = createFileSystem(MINIMAL);
  const bundle = loadBundle(fsPort, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  const { files } = site.build(bundle, { clock, fs: fsPort }, { specVersion: '1.0.0-rc.6', version: '0.0.2' });
  const local = mcpTools.tools(bundle, {});
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(String(files.get('/compose/agsc-core.js')), context);
  vm.runInContext(String(files.get('/compose/agsc-page-tools.js')), context);
  const api = vm.runInContext('globalThis.AGSC_PAGE_TOOLS', context);
  const page = api.pageToolset(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID }),
    vm.runInContext('globalThis.AGSC_CORE', context));
  const compose = require('../../src/composition/compose.js');
  const module = pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId: 'minimal' }), { compose: compose.compose });

  const plain = local.call('read', { slug: 'handoff' });
  const aliased = local.call('read', { slug: 'memory://minimal/handoff' });
  assert.strictEqual(aliased.type, 'item');
  assert.deepStrictEqual(aliased, plain);
  assert.deepStrictEqual(local.call('read', { slug: 'memory://minimal/concepts/handoff' }), plain);
  assert.deepStrictEqual(local.call('links', { slug: 'memory://minimal/supervisor' }), local.call('links', { slug: 'supervisor' }));
  assert.deepStrictEqual(local.call('propose', { slug: 'memory://minimal/supervisor' }), local.call('propose', { slug: 'supervisor' }));
  assert.deepStrictEqual(local.call('compose', { selection: ['memory://minimal/supervisor'] }),
    local.call('compose', { selection: ['supervisor'] }));
  const foreign = local.call('read', { slug: 'memory://other-node/handoff' });
  assert.strictEqual(foreign.body.code, 'AGSC-E309');
  assert.strictEqual(local.call('compose', { selection: ['supervisor', 'memory://other-node/x'] }).body.code, 'AGSC-E309');
  assert.strictEqual(local.call('read', { slug: 'memory://minimal/no-such-item' }).body.code, 'AGSC-E301');

  // AGSC-09-16: one tool contract, two transports — the page answers the same bytes.
  for (const [name, args] of [
    ['read', { slug: 'memory://minimal/handoff' }],
    ['read', { slug: 'memory://other-node/handoff' }],
    ['links', { slug: 'memory://minimal/supervisor' }],
    ['propose', { slug: 'memory://minimal/handoff' }],
    ['compose', { selection: ['memory://minimal/supervisor'] }],
    ['compose', { selection: ['memory://other-node/x'] }],
  ]) {
    const expected = JSON.parse(JSON.stringify(local.call(name, args)));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(page.call(name, args))), expected, `${name} page script`);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(module.call(name, args))), expected, `${name} module`);
  }
});

test('AGSC-05-04a: wherever memory:// is accepted, the https item IRI is accepted too, on both transports', () => {
  const fsPort = createFileSystem(MINIMAL);
  const bundle = loadBundle(fsPort, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  const { files } = site.build(bundle, { clock, fs: fsPort }, { specVersion: '1.0.0-rc.6', version: '0.0.2' });
  const local = mcpTools.tools(bundle, {});
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const compose = require('../../src/composition/compose.js');
  const module = pageTools.pageToolset(pageTools.pageCorpus(sources, { bundleId: 'minimal' }), { compose: compose.compose });
  const iri = 'https://minimal.example/concepts/handoff/';
  const plain = local.call('read', { slug: 'handoff' });
  assert.deepStrictEqual(local.call('read', { slug: iri }), plain);
  assert.deepStrictEqual(local.call('read', { slug: 'memory://minimal/handoff' }), plain);
  assert.deepStrictEqual(local.call('compose', { selection: [iri] }), local.call('compose', { selection: ['handoff'] }));
  assert.strictEqual(local.call('read', { slug: 'https://minimal.example/concepts/no-such/' }).body.code, 'AGSC-E301');
  // A URL of another origin is not an item IRI of this node and stays an (unknown) slug.
  assert.strictEqual(local.call('read', { slug: 'https://other.example/concepts/handoff/' }).body.code, 'AGSC-E301');
  for (const args of [{ slug: iri }, { slug: 'https://minimal.example/concepts/no-such/' }]) {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(module.call('read', args))),
      JSON.parse(JSON.stringify(local.call('read', args))));
  }
});

test('AGSC-04-02: ci compares the two builds byte for byte, so a Bundle with an asset is reproducible', () => {
  const { sameBytes } = require('../../src/distribution/ci.js');
  assert.strictEqual(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.strictEqual(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])), false);
  assert.strictEqual(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.strictEqual(sameBytes('a', 'a'), true);
  assert.strictEqual(sameBytes('a', undefined), false);
  const dir = temp('agsc-findings-assets-');
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'with-assets'), dir, { recursive: true });
  const ci = agsc(dir, ['ci', '--json']);
  assert.strictEqual(ci.exit, 0, ci.stdout);
  assert.ok(!JSON.parse(ci.stdout).findings.some((f) => f.code === 'AGSC-E602'));
});

test('AGSC-08-23: verify --ledger ignores a published file it cannot read or parse, and still verifies the recomputation', () => {
  const dir = temp('agsc-findings-unreadable-');
  fs.cpSync(MINIMAL, dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'first']);
  const e = env();
  delete e.SOURCE_DATE_EPOCH;
  const run = (argv) => spawnSync(process.execPath, [AGSC, ...argv], { cwd: dir, encoding: 'utf8', env: e });
  assert.strictEqual(run(['build']).status, 0);
  fs.rmSync(path.join(dir, 'www', 'ledger.jsonl'));
  fs.mkdirSync(path.join(dir, 'www', 'ledger.jsonl'));
  fs.writeFileSync(path.join(dir, 'www', '.well-known', 'knowledge-linkset'), 'not json');
  const r = run(['verify', '--ledger', '--json']);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.strictEqual(JSON.parse(r.stdout).status, 'pass');
});
