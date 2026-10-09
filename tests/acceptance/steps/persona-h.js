'use strict';
// verifies AGSC-01-22, AGSC-01-23, AGSC-01-26, AGSC-01-26a, AGSC-01-27, AGSC-05-04, AGSC-05-04b, AGSC-06-26
// Steps of features/persona-h-memory.feature that run offline: the lossless export
// forms, a foreign OKF bundle, the COGX archive another memory system reads, there
// and back, the connectors example that reshapes `chunks.jsonl` for a framework's
// memory store, and the other export forms. The import into a copy of the Bundle
// that holds no item, and the import run again, are persona-g's phrases.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

const TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
const RECORDS = path.join(ROOT, 'examples', 'connectors', 'frameworks', 'records.js');
const SHAPES = Object.freeze(['langgraph', 'autogen', 'mem0']);

/** The citation members of one reshaped record, wherever its framework keeps metadata. */
function citationOf(shape, record) {
  if (shape === 'langgraph') return record.value;
  return record.metadata;
}

/** The `@id`s of a built graph. */
function graphIds(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'www', 'graph.jsonld'), 'utf8'))['@graph'].map((n) => n['@id']).sort();
}

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
  // ----------------------------------------------- COGX, records.js, other forms
  {
    pattern: 'the archive "dist/export/cogx" holds no "permissions.json", and every record names its item\'s IRI, the licence, the terms and the trust mark "untrusted"',
    run(world) {
      const dir = 'dist/export/cogx';
      assert.ok(world.exists(`${dir}/manifest.json`), 'the archive has no manifest');
      assert.ok(!world.exists(`${dir}/permissions.json`), 'the archive carries permissions.json');
      const files = fs.readdirSync(path.join(world.dir, dir)).filter((f) => f.endsWith('.jsonl')).sort();
      assert.ok(files.includes('entities.jsonl'), files.join(', '));
      let records = 0;
      for (const file of files) {
        for (const line of world.read(`${dir}/${file}`).split('\n').filter(Boolean)) {
          // A raw node is a plain property record: its record sits at the top level. A
          // fact names its item as the subject of the statement.
          const record = JSON.parse(line);
          const agsc = record.metadata ? record.metadata.agsc : record.agsc;
          assert.match(agsc.iri || record.subject_ref, /^https:\/\/agenticsystemcore\.com\//u, `${file}: ${line}`);
          assert.strictEqual(agsc.license, TERMS, file);
          assert.strictEqual(agsc.terms, TERMS, file);
          assert.strictEqual(agsc.trust, 'untrusted', file);
          records += 1;
        }
      }
      assert.ok(records > 0);
    },
  },
  {
    pattern: 'the copy builds, and its graph names every item the first node\'s graph names',
    run(world) {
      built(world, { offline: true });
      const copy = world.agsc(['build'], { cwd: world.state.target, offline: true });
      assert.strictEqual(copy.exit, 0, copy.stdout + copy.stderr);
      assert.deepStrictEqual(graphIds(world.state.target), graphIds(world.dir));
    },
  },
  {
    pattern: 'the agent reshapes "www/chunks.jsonl" with the connectors example records.js for LangGraph, AutoGen and Mem0 under the network trap',
    run(world) {
      world.state.records = {};
      for (const shape of SHAPES) {
        const r = spawnSync(process.execPath, [RECORDS, path.join(world.dir, 'www', 'chunks.jsonl'), shape],
          { cwd: world.dir, encoding: 'utf8', env: world.offlineEnv() });
        assert.strictEqual(r.status, 0, r.stderr);
        world.state.records[shape] = r.stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      }
    },
  },
  {
    pattern: 'each shape gives one record per chunk, and every record keeps the item IRI, the chunk digest, the licence, the terms and the trust mark "untrusted"',
    run(world) {
      const chunks = world.read('www/chunks.jsonl').split('\n').filter(Boolean).map((line) => JSON.parse(line));
      assert.ok(chunks.length > 0);
      for (const shape of SHAPES) {
        const records = world.state.records[shape];
        assert.strictEqual(records.length, chunks.length, shape);
        records.forEach((record, i) => {
          const cited = citationOf(shape, record);
          assert.strictEqual(cited.iri, chunks[i].iri, shape);
          assert.strictEqual(cited.digest, chunks[i].digest, shape);
          assert.strictEqual(cited.license, chunks[i].license, shape);
          assert.strictEqual(cited.terms, TERMS, shape);
          assert.strictEqual(cited.trust, 'untrusted', shape);
        });
      }
      assert.deepStrictEqual(world.state.records.langgraph[0].namespace, ['agenticsystemcore.com', chunks[0].item]);
      assert.strictEqual(world.state.records.autogen[0].content, chunks[0].text);
      assert.strictEqual(world.state.records.mem0[0].text, chunks[0].text);
    },
  },
  {
    pattern: 'each line of "dist/export/items.jsonl" is the node of the item\'s "www/pages/<slug>.jsonld", one line per item in slug order',
    run(world) {
      const pages = fs.readdirSync(path.join(world.dir, 'www', 'pages')).filter((f) => f.endsWith('.jsonld'))
        .sort((a, b) => (a < b ? -1 : 1));
      const lines = world.read('dist/export/items.jsonl').split('\n');
      assert.strictEqual(lines.pop(), '', 'the file does not end with one LF');
      assert.strictEqual(lines.length, pages.length);
      // Each per-item view is already one canonical JSON line; the export line is that node.
      pages.forEach((page, i) => assert.strictEqual(lines[i], world.read(`www/pages/${page}`).replace(/\n$/u, ''), page));
    },
  },
  {
    pattern: /^"(dist\/export\/[^"]+)" is written, carries the Content Use Terms, and a second run writes the same bytes$/u,
    run(world, rel) {
      const first = fs.readFileSync(path.join(world.dir, rel));
      if (rel.endsWith('.zip')) {
        // A stored archive: the terms file travels whole, as an entry of the export root.
        assert.ok(first.includes(Buffer.from('LICENSE-CONTENT')), 'the archive has no LICENSE-CONTENT entry');
        assert.ok(first.includes(fs.readFileSync(path.join(world.dir, 'LICENSE-CONTENT'))), 'the terms are not in the archive');
      } else {
        assert.ok(first.toString('utf8').includes(`terms: ${TERMS}`), `${rel} does not name the terms`);
      }
      const again = world.agsc(world.last.argv, { offline: true });
      assert.strictEqual(again.exit, 0, again.stdout + again.stderr);
      assert.ok(fs.readFileSync(path.join(world.dir, rel)).equals(first), `${rel} changed on the second run`);
    },
  },
];
