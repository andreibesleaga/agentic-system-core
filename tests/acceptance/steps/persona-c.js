'use strict';
// verifies AGSC-06-02, AGSC-06-14, AGSC-08-18, AGSC-09-09, AGSC-09-13, AGSC-09-14a, AGSC-09-14b
// Steps of features/persona-c-agent-mcp.feature that run offline: the real local
// stdio MCP server, reached through the official SDK client, over a scratch copy
// of the acceptance Bundle; the non-MCP path reads the build output.

const assert = require('node:assert');

const N3 = require('n3');

const { built, linkset, splitItem } = require('./_world.js');

const BASE = 'https://agenticsystemcore.com/';
const SEVEN = ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search'];

const call = async (client, name, args) => (await client.callTool({ arguments: args, name })).structuredContent;

/** The items of the fixture, from its files: slug → Bundle-relative path. */
function itemPaths(world) {
  const graph = JSON.parse(world.read('www/graph.jsonld'))['@graph'];
  return graph.map((n) => n['@id']).filter((id) => /^https:\/\/agenticsystemcore\.com\/(concepts|clusters|lessons)\/[^/]+\/$/u.test(id));
}

module.exports = [
  {
    pattern: 'no remote MCP server is served and no "agent-card.json" is emitted at v1; both MAY be declared as surfaces (AGSC-06-34, AGSC-11-21)',
    run(world) {
      world.bundle();
      built(world);
      assert.ok(![...world.snapshot('www').keys()].some((f) => f.endsWith('agent-card.json')), 'an agent card was emitted');
      const surfaces = linkset(world).linkset[0]['https://w3id.org/agentic-system-core/rel#surface']
        .map((s) => s['agsc-surface'][0]);
      assert.ok(!surfaces.includes('a2a-card') && !surfaces.includes('responder'), surfaces.join(', '));
    },
  },
  {
    pattern: 'the operator runs "npx agentic-system-core mcp <bundle-path>" from outside the Bundle',
    async run(world) {
      world.state.client = await world.mcp({ cwd: world.home, path: world.dir });
    },
  },
  {
    pattern: 'the server starts and speaks JSON-RPC 2.0 over stdio',
    async run(world) {
      // The SDK client completed the JSON-RPC 2.0 `initialize` handshake over the
      // child's stdin/stdout; the server names itself and its protocol version.
      const client = world.state.client;
      assert.ok(client.getServerVersion(), 'no server information after initialize');
      assert.ok(client.getServerCapabilities().tools, 'the server declares no tools capability');
    },
  },
  {
    pattern: 'the server exposes exactly seven tools: "search", "read", "links", "compose", "propose", "ask", "remember"',
    async run(world) {
      const names = (await world.state.client.listTools()).tools.map((t) => t.name).sort();
      assert.deepStrictEqual(names, SEVEN);
    },
  },
  {
    pattern: 'the server starts over the acceptance Bundle with every network call refused',
    async run(world) {
      world.state.client = await world.mcp({ offline: true });
    },
  },
  {
    pattern: 'it answers "search", "read" and "links" from the Bundle\'s own files',
    async run(world) {
      const client = world.state.client;
      const hits = await call(client, 'search', { query: 'protocol' });
      assert.deepStrictEqual(hits.body.hits.map((h) => h.slug).sort(), ['a2a', 'mcp']);
      const item = await call(client, 'read', { slug: 'mcp' });
      assert.strictEqual(item.body.body, splitItem(world.read('content/concepts/mcp.md')).body);
      const links = await call(client, 'links', { slug: 'a2a' });
      assert.deepStrictEqual(links.body.edges.map((e) => [e.key, e.target]), [['requires', 'mcp']]);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'an item edited on disk is served as edited when the server next starts',
    async run(world) {
      const rel = 'content/concepts/mcp.md';
      world.write(rel, world.read(rel).replace('Reach tools and data through one protocol.', 'Reach tools and data through one open protocol.'));
      await world.state.client.close();
      const again = await world.mcp({ offline: true });
      const item = await call(again, 'read', { slug: 'mcp' });
      assert.ok(item.body.body.includes('through one open protocol.'), item.body.body);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: '"mcp" given a URL instead of a Bundle directory is refused with "AGSC-E003" and exit 2 (AGSC-09-09)',
    run(world) {
      const r = world.agsc(['mcp', 'https://agenticsystemcore.com/'], { offline: true });
      assert.strictEqual(r.exit, 2, r.stdout + r.stderr);
      assert.match(r.stderr, /AGSC-E003/u);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the agent calls tool "search" with arguments "{query: \\"protocol\\"}"',
    async run(world) {
      world.state.client = world.state.client || await world.mcp();
      world.state.result = await call(world.state.client, 'search', { query: 'protocol' });
    },
  },
  {
    pattern: 'the result is the envelope "source", "trust: untrusted", "license" and "type" around hits naming "a2a" and "mcp" (AGSC-08-18)',
    run(world) {
      const r = world.state.result;
      assert.deepStrictEqual(Object.keys(r).sort(), ['body', 'license', 'source', 'trust', 'type']);
      assert.strictEqual(r.source, 'search');
      assert.strictEqual(r.trust, 'untrusted');
      assert.strictEqual(r.license, 'LicenseRef-AgenticSystemCore-Content-Use-1.0');
      assert.strictEqual(r.type, 'items');
      assert.deepStrictEqual(r.body.hits.map((h) => [h.slug, h.iri]).sort(),
        [['a2a', `${BASE}concepts/a2a/`], ['mcp', `${BASE}concepts/mcp/`]]);
    },
  },
  {
    pattern: 'the agent calls tool "read" with argument "{slug: \\"a2a\\"}"',
    async run(world) {
      world.state.result = await call(world.state.client, 'read', { slug: 'a2a' });
    },
  },
  {
    pattern: 'the result returns the body and frontmatter of "content/concepts/a2a.md"',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.trust, 'untrusted');
      assert.strictEqual(r.type, 'item');
      const { body, frontmatter } = splitItem(world.read('content/concepts/a2a.md'));
      assert.deepStrictEqual(r.body.frontmatter, frontmatter);
      assert.strictEqual(r.body.body, body);
      assert.strictEqual(r.body.iri, `${BASE}concepts/a2a/`);
    },
  },
  {
    pattern: 'the agent calls tool "links" with argument "{slug: \\"mcp\\"}"',
    async run(world) {
      world.state.result = await call(world.state.client, 'links', { slug: 'mcp' });
    },
  },
  {
    pattern: 'the result lists the "requires" Link from "a2a" as its computed inverse "required-by"',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.trust, 'untrusted');
      assert.deepStrictEqual(r.body.edges, [{ computed: true, key: 'required-by', source: 'mcp', target: 'a2a' }]);
    },
  },
  {
    pattern: 'the agent has no MCP client',
    run(world) {
      // Nothing to start: this agent reads the static files the build publishes.
      assert.ok(world.exists('www/llms.txt'));
    },
  },
  {
    pattern: 'the agent fetches "/llms.txt"',
    run(world) {
      world.state.llms = world.read('www/llms.txt');
    },
  },
  {
    pattern: 'every item is reachable from a listed page URL, and each item\'s Markdown is at "/pages/<slug>.md" (AGSC-06-14)',
    run(world) {
      const listed = new Set([...world.state.llms.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gmu)].map((m) => m[1]));
      const sections = new Set([...world.state.llms.matchAll(/^## (.+)$/gmu)].map((m) => m[1]));
      for (const iri of itemPaths(world)) {
        const slug = iri.replace(/\/$/u, '').split('/').pop();
        if (iri.includes('/clusters/')) {
          const { title } = splitItem(world.read(`content/clusters/${slug}.md`)).frontmatter;
          assert.ok(listed.has(iri) || sections.has(title), `${iri} is not reachable from /llms.txt`);
        } else {
          assert.ok(listed.has(iri), `${iri} is not listed in /llms.txt`);
        }
        assert.ok(world.exists(`www/pages/${slug}.md`), `/pages/${slug}.md is not emitted`);
        assert.ok(world.read(`www${new URL(iri).pathname}index.html`).includes(`href="/pages/${slug}.md"`),
          `the page of ${slug} does not link its Markdown view`);
      }
    },
  },
  {
    pattern: 'the agent instead fetches "/graph.ttl"',
    run(world) {
      world.state.turtle = world.read('www/graph.ttl');
    },
  },
  {
    pattern: 'the response loads into a standard RDF parser with zero blank nodes',
    run(world) {
      const quads = new N3.Parser({ format: 'text/turtle' }).parse(world.state.turtle);
      assert.ok(quads.length > 0, 'the graph is empty');
      const blank = quads.filter((q) => [q.subject, q.object, q.graph].some((t) => t.termType === 'BlankNode'));
      assert.deepStrictEqual(blank, []);
    },
  },
  {
    pattern: '"npx agentic-system-core mcp" is running over the acceptance Bundle',
    async run(world) {
      world.state.before = world.snapshot();
      world.state.client = await world.mcp();
    },
  },
  {
    pattern: 'the agent calls tool "ask" with "What pattern handles tool-use retries?"',
    async run(world) {
      world.state.result = await call(world.state.client, 'ask', { question: 'What pattern handles tool-use retries?' });
    },
  },
  {
    pattern: 'the answer cites at least one item IRI from the Bundle (AGSC-09-14a)',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'answer');
      assert.strictEqual(r.trust, 'untrusted');
      assert.ok(r.citations.includes(`${BASE}concepts/tool-use-retries/`), JSON.stringify(r.citations));
      const known = new Set(itemPaths(world));
      for (const iri of r.citations) assert.ok(known.has(iri), `${iri} is not an item of the Bundle`);
    },
  },
  {
    pattern: 'a question that shares no word with the Bundle returns exactly "no answer in this memory"',
    async run(world) {
      const r = await call(world.state.client, 'ask', { question: 'zebras quokkas marmalade' });
      assert.strictEqual(r.body, 'no answer in this memory');
    },
  },
  {
    pattern: 'the agent calls tool "remember" with kind "episode", a title, a body, its actor, the instant "at" and its operator',
    async run(world) {
      world.state.result = await call(world.state.client, 'remember', {
        actor: 'process:reader', at: '2026-01-01T00:00:00Z', body: 'Three tools failed at once and the retry budget held.',
        kind: 'episode', operator: 'human:andreibesleaga', title: 'A retry storm',
      });
    },
  },
  {
    pattern: 'a conforming Episode item comes back as a Proposal with no finding (AGSC-09-14b)',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'proposal', JSON.stringify(r));
      assert.deepStrictEqual(r.body.findings, []);
      assert.strictEqual(r.body.path, 'content/episodes/a-retry-storm.md');
      assert.strictEqual(r.body.frontmatter.type, 'episode');
      assert.strictEqual(r.body.frontmatter.actor, 'process:reader');
      assert.strictEqual(r.body.frontmatter.started, '2026-01-01T00:00:00Z');
      assert.strictEqual(r.body.frontmatter.prov.operator, 'human:andreibesleaga');
    },
  },
  {
    pattern: 'an episode without its declared actor is refused with "AGSC-E003"',
    async run(world) {
      const r = await call(world.state.client, 'remember', { body: 'No actor.', kind: 'episode', title: 'Anonymous' });
      assert.strictEqual(r.type, 'error');
      assert.strictEqual(r.body.code, 'AGSC-E003');
    },
  },
  {
    pattern: 'nothing is written to the Bundle by the server',
    run(world) {
      assert.deepStrictEqual(world.snapshot(), world.state.before);
    },
  },
  {
    pattern: '"resources/list" includes every item, "graph.jsonld" and "llms.txt"',
    async run(world) {
      const uris = new Set((await world.state.client.listResources()).resources.map((r) => r.uri));
      for (const iri of itemPaths(world)) {
        const slug = iri.replace(/\/$/u, '').split('/').pop();
        assert.ok(uris.has(`memory://agenticsystemcore/${slug}`), `${slug} is not a resource`);
      }
      assert.ok(uris.has('memory://agenticsystemcore/graph.jsonld'));
      assert.ok(uris.has('memory://agenticsystemcore/llms.txt'));
    },
  },
];
