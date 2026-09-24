'use strict';
// verifies AGSC-02-95, AGSC-08-04, AGSC-08-27, AGSC-09-14a, AGSC-09-14b
// MODE 0 — the self-correcting wiki, walked by a person and by an agent.
//
// A person adopts a folder of notes, meets a broken link that stops the build, fixes
// it, edits a page and proposes the edit; the NOW page lists what went stale. An
// agent reads the same memory through the official MCP client and is handed
// prepared text. Real command line, real git with fixed dates, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const kit = require('./_kit.js');

const SECURITY = 'Contact: https://example.org/security\nExpires: 2027-06-01T00:00:00Z\n';

test('Mode 0, a person: adopt notes, a broken link stops the build, an edit is proposed with the edit in it', () => {
  const home = kit.scratch('m0');
  const dir = path.join(home, 'notes');
  fs.mkdirSync(dir);
  kit.write(dir, 'brewing.md', '# Brewing coffee\n\nSee [Grind size](grind-size.md) before you start.\n');
  kit.write(dir, 'grind-size.md', '# Grind size\n\nFiner for espresso.\n');

  // Adoption: two notes that link to each other move together and still resolve.
  const adopted = kit.agsc(dir, ['init']);
  assert.strictEqual(adopted.code, 0, adopted.stderr);
  assert.doesNotMatch(adopted.stderr, /AGSC-E507 the reference "grind-size\.md"/u);
  assert.ok(!fs.existsSync(path.join(dir, 'content', 'assets', 'grind-size.md')), 'an adopted note was duplicated into assets');
  kit.write(dir, '.well-known/security.txt', SECURITY);
  kit.write(dir, 'content/concepts/boiling-point.md', kit.item({
    type: 'concept', title: 'Boiling point',
    description: 'Water boils at one hundred degrees at sea level and lower on a mountain, which matters.',
    prov: kit.PROV, kind: 'explainer', stale_after: '"2026-06-01T00:00:00Z"',
  }, '# Boiling point\n\nLower at altitude.'));
  // A second `init` over the adopted Bundle changes nothing.
  const again = kit.agsc(dir, ['init']);
  assert.strictEqual(again.code, 0, again.stderr);
  assert.doesNotMatch(again.stderr, /^wrote: content\//mu);
  kit.commitAll(dir, 'adopted notes');

  // A broken link: lint says where, and the build refuses to publish.
  const brewing = kit.read(dir, 'content/concepts/brewing.md');
  kit.write(dir, 'content/concepts/brewing.md', `${brewing}\nSalt it like [pasta water](salting.md).\n`);
  const lint = kit.agsc(dir, ['lint', '--json']);
  assert.strictEqual(lint.code, 1);
  assert.ok(kit.codes(lint).includes('AGSC-E310'), JSON.stringify(lint.envelope));
  const refused = kit.agsc(dir, ['build']);
  assert.strictEqual(refused.code, 1);
  assert.ok(!fs.existsSync(path.join(dir, 'www', 'index.html')), 'a failing build published a site');
  // The plain line names the file, so a person needs no --json to find it.
  assert.match(kit.agsc(dir, ['lint']).stderr, /AGSC-E310 .*content\/concepts\/brewing\.md/u);

  // The fix; the build publishes; NOW lists the stale item.
  kit.write(dir, 'content/concepts/brewing.md', brewing);
  const built = kit.agsc(dir, ['build']);
  assert.strictEqual(built.code, 0, built.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'www', 'concepts', 'brewing', 'index.html')));
  assert.match(kit.read(dir, 'www/now.md'), /## Stale items[\s\S]*boiling-point/u);

  // The person edits a page and proposes it: the patch carries the EDIT, against the
  // committed version, and applies to a clean checkout of that commit.
  const grind = kit.read(dir, 'content/concepts/grind-size.md');
  kit.write(dir, 'content/concepts/grind-size.md', `${grind}\nCoarser for a French press.\n`);
  assert.strictEqual(kit.agsc(dir, ['lint', '--fix']).code, 0);
  const proposed = kit.agsc(dir, ['propose', 'grind-size']);
  assert.strictEqual(proposed.code, 0, proposed.stderr);
  const patch = kit.read(dir, 'dist/proposal/1.patch');
  assert.match(patch, /^\+Coarser for a French press\.$/mu, patch);
  assert.doesNotMatch(proposed.stderr, /git apply/u, 'the working tree already holds the change');
  assert.match(proposed.stderr, /run: git add content\/concepts\/grind-size\.md && git commit/u);
  const clone = path.join(home, 'clone');
  kit.git(home, ['clone', '-q', dir, clone]);
  const check = spawnSync('git', ['apply', '--check', path.join(dir, 'dist/proposal/1.patch')], { cwd: clone, encoding: 'utf8', env: kit.env(home) });
  assert.strictEqual(check.status, 0, check.stderr);
  // With nothing changed, the Proposal is empty and says so, printing no command that would fail.
  kit.commitAll(dir, 'the edit');
  const empty = kit.agsc(dir, ['propose', 'grind-size', '--json']);
  assert.deepStrictEqual(kit.codes(empty), ['AGSC-E506']);
  assert.doesNotMatch(empty.stderr, /^run: /mu);

  // The review lane is lint-only: no model call is reachable from it.
  const review = kit.agsc(dir, ['review']);
  assert.strictEqual(review.code, 0, review.stderr);
  assert.match(review.stderr, /no model call is reachable/u);
});

test('Mode 0, an agent: search, read, links, ask with citations, propose the canonical file, remember its spend', async () => {
  const dir = kit.projectBundle('m0-agent');
  kit.commitAll(dir, 'the memory');
  const mcp = await kit.mcpClient(dir);
  try {
    const listed = await mcp.client.listTools();
    assert.deepStrictEqual(listed.tools.map((t) => t.name).sort(), ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search']);
    const remember = listed.tools.find((t) => t.name === 'remember');
    for (const name of ['usage', 'operator', 'agent', 'model']) {
      assert.ok(name in remember.inputSchema.properties, `the manifest does not name remember's ${name}`);
    }
    assert.strictEqual(remember.inputSchema.properties.usage.type, 'object');

    const found = await mcp.call('search', { query: 'handoff' });
    assert.strictEqual(found.trust, 'untrusted');
    assert.ok(found.body.hits.some((h) => h.slug === 'handoff'));
    const read = await mcp.call('read', { slug: 'handoff' });
    assert.strictEqual(read.body.slug, 'handoff');
    const links = await mcp.call('links', { slug: 'handoff' });
    assert.ok(links.body.edges.some((e) => e.key === 'requires' && e.target === 'supervisor'));
    const asked = await mcp.call('ask', { question: 'how does a handoff work' });
    assert.ok(asked.citations.length >= 1 && asked.citations.every((c) => c.startsWith('https://proj.example/')));
    assert.strictEqual((await mcp.call('ask', { question: 'quantum chromodynamics' })).body, 'no answer in this memory');

    // propose hands back the item's file: one blank line between block and body.
    const proposal = await mcp.call('propose', { slug: 'handoff' });
    assert.doesNotMatch(proposal.body.markdown, /\n---\n\n\n/u);
    assert.match(proposal.body.markdown, /\n---\n\n## Intent\n/u);

    // remember: a conforming item or a refusal that says why.
    const noInstant = await mcp.call('remember', { actor: 'process:probe', body: 'b', kind: 'episode', title: 'Run one' });
    assert.strictEqual(noInstant.body.code, 'AGSC-E003');
    const badActor = await mcp.call('remember', { actor: 'agent:probe', at: '2026-09-02T10:00:00Z', body: 'b', kind: 'episode', title: 'Run one' });
    assert.strictEqual(badActor.body.code, 'AGSC-E204');
    const usage = { cost_usd: 0.01, estimate: false, model: 'm', tokens_in: 10, tokens_out: 5 };
    const spent = await mcp.call('remember', {
      actor: 'process:probe', at: '2026-09-02T10:00:00Z', body: '## What happened\n\nx', kind: 'episode',
      model: 'm', operator: 'human:tester', title: 'Run one', usage,
    });
    assert.strictEqual(spent.type, 'proposal');
    assert.deepStrictEqual(spent.body.frontmatter.usage, usage, 'the spend was not carried onto the episode');
    assert.strictEqual(spent.body.frontmatter.started, '2026-09-02T10:00:00Z');
  } finally {
    await mcp.close();
  }
});
