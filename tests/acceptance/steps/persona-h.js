'use strict';
// verifies AGSC-05-04, AGSC-05-04b
// Steps of features/persona-h-memory.feature that run offline.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, linkset } = require('./_world.js');

const envelopeOf = (result) => result.structuredContent;

module.exports = [
  {
    pattern: 'the read path reuses persona-c (MCP) and the write path reuses persona-d (proposer)',
    async run(world) {
      world.bundle();
      const client = await world.mcp();
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      // AGSC-09-13: the read tools of persona-c and the write tools of persona-d are
      // one server's seven tools.
      assert.deepStrictEqual(names, ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search']);
      world.state.client = client;
    },
  },
  {
    pattern: 'an item\'s slug is "a2a" in bundle "agenticsystemcore"',
    run(world) {
      assert.strictEqual(JSON.parse(world.read('agsc.config.json')).bundle.id, 'agenticsystemcore');
      assert.ok(world.exists('content/concepts/a2a.md'));
    },
  },
  {
    pattern: 'documentation shows "memory://agenticsystemcore/a2a"',
    run(world) {
      world.state.alias = 'memory://agenticsystemcore/a2a';
      // The documentation of the form is the specification's own (AGSC-05-04).
      world.state.documented = fs.readFileSync(path.join(ROOT, 'spec', '05-graph.md'), 'utf8');
    },
  },
  {
    pattern: 'it is documented strictly as an alias of "https://agenticsystemcore.com/concepts/a2a/"',
    async run(world) {
      assert.match(world.state.documented,
        /\*\*AGSC-05-04\*\* `memory:\/\/<bundle>\/<slug>` is a documented alias of the item IRI/u);
      const build = world.agsc(['build']);
      assert.strictEqual(build.exit, 0, build.stderr);
      const graph = world.read('www/graph.jsonld');
      assert.ok(graph.includes('"https://agenticsystemcore.com/concepts/a2a/"'), 'the item IRI is the graph subject');
      // The alias and the IRI name the same item.
      const byAlias = envelopeOf(await world.state.client.callTool({ arguments: { slug: world.state.alias }, name: 'read' }));
      assert.strictEqual(byAlias.type, 'item', JSON.stringify(byAlias));
      assert.strictEqual(byAlias.body.iri, 'https://agenticsystemcore.com/concepts/a2a/');
      assert.strictEqual(byAlias.body.slug, 'a2a');
    },
  },
  {
    pattern: 'no code path resolves a "memory://" URI over the network or filesystem',
    async run(world) {
      // AGSC-05-04: never an RDF subject and never on a published surface as an IRI.
      for (const file of ['www/graph.jsonld', 'www/graph.ttl', 'www/graph.nq', 'www/llms.txt']) {
        assert.ok(!world.read(file).includes('memory://'), `${file} carries a memory:// URI`);
      }
      assert.ok(!JSON.stringify(linkset(world)).includes('memory://'));
      // A foreign bundle id is refused (AGSC-05-04b, AGSC-E309) rather than looked up
      // anywhere, and a path-shaped alias names no file.
      const foreign = envelopeOf(await world.state.client.callTool({
        arguments: { slug: 'memory://another-node/a2a' }, name: 'read',
      }));
      assert.strictEqual(foreign.type, 'error');
      assert.strictEqual(foreign.body.code, 'AGSC-E309');
      const traversal = envelopeOf(await world.state.client.callTool({
        arguments: { slug: 'memory://agenticsystemcore/../../agsc.config.json' }, name: 'read',
      }));
      assert.strictEqual(traversal.type, 'error', JSON.stringify(traversal));
    },
  },
];
