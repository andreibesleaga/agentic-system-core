'use strict';
// verifies AGSC-06-08, AGSC-09-93, AGSC-11-03, AGSC-11-20
// Steps of features/persona-o-restricted.feature (persona P15, the restricted
// publisher). A restricted node is the acceptance Bundle with `visibility:
// "restricted"`; its discovery document is read from the build output, and the node
// is served on loopback by the real `agsc-host serve` when a scenario checks what
// an unauthenticated agent receives over HTTP. The two checkers judge a discovery
// document derived from a public build exactly as AGSC-11-20 asks (the visibility
// attribute added; the four content facts, the ledger link and the digests of gated
// targets removed), so the check of the access link does not depend on how the
// engine's own configuration names the access page. The Python checker runs from
// its checkout beside the engine (`steps/_python-package.js` finds it).

const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { built, linkset, pythonPackage } = require('./_world.js');

const REL = 'https://w3id.org/agentic-system-core/rel#';
const WELLKNOWN = '/.well-known/knowledge-linkset';
/** AGSC-11-20: the four bundle facts a restricted node omits. */
const CONTENT_FACTS = ['agsc-bundle-hash', 'agsc-bundle-version', 'agsc-counts', 'agsc-ledger-head'];
/** AGSC-11-20: the targets a restricted node serves unauthenticated, besides the discovery document. */
const OPEN = ['/graph.jsonld', '/llms.txt'];
const ACCESS_PAGE = 'https://agenticsystemcore.com/access/';

/** Change the current Bundle's configuration. */
function configure(world, change) {
  const config = JSON.parse(world.read('agsc.config.json'));
  change(config);
  world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
}

/** RFC 8785 for the plain JSON of a discovery document: sorted members, no space. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/** The anchor's `describedby` link of a link context. */
function anchorLink(context) {
  return (context.describedby || []).find((l) => /\/graph\.jsonld$/u.test(l.href));
}

/** Every target of a link context with a `digest`, as origin-rooted paths. */
function digested(context) {
  const out = [];
  for (const [relation, targets] of Object.entries(context)) {
    if (relation === 'anchor') continue;
    for (const t of targets) if (t.digest !== undefined) out.push(new URL(t.href).pathname);
  }
  return out.sort();
}

/**
 * Write the derived restricted document with the given access links and run both
 * checkers on it. Each link carries `agsc-access: ["credential"]`, as the engine's
 * writer emits it (AGSC-11-20, case disc-0020), unless `change` alters the context.
 */
function checkBoth(world, accessLinks, change = () => {}) {
  const context = structuredClone(world.state.restricted);
  if (accessLinks.length) context[`${REL}access`] = accessLinks.map((href) => ({ 'agsc-access': ['credential'], href }));
  change(context);
  world.write(`www${WELLKNOWN}`, `${canonical({ linkset: [context] })}\n`);
  const file = path.join(world.dir, 'www', ...WELLKNOWN.split('/').filter(Boolean));
  const node = world.tool('validate-wellknown', [file, '--level', '0', '--json']);
  const found = pythonPackage();
  assert.ok(found.available, found.reason);
  const py = spawnSync(found.python, ['-m', 'agentic_system_core.cli', 'validate-wellknown', file, '--level', '0', '--json'], {
    cwd: world.dir,
    encoding: 'utf8',
    env: { ...world.env(), PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONPATH: found.source },
  });
  world.state.checks = [['validate-wellknown', node.exit, node.stdout], ['the Python checker', py.status, py.stdout + py.stderr]];
}

/** GET one path of the loopback node as a browser on another origin would, with no credentials. */
function get(origin, route) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${origin}${route}`, { headers: { Origin: 'https://reader.example' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ body, headers: res.headers, status: res.statusCode }));
    });
    req.on('error', reject);
  });
}

module.exports = [
  {
    pattern: 'the publisher keeps the discovery document of this public build',
    run(world) {
      world.state.publicContext = linkset(world).linkset[0];
      const facts = anchorLink(world.state.publicContext);
      for (const name of CONTENT_FACTS.filter((n) => n !== 'agsc-ledger-head')) {
        assert.ok(facts[name] !== undefined, `the public build carries no ${name}`);
      }
      // AGSC-06-08: the ledger head rides on the rel#ledger link, not on the anchor's link.
      const ledger = world.state.publicContext[`${REL}ledger`];
      assert.ok(Array.isArray(ledger) && ledger[0]['agsc-ledger-head'] !== undefined, 'the public build carries no rel#ledger link with its head');
    },
  },
  {
    pattern: 'the publisher makes the node restricted',
    run(world) {
      configure(world, (config) => { config.visibility = 'restricted'; });
    },
  },
  {
    pattern: /^the publisher names its access page "(https:\/\/[^"]+)"$/u,
    run(world, url) {
      configure(world, (config) => { config.access = url; });
    },
  },
  {
    pattern: 'the publisher removes the access page from the configuration',
    run(world) {
      configure(world, (config) => { delete config.access; });
    },
  },
  {
    pattern: 'the anchor\'s "describedby" link says "agsc-visibility" "restricted" and still carries "agsc-spec-version" and "agsc-generated-at" (AGSC-11-20)',
    run(world) {
      world.state.context = linkset(world).linkset[0];
      const link = anchorLink(world.state.context);
      assert.deepStrictEqual(link['agsc-visibility'], ['restricted']);
      assert.deepStrictEqual(link['agsc-spec-version'], anchorLink(world.state.publicContext)['agsc-spec-version']);
      assert.deepStrictEqual(link['agsc-generated-at'], ['2026-01-01T00:00:00Z']);
    },
  },
  {
    pattern: 'it omits "agsc-counts", "agsc-bundle-hash", "agsc-bundle-version" and "agsc-ledger-head", which the public build carried, and the "…rel#ledger" link',
    run(world) {
      const { context } = world.state;
      const link = anchorLink(context);
      for (const name of CONTENT_FACTS) assert.strictEqual(link[name], undefined, `the restricted build publishes ${name}`);
      for (const targets of Object.values(context)) {
        if (Array.isArray(targets)) for (const t of targets) for (const name of CONTENT_FACTS) assert.strictEqual(t[name], undefined, name);
      }
      assert.ok(!(`${REL}ledger` in context), 'a restricted node links its ledger');
    },
  },
  {
    pattern: 'it carries a "digest" only for "/graph.jsonld" and "/llms.txt", the targets it serves unauthenticated',
    run(world) {
      assert.deepStrictEqual(digested(world.state.context), OPEN);
      // The public build of the same Bundle carries digests of gated targets too.
      assert.ok(digested(world.state.publicContext).some((p) => !OPEN.includes(p)));
    },
  },
  {
    pattern: /^the discovery document carries exactly one "…rel#access" link, to "(https:\/\/[^"]+)" \(AGSC-11-20\)$/u,
    run(world, url) {
      const links = linkset(world).linkset[0][`${REL}access`] || [];
      assert.deepStrictEqual(links.map((l) => l.href), [url]);
    },
  },
  {
    pattern: 'the shipped validate-wellknown passes the discovery file at Level 0',
    run(world) {
      const r = world.tool('validate-wellknown', [path.join(world.dir, 'www', '.well-known', 'knowledge-linkset'), '--level', '0', '--json']);
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
    },
  },
  {
    pattern: 'a restricted node\'s discovery document, derived from a public build as AGSC-11-20 asks, with no "…rel#access" link',
    run(world) {
      world.bundle();
      world.commitAll('Initial content');
      built(world);
      const context = linkset(world).linkset[0];
      const link = anchorLink(context);
      for (const name of CONTENT_FACTS) delete link[name];
      link['agsc-visibility'] = ['restricted'];
      delete context[`${REL}ledger`];
      delete context[`${REL}access`];
      for (const [relation, targets] of Object.entries(context)) {
        if (relation === 'anchor') continue;
        for (const t of targets) {
          const local = new URL(t.href).origin === new URL(context.anchor).origin;
          if (t.digest !== undefined && !(local && OPEN.includes(new URL(t.href).pathname))) delete t.digest;
        }
      }
      world.state.restricted = context;
    },
  },
  {
    pattern: 'the agent checks it at Level 0 with the shipped validate-wellknown and with the Python checker',
    run(world) {
      checkBoth(world, []);
    },
  },
  {
    pattern: /^both report the error "(AGSC-E\d{3})" for the (missing|repeated) access link$/u,
    run(world, code) {
      for (const [name, exit, out] of world.state.checks) {
        assert.strictEqual(exit, 1, `${name} passes it: ${out}`);
        const findings = JSON.parse(out).findings;
        assert.ok(findings.some((f) => f.code === code && f.severity === 'error' && /access/u.test(f.message)), `${name}: ${out}`);
      }
    },
  },
  {
    pattern: /^the document carries (two|exactly one) "…rel#access" links?$/u,
    run(world, how) {
      checkBoth(world, how === 'two' ? [ACCESS_PAGE, 'https://agenticsystemcore.com/access/other/'] : [ACCESS_PAGE]);
    },
  },
  {
    pattern: /^the document's one "…rel#access" link carries (no "agsc-access"|"agsc-access" "none")$/u,
    run(world, how) {
      checkBoth(world, [ACCESS_PAGE], (context) => {
        const [link] = context[`${REL}access`];
        if (how.startsWith('no')) delete link['agsc-access'];
        else link['agsc-access'] = ['none'];
      });
    },
  },
  {
    pattern: /^the document carries exactly one "…rel#access" link and no "(agsc-generated-at|agsc-spec-version)"$/u,
    run(world, name) {
      checkBoth(world, [ACCESS_PAGE], (context) => { delete anchorLink(context)[name]; });
    },
  },
  {
    pattern: /^both report the error "(AGSC-E\d{3})" for (the access class of the access link|"(agsc-generated-at|agsc-spec-version)", which a restricted node keeps at every Level), and nothing else$/u,
    run(world, code, what, name) {
      const lists = [];
      for (const [checker, exit, out] of world.state.checks) {
        assert.strictEqual(exit, 1, `${checker} passes it: ${out}`);
        const { findings } = JSON.parse(out);
        // The one finding names what is wrong: the access attribute, or the kept fact.
        assert.deepStrictEqual(findings.map((f) => [f.code, f.severity]), [[code, 'error']], `${checker}: ${out}`);
        assert.ok(findings[0].message.includes(name || 'agsc-access'), `${checker}: ${out}`);
        lists.push(findings.map((f) => `${f.code} ${f.message}`));
      }
      // Parity (AGSC-09-93): the two checkers give the same verdict in the same words.
      assert.deepStrictEqual(lists[0], lists[1]);
    },
  },
  {
    pattern: 'both pass it',
    run(world) {
      for (const [name, exit, out] of world.state.checks) assert.strictEqual(exit, 0, `${name}: ${out}`);
    },
  },
  {
    pattern: 'an agent with no credentials reads the node over loopback from another origin',
    async run(world) {
      const { origin } = world.state.loopback;
      world.state.responses = Object.create(null);
      for (const route of [WELLKNOWN, '/graph.jsonld', '/llms.txt', '/chunks.jsonl', '/concepts/handoff/']) {
        world.state.responses[route] = await get(origin, route);
        assert.strictEqual(world.state.responses[route].status, 200, route);
      }
    },
  },
  {
    pattern: 'only "/.well-known/knowledge-linkset" is served with "Access-Control-Allow-Origin: *"; "/graph.jsonld", "/llms.txt", "/chunks.jsonl" and an item page are served without it (AGSC-11-20, AGSC-11-03)',
    run(world) {
      for (const [route, response] of Object.entries(world.state.responses)) {
        const allow = response.headers['access-control-allow-origin'];
        if (route === WELLKNOWN) assert.strictEqual(allow, '*', route);
        else assert.strictEqual(allow, undefined, `${route} is readable from any origin`);
        assert.strictEqual(response.headers['access-control-allow-credentials'], undefined, route);
      }
    },
  },
  {
    pattern: 'the discovery document it reads names no per-type count, no bundle hash, no content version, no ledger head and no ledger link',
    run(world) {
      const context = JSON.parse(world.state.responses[WELLKNOWN].body).linkset[0];
      assert.deepStrictEqual(anchorLink(context)['agsc-visibility'], ['restricted']);
      for (const targets of Object.values(context)) {
        if (Array.isArray(targets)) for (const t of targets) for (const name of CONTENT_FACTS) assert.strictEqual(t[name], undefined, name);
      }
      assert.ok(!(`${REL}ledger` in context));
    },
  },
];
