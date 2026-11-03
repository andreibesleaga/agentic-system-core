'use strict';
// verifies AGSC-07-30, AGSC-11-24, AGSC-08-32
// The context map and the typed peers through the command line, on scratch copies of
// `tests/fixtures/minimal` with the clusters and items of vector lint-0060 (the contexts billing and
// shipping). `compose` writes `context-map.json` in `<harness dir>.companion/` for a node that
// declares contexts, with and without `--out`, and the seven Harness files are the bytes of the same
// composition without contexts; a node that declares none gets no companion directory at all
// (AGSC-07-30). A typed peer is named by its address alone wherever 1.0 named the string, so the
// built site is byte for byte that of the plain peer (AGSC-11-24); its crosswalk is checked by
// `lint`, `build` and `compose` (AGSC-E209 for a statement of another shape, AGSC-E901 for an
// absent file) and published only in the context map. Fixed clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { main } = require('../../../src/application/cli/main.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const CONTEXT_NODE = require(path.join(ROOT, 'tests', 'vectors', 'lint', 'lint-0060-titles-are-unique-inside-one-context.json')).input.add_files;
const PEER = 'https://b.example/.well-known/knowledge-linkset';
const CROSSWALK = '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n'
  + '<https://minimal.example/concepts/handoff/> skos:exactMatch <https://b.example/concepts/handoff/> .\n';

/** A scratch copy of the fixture with `files` added (each `{path: text}`). */
function scratch(...fileSets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-context-map-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  fs.rmSync(path.join(dir, 'www'), { force: true, recursive: true });
  for (const [file, text] of Object.entries(Object.assign({}, ...fileSets))) {
    if (text === undefined) continue;
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}

/** The configuration of `files` (the fixture's when absent) with `fields` set. */
function config(fields, files = {}) {
  const base = files['agsc.config.json'] || fs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8');
  return { 'agsc.config.json': `${JSON.stringify({ ...JSON.parse(base), ...fields }, null, 2)}\n` };
}
/** The files of lint-0060 without its configuration: the clusters and items, no context declared. */
const withoutContexts = () => {
  const files = { ...CONTEXT_NODE };
  delete files['agsc.config.json'];
  return files;
};

/** `agsc <argv> --json` over the Bundle at `dir`: the exit code and the findings. */
function run(dir, ...argv) {
  const stdout = captureStream();
  const exit = main([...argv, '--json', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir,
    specVersion: '1.0.0', stderr: captureStream(), stdout, version: '1.0.0',
  });
  return { exit, findings: JSON.parse(stdout.text() || '{}').findings || [] };
}

/** Every file under `dir`, relative, with its bytes. */
function tree(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, entry);
    if (fs.statSync(file).isFile()) out[entry.split(path.sep).join('/')] = fs.readFileSync(file, 'utf8');
  }
  return out;
}
const codes = (findings) => findings.filter((f) => f.severity === 'error').map((f) => f.code);

test('compose writes context-map.json beside the Harness of a node that declares contexts', () => {
  const dir = scratch(CONTEXT_NODE);
  assert.strictEqual(run(dir, 'compose', 'account-a', 'account-b', 'handoff').exit, 0);
  const harnessDir = fs.readdirSync(path.join(dir, 'dist', 'harness')).filter((name) => !name.endsWith('.companion'));
  assert.strictEqual(harnessDir.length, 1);
  const companion = tree(path.join(dir, 'dist', 'harness', `${harnessDir[0]}.companion`));
  assert.deepStrictEqual(Object.keys(companion), ['context-map.json']);
  const map = JSON.parse(companion['context-map.json']);
  assert.deepStrictEqual(map.contexts.map((c) => [c.name, c.members]), [['billing', ['account-a']], ['shipping', ['account-b']]]);
  assert.deepStrictEqual(map.unassigned, ['handoff']);
  assert.deepStrictEqual(map.peers, []);
  assert.strictEqual(map.selection_digest.slice(0, 16), harnessDir[0]);
  assert.ok(!Object.keys(tree(path.join(dir, 'dist', 'harness', harnessDir[0]))).includes('context-map.json'), 'never inside the Harness');

  const plain = scratch(withoutContexts());
  assert.strictEqual(run(plain, 'compose', 'account-a', 'account-b', 'handoff').exit, 0);
  assert.deepStrictEqual(fs.readdirSync(path.join(plain, 'dist', 'harness')), harnessDir, 'no companion directory without contexts');
  assert.deepStrictEqual(tree(path.join(dir, 'dist', 'harness', harnessDir[0])), tree(path.join(plain, 'dist', 'harness', harnessDir[0])),
    'the seven file kinds are the same bytes with and without contexts');
});

test('with --out <dir> the map is written in <dir>.companion/', () => {
  const dir = scratch(CONTEXT_NODE);
  assert.strictEqual(run(dir, 'compose', 'account-a', '--out', 'out/h').exit, 0);
  assert.deepStrictEqual(Object.keys(tree(path.join(dir, 'out', 'h.companion'))), ['context-map.json']);
  const plain = scratch(withoutContexts());
  assert.strictEqual(run(plain, 'compose', 'account-a', '--out', 'out/h').exit, 0);
  assert.deepStrictEqual(fs.readdirSync(path.join(plain, 'out')), ['h']);
});

test('an invalid composition writes neither the Harness nor the map', () => {
  const dir = scratch(CONTEXT_NODE);
  assert.strictEqual(run(dir, 'compose', 'no-such-item').exit, 1);
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'harness')));
});

test('a typed peer reaches the built site as its address alone, and its crosswalk reaches the map', () => {
  const typed = scratch(withoutContexts(), config({ peers: [{ crosswalk: 'domain/b.ttl', relationship: 'translation-layer', url: PEER }] }, CONTEXT_NODE),
    { 'domain/b.ttl': CROSSWALK });
  const plain = scratch(withoutContexts(), config({ peers: [PEER] }, CONTEXT_NODE));
  for (const dir of [typed, plain]) {
    const lint = run(dir, 'lint');
    assert.deepStrictEqual(codes(lint.findings), []);
    assert.strictEqual(run(dir, 'build').exit, 0);
  }
  const site = tree(path.join(typed, 'www'));
  assert.deepStrictEqual(site, tree(path.join(plain, 'www')), 'the same bytes as the plain peer (AGSC-11-24)');
  assert.match(site['.well-known/knowledge-linkset'], new RegExp(`"href":"${PEER.replace(/\./gu, '\\.')}"`, 'u'));
  assert.ok(!Object.values(site).some((text) => text.includes('[object Object]')));

  assert.strictEqual(run(typed, 'compose', 'handoff').exit, 0);
  const name = fs.readdirSync(path.join(typed, 'dist', 'harness')).find((entry) => entry.endsWith('.companion'));
  const map = JSON.parse(fs.readFileSync(path.join(typed, 'dist', 'harness', name, 'context-map.json'), 'utf8'));
  assert.deepStrictEqual(map.peers, [{
    crosswalk: [{ local: 'https://minimal.example/concepts/handoff/', match: 'exactMatch', peer: 'https://b.example/concepts/handoff/' }],
    relationship: 'translation-layer', url: PEER,
  }]);
});

test('a crosswalk that cannot be applied is refused by lint, build and compose, before anything is written', () => {
  const peers = (crosswalk) => config({ peers: [{ crosswalk, relationship: 'shared-kernel', url: PEER }] }, CONTEXT_NODE);
  const bad = scratch(withoutContexts(), peers('domain/b.ttl'), { 'domain/b.ttl': CROSSWALK.replace('exactMatch', 'relatedMatch') });
  const cluster = scratch(withoutContexts(), peers('domain/b.ttl'), { 'domain/b.ttl': CROSSWALK.replace('concepts/handoff/>', 'clusters/billing/>') });
  const absent = scratch(withoutContexts(), peers('domain/missing.ttl'));
  for (const [dir, code] of [[bad, 'AGSC-E209'], [cluster, 'AGSC-E209'], [absent, 'AGSC-E901']]) {
    for (const verb of [['lint'], ['build'], ['compose', 'handoff']]) {
      const result = run(dir, ...verb);
      assert.strictEqual(result.exit, 1, `${verb[0]} ${code}`);
      assert.deepStrictEqual(codes(result.findings), [code], `${verb[0]} ${code}`);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'dist', 'harness')) && !fs.existsSync(path.join(dir, 'www')));
  }
});
