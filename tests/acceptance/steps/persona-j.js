'use strict';
// verifies AGSC-04-09, AGSC-06-08, AGSC-06-09, AGSC-06-10, AGSC-06-14, AGSC-06-17, AGSC-09-93
// Steps of features/persona-j-standards.feature that run offline. The build
// output stands in for the published site: what an implementer would fetch from
// the node is read from `www/`, and the shipped validator is run in its
// documented offline form (a file argument, whose targets it maps onto the same
// directory), so nothing reaches the network.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { linkset } = require('./_world.js');

const REL = 'https://w3id.org/agentic-system-core/rel#';
const BASE = 'https://agenticsystemcore.com/';
const DIGEST = /^sha-256=:[A-Za-z0-9+/]{43}=:$/u;

/** The fixture with a git history, built: `rel#ledger` exists only with history. */
function builtWithHistory(world, epoch) {
  if (!world.dir) {
    world.bundle();
    world.commitAll('Add the acceptance Bundle');
  }
  const build = world.agsc(['build'], epoch ? { env: { SOURCE_DATE_EPOCH: epoch } } : {});
  assert.strictEqual(build.exit, 0, build.stderr);
  return linkset(world).linkset[0];
}

/** The build-output file an https URL of this node names. */
function fileOf(world, href) {
  assert.ok(href.startsWith(BASE), `${href} is not a URL of this node`);
  let rel = href.slice(BASE.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return path.join(world.dir, 'www', rel);
}

module.exports = [
  {
    pattern: 'the implementer reads the "describedby" link to "/graph.jsonld" inside "/.well-known/knowledge-linkset"',
    run(world) {
      world.state.context = builtWithHistory(world);
      const described = world.state.context.describedby;
      assert.strictEqual(described.length, 1);
      assert.strictEqual(described[0].href, `${BASE}graph.jsonld`);
      world.state.describedby = described[0];
    },
  },
  {
    pattern: 'it carries "agsc-spec-version", "agsc-generated-at", "agsc-counts" and "agsc-bundle-hash", every value an array',
    run(world) {
      for (const name of ['agsc-spec-version', 'agsc-generated-at', 'agsc-counts', 'agsc-bundle-hash']) {
        const value = world.state.describedby[name];
        assert.ok(Array.isArray(value) && value.length >= 1, `${name} is not a non-empty array`);
        for (const v of value) assert.strictEqual(typeof v, 'string');
      }
    },
  },
  {
    pattern: 'the "…rel#graph" and "…rel#ledger" links each carry a "digest" of the form "sha-256=:<base64>:"',
    run(world) {
      for (const rel of ['graph', 'ledger']) {
        const links = world.state.context[`${REL}${rel}`];
        assert.ok(Array.isArray(links) && links.length >= 1, `no rel#${rel} link`);
        for (const link of links) {
          assert.strictEqual(link.digest.length, 1);
          assert.match(link.digest[0], DIGEST);
          // The digest is the SHA-256 of the bytes the node serves at that target.
          const bytes = fs.readFileSync(fileOf(world, link.href));
          const expected = `sha-256=:${crypto.createHash('sha256').update(bytes).digest('base64')}:`;
          assert.strictEqual(link.digest[0], expected, link.href);
        }
      }
    },
  },
  {
    pattern: '"agsc-generated-at" derives from "SOURCE_DATE_EPOCH", never the wall clock',
    run(world) {
      assert.deepStrictEqual(world.state.describedby['agsc-generated-at'], ['2026-01-01T00:00:00Z']);
      const later = builtWithHistory(world, '1790000000').describedby[0];
      assert.deepStrictEqual(later['agsc-generated-at'], ['2026-09-21T14:13:20Z']);
      const again = builtWithHistory(world, '1790000000').describedby[0];
      assert.deepStrictEqual(again, later, 'two builds at one instant publish one document');
    },
  },
  {
    pattern: 'the implementer fetches "/llms.txt"',
    run(world) {
      world.bundle();
      const build = world.agsc(['build']);
      assert.strictEqual(build.exit, 0, build.stderr);
      world.state.llms = world.read('www/llms.txt');
    },
  },
  {
    pattern: 'every published item is reachable from the listed links',
    run(world) {
      const listed = new Set([...world.state.llms.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gmu)].map((m) => m[1]));
      const graph = JSON.parse(world.read('www/graph.jsonld'));
      const items = (graph['@graph'] || []).map((n) => n['@id'])
        .filter((id) => /^https:\/\/agenticsystemcore\.com\/(concepts|clusters|lessons|procedures|episodes|gates)\/[^/]+\/$/u.test(id));
      assert.ok(items.length >= 8, `the graph lists ${items.length} items`);
      // AGSC-06-14: an item is reachable directly (a listed link) or, for a cluster,
      // through its listed section, whose members are the links under it.
      const sections = new Set([...world.state.llms.matchAll(/^## (.+)$/gmu)].map((m) => m[1]));
      for (const iri of items) {
        if (/\/clusters\//u.test(iri)) {
          const node = graph['@graph'].find((n) => n['@id'] === iri);
          const title = [].concat(node.prefLabel || []).map((t) => (typeof t === 'object' ? t['@value'] : t))[0];
          assert.ok(sections.has(title) || listed.has(iri), `cluster ${iri} has no section in /llms.txt`);
        } else {
          assert.ok(listed.has(iri), `${iri} is not listed in /llms.txt`);
        }
      }
      for (const href of listed) assert.ok(fs.existsSync(fileOf(world, href)), `${href} is listed and not emitted`);
    },
  },
  {
    pattern: 'no authentication or API key is required',
    run(world) {
      const surface = linkset(world).linkset[0][`${REL}surface`].find((s) => s['agsc-surface'][0] === 'llms-txt');
      assert.deepStrictEqual(surface['agsc-access'], ['none']);
      const headers = world.read('www/_headers');
      assert.ok(!/authorization|www-authenticate|api[-_ ]?key/iu.test(headers), 'the host is told to ask for credentials');
    },
  },
  {
    pattern: 'the implementer runs "the shipped validate-wellknown tool on https://agenticsystemcore.com/.well-known/knowledge-linkset"',
    run(world) {
      builtWithHistory(world);
      world.state.validate = world.tool('validate-wellknown',
        [path.join(world.dir, 'www', '.well-known', 'knowledge-linkset'), '--level', '2', '--json']);
    },
  },
  {
    pattern: 'it exits 0 and prints an agsc.diagnostics.v1 envelope with verb "validate-wellknown"',
    run(world) {
      const { exit, stdout, stderr } = world.state.validate;
      assert.strictEqual(exit, 0, stdout + stderr);
      const envelope = JSON.parse(stdout);
      assert.strictEqual(envelope.schema, 'agsc.diagnostics.v1');
      assert.strictEqual(envelope.verb, 'validate-wellknown');
      assert.strictEqual(envelope.status, 'pass');
    },
  },
  {
    pattern: 'running it against a linkset carrying an unregistered short name exits 1',
    run(world) {
      const document = linkset(world);
      document.linkset[0]['made-up-relation'] = [{ href: `${BASE}llms.txt` }];
      const at = path.join(world.dir, 'www', '.well-known', 'knowledge-linkset');
      fs.writeFileSync(at, `${JSON.stringify(document)}\n`);
      const r = world.tool('validate-wellknown', [at, '--json']);
      assert.strictEqual(r.exit, 1, r.stdout);
      assert.ok(JSON.parse(r.stdout).findings.some((f) => /made-up-relation/u.test(f.message)), r.stdout);
    },
  },
  {
    pattern: 'the implementer reads "/.well-known/knowledge-linkset" and the headers "_headers" serves it with',
    run(world) {
      world.state.context = builtWithHistory(world);
      world.state.raw = world.read('www/.well-known/knowledge-linkset');
      // The Cloudflare-style `_headers` file: a path line, then its indented headers.
      const blocks = world.read('www/_headers').split(/\n(?=\S)/u);
      world.state.headers = blocks.filter((b) => b.split('\n')[0].trim() === '/.well-known/knowledge-linkset')
        .flatMap((b) => b.split('\n').slice(1)).map((l) => l.trim()).filter(Boolean);
    },
  },
  {
    pattern: 'it is served as "application/linkset+json" with profile "https://w3id.org/agentic-system-core/profile/agentic-knowledge" and "linkset" is its sole top-level member (AGSC-06-17, AGSC-06-08)',
    run(world) {
      assert.ok(world.state.headers.includes(
        'Content-Type: application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"'),
      world.state.headers.join('\n'));
      assert.deepStrictEqual(Object.keys(JSON.parse(world.state.raw)), ['linkset']);
    },
  },
  {
    pattern: 'it is a RFC 9264 linkset with "anchor" equal to the site base',
    run(world) {
      const document = JSON.parse(world.state.raw);
      assert.ok(Array.isArray(document.linkset) && document.linkset.length === 1);
      assert.strictEqual(world.state.context.anchor, BASE);
      for (const [relation, targets] of Object.entries(world.state.context)) {
        if (relation === 'anchor') continue;
        assert.ok(Array.isArray(targets) && targets.every((t) => typeof t.href === 'string'), relation);
      }
    },
  },
  {
    pattern: 'it links "describedby" to "/graph.jsonld"',
    run(world) {
      assert.deepStrictEqual(world.state.context.describedby.map((l) => l.href), [`${BASE}graph.jsonld`]);
    },
  },
  {
    pattern: 'it links relation "https://w3id.org/agentic-system-core/rel#graph" to "/graph.nq" and to "/graph.ttl"',
    run(world) {
      assert.deepStrictEqual(world.state.context[`${REL}graph`].map((l) => l.href), [`${BASE}graph.nq`, `${BASE}graph.ttl`]);
    },
  },
  {
    pattern: 'it links relation "…rel#context" to "/ns/context.jsonld", and carries no "…rel#ontology" link, because a content node does not serve the vocabulary (AGSC-06-10)',
    run(world) {
      assert.deepStrictEqual(world.state.context[`${REL}context`].map((l) => l.href), [`${BASE}ns/context.jsonld`]);
      assert.ok(world.exists('www/ns/context.jsonld'));
      assert.ok(!(`${REL}ontology` in world.state.context), 'a content node links a vocabulary it does not serve');
      assert.ok(!world.exists('www/ns/agsc.ttl'));
    },
  },
  {
    pattern: 'it links relation "…rel#now" to "/now.md" and "…rel#skills" to "/skills/index.json"',
    run(world) {
      assert.deepStrictEqual(world.state.context[`${REL}now`].map((l) => l.href), [`${BASE}now.md`]);
      assert.deepStrictEqual(world.state.context[`${REL}skills`].map((l) => l.href), [`${BASE}skills/index.json`]);
      assert.ok(world.exists('www/now.md') && world.exists('www/skills/index.json'));
    },
  },
  {
    pattern: 'it links "alternate" to "/llms.txt", and every target on the node\'s own origin is a file the build emitted',
    run(world) {
      assert.deepStrictEqual(world.state.context.alternate.map((l) => l.href), [`${BASE}llms.txt`]);
      // No dangling promise: `/specs/` and `/legal/` are linked only where emitted.
      for (const [relation, targets] of Object.entries(world.state.context)) {
        if (relation === 'anchor') continue;
        for (const { href } of targets) {
          if (href.startsWith(BASE)) assert.ok(fs.existsSync(fileOf(world, href)), `${relation} names ${href}, which the build did not emit`);
        }
      }
    },
  },
];
