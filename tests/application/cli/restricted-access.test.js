'use strict';
// verifies AGSC-11-20, AGSC-01-18, AGSC-06-08
// A restricted node names the page where a reader obtains credentials in the
// configuration's top-level `access` key (an absolute `https:` URL, read only when
// `visibility` is `restricted`). The configuration check that `lint`, `build` and `ci`
// share reports a restricted configuration that names none as `AGSC-E202`, so no
// restricted node is built without its one `…/rel#access` link; the build emits that
// link exactly once, to the page named. A public node may carry the key; nothing reads
// it there.
//
// Over scratch copies of `tests/fixtures/minimal`, in process, with a fixed instant
// and no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { agsc, codes, scratch, writeConfig } = require('./_bundle-run.js');
const validate = require('../../../src/knowledge/validate.js');
const discovery = require('../../../src/distribution/discovery.js');
const { readSchemas } = require('../../../src/adapters/node-fs.js');

const S = validate.schemas(readSchemas());
const ACCESS = 'https://minimal.example/access/';
const REL_ACCESS = `${discovery.REL}access`;
const BASE = {
  bundle: { id: 'minimal' },
  site: { base: 'https://minimal.example/', title: 'Minimal Bundle' },
  spec_version: '1.0.0-rc.7',
};

/** The findings of the configuration check alone. */
const configFindings = (config) => validate.config(config, { schemas: S });

/** The link context of the discovery document a build wrote under `www/`. */
function builtContext(dir) {
  const file = path.join(dir, 'www', '.well-known', 'knowledge-linkset');
  return JSON.parse(fs.readFileSync(file, 'utf8')).linkset[0];
}

test('AGSC-01-18 / AGSC-11-20: the configuration admits a top-level access URL on a restricted node', () => {
  assert.deepStrictEqual(configFindings({ ...BASE, access: ACCESS, visibility: 'restricted' }), []);
});

test('AGSC-11-20: a restricted configuration that names no access page is AGSC-E202, naming the key', () => {
  const findings = configFindings({ ...BASE, visibility: 'restricted' });
  assert.deepStrictEqual(findings.map((f) => [f.code, f.severity, f.key]), [['AGSC-E202', 'error', 'access']]);
  assert.match(findings[0].message, /restricted/u);
  assert.match(findings[0].message, /AGSC-11-20/u);
  // An empty string names no page either; the schema refuses it as a pattern fault.
  assert.ok(configFindings({ ...BASE, access: '', visibility: 'restricted' }).some((f) => f.code === 'AGSC-E204'));
});

test('AGSC-11-20: the access page is an absolute https URL; anything else is a pattern fault, AGSC-E204', () => {
  for (const value of ['http://minimal.example/access/', '/access/', ['mailto:owner', 'minimal.example'].join('@'), 'https://']) {
    const found = configFindings({ ...BASE, access: value, visibility: 'restricted' }).map((f) => f.code);
    assert.ok(found.includes('AGSC-E204'), `${JSON.stringify(value)} gave ${JSON.stringify(found)}`);
  }
  assert.deepStrictEqual(configFindings({ ...BASE, access: 7, visibility: 'restricted' }).map((f) => f.code), ['AGSC-E201']);
});

test('AGSC-11-20: a public node may name an access page; nothing reads it there', () => {
  assert.deepStrictEqual(configFindings({ ...BASE, access: ACCESS }), []);
  assert.deepStrictEqual(configFindings({ ...BASE, access: ACCESS, visibility: 'public' }), []);
  assert.deepStrictEqual(configFindings(BASE), [], 'a public node with no access page is not a fault');
  const context = discovery.linkset({ ...BASE, access: ACCESS }, {}).linkset[0];
  assert.ok(!(REL_ACCESS in context), 'a public node carries an access link');
});

test('AGSC-11-20: lint passes a restricted node that names its access page, and reports one that does not', async (t) => {
  const dir = scratch(t, 'agsc-restricted-');
  writeConfig(dir, (c) => ({ ...c, access: ACCESS, visibility: 'restricted' }));
  const named = await agsc(dir, ['lint', '--json']);
  assert.strictEqual(named.exit, 0, named.stdout + named.stderr);
  assert.deepStrictEqual(codes(named).filter((c) => c === 'AGSC-E004' || c === 'AGSC-E202'), []);

  writeConfig(dir, (c) => {
    delete c.access;
    return c;
  });
  const none = await agsc(dir, ['lint', '--json']);
  assert.strictEqual(none.exit, 1, none.stdout + none.stderr);
  // The envelope on stdout lists each finding once (stderr repeats it as a line).
  const e202 = JSON.parse(none.stdout).findings.filter((f) => f.code === 'AGSC-E202');
  assert.strictEqual(e202.length, 1, JSON.stringify(none.findings));
  assert.strictEqual(e202[0].file, 'agsc.config.json');
});

test('AGSC-11-20 / AGSC-06-08: a restricted build carries exactly one access link, to the page named', async (t) => {
  const dir = scratch(t, 'agsc-restricted-');
  writeConfig(dir, (c) => ({ ...c, access: ACCESS, visibility: 'restricted' }));
  const run = await agsc(dir, ['build', '--json']);
  assert.strictEqual(run.exit, 0, run.stdout + run.stderr);
  const context = builtContext(dir);
  assert.deepStrictEqual(context[REL_ACCESS], [{ 'agsc-access': ['credential'], href: ACCESS }]);
  assert.deepStrictEqual(context.describedby[0]['agsc-visibility'], ['restricted']);
});

test('AGSC-11-20: a restricted node that names no access page is not built: AGSC-E202 and nothing written', async (t) => {
  const dir = scratch(t, 'agsc-restricted-');
  writeConfig(dir, (c) => ({ ...c, visibility: 'restricted' }));
  const run = await agsc(dir, ['build', '--json']);
  assert.strictEqual(run.exit, 1, run.stdout + run.stderr);
  assert.ok(run.findings.some((f) => f.code === 'AGSC-E202' && f.file === 'agsc.config.json'), JSON.stringify(run.findings));
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'a restricted node with no access link was written');
  const ci = await agsc(dir, ['ci', '--json']);
  assert.strictEqual(ci.exit, 1, ci.stdout + ci.stderr);
  assert.ok(ci.findings.some((f) => f.code === 'AGSC-E202' && f.key === 'access'), JSON.stringify(ci.findings));
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'ci wrote a restricted node with no access link');
});

test('AGSC-11-20: a public build carries no access link, even when the key is set', async (t) => {
  const dir = scratch(t, 'agsc-restricted-');
  writeConfig(dir, (c) => ({ ...c, access: ACCESS }));
  const run = await agsc(dir, ['build', '--json']);
  assert.strictEqual(run.exit, 0, run.stdout + run.stderr);
  const context = builtContext(dir);
  assert.ok(!(REL_ACCESS in context));
  assert.strictEqual(context.describedby[0]['agsc-visibility'], undefined);
});
