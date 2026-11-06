'use strict';
// tests/distribution/a2a-card.test.js — AGSC-06-34 with AGSC-06-07: the Agent2Agent agent card.
//
//   * The emitted card is read back by the official A2A SDK (`@a2a-js/sdk` 1.3.0): its codec
//     loses nothing, so every member is one A2A 1.0 defines; every member A2A 1.0 §4.4.1 requires
//     is present, `tags` on every skill (§4.4.5), and `url`, `protocolBinding`, `protocolVersion`
//     on every interface (§4.4.6) (the lists re-read on 2026-11-07).
//   * No card without both declarations; a card without a responder is AGSC-E210; a local MCP tool
//     server makes no node eligible.
//   * The build loads the card module, and the SDK with it, only for a node that declares a card.
//   * fast-check: the card keeps the packs' and the responders' order and is the same bytes twice.
//
// Deterministic: no clock, no network, fixed seed.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fc = require('fast-check');
const { AgentCard } = require('@a2a-js/sdk');

const card = require('../../src/distribution/a2a-card.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');

/** A2A 1.0 §4.4.1, §4.4.5, §4.4.6: the members marked required. */
const REQUIRED_CARD = ['capabilities', 'defaultInputModes', 'defaultOutputModes', 'description', 'name', 'skills', 'supportedInterfaces', 'version'];
const REQUIRED_SKILL = ['description', 'id', 'name', 'tags'];
const REQUIRED_INTERFACE = ['protocolBinding', 'protocolVersion', 'url'];

const RESPONDER = { access: 'consent', binding: 'HTTP+JSON', surface: 'responder', target: 'https://a.example/a2a', version: 'a2a:1.0' };
const CARD = { access: 'none', surface: 'a2a-card', target: 'https://a.example/.well-known/agent-card.json', version: '1.0' };
const PACKS = [{ description: 'Recurring shapes.', name: 'agent-patterns' }, { description: 'How a worker hands work back.', name: 'hand-back' }];
const input = (extra = {}) => ({
  bundleVersion: 'v1.4.0', description: 'A node.', packs: PACKS, specVersion: '1.1.0', surfaces: [RESPONDER, CARD], title: 'Example Node', ...extra,
});

test('AGSC-06-34: the official A2A SDK reads the card back unchanged, and it carries every member A2A 1.0 requires', () => {
  for (const packs of [PACKS, []]) {
    const text = card.cardBytes(input({ packs }));
    assert.ok(text.endsWith('}\n') && !text.endsWith('\n\n'));
    const value = JSON.parse(text);
    assert.equal(text, `${canonicalize(value)}\n`, 'JCS with one LF');
    const read = AgentCard.toJSON(AgentCard.fromJSON(value));
    // The codec leaves an empty `skills` out (the protobuf JSON mapping); A2A 1.0 requires it.
    assert.deepEqual({ skills: [], ...read }, value, 'the SDK keeps every member: none is outside A2A 1.0');
    assert.deepEqual(Object.keys(value).sort(), REQUIRED_CARD, 'exactly the required members');
    for (const skill of value.skills) assert.deepEqual(Object.keys(skill).sort(), REQUIRED_SKILL);
    for (const one of value.supportedInterfaces) assert.deepEqual(Object.keys(one).sort(), REQUIRED_INTERFACE);
    assert.deepEqual(value.capabilities, {});
  }
});

test('AGSC-06-34: the members come from the configuration and the build, as the rule says', () => {
  const value = JSON.parse(card.cardBytes(input({ surfaces: [{ ...RESPONDER, binding: undefined }, CARD] })));
  assert.equal(value.supportedInterfaces[0].protocolBinding, 'JSONRPC', 'the default binding');
  assert.equal(value.supportedInterfaces[0].protocolVersion, '1.0', 'the version declared for a2a-card');
  assert.deepEqual(value.skills.map((s) => s.tags), [['knowledge', 'skill-pack'], ['knowledge', 'skill-pack']]);
  assert.equal(JSON.parse(card.cardBytes(input({ visibility: 'restricted' }))).version, '1.1.0', 'the spec version when restricted');
  assert.equal(JSON.parse(card.cardBytes(input({ description: '', tagline: 'A tagline.' }))).description, 'A tagline.');
  assert.equal(JSON.parse(card.cardBytes(input({ description: null, tagline: null }))).description, 'Example Node');
});

test('AGSC-06-07: no card without both declarations; a card without an endpoint is AGSC-E210', () => {
  assert.equal(card.cardBytes(input({ surfaces: [CARD] })), null);
  assert.equal(card.cardBytes(input({ surfaces: [RESPONDER] })), null);
  assert.equal(card.cardBytes(input({ surfaces: [] })), null);
  assert.deepEqual(card.cardFindings([CARD]).map((f) => [f.code, f.severity]), [['AGSC-E210', 'error']]);
  assert.deepEqual(card.cardFindings([RESPONDER]), []);
  assert.deepEqual(card.cardFindings([RESPONDER, CARD]), []);
  assert.equal(card.eligible([{ surface: 'mcp', target: 'https://a.example/specs/mcp/' }, CARD]), false, 'a tool server is not an A2A endpoint');
});

test('the build loads the card module and the A2A SDK only for a node that declares a card', () => {
  const root = path.resolve(__dirname, '..', '..');
  const probe = `const wk = require('./src/distribution/well-known.js');
    const loaded = () => Object.keys(require.cache).some((f) => f.includes('@a2a-js'));
    const base = { bundleVersion: 'v', config: { site: { base: 'https://a.example/', title: 'T' }, surfaces: [] }, specVersion: '1.1.0' };
    const before = wk.agentCard(base).text === null && !loaded();
    wk.agentCard({ ...base, config: { ...base.config, surfaces: ${JSON.stringify([RESPONDER, CARD])} } });
    process.stdout.write(JSON.stringify([before, loaded()]));`;
  const run = spawnSync(process.execPath, ['-e', probe], { cwd: root, encoding: 'utf8' });
  assert.equal(run.stdout, '[true,true]', run.stderr);
});

test('property: the card keeps the order of the packs and of the responders, and is the same bytes twice', () => {
  const name = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/u);
  fc.assert(fc.property(fc.uniqueArray(name, { maxLength: 5 }), fc.uniqueArray(name, { minLength: 1, maxLength: 3 }), (packs, hosts) => {
    const responders = hosts.map((host) => ({ ...RESPONDER, target: `https://${host}.example/a2a` }));
    const one = input({ packs: packs.map((n) => ({ description: `About ${n}.`, name: n })), surfaces: [...responders, CARD] });
    const text = card.cardBytes(one);
    assert.equal(card.cardBytes(one), text);
    const value = JSON.parse(text);
    assert.deepEqual(value.skills.map((s) => s.id), packs);
    assert.deepEqual(value.supportedInterfaces.map((i) => i.url), responders.map((r) => r.target));
  }), { numRuns: 50, seed: 20261107 });
});
