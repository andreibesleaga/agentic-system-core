'use strict';
// tests/distribution/forge.test.js — AGSC-08-12's `enforce[]` compilation, the third
// of the three silently unmet MUSTs V9-D found (V9D-A3, specification item V9D-06).
//
// Only ONE of the four artefacts has its bytes pinned by the rule — the
// `status-check` array — so that one is asserted byte for byte against the rule's own
// wording (AGSC-08-09's check names, code-point ordered, JCS). The other three are
// asserted for the properties the rule DOES state: the target path, determinism,
// idempotence, the drift code, and that no second executable is emitted.

const test = require('node:test');
const assert = require('node:assert');

const forge = require('../../src/distribution/forge.js');
const { ENFORCE_VALUES } = require('../../src/governance/lint.js');

const ALL = ['status-check', 'hook', 'codeowner', 'ruleset'];

function gate(over = {}) {
  return { enforce: ALL, level: 'L2', slug: 'gate-all', type: 'gate', ...over };
}

/** An in-memory FileSystem port that records every write. */
function memoryPort(seed = {}) {
  const files = new Map(Object.entries(seed));
  const dirs = [];
  return {
    dirs,
    files,
    fs: {
      exists: (p) => files.has(p),
      mkdirp: (p) => dirs.push(p),
      readFile: (p) => {
        if (!files.has(p)) throw new Error(`no ${p}`);
        return files.get(p);
      },
      writeFile: (p, data) => files.set(p, String(data)),
    },
  };
}

test('the four values and their targets are exactly AGSC-08-12\'s, and the list is shared', () => {
  assert.deepStrictEqual(Object.keys(forge.TARGETS).sort(), [...ALL].sort());
  assert.deepStrictEqual(forge.TARGETS, {
    codeowner: 'CODEOWNERS',
    hook: 'pre-commit',
    ruleset: 'ruleset.json',
    'status-check': 'status-checks.json',
  });
  // The closed set is stated once, in the Governance context (AGSC-08 is its rule).
  assert.deepStrictEqual([...ENFORCE_VALUES].sort(), Object.keys(forge.TARGETS).sort());
  assert.strictEqual(forge.FORGE_DIR, 'dist/forge');
});

test('AGSC-08-09: the check names a gate item implies, by level and by declaration', () => {
  assert.deepStrictEqual(forge.checkNames([gate({ level: 'L1' })]), ['links', 'schema']);
  assert.deepStrictEqual(forge.checkNames([gate({ level: 'L2' })]),
    ['determinism', 'links', 'provenance', 'review', 'schema']);
  // A declared `checks[]` is the set, "one per value", and is not widened by the level.
  assert.deepStrictEqual(forge.checkNames([gate({ checks: ['review', 'links'], level: 'L2' })]),
    ['links', 'review']);
  // Two gate items union, without repetition, in code-point order.
  assert.deepStrictEqual(forge.checkNames([gate({ checks: ['review'] }), gate({ checks: ['links'] })]),
    ['links', 'review']);
  // Nothing but a `gate` item contributes.
  assert.deepStrictEqual(forge.checkNames([{ type: 'concept', checks: ['review'] }, null, 'x']), []);
  assert.deepStrictEqual(forge.checkNames(undefined), []);
});

test('AGSC-08-12: status-checks.json is the JCS array of those names, byte for byte', () => {
  const files = forge.compile([gate({ enforce: ['status-check'], level: 'L2' })], {});
  assert.deepStrictEqual([...files.keys()], ['status-checks.json']);
  assert.strictEqual(files.get('status-checks.json'),
    '["determinism","links","provenance","review","schema"]\n');
});

test('AGSC-08-12: only the values a Bundle enforces are compiled, and the map is path-ordered', () => {
  assert.deepStrictEqual([...forge.compile([gate({ enforce: ['ruleset', 'hook'] })], {}).keys()],
    ['pre-commit', 'ruleset.json']);
  assert.deepStrictEqual([...forge.compile([gate({ enforce: [] })], {}).keys()], []);
  assert.deepStrictEqual([...forge.compile([{ type: 'concept', slug: 'c' }], {}).keys()], []);
  assert.deepStrictEqual([...forge.compile([gate()], {}).keys()],
    ['CODEOWNERS', 'pre-commit', 'ruleset.json', 'status-checks.json']);
});

test('AGSC-07-15: the hook is the ONE executable, and no other artefact carries a shebang', () => {
  const files = forge.compile([gate()], {});
  assert.ok(files.get('pre-commit').startsWith('#!/bin/sh\n'));
  for (const [name, text] of files) {
    if (name === 'pre-commit') continue;
    assert.ok(!text.startsWith('#!'), `${name} carries a shebang`);
  }
  // AGSC-08-27/08-30: the hook reaches no model call — it runs `agsc lint` and stops.
  assert.match(files.get('pre-commit'), /\nagsc lint\n/u);
  assert.ok(!/curl|wget|http/u.test(files.get('pre-commit')), 'the hook reaches the network');
});

test('CODEOWNERS takes channels[].owner, else the bundle.operator identifier, else nothing', () => {
  const withChannels = forge.compile([gate({ enforce: ['codeowner'] })], {
    channels: [{ name: 'b', owner: 'zeta' }, { name: 'a', owner: 'alpha' }, { name: 'c' }],
  }).get('CODEOWNERS');
  assert.match(withChannels, /\n\* @alpha @zeta\n/u);
  const withOperator = forge.compile([gate({ enforce: ['codeowner'] })], {
    bundle: { operator: 'human:andreibesleaga' },
  }).get('CODEOWNERS');
  assert.match(withOperator, /\n\* @andreibesleaga\n/u);
  const withNeither = forge.compile([gate({ enforce: ['codeowner'] })], {}).get('CODEOWNERS');
  assert.match(withNeither, /No owner is declared/u);
  assert.ok(!withNeither.includes('* @'), 'an owner was invented');
  // An actor string that is not `human:<id>` supplies no login (AGSC-01-25).
  assert.match(forge.compile([gate({ enforce: ['codeowner'] })], { bundle: { operator: 'agent:x/1' } })
    .get('CODEOWNERS'), /No owner is declared/u);
  assert.deepStrictEqual(forge.owners(undefined), []);
});

test('ruleset.json is JCS-canonical and carries the same check names', () => {
  const text = forge.compile([gate({ enforce: ['ruleset'], level: 'L1' })], {}).get('ruleset.json');
  assert.strictEqual(text, '{"enforcement":"active","name":"agsc",'
    + '"rules":{"required_status_checks":["links","schema"]},"target":"branch"}\n');
  assert.deepStrictEqual(JSON.parse(text).rules.required_status_checks, ['links', 'schema']);
});

test('AGSC-04-01: compiling twice produces the same bytes, whatever the item order', () => {
  const a = forge.compile([gate({ slug: 'g1', checks: ['review'] }), gate({ slug: 'g2', checks: ['links'] })], {});
  const b = forge.compile([gate({ slug: 'g2', checks: ['links'] }), gate({ slug: 'g1', checks: ['review'] })], {});
  assert.deepStrictEqual([...a.entries()], [...b.entries()]);
});

test('AGSC-08-12: write() puts the artefacts under dist/forge/ and nowhere else', () => {
  const port = memoryPort();
  const result = forge.write([gate()], { bundle: { operator: 'human:x' } }, port);
  assert.deepStrictEqual(result.written.sort(), [
    'dist/forge/CODEOWNERS', 'dist/forge/pre-commit',
    'dist/forge/ruleset.json', 'dist/forge/status-checks.json',
  ]);
  assert.deepStrictEqual(result.drift, []);
  assert.deepStrictEqual(result.findings, []);
  for (const written of result.written) {
    assert.ok(written.startsWith('dist/forge/'), written);
    assert.ok(!written.startsWith('www/') && !written.startsWith('content/'), written);
  }
  assert.deepStrictEqual([...new Set(port.dirs)], ['dist/forge']);
});

test('AGSC-08-12: a second run over its own output writes nothing — idempotence', () => {
  const port = memoryPort();
  forge.write([gate()], {}, port);
  const second = forge.write([gate()], {}, port);
  assert.deepStrictEqual(second.written, []);
  assert.deepStrictEqual(second.drift, []);
  assert.deepStrictEqual(second.findings, []);
});

test('AGSC-08-12 / AGSC-E707: a hand-edited artefact is reported and NOT overwritten', () => {
  const port = memoryPort({ 'dist/forge/status-checks.json': '["something a person wrote"]\n' });
  const result = forge.write([gate({ enforce: ['status-check'] })], {}, port);
  assert.deepStrictEqual(result.written, []);
  assert.deepStrictEqual(result.drift, ['dist/forge/status-checks.json']);
  assert.strictEqual(result.findings.length, 1);
  assert.strictEqual(result.findings[0].code, 'AGSC-E707');
  assert.strictEqual(result.findings[0].severity, 'error');
  assert.match(result.findings[0].message, /AGSC-08-12/u);
  assert.match(result.findings[0].message, /NOT overwritten/u);
  assert.strictEqual(port.files.get('dist/forge/status-checks.json'), '["something a person wrote"]\n');
});

test('write() is total: no port, no writable port and an unreadable existing file', () => {
  assert.deepStrictEqual(forge.write([gate()], {}, undefined).written, []);
  assert.deepStrictEqual(forge.write([gate()], {}, { fs: {} }).written, []);
  const hostile = {
    fs: {
      exists: () => true,
      mkdirp: () => {},
      readFile: () => { throw new Error('unreadable'); },
      writeFile: () => {},
    },
  };
  // Unreadable is treated as absent, so the artefact is written rather than the run
  // failing on a file the port cannot show us.
  assert.strictEqual(forge.write([gate({ enforce: ['hook'] })], {}, hostile).written.length, 1);
});

test('AGSC-08-12: an enforce[] value with no compilation target is AGSC-E707', () => {
  const result = forge.write([gate({ enforce: ['status-check', 'x-forge-thing'] })], {}, memoryPort());
  const codes = result.findings.map((f) => f.code);
  assert.deepStrictEqual(codes, ['AGSC-E707']);
  assert.match(result.findings[0].message, /"x-forge-thing"/u);
  // The value it CAN compile is still compiled — one bad value does not stop the rest.
  assert.deepStrictEqual(result.written, ['dist/forge/status-checks.json']);
});

test('enforcedValues is the union over gate items, code-point ordered, and total', () => {
  assert.deepStrictEqual(forge.enforcedValues([gate({ enforce: ['ruleset'] }), gate({ enforce: ['hook', 'ruleset'] })]),
    ['hook', 'ruleset']);
  assert.deepStrictEqual(forge.enforcedValues([{ type: 'gate', enforce: 'hook' }]), []);
  assert.deepStrictEqual(forge.enforcedValues([null, undefined, 3]), []);
  assert.deepStrictEqual(forge.enforcedValues(null), []);
});

test('AGSC-08-12: lint itself reports an enforce[] value it cannot compile', () => {
  // eslint-disable-next-line global-require
  const govLint = require('../../src/governance/lint.js');
  const gateItem = (enforce) => ({
    body: 'Body.\n',
    frontmatter: { enforce, level: 'L2', title: 'A gate', type: 'gate' },
    path: 'content/gates/g.md',
    slug: 'g',
    type: 'gate',
  });
  const codes = (items) => govLint.checkEnforce(items).map((f) => f.code);
  assert.deepStrictEqual(codes([gateItem(['status-check', 'hook'])]), []);
  assert.deepStrictEqual(codes([gateItem(['x-forge-thing'])]), ['AGSC-E707']);
  const one = govLint.checkEnforce([gateItem(['x-forge-thing'])])[0];
  assert.strictEqual(one.severity, 'error');
  assert.strictEqual(one.file, 'content/gates/g.md');
  assert.match(one.message, /AGSC-08-12/u);
  // Non-strings, a non-array `enforce`, a non-gate item and a malformed list are all
  // silent here: the schema's own enum is what refuses them (AGSC-E203).
  assert.deepStrictEqual(codes([gateItem([3, null])]), []);
  assert.deepStrictEqual(codes([gateItem('hook')]), []);
  assert.deepStrictEqual(codes([{ frontmatter: { enforce: ['x-y'], type: 'concept' }, path: 'p', slug: 'c', type: 'concept' }]), []);
  assert.deepStrictEqual(codes(undefined), []);
  // And the whole lint lane carries the finding, not only the check.
  const all = govLint.lint({ items: [gateItem(['x-forge-thing'])] }).map((f) => f.code);
  assert.ok(all.includes('AGSC-E707'), all.join(','));
});
