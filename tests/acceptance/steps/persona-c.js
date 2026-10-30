'use strict';
/* global document, window */
// verifies AGSC-06-02, AGSC-06-14, AGSC-06-18, AGSC-06-28, AGSC-06-29, AGSC-06-30, AGSC-08-18, AGSC-09-09, AGSC-09-13, AGSC-09-14a, AGSC-09-14b, AGSC-09-16
// Steps of features/persona-c-agent-mcp.feature. Offline: the real local stdio MCP
// server, reached through the official SDK client (or, for the protocol revision
// it speaks, through the three JSON-RPC lines every client sends first), over a
// scratch copy of the acceptance Bundle; the non-MCP path, the crawler and the
// memory framework read the build output; the page tools run as a page runs them,
// in a bare JavaScript context whose `fetch` reaches the node's own files and
// nothing else. In a browser (`_browser.js`): the same page tools registered through
// a `document.modelContext` the page is given before its scripts run.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const N3 = require('n3');

const { AGSC, built, linkset, splitItem } = require('./_world.js');
const browser = require('./_browser.js');

const BASE = 'https://agenticsystemcore.com/';
const SEVEN = ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search'];
const TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
const PROMPT = 'answer-from-this-memory-with-citations';
const DRAFT = 'unreleased-idea';
/** The three scripts an item page loads to offer the page tools (AGSC-09-16). */
const PAGE_SCRIPTS = ['/compose/agsc-core.js', '/compose/agsc-page-tools.js', '/compose/webmcp.js'];
/** One call of each of the seven tools, with the arguments both transports take. */
const CALLS = [
  ['search', { query: 'handoff' }],
  ['read', { slug: 'handoff' }],
  ['links', { slug: 'supervisor' }],
  ['ask', { question: 'What pattern handles tool-use retries?' }],
  ['compose', { selection: ['handoff'] }],
  ['propose', { slug: 'handoff' }],
  ['remember', {
    actor: 'process:reader', at: '2026-01-01T00:00:00Z', body: 'Three tools failed at once and the retry budget held.',
    kind: 'episode', operator: 'human:andreibesleaga', title: 'A retry storm',
  }],
];
/** The members a 1.0 chunk line may carry (AGSC-06-29); `x-` members aside. */
const CHUNK_MEMBERS = ['digest', 'id', 'iri', 'item', 'kind', 'license', 'links', 'ordinal', 'section',
  'subkind', 'terms', 'text', 'title', 'trust', 'type'];

const call = async (client, name, args) => (await client.callTool({ arguments: args, name })).structuredContent;

/** The items of the fixture, from its files: slug → Bundle-relative path. */
function itemPaths(world) {
  const graph = JSON.parse(world.read('www/graph.jsonld'))['@graph'];
  return graph.map((n) => n['@id']).filter((id) => /^https:\/\/agenticsystemcore\.com\/(concepts|clusters|lessons)\/[^/]+\/$/u.test(id));
}

/** Every file of the build output, as route → text: what a page can fetch. */
function routesOf(world) {
  const out = new Map();
  for (const [rel, base64] of world.snapshot('www')) out.set(`/${rel}`, Buffer.from(base64, 'base64').toString('utf8'));
  return out;
}

/**
 * The page tools as a page runs them, without a browser: the three scripts of an
 * item page in a fresh `node:vm` context whose `fetch` answers the node's own files
 * and nothing else, with no `document.modelContext` (the page then keeps its tools
 * on `AGSC_TOOLS`, as a page in a browser without the proposal does).
 */
async function pageToolsOf(world) {
  const files = routesOf(world);
  const reads = [];
  const sandbox = {
    document: { getElementById: () => null },
    fetch: (route) => {
      reads.push(String(route));
      const body = files.get(String(route));
      if (body === undefined) return Promise.resolve({ json: () => Promise.reject(new Error('404')), ok: false, text: () => Promise.resolve('') });
      return Promise.resolve({ json: () => Promise.resolve(JSON.parse(body)), ok: true, text: () => Promise.resolve(body) });
    },
    location: { origin: 'http://127.0.0.1:8000', search: '' },
    Promise,
    TextEncoder,
  };
  const context = vm.createContext(sandbox);
  for (const script of PAGE_SCRIPTS) vm.runInContext(files.get(script), context, { filename: script });
  await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.ready', context);
  return {
    call: async (name, args) => JSON.parse(JSON.stringify(await sandbox.AGSC_TOOLS.call(name, args))),
    files,
    reads,
  };
}

/** The answers of the local tool server to `CALLS`, as the JSON text an agent receives. */
async function serverAnswers(world) {
  const client = await world.mcp({ offline: true });
  const out = new Map();
  for (const [name, args] of CALLS) {
    const r = await client.callTool({ arguments: args, name });
    out.set(name, JSON.parse(r.content[0].text));
  }
  return out;
}

/** JCS (RFC 8785) for the values a chunk line holds: objects, arrays, strings, integers. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The `verdict:` line `agsc compose <selection>` prints, run on a copy of the Bundle. */
function cliVerdict(world, selection) {
  const copy = world.temp('agsc-acc-compose-');
  fs.cpSync(world.dir, copy, { recursive: true });
  const r = world.agsc(['compose', ...selection], { cwd: copy, offline: true });
  assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
  // The verdict is a note of the plain output (AGSC-09-12), printed on the error stream.
  const line = `${r.stdout}${r.stderr}`.split('\n').find((l) => l.startsWith('verdict: '));
  assert.ok(line, `no verdict line in ${r.stdout}${r.stderr}`);
  return JSON.parse(line.slice('verdict: '.length));
}

/** RFC 9309 §2.2.1–2.2.2: the group a product token obeys and whether it may fetch a path. */
function robotsAllows(groups, token, route) {
  const named = groups.find((g) => g.agents.some((a) => a.toLowerCase() === token.toLowerCase()));
  const group = named || groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  const matching = group.rules.filter((r) => route.startsWith(r.path) && r.path !== '');
  if (matching.length === 0) return true;
  const longest = Math.max(...matching.map((r) => r.path.length));
  const best = matching.filter((r) => r.path.length === longest);
  return best.some((r) => r.allow);
}

/** The groups of a robots.txt: user agents, Allow/Disallow rules and other records. */
function robotsGroups(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/u, '').trim();
    if (line === '') continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/u.exec(line);
    assert.ok(m, `not a robots.txt record: ${raw}`);
    const [, key, value] = m;
    const name = key.toLowerCase();
    if (name === 'user-agent') {
      if (!current || current.rules.length > 0 || current.other.length > 0) {
        current = { agents: [], other: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
    } else if (name === 'allow' || name === 'disallow') {
      current.rules.push({ allow: name === 'allow', path: value });
    } else if (name !== 'sitemap') {
      current.other.push(`${key}: ${value}`);
    }
  }
  return groups;
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
    pattern: 'the agent calls tool "remember" with kind "episode", a title, a body, its actor, the instant "at", its operator, its agent and its model',
    async run(world) {
      world.state.result = await call(world.state.client, 'remember', {
        actor: 'process:reader', agent: 'agent:reader', at: '2026-01-01T00:00:00Z',
        body: 'Three tools failed at once and the retry budget held.',
        kind: 'episode', model: 'm-1', operator: 'human:andreibesleaga', title: 'A retry storm',
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
  {
    pattern: 'the agent lists the prompts',
    async run(world) {
      world.state.prompts = (await world.state.client.listPrompts()).prompts;
    },
  },
  {
    pattern: 'there is exactly one, "answer-from-this-memory-with-citations", taking one required argument "question" (AGSC-09-14b)',
    run(world) {
      const prompts = world.state.prompts;
      assert.deepStrictEqual(prompts.map((p) => p.name), [PROMPT]);
      assert.strictEqual(prompts[0].title, 'answer from this memory with citations');
      assert.strictEqual(prompts[0].description, 'answer from this memory with citations');
      assert.deepStrictEqual(prompts[0].arguments.map((a) => [a.name, a.required]), [['question', true]]);
    },
  },
  {
    pattern: /^the agent gets that prompt with the question "([^"]+)"$/u,
    async run(world, question) {
      world.state.question = question;
      world.state.result = await world.state.client.getPrompt({ arguments: { question }, name: PROMPT });
    },
  },
  {
    pattern: 'it returns one user message that carries the question',
    run(world) {
      const { messages } = world.state.result;
      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].role, 'user');
      assert.strictEqual(messages[0].content.type, 'text');
      assert.ok(messages[0].content.text.includes(world.state.question), messages[0].content.text);
    },
  },
  {
    pattern: 'a prompt name that does not exist is answered with a JSON-RPC error, not a tool envelope',
    async run(world) {
      await assert.rejects(world.state.client.getPrompt({ arguments: { question: 'x' }, name: 'no-such-prompt' }),
        (e) => Number.isInteger(e.code) && e.code < 0);
      assert.deepStrictEqual(world.snapshot(), world.state.before);
    },
  },
  {
    pattern: 'the node is built and its item page "/concepts/handoff/" loads the three page-tool scripts',
    run(world) {
      const page = world.read('www/concepts/handoff/index.html');
      for (const script of PAGE_SCRIPTS) {
        assert.ok(page.includes(`<script src="${script}" defer>`), `the item page does not load ${script}`);
        assert.ok(world.exists(`www${script}`), `${script} is not emitted`);
      }
      world.state.before = world.snapshot();
    },
  },
  {
    pattern: 'an agent runs those scripts with nothing but the node\'s own files to fetch, and calls each of the seven tools',
    async run(world) {
      const tools = await pageToolsOf(world);
      world.state.page = new Map();
      for (const [name, args] of CALLS) world.state.page.set(name, await tools.call(name, args));
      world.state.reads = { files: tools.files, routes: tools.reads };
    },
  },
  {
    pattern: 'a browser opens "/concepts/handoff/" offering "document.modelContext", and the agent calls each of the seven tools the page registers',
    async run(world) {
      const opened = await browser.open(world, '/concepts/handoff/', {
        init: () => {
          window.__tools = {};
          document.modelContext = {
            clearContext() {}, provideContext() {}, registerTool(t) { window.__tools[t.name] = t; }, unregisterTool() {},
          };
        },
      });
      await opened.page.waitForFunction(() => Object.keys(window.__tools).length === 7, null, { timeout: 10000 });
      assert.deepStrictEqual((await opened.page.evaluate(() => Object.keys(window.__tools))).sort(), SEVEN);
      world.state.page = new Map();
      for (const [name, args] of CALLS) {
        const text = await opened.page.evaluate(async ([n, a]) => {
          const out = await window.__tools[n].execute(a);
          return typeof out === 'string' ? out : JSON.stringify(out);
        }, [name, args]);
        world.state.page.set(name, JSON.parse(text));
      }
      world.state.reads = { browser: opened };
    },
  },
  {
    pattern: 'every answer equals the answer the local tool server gives to the same call (AGSC-09-16)',
    async run(world) {
      const server = await serverAnswers(world);
      assert.deepStrictEqual([...world.state.page.keys()].sort(), SEVEN);
      for (const [name] of CALLS) {
        assert.notStrictEqual(world.state.page.get(name).type, 'error', `${name}: ${JSON.stringify(world.state.page.get(name))}`);
        assert.deepStrictEqual(world.state.page.get(name), server.get(name), `${name}: the page and the tool server disagree`);
      }
      assert.deepStrictEqual(world.snapshot(), world.state.before, 'a tool call wrote into the Bundle');
    },
  },
  {
    pattern: 'the page read nothing outside the node',
    run(world) {
      const { browser: opened, files, routes } = world.state.reads;
      if (opened) {
        assert.deepStrictEqual(opened.offOrigin, [], 'the page requested another origin');
        assert.deepStrictEqual(opened.errors, [], 'the page logged errors');
        return;
      }
      assert.ok(routes.length > 0, 'the page tools read nothing');
      for (const route of routes) assert.ok(files.has(route), `the page tools asked for ${route}, which the node does not serve`);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the node is built with "site.tdm_crawlers" naming "CCBot" and "GPTBot"',
    run(world) {
      assert.deepStrictEqual(JSON.parse(world.read('agsc.config.json')).site.tdm_crawlers, ['CCBot', 'GPTBot']);
      assert.ok(world.exists('www/robots.txt'));
    },
  },
  {
    pattern: 'a crawler fetches "/robots.txt" and "/.well-known/tdmrep.json"',
    run(world) {
      world.state.robots = world.read('www/robots.txt');
      world.state.tdmrep = world.read('www/.well-known/tdmrep.json');
    },
  },
  {
    pattern: '"/robots.txt" holds one group per named product token, in the configured order and before the "User-agent: *" group, each with "Disallow: /" (AGSC-06-18)',
    run(world) {
      const groups = robotsGroups(world.state.robots);
      assert.deepStrictEqual(groups.map((g) => g.agents), [['CCBot'], ['GPTBot'], ['*']]);
      for (const g of groups.slice(0, 2)) assert.deepStrictEqual(g.rules, [{ allow: false, path: '/' }]);
      assert.ok(!groups[2].rules.some((r) => !r.allow), 'the "User-agent: *" group disallows a path');
      assert.match(world.state.robots, /^Sitemap: https:\/\/agenticsystemcore\.com\/sitemap\.xml$/mu);
    },
  },
  {
    pattern: 'every group carries the same optional "Content-Signal" record',
    run(world) {
      const groups = robotsGroups(world.state.robots);
      const signals = groups.map((g) => g.other.filter((o) => o.startsWith('Content-Signal: ')));
      for (const s of signals) assert.strictEqual(s.length, 1, JSON.stringify(signals));
      assert.strictEqual(new Set(signals.map((s) => s[0])).size, 1, JSON.stringify(signals));
    },
  },
  {
    pattern: '"/.well-known/tdmrep.json" is exactly [{"location":"/","tdm-reservation":1}]',
    run(world) {
      assert.deepStrictEqual(JSON.parse(world.state.tdmrep), [{ location: '/', 'tdm-reservation': 1 }]);
      assert.strictEqual(world.state.tdmrep.trim(), '[{"location":"/","tdm-reservation":1}]');
      assert.ok(!world.exists('www/tdmrep.json'), 'the duplicate /tdmrep.json is emitted');
    },
  },
  {
    pattern: 'a crawler the list does not name may fetch every page, and "GPTBot" may fetch none',
    run(world) {
      const groups = robotsGroups(world.state.robots);
      for (const route of ['/', '/concepts/handoff/', '/pages/handoff.md', '/llms.txt']) {
        assert.ok(robotsAllows(groups, 'ExampleSearchBot', route), `an unnamed crawler may not fetch ${route}`);
        assert.ok(!robotsAllows(groups, 'GPTBot', route), `GPTBot may fetch ${route}`);
        assert.ok(!robotsAllows(groups, 'gptbot', route), 'product tokens are matched without regard to case');
      }
    },
  },
  {
    pattern: 'the author\'s Bundle holds the draft Concept "unreleased-idea" and is built',
    run(world) {
      world.write(`content/concepts/${DRAFT}.md`, ['---', 'type: concept', 'title: Unreleased idea',
        'description: A pattern still being written, which no reader should find on any published surface yet.',
        'status: draft', 'clusters:', '  - protocols', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
        'kind: pattern', '---', '', '## Intent', '', 'Not ready.', ''].join('\n'));
      built(world);
    },
  },
  {
    pattern: 'the agent calls tool "read" with the slug "unreleased-idea" on the local tool server',
    async run(world) {
      world.state.client = await world.mcp({ offline: true });
      world.state.result = await call(world.state.client, 'read', { slug: DRAFT });
    },
  },
  {
    pattern: 'the local tool server returns the draft, because it reads the author\'s working tree',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'item', JSON.stringify(r));
      assert.strictEqual(r.trust, 'untrusted');
      assert.strictEqual(r.body.frontmatter.status, 'draft');
      assert.strictEqual(r.body.frontmatter.title, 'Unreleased idea');
    },
  },
  {
    pattern: 'a page agent calls the page tool "read" with the slug "unreleased-idea" on the built node',
    async run(world) {
      world.state.tools = await pageToolsOf(world);
      world.state.result = await world.state.tools.call('read', { slug: DRAFT });
    },
  },
  {
    pattern: 'the page tool answers "AGSC-E301", as it does for a slug that does not exist',
    async run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'error', JSON.stringify(r));
      assert.strictEqual(r.body.code, 'AGSC-E301');
      const missing = await world.state.tools.call('read', { slug: 'no-such-slug' });
      assert.strictEqual(missing.type, 'error');
      assert.strictEqual(missing.body.code, r.body.code);
    },
  },
  {
    pattern: 'neither the page tool "search" nor any published file names the draft (AGSC-06-30)',
    async run(world) {
      const hits = await world.state.tools.call('search', { query: 'unreleased idea' });
      assert.ok(!JSON.stringify(hits).includes(DRAFT), JSON.stringify(hits));
      for (const [route, text] of routesOf(world)) assert.ok(!text.includes(DRAFT), `${route} names the draft`);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the node is built',
    run(world) {
      assert.ok(world.exists('www/.well-known/knowledge-linkset'), 'the Bundle is not built');
    },
  },
  {
    pattern: 'a memory framework loads "/chunks.jsonl" line by line',
    run(world) {
      world.state.chunks = world.read('www/chunks.jsonl');
    },
  },
  {
    pattern: 'every line is one canonical JSON object marked "trust: untrusted", carrying the Content Use Terms, its item IRI, its section and its ordinal (AGSC-06-29)',
    run(world) {
      const text = world.state.chunks;
      assert.ok(text.endsWith('\n') && !text.includes('\n\n'), 'not LF-terminated lines without blank lines');
      const lines = text.slice(0, -1).split('\n');
      assert.ok(lines.length > 0);
      for (const line of lines) {
        const chunk = JSON.parse(line);
        assert.strictEqual(line, canonical(chunk), 'a line is not JCS-canonical');
        assert.deepStrictEqual(Object.keys(chunk).filter((k) => !CHUNK_MEMBERS.includes(k) && !k.startsWith('x-')), []);
        assert.strictEqual(chunk.trust, 'untrusted');
        assert.strictEqual(chunk.terms, TERMS);
        assert.strictEqual(chunk.license, TERMS);
        assert.ok(chunk.iri.startsWith(BASE) && chunk.iri.endsWith(`/${chunk.item}/`), chunk.iri);
        assert.strictEqual(typeof chunk.section, 'string');
        assert.ok(Number.isInteger(chunk.ordinal) && chunk.ordinal >= 0);
        assert.strictEqual(chunk.type, 'text');
      }
      world.state.lines = lines.map((l) => JSON.parse(l));
    },
  },
  {
    pattern: 'each "id" is recomputed from the item IRI, the section and the ordinal, and each "digest" from the text (AGSC-06-28)',
    run(world) {
      const sha = (buffers) => crypto.createHash('sha256').update(Buffer.concat(buffers)).digest('hex');
      const nul = Buffer.from([0]);
      for (const c of world.state.lines) {
        const id = sha([Buffer.from(c.iri, 'utf8'), nul, Buffer.from(c.section, 'utf8'), nul, Buffer.from(String(c.ordinal), 'utf8')]);
        assert.strictEqual(c.id, id, `${c.item}#${c.section}/${c.ordinal}: the id is not the one AGSC-06-28 derives`);
        assert.strictEqual(c.digest, sha([Buffer.from(c.text, 'utf8')]));
      }
      assert.strictEqual(new Set(world.state.lines.map((c) => c.id)).size, world.state.lines.length, 'two chunks share an id');
    },
  },
  {
    pattern: 'the lines are ordered by item, section and ordinal, and no draft item is among them (AGSC-06-30)',
    run(world) {
      const key = (c) => [c.item, c.section, c.ordinal];
      const order = (a, b) => {
        for (let i = 0; i < 2; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
        return a[2] - b[2];
      };
      const keys = world.state.lines.map(key);
      assert.deepStrictEqual(keys, [...keys].sort(order));
      const items = new Set(world.state.lines.map((c) => c.item));
      assert.ok(!items.has(DRAFT), 'the draft is exported');
      for (const iri of itemPaths(world)) {
        assert.ok(items.has(iri.replace(/\/$/u, '').split('/').pop()), `${iri} contributes no chunk`);
      }
    },
  },
  {
    pattern: 'a second build gives the same lines',
    run(world) {
      built(world, { offline: true });
      assert.strictEqual(world.read('www/chunks.jsonl'), world.state.chunks);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the agent calls tool "compose" with the selection "handoff"',
    async run(world) {
      world.state.result = await call(world.state.client, 'compose', { selection: ['handoff'] });
    },
  },
  {
    pattern: 'the verdict equals the one "agsc compose handoff" prints for the same selection (AGSC-09-16)',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'verdict', JSON.stringify(r));
      assert.strictEqual(r.trust, 'untrusted');
      const cli = cliVerdict(world, ['handoff']);
      assert.deepStrictEqual(r.body, cli);
      assert.deepStrictEqual(cli.added, [{ path: [['handoff', 'requires', 'supervisor']], slug: 'supervisor' }]);
    },
  },
  {
    pattern: 'an MCP client that speaks the revision 2025-11-25 reads the resource "memory://agenticsystemcore/no-such-item"',
    run(world) {
      // The three lines every client sends first, then the read: no SDK in between,
      // so the revision and the error code are the bytes the server wrote.
      const lines = [
        { id: 1, jsonrpc: '2.0', method: 'initialize',
          params: { capabilities: {}, clientInfo: { name: 'acceptance', version: '1.0.0' }, protocolVersion: '2025-11-25' } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { id: 2, jsonrpc: '2.0', method: 'resources/read', params: { uri: 'memory://agenticsystemcore/no-such-item' } },
      ];
      const r = spawnSync(process.execPath, [AGSC, 'mcp'], {
        cwd: world.dir, encoding: 'utf8', env: world.offlineEnv(), input: `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`,
      });
      assert.strictEqual(r.status, 0, r.stderr);
      world.state.answers = new Map(r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m]));
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the server negotiated the revision "2025-11-25"',
    run(world) {
      assert.strictEqual(world.state.answers.get(1).result.protocolVersion, '2025-11-25');
    },
  },
  {
    pattern: 'the answer is the JSON-RPC error -32002, "Resource not found", that revision defines, and not a tool envelope',
    run(world) {
      const answer = world.state.answers.get(2);
      assert.ok(answer && answer.error, `no JSON-RPC error: ${JSON.stringify(answer)}`);
      assert.strictEqual(answer.result, undefined);
      assert.strictEqual(answer.error.code, -32002, `the server answered ${answer.error.code}`);
      assert.strictEqual(answer.error.message, 'Resource not found');
    },
  },
];
