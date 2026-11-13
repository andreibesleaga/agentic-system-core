'use strict';
// verifies AGSC-06-34, AGSC-06-42
// Steps of features/persona-c-agent-mcp.feature for an A2A client and a catalogue crawler: a node
// that declares the `a2a-card` surface without a `responder` publishes no card and its build is
// refused with AGSC-E210 (AGSC-06-07); with only an MCP responder no card is published, an MCP
// endpoint not being an A2A interface, and the build warns AGSC-E210 (AGSC-11-21); with an A2A
// responder the card is published and the official A2A
// SDK (`@a2a-js/sdk`) reads it back unchanged (AGSC-06-34); with `discovery.ai_catalog` the two
// catalogue files carry the SHA-256 of the card and of the discovery document the build wrote
// (AGSC-06-42). The shipped `validate-wellknown` resolves the `a2a-card` target on the node's own
// origin and warns AGSC-E210 when the declared card is not served (AGSC-11-16).

const assert = require('node:assert');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { AgentCard } = require('@a2a-js/sdk');

const CARD = { access: 'none', surface: 'a2a-card', target: 'https://agenticsystemcore.com/.well-known/agent-card.json', version: '1.0' };

/** Merge `patch` into the Bundle's configuration. */
function configure(world, patch) {
  const config = JSON.parse(world.read('agsc.config.json'));
  world.write('agsc.config.json', `${JSON.stringify({ ...config, ...patch }, null, 2)}\n`);
}

/** The AGSC-E210 findings of the shipped validate-wellknown, at Level 1, about the a2a-card target. */
function cardTargetFindings(world) {
  const run = world.tool('validate-wellknown', [path.join(world.dir, 'www', '.well-known', 'knowledge-linkset'), '--level', '1', '--json']);
  assert.strictEqual(run.exit, 0, run.stdout + run.stderr);
  return JSON.parse(run.stdout).findings.filter((f) => f.code === 'AGSC-E210' && f.message.includes('a2a-card'));
}

const hex = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

module.exports = [
  {
    pattern: 'the configuration declares the a2a-card surface and no responder',
    run(world) {
      configure(world, { surfaces: [CARD] });
    },
  },
  {
    pattern: /^the configuration declares an MCP responder "([^"]+)" beside the a2a-card surface$/u,
    run(world, target) {
      configure(world, { surfaces: [{ access: 'consent', surface: 'responder', target, version: 'mcp:2026-07-28' }, CARD] });
    },
  },
  {
    pattern: /^the configuration declares a responder "([^"]+)" beside the a2a-card surface and switches discovery\.ai_catalog on$/u,
    run(world, target) {
      configure(world, {
        discovery: { ai_catalog: true },
        surfaces: [{ access: 'consent', binding: 'HTTP+JSON', surface: 'responder', target, version: 'a2a:1.0' }, CARD],
      });
    },
  },
  {
    pattern: /^the official A2A SDK reads "([^"]+)" back unchanged, with one skill for each skill pack$/u,
    run(world, rel) {
      const card = JSON.parse(world.read(rel));
      assert.deepStrictEqual({ skills: [], ...AgentCard.toJSON(AgentCard.fromJSON(card)) }, card);
      const packs = JSON.parse(world.read('www/skills/index.json')).packs;
      assert.ok(packs.length > 0, 'the acceptance Bundle publishes skill packs');
      assert.deepStrictEqual(card.skills.map((s) => s.id), packs.map((p) => p.name));
    },
  },
  {
    pattern: 'the discovery file declares no a2a-card, so the shipped validate-wellknown has no a2a-card target to warn about (AGSC-11-16)',
    run(world) {
      assert.ok(!world.read('www/.well-known/knowledge-linkset').includes('"a2a-card"'), 'the card is not declared');
      assert.deepStrictEqual(cardTargetFindings(world), []);
    },
  },
  {
    pattern: 'the shipped validate-wellknown finds the a2a-card target of the discovery file served',
    run(world) {
      assert.deepStrictEqual(cardTargetFindings(world), []);
    },
  },
  {
    pattern: /^the entries of "([^"]+)" and "([^"]+)" carry the SHA-256 of the card and of the discovery document as built$/u,
    run(world, catalogue, ard) {
      const want = [hex(world.read('www/.well-known/agent-card.json')), hex(world.read('www/.well-known/knowledge-linkset'))];
      assert.deepStrictEqual(JSON.parse(world.read(catalogue)).entries.map((e) => e.digest), want);
      assert.deepStrictEqual(JSON.parse(world.read(ard)).entries.map((e) => e.metadata.digest), want);
    },
  },
];
