'use strict';
// tests/application/plugins.test.js — the plugin contract of D112 §(2).
//
// Three properties, each asserted directly: nothing is loaded from the network, a
// mismatch is a registered Finding and never a crash, and the contract is additive
// within 1.x (a 1.0 plugin registers on a 1.1 host; a 1.1 plugin does not register
// on a 1.0 host, and says why).

const test = require('node:test');
const assert = require('node:assert');

const plugins = require('../../src/application/plugins.js');

const SPEC = '1.0.0-rc.6';
const good = (over) => ({
  agsc_spec_version: '1.0.0',
  kind: 'checker',
  name: 'validate-example',
  plugin_api_version: '1.0.0',
  ...(over || {}),
});

test('AGSC-00-24: the kind list is CLOSED at eight, and every row states its limits', () => {
  assert.strictEqual(plugins.KIND_NAMES.length, 8);
  assert.deepStrictEqual([...plugins.KIND_NAMES].sort(), [
    'channel-adapter', 'checker', 'composition-emitter', 'deployment-profile',
    'forge-shim', 'memory-adapter', 'page-tool', 'surface',
  ]);
  for (const name of plugins.KIND_NAMES) {
    const row = plugins.KINDS[name];
    assert.ok(typeof row.selector === 'string' && row.selector !== '', name);
    assert.ok(Array.isArray(row.emits) && row.emits.length > 0, name);
    assert.ok(Array.isArray(row.reads) && row.reads.length > 0, name);
    assert.ok(typeof row.never === 'string' && row.never !== '', name);
    assert.ok(Array.isArray(row.rules) && row.rules.every((r) => /^AGSC-\d\d-\d\d/u.test(r)), name);
    // (i) no row grants the network during build, lint, verify or ci's gates.
    assert.ok(row.network === false || row.network === 'ci', name);
  }
  // Exactly one kind may ever reach the network, and only in the CI lane.
  assert.deepStrictEqual(plugins.KIND_NAMES.filter((n) => plugins.KINDS[n].network !== false),
    ['channel-adapter']);
});

test('a well-formed plugin registers, and is then selectable by name', () => {
  const registry = plugins.createRegistry('checker', { specVersion: SPEC });
  const result = registry.register(good());
  assert.deepStrictEqual(result.findings, []);
  assert.strictEqual(result.registered, true);
  assert.deepStrictEqual(registry.names(), ['validate-example']);
  assert.strictEqual(registry.get('validate-example').name, 'validate-example');
  assert.strictEqual(registry.contract.selector, 'one of the nine of AGSC-09-90');
});

test('a mismatch is AGSC-E004 and never a crash', () => {
  const registry = plugins.createRegistry('checker', { specVersion: SPEC });
  const cases = [
    [good({ agsc_spec_version: '1.1.0' }), /specification version/u],
    [good({ agsc_spec_version: '2.0.0' }), /specification version/u],
    [good({ plugin_api_version: '1.1.0' }), /plugin-API version/u],
    [good({ plugin_api_version: '2.0.0' }), /plugin-API version/u],
    [good({ kind: 'wombat' }), /not one of the eight plugin kinds/u],
    [good({ kind: 'surface' }), /was offered to the "checker" registry/u],
    [good({ name: undefined }), /must declare "name"/u],
    [good({ agsc_spec_version: 'wombat' }), /specification version/u],
    [null, /must be an object/u],
    ['a string', /must be an object/u],
    [[], /must be an object/u],
  ];
  for (const [plugin, message] of cases) {
    const result = registry.register(plugin);
    assert.strictEqual(result.registered, false, JSON.stringify(plugin));
    assert.ok(result.findings.length > 0);
    assert.ok(result.findings.every((f) => f.code === 'AGSC-E004' && f.severity === 'error'),
      JSON.stringify(result.findings));
    assert.ok(result.findings.some((f) => message.test(f.message)),
      JSON.stringify(result.findings.map((f) => f.message)));
  }
  assert.deepStrictEqual(registry.names(), [], 'a refused plugin must not be registered');
});

test('the contract is additive within 1.x, and says so in both directions', () => {
  // A 1.0 plugin on a 1.1 host: fine, which is what "additive" means.
  assert.deepStrictEqual(plugins.admit(good(), {
    pluginApiVersion: '1.4.0', specVersion: '1.1.0',
  }), []);
  // A 1.1 plugin on a 1.0 host: refused, because it may use a hook this host does
  // not offer, and running it half-understood is the failure AGSC-00-21 exempts
  // configuration from.
  const refused = plugins.admit(good({ plugin_api_version: '1.1.0' }), { specVersion: SPEC });
  assert.strictEqual(refused.length, 1);
  assert.strictEqual(refused[0].code, 'AGSC-E004');
  assert.strictEqual(plugins.compatible('1.0.0', '1.0.0-rc.6'), true);
  assert.strictEqual(plugins.compatible('1.0.99', '1.1.0'), true);
  assert.strictEqual(plugins.compatible('1.2.0', '1.1.0'), false);
  assert.strictEqual(plugins.compatible('0.9.0', '1.0.0'), false);
  assert.strictEqual(plugins.compatible(undefined, '1.0.0'), false);
  assert.strictEqual(plugins.compatible('1.0.0', undefined), false);
  assert.deepStrictEqual(plugins.majorMinor('x'), null);
});

test('two plugins of one kind may not share a name', () => {
  const registry = plugins.createRegistry('checker', { specVersion: SPEC });
  assert.strictEqual(registry.register(good()).registered, true);
  const again = registry.register(good());
  assert.strictEqual(again.registered, false);
  assert.match(again.findings[0].message, /both call themselves/u);
  assert.strictEqual(registry.entries().length, 1);
});

test('a registry for a kind AGSC-00-24 does not define registers nothing', () => {
  const registry = plugins.createRegistry('wombat', { specVersion: SPEC });
  assert.strictEqual(registry.contract, null);
  const result = registry.register(good({ kind: 'wombat' }));
  assert.strictEqual(result.registered, false);
  assert.strictEqual(result.findings[0].code, 'AGSC-E004');
});

test('nothing is auto-loaded from the network', () => {
  const registry = plugins.createRegistry('checker', { specVersion: SPEC });
  let resolved = 0;
  const resolveModule = () => { resolved += 1; return good(); };
  for (const remote of ['https://example.org/p.js', 'http://example.org/p.js',
    'npm:@acme/p', 'file:///tmp/p.js', 'data:text/javascript,0']) {
    const result = plugins.loadInto(registry, remote, { resolveModule });
    assert.strictEqual(result.registered, false, remote);
    assert.strictEqual(result.findings[0].code, 'AGSC-E905', remote);
    assert.match(result.findings[0].message, /never from the network/u);
  }
  assert.strictEqual(resolved, 0, 'a remote specifier must not reach the resolver at all');
  assert.strictEqual(plugins.isRemote('./local.js'), false);
  assert.strictEqual(plugins.isRemote('@acme/agsc-adapter'), false);
  assert.strictEqual(plugins.isRemote('C:\\plugins\\p.js'), false);
});

test('a local path and a package name are the two shapes, and both register', () => {
  for (const specifier of ['./plugins/validate-example.js', '@acme/agsc-checker']) {
    const registry = plugins.createRegistry('checker', { specVersion: SPEC });
    const result = plugins.loadInto(registry, specifier, { resolveModule: () => good() });
    assert.strictEqual(result.registered, true, specifier);
    assert.deepStrictEqual(result.findings, []);
    assert.strictEqual(result.plugin.name, 'validate-example');
  }
});

test('a plugin that is absent or throws while loading is AGSC-E901, not a crash', () => {
  const registry = plugins.createRegistry('checker', { specVersion: SPEC });
  const result = plugins.loadInto(registry, './missing.js', {
    resolveModule: () => { throw new Error('Cannot find module'); },
  });
  assert.strictEqual(result.registered, false);
  assert.strictEqual(result.findings[0].code, 'AGSC-E901');
  assert.match(result.findings[0].message, /Cannot find module/u);
  const empty = plugins.loadInto(registry, '', { resolveModule: () => good() });
  assert.strictEqual(empty.findings[0].code, 'AGSC-E004');
  const nothing = plugins.loadInto(registry, undefined, { resolveModule: () => good() });
  assert.strictEqual(nothing.findings[0].code, 'AGSC-E004');
});
