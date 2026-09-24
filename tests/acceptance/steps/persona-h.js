'use strict';
// verifies AGSC-01-22, AGSC-01-23, AGSC-01-26, AGSC-05-04, AGSC-05-04b
// Steps of features/persona-h-memory.feature that run offline.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { FIXTURE, ROOT, built, linkset, splitItem } = require('./_world.js');

/** The foreign OKF v0.2 bundle an agent imports: a procedure, an unknown type, a collision. */
const OKF = Object.freeze({
  'index.md': '---\nokf_version: "0.2"\n---\n\n# A foreign bundle\n',
  'ops/rotate.md': ['---', 'type: procedure', 'title: Rotate the signing key',
    'description: Rotate the signing key every ninety days and record who did it and when.', '---', '',
    '## When', '', 'Every ninety days.', '', '## Steps', '', '1. Rotate it.', '', '## Checks', '', 'The old key no longer verifies.', ''].join('\n'),
  'ops/attested.md': ['---', 'type: Attested Computation', 'title: Attested run',
    'description: A computation whose result carries an attestation that a verifier can check offline.', '---', '',
    'The result carries its own evidence.', ''].join('\n'),
  'notes/rotate.md': ['---', 'type: concept', 'kind: explainer', 'title: Rotation, explained',
    'description: A second note whose file name collides with the procedure kept in the other folder.', '---', '',
    'Why keys are rotated.', ''].join('\n'),
});

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
  {
    pattern: 'the Bundle root carries the Content Use Terms as "LICENSE-CONTENT"',
    run(world) {
      world.bundle();
      fs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(world.dir, 'LICENSE-CONTENT'));
    },
  },
  {
    pattern: /^the agent runs "npx agentic-system-core export --(markdown|okf|jsonld)"$/u,
    run(world, form) {
      const r = world.agsc(['export', `--${form}`], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
    },
  },
  {
    pattern: '"dist/export/markdown/" contains the lint-normalized Bundle with no key lost (AGSC-01-26)',
    run(world) {
      // The reference: the same Bundle after `lint --fix`, in a second scratch copy.
      const fixed = world.temp('agsc-acc-fixed-');
      fs.cpSync(FIXTURE, fixed, { recursive: true });
      const fix = world.agsc(['lint', '--fix'], { cwd: fixed, offline: true });
      assert.strictEqual(fix.exit, 0, fix.stdout + fix.stderr);
      const exported = world.snapshot('dist/export/markdown/content');
      const expected = new Map([...world.snapshot()].filter(([rel]) => rel.startsWith('content/'))
        .map(([rel]) => [rel.slice('content/'.length), fs.readFileSync(path.join(fixed, rel)).toString('base64')]));
      assert.deepStrictEqual([...exported.keys()], [...expected.keys()]);
      for (const [rel, bytes] of expected) {
        // The root document alone gains the content version (AGSC-01-26, AGSC-04-25).
        if (rel !== 'index.md') assert.strictEqual(exported.get(rel), bytes, `${rel} is not the lint-normalized file`);
      }
      const root = splitItem(world.read('dist/export/markdown/content/index.md')).frontmatter;
      assert.deepStrictEqual({ ...root, bundle_version: undefined },
        { ...splitItem(world.read('content/index.md')).frontmatter, bundle_version: undefined });
      assert.match(root.bundle_version, /^0\.0\.0\+20260101T000000Z$/u);
      for (const rel of expected.keys()) {
        if (rel === 'index.md') continue;
        const source = splitItem(world.read(`content/${rel}`)).frontmatter;
        const out = splitItem(world.read(`dist/export/markdown/content/${rel}`)).frontmatter;
        assert.deepStrictEqual(out, source, `${rel} lost a key`);
      }
      assert.ok(world.exists('dist/export/markdown/LICENSE-CONTENT'), 'the export does not carry the terms');
    },
  },
  {
    pattern: '"dist/export/okf/content/index.md" carries "okf_version" and a "content/log.md" is added',
    run(world) {
      assert.strictEqual(splitItem(world.read('dist/export/okf/content/index.md')).frontmatter.okf_version, '0.2');
      const log = world.read('dist/export/okf/content/log.md');
      for (const slug of ['a2a', 'handoff', 'mcp', 'supervisor']) assert.match(log, new RegExp(`^- ${slug}: `, 'mu'));
    },
  },
  {
    pattern: '"dist/export/graph.jsonld" equals "www/graph.jsonld" byte-for-byte',
    run(world) {
      built(world, { offline: true });
      assert.ok(fs.readFileSync(path.join(world.dir, 'dist', 'export', 'graph.jsonld'))
        .equals(fs.readFileSync(path.join(world.dir, 'www', 'graph.jsonld'))));
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the agent runs "npx agentic-system-core import ./some-okf-bundle --from okf"',
    run(world) {
      world.bundle();
      for (const [rel, text] of Object.entries(OKF)) world.write(`some-okf-bundle/${rel}`, text);
      world.state.import = world.agsc(['import', './some-okf-bundle', '--from', 'okf'], { offline: true });
      assert.strictEqual(world.state.import.exit, 0, world.state.import.stdout + world.state.import.stderr);
    },
  },
  {
    pattern: 'each file is written under the folder of its type, a "procedure" under "content/procedures/"',
    run(world) {
      assert.strictEqual(splitItem(world.read('content/procedures/rotate-2.md')).frontmatter.type, 'procedure');
      assert.strictEqual(splitItem(world.read('content/concepts/attested.md')).frontmatter.type, 'concept');
      assert.ok(!world.exists('content/concepts/index.md'), 'the root index.md became an item');
    },
  },
  {
    pattern: 'an unknown "type" value is imported as "concept" with the warning "AGSC-E506", the original kept as "x-okf-type" (AGSC-01-22)',
    run(world) {
      assert.strictEqual(splitItem(world.read('content/concepts/attested.md')).frontmatter['x-okf-type'], 'Attested Computation');
      assert.match(world.state.import.stderr, /^warn: AGSC-E506 [^\n]*attested\.md: the foreign type "Attested Computation"/mu);
    },
  },
  {
    pattern: 'colliding slugs are deduplicated with a "-2" suffix',
    run(world) {
      // Input is read in code-point path order (AGSC-01-23): notes/rotate.md before ops/rotate.md.
      assert.strictEqual(splitItem(world.read('content/concepts/rotate.md')).frontmatter.title, 'Rotation, explained');
      assert.strictEqual(splitItem(world.read('content/procedures/rotate-2.md')).frontmatter.title, 'Rotate the signing key');
    },
  },
  {
    pattern: 'a second run writes nothing and reports every item unchanged',
    run(world) {
      const before = world.snapshot('content');
      const again = world.agsc(['import', './some-okf-bundle', '--from', 'okf'], { offline: true });
      assert.strictEqual(again.exit, 0, again.stdout + again.stderr);
      assert.match(again.stderr, /^import: 0 written, 0 replaced, 3 unchanged$/mu);
      assert.deepStrictEqual(world.snapshot('content'), before);
    },
  },
  {
    pattern: '"npx agentic-system-core lint" finds no error in the imported items except a concept "kind" the foreign bundle never declared',
    run(world) {
      const lint = world.agsc(['lint', '--json'], { offline: true });
      const errors = JSON.parse(lint.stdout).findings.filter((f) => f.severity === 'error');
      for (const f of errors) {
        assert.strictEqual(f.file, 'content/concepts/attested.md', JSON.stringify(f));
        assert.match(f.message, /required property 'kind'/u, JSON.stringify(f));
      }
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
];
