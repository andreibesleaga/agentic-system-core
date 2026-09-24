'use strict';
// AGSC-06-10 and AGSC-06-35 as amended at rc.6 (W-2):
// the IANA-registered `cite-as` (RFC 8574) is admitted for a related-system link,
// and `https://w3id.org/agentic-system-core/rel#signature` joins the extension
// relations. The engine held four hard-coded copies of the older lists — the
// discovery writer's checker, the federation reader's `related[]` check, and the
// independent `tools/validate-wellknown` — so a configuration naming `cite-as`
// was refused by the shipped engine although the rule and the schema admit it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const discovery = require('../../src/distribution/discovery.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');
const federation = require('../../src/boundary/federation.js');

const REPO = path.resolve(__dirname, '..', '..');
const REL = 'https://w3id.org/agentic-system-core/rel#';
const BASE = 'https://example.org/';
const DIGEST = 'sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:';

const CITE = { href: 'https://doi.org/10.5281/zenodo.1', type: 'text/html' };
const SIGNATURE = { href: `${BASE}.well-known/knowledge-linkset.sig`, type: 'application/octet-stream' };

function level2(extra) {
  return {
    linkset: [{
      anchor: BASE,
      describedby: [{
        'agsc-bundle-hash': [DIGEST],
        'agsc-bundle-version': ['v1.0.0'],
        'agsc-counts': ['clusters=0', 'concepts=1', 'episodes=0', 'gates=0', 'lessons=0', 'procedures=0'],
        'agsc-generated-at': ['2026-09-16T00:00:00Z'],
        'agsc-spec-version': ['1.0.0-rc.6'],
        digest: [DIGEST],
        href: `${BASE}graph.jsonld`,
        type: 'application/ld+json',
      }],
      license: [{ href: `${BASE}legal/` }],
      ...extra,
    }],
  };
}

function validateWellknown(doc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-rel-'));
  fs.mkdirSync(path.join(dir, '.well-known'));
  const at = path.join(dir, '.well-known', 'knowledge-linkset');
  fs.writeFileSync(at, `${canonicalize(doc)}\n`);
  fs.writeFileSync(path.join(dir, 'graph.jsonld'), ''); // the digest above is SHA-256 of zero bytes
  const run = spawnSync(process.execPath,
    [path.join(REPO, 'tools', 'validate-wellknown'), at, '--level', '2', '--json'], { encoding: 'utf8' });
  fs.rmSync(dir, { force: true, recursive: true });
  return JSON.parse(run.stdout.split('\n').filter(Boolean).pop());
}

test('the relation tables name cite-as and signature (AGSC-06-10, AGSC-06-35)', () => {
  assert.ok(discovery.REGISTERED_RELATIONS.includes('cite-as'));
  assert.ok(discovery.RELATED_RELATIONS.includes('cite-as'));
  assert.ok(discovery.EXTENSION_RELATIONS.includes('signature'));
  assert.ok(discovery.ALLOWED_RELATIONS.includes(`${REL}signature`));
  assert.ok(federation.RELATED_RELATIONS.includes('cite-as'));
});

test('a configured cite-as link is written, and the writer\'s own checker accepts it', () => {
  const config = { related: [{ href: CITE.href, rel: 'cite-as', type: 'text/html' }], site: { base: BASE } };
  const doc = discovery.linkset(config, { level: 0 });
  assert.deepStrictEqual(doc.linkset[0]['cite-as'].map((l) => l.href), [CITE.href]);
  assert.deepStrictEqual(federation.checkRelated(config), []);
  assert.deepStrictEqual(discovery.check(level2({ 'cite-as': [CITE], [`${REL}signature`]: [SIGNATURE] })), []);
  assert.ok(discovery.check(level2({ [`${REL}signed`]: [SIGNATURE] })).some((f) => f.code === 'AGSC-E209'));
});

test('tools/validate-wellknown accepts cite-as and rel#signature, and still requires type on cite-as', () => {
  const ok = validateWellknown(level2({ 'cite-as': [CITE], [`${REL}signature`]: [SIGNATURE] }));
  assert.strictEqual(ok.status, 'pass', JSON.stringify(ok.findings));
  const untyped = validateWellknown(level2({ 'cite-as': [{ href: CITE.href }] }));
  assert.ok(untyped.findings.some((f) => f.code === 'AGSC-E209' && /cite-as/u.test(f.message)),
    JSON.stringify(untyped.findings));
  const unknown = validateWellknown(level2({ [`${REL}signed`]: [SIGNATURE] }));
  assert.ok(unknown.findings.some((f) => f.code === 'AGSC-E209'));
});
