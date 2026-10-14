'use strict';
// AGSC-08-01 / AGSC-02-05 / AGSC-01-18: a key named like a member of JavaScript's
// object prototype is a key like any other.
//
// Before the fix:
//   (a) a frontmatter key `__proto__` was copied by plain assignment, which SET the
//       copy's prototype: an item with no `prov` of its own and a `__proto__: {prov: …}`
//       block passed lint and build with 0 findings, and the page carried no
//       provenance at all. It is now an own key, so the missing `prov` is `AGSC-E501`
//       and the key itself is a malformed key name (`AGSC-E204`, AGSC-02-05).
//   (b) `agsc.config.json` (and the user configuration) was merged by plain
//       assignment, so `{"__proto__": {"x": 1}}` wrote into `Object.prototype` of the
//       engine process and every verb then died with an internal error. The merge now
//       skips `__proto__`, `constructor` and `prototype`, and lint reports the key as
//       `AGSC-E004` (configuration is closed, AGSC-01-18).
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { agsc, codes, scratch, writeConfig } = require('./_bundle-run.js');
const validate = require('../../../src/knowledge/validate.js');
const { load } = require('../../../src/application/config/load.js');

const ITEM = path.join('content', 'concepts', 'handoff.md');
const OWN_PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';

function protoProv(dir) {
  const file = path.join(dir, ITEM);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(OWN_PROV));
  fs.writeFileSync(file, text.replace(OWN_PROV,
    '__proto__:\n  prov:\n    origin: human\n    operator: human:someone-else\n'));
}

test('(a) a frontmatter __proto__ block does not stand in for a missing prov (lint)', async (t) => {
  const dir = scratch(t);
  protoProv(dir);
  const r = await agsc(dir, ['lint', '--json']);
  const own = r.findings.filter((f) => f.file === 'content/concepts/handoff.md').map((f) => f.code);
  assert.ok(own.includes('AGSC-E501'), `prov is missing: ${JSON.stringify(r.findings)}`);
  assert.ok(own.includes('AGSC-E204'), `__proto__ is a malformed key name: ${JSON.stringify(r.findings)}`);
  assert.notEqual(r.exit, 0);
});

test('(a) build and ci refuse the same item', async (t) => {
  const dir = scratch(t);
  protoProv(dir);
  for (const verb of ['build', 'ci']) {
    const r = await agsc(dir, [verb, '--json']);
    assert.ok(codes(r).includes('AGSC-E501'), `${verb}: ${JSON.stringify(r.findings)}`);
    assert.notEqual(r.exit, 0, verb);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'a build with an error writes nothing');
});

test('(a) applyTypes keeps a __proto__ key as an own key and never sets a prototype', () => {
  const parsed = JSON.parse('{"title":"T","__proto__":{"prov":{"origin":"human"}}}');
  const typed = validate.applyTypes(parsed, { type: 'object', properties: {} });
  assert.equal(Object.getPrototypeOf(typed), Object.prototype);
  assert.ok(Object.prototype.hasOwnProperty.call(typed, '__proto__'));
  assert.equal(typed.prov, undefined);
  assert.deepEqual(Object.keys(typed), ['title', '__proto__']);
});

test('(b) a __proto__ member in agsc.config.json pollutes nothing and is AGSC-E004', async (t) => {
  const dir = scratch(t);
  const text = fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')
    .replace('{\n', '{\n  "__proto__": {"pollutedByConfig": "yes"},\n');
  writeConfig(dir, text);
  const r = await agsc(dir, ['lint', '--json']);
  assert.equal(({}).pollutedByConfig, undefined, 'Object.prototype was written');
  assert.doesNotMatch(r.stderr, /internal error/u);
  const e004 = r.findings.filter((f) => f.code === 'AGSC-E004');
  assert.ok(e004.some((f) => f.key === '__proto__'), JSON.stringify(r.findings));
  assert.equal(r.exit, 2);
});

test('(b) load() skips __proto__, constructor and prototype in every layer', () => {
  const project = JSON.parse('{"__proto__":{"a":1},"site":{"constructor":{"prototype":{"b":2}},"title":"T"}}');
  const user = JSON.parse('{"__proto__":{"c":3},"build":{"prototype":{"d":4}}}');
  const loaded = load({ projectConfig: project, userConfig: user });
  for (const name of ['a', 'b', 'c', 'd']) assert.equal(({})[name], undefined, `Object.prototype.${name}`);
  assert.equal(Object.getPrototypeOf(loaded.config), Object.prototype);
  assert.equal(loaded.config.site.title, 'T');
  assert.equal(typeof loaded.config.site.constructor, 'function', 'site.constructor is still the inherited one');
  assert.ok(!Object.keys(loaded.sources).some((p) => /(^|\.)(__proto__|constructor|prototype)(\.|$)/u.test(p)));
});
