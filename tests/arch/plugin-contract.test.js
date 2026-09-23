'use strict';
// tests/arch/plugin-contract.test.js — D112 §(2): every sample under
// `examples/plugins/` is checked against its row of AGSC-00-24, so the samples are
// proof and not decoration.
//
// FOUR PROPERTIES, one per obligation the contract states:
//
//   (a) it declares the four members and registers into ITS OWN registry;
//   (b) it reaches no network — no `fetch`, no network module, no child process,
//       for every kind whose row says `network: false`;
//   (c) it writes nothing: no sample requires the FileSystem, so none of them can
//       write outside its declared outputs, and the paths each one NAMES stay
//       inside what its row admits — never `content/`, never outside the Bundle
//       root, never through a link (AGSC-08-02, AGSC-01-16, AGSC-01-35);
//   (d) it changes no canonical byte of a 1.0 surface: the fixture Bundle is built
//       with every sample loaded and the emitted files are compared, file by file,
//       with a build that loaded none.
//
// (b) and (c) are checked BOTH in the source text and at run time: the source scan
// catches a call the sample never makes on the path a test happens to take, and the
// run-time check catches a module that reached for a capability under another name.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const plugins = require('../../src/application/plugins.js');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'examples', 'plugins');
const SPEC = require('../../src/application/cli/main.js').SPEC_VERSION;

/** Every sample, as `{file, source, plugin}`. */
function samples() {
  return nodeFs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort().map((file) => ({
    file,
    // eslint-disable-next-line global-require, import/no-dynamic-require
    plugin: require(path.join(DIR, file)),
    source: nodeFs.readFileSync(path.join(DIR, file), 'utf8'),
  }));
}

/** The code of a sample, with its comment block removed: what actually runs. */
function code(source) {
  return String(source)
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/u.test(line))
    .join('\n');
}

test('there is one sample per kind, and every kind has one', () => {
  const found = samples().map((s) => s.plugin.kind).sort();
  assert.deepStrictEqual(found, [...plugins.KIND_NAMES].sort());
  assert.strictEqual(found.length, 8);
  for (const sample of samples()) {
    assert.strictEqual(`${sample.plugin.kind}.js`, sample.file,
      'a sample is named after its kind, so a reader finds it without a table');
  }
});

test('(a) every sample registers into its own registry, and into no other', () => {
  for (const sample of samples()) {
    const own = plugins.createRegistry(sample.plugin.kind, { specVersion: SPEC });
    const result = own.register(sample.plugin);
    assert.deepStrictEqual(result.findings, [], sample.file);
    assert.strictEqual(result.registered, true, sample.file);
    for (const other of plugins.KIND_NAMES) {
      if (other === sample.plugin.kind) continue;
      const wrong = plugins.createRegistry(other, { specVersion: SPEC }).register(sample.plugin);
      assert.strictEqual(wrong.registered, false, `${sample.file} registered as ${other}`);
      assert.strictEqual(wrong.findings[0].code, 'AGSC-E004');
    }
  }
});

test('(b) no sample reaches the network, and none spawns a process', () => {
  const forbidden = [
    [/\bfetch\s*\(/u, 'fetch('],
    [/require\(['"]node:(net|tls|http|https|dgram|dns)['"]\)/u, 'a network module'],
    [/require\(['"]node:child_process['"]\)/u, 'child_process'],
    [/\bXMLHttpRequest\b/u, 'XMLHttpRequest'],
    [/\bWebSocket\b/u, 'WebSocket'],
    [/\bnavigator\.sendBeacon\b/u, 'sendBeacon'],
    [/\bimport\s*\(/u, 'a dynamic import'],
    [/\beval\s*\(/u, 'eval'],
    [/new Function\s*\(/u, 'new Function'],
  ];
  for (const sample of samples()) {
    const body = code(sample.source);
    for (const [pattern, what] of forbidden) {
      assert.ok(!pattern.test(body), `${sample.file} uses ${what}`);
    }
  }
});

test('(b) at run time: a sample requires nothing at all, so it can hold no capability', () => {
  // Every sample is a leaf: it requires no module, which is the strongest form of
  // "it cannot reach the network or the disk" a CommonJS module can have. This is
  // asserted over the REAL loader, not over the source text.
  for (const sample of samples()) {
    const full = path.join(DIR, sample.file);
    delete require.cache[require.resolve(full)];
    const loaded = new Module(full, null);
    loaded.filename = full;
    loaded.paths = Module._nodeModulePaths(DIR);
    const asked = [];
    loaded.require = (id) => { asked.push(id); throw new Error(`refused: ${id}`); };
    loaded._compile(nodeFs.readFileSync(full, 'utf8'), full);
    assert.deepStrictEqual(asked, [], `${sample.file} required ${asked.join(', ')}`);
    assert.strictEqual(typeof loaded.exports.kind, 'string');
  }
});

test('(c) no sample writes, and every path it names is inside its declared outputs', () => {
  for (const sample of samples()) {
    const body = code(sample.source);
    for (const pattern of [/writeFileSync/u, /\bfs\./u, /require\(['"]node:fs['"]\)/u,
      /process\.cwd\(/u, /process\.env\b/u]) {
      assert.ok(!pattern.test(body), `${sample.file} reaches for the host: ${pattern}`);
    }
  }
  // The paths the samples that NAME one produce, checked against the three limits.
  const paths = [
    require(path.join(DIR, 'forge-shim.js')).workflow({ level: 2 }).path,
    require(path.join(DIR, 'deployment-profile.js')).headerFile([]).path,
    require(path.join(DIR, 'composition-emitter.js')).emit(new Map(), 'dist/harness/abc/').path,
  ];
  for (const at of paths) {
    assert.ok(!at.startsWith('content/'), `${at} is inside content/ (AGSC-08-02)`);
    assert.ok(!at.startsWith('/') && !/^[A-Za-z]:/u.test(at), `${at} is not Bundle-relative`);
    assert.ok(!at.split('/').includes('..'), `${at} escapes the Bundle root (AGSC-01-16)`);
  }
  // AGSC-07-18: the composition emitter writes BESIDE the Harness, never inside it.
  const emitted = require(path.join(DIR, 'composition-emitter.js'))
    .emit(new Map([['AGENTS.md', '']]), 'dist/harness/abc/');
  assert.strictEqual(emitted.path, 'dist/harness/abc.index.md');
  assert.ok(!emitted.path.startsWith('dist/harness/abc/'));
});

test('(d) loading every sample changes no canonical byte of a 1.0 surface', () => {
  // The whole fixture, built twice in one process: once with no sample loaded, once
  // with all eight registered and called. A plugin of these eight kinds is given
  // its inputs and answers a value; none of them is handed the build, and this is
  // the test that says so in bytes rather than in prose.
  // eslint-disable-next-line global-require
  const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
  // eslint-disable-next-line global-require
  const { createClock } = require('../../src/adapters/node-clock.js');
  // eslint-disable-next-line global-require
  const validate = require('../../src/knowledge/validate.js');
  // eslint-disable-next-line global-require
  const { loadBundle } = require('../../src/application/bundle.js');
  // eslint-disable-next-line global-require
  const site = require('../../src/distribution/site.js');
  const buildFixture = () => {
    const fs = createFileSystem(path.join(ROOT, 'tests', 'fixtures', 'minimal'));
    const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    return site.build(bundle, { clock, fs }, { specVersion: SPEC, version: '0.0.2' }).files;
  };
  const before = buildFixture();

  const registries = new Map(plugins.KIND_NAMES
    .map((kind) => [kind, plugins.createRegistry(kind, { specVersion: SPEC })]));
  for (const sample of samples()) {
    assert.strictEqual(registries.get(sample.plugin.kind).register(sample.plugin).registered, true);
  }
  const items = [{ slug: 'a', title: 'A', type: 'concept' }, { slug: 'b', title: 'B', type: 'procedure' }];
  registries.get('memory-adapter').get('tsv').toLines(items);
  registries.get('channel-adapter').get('plain-text').message({ reason: 'r', slug: 'a', title: 'A' });
  registries.get('forge-shim').get('example-forge').workflow({ level: 2 });
  registries.get('deployment-profile').get('example-host').headerFile([]);
  registries.get('surface').get('x-example-titles').emit(items);
  registries.get('page-tool').get('agsc.example.count_by_type').call({ items });
  registries.get('composition-emitter').get('example-index').emit(new Map(), 'dist/harness/x/');
  registries.get('checker').get('validate-example').check([{ path: 'x', text: 'y\n' }]);

  const after = buildFixture();
  assert.deepStrictEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [route, text] of before) {
    assert.strictEqual(after.get(route), text, `${route} moved while a plugin was loaded`);
  }
});
