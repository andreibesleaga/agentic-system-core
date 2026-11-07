'use strict';
// verifies AGSC-06-34, AGSC-06-42
// Steps of features/persona-c-agent-mcp.feature for an A2A client and a catalogue crawler: a node
// that declares the `a2a-card` surface without a `responder` publishes no card and its build is
// refused with AGSC-E210 (AGSC-06-07); with only an MCP responder no card is published, an MCP
// endpoint not being an A2A interface, and the build warns AGSC-E210 (AGSC-11-21); with an A2A
// responder the card is published and the official A2A
// SDK (`@a2a-js/sdk`) reads it back unchanged (AGSC-06-34); with `discovery.ai_catalog` the two
// catalogue files carry the SHA-256 of the card and of the discovery document the build wrote
// (AGSC-06-42).

const assert = require('node:assert');
const { createHash } = require('node:crypto');
const { AgentCard } = require('@a2a-js/sdk');

const CARD = { access: 'none', surface: 'a2a-card', target: 'https://agenticsystemcore.com/.well-known/agent-card.json', version: '1.0' };

/** Merge `patch` into the Bundle's configuration. */
function configure(world, patch) {
  const config = JSON.parse(world.read('agsc.config.json'));
  world.write('agsc.config.json', `${JSON.stringify({ ...config, ...patch }, null, 2)}\n`);
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
    pattern: /^the entries of "([^"]+)" and "([^"]+)" carry the SHA-256 of the card and of the discovery document as built$/u,
    run(world, catalogue, ard) {
      const want = [hex(world.read('www/.well-known/agent-card.json')), hex(world.read('www/.well-known/knowledge-linkset'))];
      assert.deepStrictEqual(JSON.parse(world.read(catalogue)).entries.map((e) => e.digest), want);
      assert.deepStrictEqual(JSON.parse(world.read(ard)).entries.map((e) => e.metadata.digest), want);
    },
  },
];
