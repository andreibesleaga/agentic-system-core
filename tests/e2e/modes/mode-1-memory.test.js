'use strict';
// verifies AGSC-04-25, AGSC-06-08, AGSC-06-10, AGSC-10-12
// MODE 1 — distributed memory: two nodes that declare each other, walked by a person
// (the mutual check) and by an agent (discovery → peer → digests). Every link the
// discovery document carries resolves on the served node: a link to a route the node
// does not emit (`/legal/` without a licence text, `/specs/`) is a 404 every agent
// follows, so it is not emitted. Loopback stands in for DNS; nothing leaves the machine.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const kit = require('./_kit.js');

const WELLKNOWN = '/.well-known/knowledge-linkset';
const REL = 'https://w3id.org/agentic-system-core/rel#';

function node(name, peer, { licence }) {
  const dir = kit.projectBundle(`m1-${name}`, { base: `https://${name}.example/` });
  const config = JSON.parse(kit.read(dir, 'agsc.config.json'));
  config.peers = [`https://${peer}.example${WELLKNOWN}`];
  config.bundle.id = name;
  kit.write(dir, 'agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
  if (licence) fs.copyFileSync(path.join(kit.ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  kit.commitAll(dir, `node ${name}`);
  const built = kit.agsc(dir, ['build']);
  assert.strictEqual(built.code, 0, built.stderr);
  return dir;
}

const checker = (args) => spawnSync(process.execPath, [path.join(kit.ROOT, 'tools', 'validate-wellknown'), ...args], { encoding: 'utf8' });

test('Mode 1, a person: two nodes pass the mutual check at Level 2, and a one-sided claim fails it', () => {
  const a = node('a', 'b', { licence: false });
  const b = node('b', 'a', { licence: true });
  const mutual = checker([path.join(a, 'www', WELLKNOWN), '--level', '2', '--peer', path.join(b, 'www', WELLKNOWN)]);
  assert.strictEqual(mutual.status, 0, mutual.stdout + mutual.stderr);
  const c = node('c', 'a', { licence: false });
  const oneSided = checker([path.join(a, 'www', WELLKNOWN), '--level', '2', '--peer', path.join(c, 'www', WELLKNOWN), '--json']);
  assert.strictEqual(oneSided.status, 1);
  assert.ok(JSON.parse(oneSided.stdout).findings.some((f) => f.code === 'AGSC-E907'));
});

test('Mode 1, an agent: discovery, the peer, the digests — and every discovery link resolves', async () => {
  const a = node('a', 'b', { licence: false });
  const b = node('b', 'a', { licence: true });
  const servers = { 'a.example': await kit.serve(path.join(a, 'www')), 'b.example': await kit.serve(path.join(b, 'www')) };
  const fetchIri = (iri) => {
    const url = new URL(iri);
    return servers[url.host].get(url.pathname);
  };
  try {
    const docA = JSON.parse((await servers['a.example'].get(WELLKNOWN)).body);
    const linksA = docA.linkset[0];
    // A node with no licence text links no licence page, and no node of this engine
    // links /specs/, which the engine never emits.
    assert.ok(!('license' in linksA), 'a license link to a /legal/ route this node does not emit');
    assert.ok(!('service-doc' in linksA), 'a service-doc link to a /specs/ route this node does not emit');
    // The agent follows the peer link to B.
    const peer = linksA[`${REL}peer`].map((l) => l.href);
    assert.deepStrictEqual(peer, [`https://b.example${WELLKNOWN}`]);
    const docB = JSON.parse((await fetchIri(peer[0])).body);
    const linksB = docB.linkset[0];
    assert.strictEqual(linksB.anchor, 'https://b.example/');
    assert.deepStrictEqual(linksB.license.map((l) => l.href), ['https://b.example/legal/']);
    // Every link of both documents resolves, and every digest checks.
    let digests = 0;
    for (const links of [linksA, linksB]) {
      for (const [relation, list] of Object.entries(links)) {
        if (!Array.isArray(list) || relation === `${REL}peer`) continue;
        for (const one of list) {
          // A link off the node (a forge's contribution target) is not the node's to serve.
          if (new URL(one.href).host !== new URL(links.anchor).host) continue;
          const got = await fetchIri(one.href);
          assert.strictEqual(got.status, 200, `${relation} ${one.href} answered ${got.status}`);
          if (one.digest) {
            const want = one.digest[0].replace(/^sha-256=:|:$/gu, '');
            assert.strictEqual(createHash('sha256').update(got.body).digest('base64'), want, `${one.href} digest`);
            digests += 1;
          }
        }
      }
    }
    assert.ok(digests >= 8, `only ${digests} digests were checked`);
    // B's content, read the way an agent reads it.
    assert.match(String((await fetchIri('https://b.example/llms.txt')).body), /^# /u);
    const graph = JSON.parse((await fetchIri('https://b.example/graph.jsonld')).body);
    assert.ok((graph['@graph'] || []).some((n) => n['@id'] === 'https://b.example/concepts/handoff/'));
  } finally {
    await servers['a.example'].close();
    await servers['b.example'].close();
  }

  // The skim context states the content version /llms.txt states for the same state.
  const exported = kit.agsc(b, ['export', '--to', 'llm-context']);
  assert.strictEqual(exported.code, 0, exported.stderr);
  const version = (text) => /^bundle_version: (.+)$/mu.exec(text)[1];
  const llms = version(kit.read(b, 'www/llms.txt'));
  assert.match(llms, /^0\.0\.0\+1\.g[0-9a-f]{12}$/u);
  assert.strictEqual(version(kit.read(b, 'dist/export/llm-context/llms-ctx.txt')), llms);

  // The agent on A records a lesson that cites B, through A's own tool server.
  const mcp = await kit.mcpClient(a);
  try {
    const lesson = await mcp.call('remember', {
      body: '## Lesson\n\nPair retries with a breaker.', kind: 'lesson', operator: 'human:tester',
      sources: [{ id: 'b-handoff', resource: 'https://b.example/concepts/handoff/' }, { id: 'bad', resource: 'javascript:alert(1)' }],
      title: 'Pair retries with a breaker',
    });
    assert.deepStrictEqual(lesson.body.frontmatter.sources, [{ id: 'b-handoff', resource: 'https://b.example/concepts/handoff/' }]);
    assert.deepStrictEqual(lesson.body.findings.map((f) => f.code), ['AGSC-E506']);
  } finally {
    await mcp.close();
  }
});
