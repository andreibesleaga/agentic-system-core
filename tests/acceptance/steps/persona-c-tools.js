'use strict';
// verifies AGSC-09-13, AGSC-05-33, AGSC-07-25
// Steps of features/persona-c-agent-mcp.feature for what the tool contract of 1.1 adds: an
// agent asks the local tool server why two items are linked (`explain`), which Link warnings
// the listed items carry (`check`) and what a selection needs (`brief`, which writes nothing),
// cites a chunk through the citation records of `read`, and meets the bound on `search`.
// The server is the real `agsc mcp` process the Background starts; the chunk lines are read
// from a build of the same Bundle at the same fixed instant. Nothing is fetched.

const assert = require('node:assert');
const crypto = require('node:crypto');

const { splitItem } = require('./_world.js');

const call = async (client, name, args) => (await client.callTool({ arguments: args, name })).structuredContent;

module.exports = [
  {
    pattern: 'the item "handoff" lists itself under "related", the Link warning "AGSC-E313" (AGSC-03-23)',
    run(world) {
      const rel = 'content/concepts/handoff.md';
      const text = world.read(rel);
      assert.ok(!/^related:/mu.test(text), 'the fixture already has a related key on handoff');
      world.write(rel, text.replace(/^requires:\n/mu, 'related:\n  - handoff\nrequires:\n'));
    },
  },
  {
    pattern: 'the agent calls tool "explain" with key "required-by", source "mcp" and target "a2a"',
    async run(world) {
      world.state.result = await call(world.state.client, 'explain', { key: 'required-by', source: 'mcp', target: 'a2a' });
    },
  },
  {
    pattern: 'the relation holds because "a2a" authors "requires" toward "mcp", the reading "inverse" (AGSC-05-33)',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'explanation');
      assert.strictEqual(r.trust, 'untrusted');
      assert.deepStrictEqual(r.body, {
        because: [{ from: [['a2a', 'requires', 'mcp']], rule: 'inverse' }], holds: true, key: 'required-by', source: 'mcp', target: 'a2a',
      });
    },
  },
  {
    pattern: 'a relation that no Link gives is the answer "holds" false with no step, not an error',
    async run(world) {
      const r = await call(world.state.client, 'explain', { key: 'contradicts', source: 'mcp', target: 'a2a' });
      assert.strictEqual(r.type, 'explanation');
      assert.deepStrictEqual(r.body, { because: [], holds: false, key: 'contradicts', source: 'mcp', target: 'a2a' });
      // A key that is none of the fourteen, nor an inverse name, is the error AGSC-E203.
      assert.strictEqual((await call(world.state.client, 'explain', { key: 'mentions', source: 'mcp', target: 'a2a' })).body.code, 'AGSC-E203');
    },
  },
  {
    pattern: 'the agent calls tool "check" with no selection',
    async run(world) {
      world.state.result = await call(world.state.client, 'check', {});
    },
  },
  {
    pattern: 'the answer names every listed item it checked, in code-point order, and each Link warning without a position (AGSC-09-13)',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'findings');
      // The listed set (AGSC-00-05): every item file of the Bundle that is neither a draft nor retired.
      const listed = [...world.snapshot('content').keys()].filter((rel) => /^[a-z]+s\/[^/]+\.md$/u.test(rel))
        .filter((rel) => !['draft', 'retired'].includes(splitItem(world.read(`content/${rel}`)).frontmatter.status))
        .map((rel) => rel.split('/')[1].slice(0, -3));
      assert.deepStrictEqual(r.body.selection, [...listed].sort());
      // The Given step seeded one warning, so the loop below has a finding to check.
      assert.ok(r.body.findings.length > 0, 'check returned no finding, so no warning was checked');
      assert.ok(r.body.findings.some((f) => f.code === 'AGSC-E313' && JSON.stringify(f).includes('handoff')),
        JSON.stringify(r.body.findings));
      for (const finding of r.body.findings) {
        assert.match(finding.code, /^AGSC-E31[3-6]$/u);
        for (const member of ['col', 'file', 'line', 'message']) assert.ok(!(member in finding), `${member} in ${JSON.stringify(finding)}`);
      }
    },
  },
  {
    pattern: 'the agent calls tool "brief" with the selection "a2a"',
    async run(world) {
      world.state.result = await call(world.state.client, 'brief', { selection: ['a2a'] });
    },
  },
  {
    pattern: 'the answer is the brief of that selection, "mcp" before "a2a" in its order, and nothing is written to the Bundle (AGSC-07-25)',
    run(world) {
      const r = world.state.result;
      assert.strictEqual(r.type, 'brief');
      assert.deepStrictEqual(r.body.order, ['mcp', 'a2a']);
      assert.ok(r.body.selection.includes('a2a') && r.body.selection.includes('mcp'), JSON.stringify(r.body.selection));
      assert.match(r.body.selection_digest, /^[0-9a-f]{64}$/u);
      assert.deepStrictEqual(world.snapshot(), world.state.before, 'the brief wrote into the Bundle');
    },
  },
  {
    pattern: 'each citation record of the answer carries the digest and id of its line in "/chunks.jsonl" and the content version of the build (AGSC-09-13)',
    run(world) {
      const records = world.state.result.body.chunks;
      assert.ok(records.length > 0, 'a2a carries no chunk');
      assert.strictEqual(world.agsc(['build']).exit, 0, world.last.stderr);
      const lines = world.read('www/chunks.jsonl').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l))
        .filter((l) => l.item === 'a2a');
      const version = JSON.parse(world.read('www/.well-known/knowledge-linkset')).linkset[0].describedby[0]['agsc-bundle-version'][0];
      assert.deepStrictEqual(records.map((c) => [c.id, c.digest, c.section]), lines.map((l) => [l.id, l.digest, l.section]));
      for (const [i, record] of records.entries()) {
        assert.strictEqual(record.digest, crypto.createHash('sha256').update(lines[i].text, 'utf8').digest('hex'));
        assert.strictEqual(record.bundle_version, version);
        assert.strictEqual(record.algorithm, 'sha-256');
        assert.strictEqual(record.coverage, 'text');
      }
    },
  },
  {
    pattern: 'the acceptance Bundle holds 120 more concepts that all mention "widget"',
    run(world) {
      world.bundle();
      for (let n = 1; n <= 120; n += 1) {
        const slug = `w-${String(n).padStart(3, '0')}`;
        world.write(`content/concepts/${slug}.md`, `---\ntitle: Widget ${n}\ntype: concept\nkind: explainer\ndescription: A widget of the shop.\n---\n\nA widget.\n`);
      }
    },
  },
  {
    pattern: 'the agent calls tool "search" with the query "widget" on the local tool server',
    async run(world) {
      world.state.client = await world.mcp();
      world.state.result = await call(world.state.client, 'search', { query: 'widget' });
    },
  },
  {
    pattern: 'the answer carries the first 100 hits by slug and the member "total" 120 (AGSC-09-13)',
    run(world) {
      const { body } = world.state.result;
      assert.strictEqual(body.hits.length, 100);
      assert.strictEqual(body.total, 120);
      assert.deepStrictEqual(body.hits.map((h) => h.slug), Array.from({ length: 100 }, (_, i) => `w-${String(i + 1).padStart(3, '0')}`));
    },
  },
  {
    pattern: 'a search under the bound carries no "total", as in 1.0',
    async run(world) {
      const r = await call(world.state.client, 'search', { query: 'protocol' });
      assert.ok(r.body.hits.length > 0 && r.body.hits.length <= 100);
      assert.deepStrictEqual(Object.keys(r.body), ['hits']);
    },
  },
];
