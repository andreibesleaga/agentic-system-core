'use strict';
// verifies AGSC-04-09, AGSC-06-06, AGSC-06-07, AGSC-06-08, AGSC-06-09, AGSC-06-10, AGSC-06-14, AGSC-06-17, AGSC-09-93, AGSC-10-12, AGSC-11-08, AGSC-11-12, AGSC-11-14
// Steps of features/persona-j-standards.feature that run offline. The build
// output stands in for the published site: what an implementer would fetch from
// the node is read from `www/`, and the shipped validator is run in its
// documented offline form (a file argument, whose targets it maps onto the same
// directory), so nothing reaches the network. Where a scenario checks response
// headers, the node is served on loopback by the real `agsc-host serve`. The
// w3id rules are read from `w3id/.htaccess` and applied by the small subset of
// mod_rewrite they use (RewriteCond on the Accept header, RewriteRule with R=303),
// so the redirect table is checked without w3id's host; the live 303 is the
// `external` scenario. Two federating publishers are two scratch copies of the
// acceptance Bundle with the bases `https://<name>/`: the configuration names a
// peer only by an https URL (AGSC-10-12), so their mutual check runs in its
// documented two-file form. The federation walk an agent runs is the engine's
// library function with an injected fetch over the built files and an injected
// address map, so no name is resolved and no connection is opened.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ROOT, built, linkset } = require('./_world.js');

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

const WELLKNOWN = '.well-known/knowledge-linkset';
const PROFILE = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
const SITE = 'https://agenticsystemcore.com/';
/** A public address standing in for a peer's host name: the walk's fetch is injected, so it is never reached. */
const PUBLIC_ADDRESS = '2606:4700:4700::1111';

/**
 * A scratch copy of the acceptance Bundle published at `https://<name>/` with the
 * given peers (host names), committed on the fixed dates and built; it becomes the
 * current Bundle. `edit(config)` may change the configuration further.
 */
function node(world, name, peers, edit = () => {}) {
  world.bundle();
  const config = JSON.parse(world.read('agsc.config.json'));
  config.site.base = `https://${name}/`;
  config.bundle.id = name.split('.')[0];
  if (peers.length) config.peers = peers.map((peer) => `https://${peer}/${WELLKNOWN}`);
  edit(config);
  world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
  world.commitAll(`The node ${name}`);
  built(world);
  world.state.nodes = world.state.nodes || Object.create(null);
  world.state.nodes[name] = world.dir;
  return world.dir;
}

/** The shipped checker on two nodes' discovery files, the second as `--peer`. */
function peerCheck(world, from, to) {
  const file = (name) => path.join(world.state.nodes[name], 'www', ...WELLKNOWN.split('/'));
  return world.tool('validate-wellknown', [file(from), '--level', '2', '--peer', file(to), '--json']);
}

/**
 * The subset of mod_rewrite the w3id rules use, in a per-directory context: the
 * request path has no leading slash; a RewriteCond tests the Accept header (an
 * [OR] joins it to the next condition, otherwise conditions are all required);
 * the first RewriteRule whose pattern and conditions match answers with its R
 * status and its substitution, $n replaced by the pattern's groups.
 */
function readRewriteRules(text) {
  const rules = [];
  let conditions = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const parts = line.split(/\s+/u);
    if (parts[0] === 'RewriteCond') {
      assert.strictEqual(parts[1], '%{HTTP_ACCEPT}', `a condition on ${parts[1]}, which this reader does not model`);
      conditions.push({ or: /\[OR\]/u.test(parts[3] || ''), pattern: new RegExp(parts[2], 'u') });
    } else if (parts[0] === 'RewriteRule') {
      const flags = (parts[3] || '').replace(/^\[|\]$/gu, '').split(',');
      const status = flags.map((f) => /^R=(\d{3})$/u.exec(f)).find(Boolean);
      rules.push({ conditions, pattern: new RegExp(parts[1], 'u'), status: status ? Number(status[1]) : null, target: parts[2] });
      conditions = [];
    }
  }
  return rules;
}

/** Whether a rule's conditions hold for an Accept value: groups joined by [OR], all groups required. */
function conditionsHold(conditions, accept) {
  let group = false;
  for (const [i, c] of conditions.entries()) {
    group = group || c.pattern.test(accept);
    const closes = !c.or || i === conditions.length - 1;
    if (closes) {
      if (!group) return false;
      group = false;
    }
  }
  return true;
}

function rewrite(rules, requestPath, accept) {
  for (const rule of rules) {
    const m = rule.pattern.exec(requestPath);
    if (!m || !conditionsHold(rule.conditions, accept)) continue;
    return { location: rule.target.replace(/\$(\d)/gu, (_, n) => m[Number(n)] || ''), status: rule.status };
  }
  return null;
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
    pattern: 'the agent reads the rules of "w3id/.htaccess" that w3id serves under "https://w3id.org/agentic-system-core/"',
    run(world) {
      world.state.rewrite = readRewriteRules(fs.readFileSync(path.join(ROOT, 'w3id', '.htaccess'), 'utf8'));
      assert.ok(world.state.rewrite.length >= 10, 'the rule file carries no rewrite rules');
    },
  },
  {
    pattern: 'each of these requests is answered "303 See Other" with this "Location":',
    run(world, table) {
      assert.ok(table && table.rows.length > 1, 'the step needs a table of | path | Accept | Location | rows');
      const [header, ...rows] = table.rows.map((row) => row.cells.map((c) => c.value));
      assert.deepStrictEqual(header, ['path', 'Accept', 'Location']);
      for (const [requestPath, accept, location] of rows) {
        const answer = rewrite(world.state.rewrite, requestPath, accept);
        assert.ok(answer, `no rule answers ${requestPath} with Accept: ${accept}`);
        assert.deepStrictEqual(answer, { location, status: 303 }, `${requestPath} with Accept: ${accept}`);
      }
    },
  },
  {
    pattern: 'every "Location" the rules can produce is on "https://agenticsystemcore.com/", so no rule is an open redirect',
    run(world) {
      for (const rule of world.state.rewrite) {
        assert.strictEqual(rule.status, 303, `${rule.pattern} answers ${rule.status}`);
        // The host is literal in every substitution: no group can move the redirect to another host.
        assert.ok(rule.target.startsWith(SITE), `${rule.pattern} redirects to ${rule.target}`);
      }
    },
  },
  {
    pattern: 'the host serves the discovery document as "application/json", with the profile carried only by a "Link: rel=profile" header',
    run(world) {
      // `agsc-host serve` answers with the reference `_headers` of the build, read on every request.
      const blocks = world.read('www/_headers').split(/\n(?=\S)/u);
      const at = blocks.findIndex((b) => b.split('\n')[0].trim() === `/${WELLKNOWN}`);
      assert.ok(at >= 0, 'the build writes no header block for the discovery document');
      const lines = blocks[at].split('\n');
      assert.ok(lines.some((l) => l.trim() === `Link: <${PROFILE}>; rel="profile"`), 'the block carries no profile Link');
      const type = lines.findIndex((l) => /^\s+Content-Type:/u.test(l));
      assert.ok(type > 0, 'the block names no Content-Type');
      lines[type] = '  Content-Type: application/json';
      blocks[at] = lines.join('\n');
      world.write('www/_headers', blocks.join('\n'));
    },
  },
  {
    pattern: 'its finding "AGSC-E201" says the media type "application/json" is not "application/linkset+json" (AGSC-06-07)',
    run(world) {
      const findings = world.json().findings.filter((f) => f.code === 'AGSC-E201' && f.severity === 'error');
      assert.ok(findings.some((f) => f.message.includes('"application/json"') && f.message.includes('application/linkset+json')
        && f.message.includes('AGSC-06-07')), world.last.stdout);
    },
  },
  {
    pattern: /^two publishers build the nodes "([^"]+)" and "([^"]+)" from the acceptance Bundle, each naming the other in "peers\[\]"$/u,
    run(world, a, b) {
      node(world, a, [b]);
      node(world, b, [a]);
    },
  },
  {
    pattern: /^the publisher runs the shipped validate-wellknown at Level 2 on the discovery file of "([^"]+)" with "--peer" the discovery file of "([^"]+)"$/u,
    run(world, a, b) {
      world.state.mutual = peerCheck(world, a, b);
    },
  },
  {
    pattern: /^it exits 0, and so does the same check from "([^"]+)" to "([^"]+)" \(AGSC-10-12\)$/u,
    run(world, b, a) {
      for (const r of [world.state.mutual, peerCheck(world, b, a)]) {
        assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
        assert.strictEqual(JSON.parse(r.stdout).status, 'pass');
      }
    },
  },
  {
    pattern: /^a node "([^"]+)" that names "([^"]+)" as its peer, while "\2" does not name it, is "resolved, not mutual" with "(AGSC-E\d{3})"$/u,
    run(world, c, a, code) {
      node(world, c, [a]);
      for (const r of [peerCheck(world, a, c), peerCheck(world, c, a)]) {
        assert.strictEqual(r.exit, 1, r.stdout);
        const findings = JSON.parse(r.stdout).findings;
        assert.ok(findings.some((f) => f.code === code && /resolved, not mutual/u.test(f.message)), r.stdout);
      }
    },
  },
  {
    pattern: /^the publisher adds the contribute entry "([^"]+)" in mode "(channel)", backed by the channel "([^"]+)" that publishes "(hitl)"$/u,
    run(world, target, mode, channel, publish) {
      const config = JSON.parse(world.read('agsc.config.json'));
      config.contribute = [...(config.contribute || []), { channel, mode, target }];
      config.channels = [{ adapter: 'email', author: 'inbox-bot', name: channel, owner: config.bundle.operator, publish }];
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
      world.state.contribute = config.contribute;
    },
  },
  {
    pattern: 'the discovery document carries one "…rel#contribute" link per "contribute[]" entry, each with its mode as "agsc-contribute-mode" (AGSC-11-14)',
    run(world) {
      const links = linkset(world).linkset[0][`${REL}contribute`];
      const got = links.map((l) => [l.href, l['agsc-contribute-mode']]).sort();
      const want = world.state.contribute.map((c) => [c.target, [c.mode]]).sort();
      assert.ok(want.some(([, mode]) => mode[0] === 'channel'), 'no channel entry is configured');
      assert.deepStrictEqual(got, want);
    },
  },
  {
    pattern: /^the channel "([^"]+)" is set to publish "(auto|hitl)"$/u,
    run(world, name, publish) {
      const config = JSON.parse(world.read('agsc.config.json'));
      const channel = config.channels.find((c) => c.name === name);
      assert.ok(channel, `no channel ${name}`);
      channel.publish = publish;
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
    },
  },
  {
    pattern: /^the node "([^"]+)" names "([^"]+)" as its peer, and its item "([a-z0-9-]+)" cites "([^"]+)" and "([^"]+)" in "sources\[\]"$/u,
    run(world, name, peer, slug, cited, other) {
      world.bundle();
      const config = JSON.parse(world.read('agsc.config.json'));
      config.site.base = `https://${name}/`;
      config.peers = [`https://${peer}/${WELLKNOWN}`];
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
      const file = `content/concepts/${slug}.md`;
      const text = world.read(file);
      const close = text.indexOf('\n---\n', 4);
      assert.ok(close > 0, `${file} has no front matter`);
      world.write(file, `${text.slice(0, close)}\nsources:\n  - resource: ${cited}\n  - resource: ${other}${text.slice(close)}`);
      world.state.citation = { base: `https://${name}/`, cited, other, peer: `https://${peer}/`, slug };
    },
  },
  {
    pattern: /^"graph\.nq", "graph\.ttl" and "graph\.jsonld" of "([^"]+)" each say that "([a-z0-9-]+)" has "rdfs:seeAlso" "([^"]+)" and "asc:peerOrigin" "([^"]+)" \(AGSC-11-12\)$/u,
    run(world, name, slug, cited, peer) {
      const item = `https://${name}/concepts/${slug}/`;
      const nq = world.read('www/graph.nq');
      assert.ok(nq.includes(`<${item}> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${cited}> <https://${name}/> .\n`), 'no rdfs:seeAlso quad');
      assert.ok(nq.includes(`<${item}> <https://w3id.org/agentic-system-core/ns#peerOrigin> <${peer}> <https://${name}/> .\n`), 'no asc:peerOrigin quad');
      const block = world.read('www/graph.ttl').split('\n\n').find((b) => b.startsWith(`<${item}> `));
      assert.ok(block, `graph.ttl has no block for ${item}`);
      assert.match(block, new RegExp(`\\n {4}rdfs:seeAlso <${cited.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}> [;.]`, 'u'));
      assert.match(block, new RegExp(`\\n {4}asc:peerOrigin <${peer.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}> [;.]`, 'u'));
      const nodeOf = JSON.parse(world.read('www/graph.jsonld'))['@graph'].find((n) => n['@id'] === item);
      assert.deepStrictEqual([nodeOf.seeAlso, nodeOf.peerOrigin], [cited, peer]);
    },
  },
  {
    pattern: /^the source on "([^"]+)", which no peer declares, gets neither, and no Link key of "([a-z0-9-]+)" names a URL$/u,
    run(world, host, slug) {
      const { base } = world.state.citation;
      const item = `<${base}concepts/${slug}/>`;
      for (const view of ['www/graph.nq', 'www/graph.ttl']) {
        for (const line of world.read(view).split('\n').filter((l) => /seeAlso|peerOrigin/u.test(l))) {
          assert.ok(!line.includes(host), `${view}: ${line}`);
        }
      }
      const nodes = JSON.parse(world.read('www/graph.jsonld'))['@graph'];
      for (const n of nodes) {
        for (const key of ['seeAlso', 'peerOrigin']) assert.ok(!JSON.stringify(n[key] || '').includes(host), `graph.jsonld ${n['@id']} ${key}`);
      }
      // The only objects of the item's own quads that leave its node are the two of
      // AGSC-11-12: a Link key's value is a slug of this Bundle, never a URL (AGSC-03-02).
      const leaving = world.read('www/graph.nq').split('\n').filter((l) => l.startsWith(`${item} `))
        .map((l) => /^<[^>]+> <([^>]+)> <([^>]+)> /u.exec(l)).filter(Boolean)
        .filter((m) => !m[2].startsWith(base) && !m[2].startsWith('https://w3id.org/agentic-system-core/ns#'));
      assert.deepStrictEqual(leaving.map((m) => m[1]).sort(),
        ['http://www.w3.org/2000/01/rdf-schema#seeAlso', 'https://w3id.org/agentic-system-core/ns#peerOrigin']);
    },
  },
  {
    pattern: /^the node "([^"]+)" names "([^"]+)" as its peer, and the Bundle is built$/u,
    run(world, name, peer) {
      node(world, name, [peer]);
    },
  },
  {
    pattern: /^an agent walks the federation from "([^"]+)" while "([^"]+)" resolves to "([^"]+)"$/u,
    run(world, from, peer, address) {
      const federation = require(path.join(ROOT, 'src', 'boundary', 'federation.js'));
      const start = `https://${from}/${WELLKNOWN}`;
      const document = JSON.parse(fs.readFileSync(path.join(world.state.nodes[from], 'www', ...WELLKNOWN.split('/')), 'utf8'));
      const reads = [];
      const fetch = (key) => {
        reads.push(key);
        if (key !== start) return { ok: false, peers: [] };
        const context = document.linkset[0];
        return { anchor: context.anchor, ok: true, peers: (context[`${REL}peer`] || []).map((l) => l.href), url: key };
      };
      const result = federation.walk({ fetch, resolved: { [from]: [PUBLIC_ADDRESS], [peer]: [address] }, start });
      world.state.walk = { reads, result, start };
    },
  },
  {
    pattern: /^the walk skips "([^"]+)" with "(AGSC-E\d{3})" and never reads it \(AGSC-11-08\)$/u,
    run(world, peer, code) {
      const { reads, result, start } = world.state.walk;
      const target = `https://${peer}/${WELLKNOWN}`;
      assert.deepStrictEqual(result.visited, [start]);
      assert.deepStrictEqual(result.skipped.map((s) => ({ ...s })), [{ code, peer: target }]);
      assert.deepStrictEqual(reads, [start], `the walk read ${reads.join(', ')}`);
    },
  },
  {
    pattern: /^the shipped validate-wellknown refuses "(https:\/\/\[[0-9a-f:.]+\]\/\.well-known\/knowledge-linkset)" with "(AGSC-E\d{3})" and makes no network call$/u,
    run(world, url, code) {
      // Run under the network trap: a refusal of the address happens before any connection.
      const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'validate-wellknown'), url, '--json'], {
        cwd: world.dir, encoding: 'utf8', env: world.offlineEnv(),
      });
      assert.strictEqual(r.status, 1, r.stdout + r.stderr);
      const findings = JSON.parse(r.stdout).findings;
      assert.deepStrictEqual(findings.map((f) => f.code), [code], r.stdout);
      assert.match(findings[0].message, /address refused/u);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
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
