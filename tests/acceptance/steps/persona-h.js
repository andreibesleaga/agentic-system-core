'use strict';
// verifies AGSC-05-35, AGSC-05-37, AGSC-01-22, AGSC-01-23, AGSC-01-26, AGSC-01-26a, AGSC-01-27, AGSC-01-39, AGSC-05-04, AGSC-05-36, AGSC-05-04b, AGSC-06-26, AGSC-09-17
// Steps of features/persona-h-memory.feature that run offline: the lossless export
// forms, a foreign OKF bundle, the COGX archive another memory system reads, there
// and back, the connectors example that reshapes `chunks.jsonl` for a framework's
// memory store, and the other export forms. The import into a copy of the Bundle
// that holds no item, and the import run again, are persona-g's phrases.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const N3 = require('n3');

const jcs = require('../../../src/knowledge/jcs.js');

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

/** The thesaurus an author brings from a taxonomy tool: tests/fixtures/skos-thesaurus/thesaurus.ttl. */
const THESAURUS = path.join(ROOT, 'tests', 'fixtures', 'skos-thesaurus', 'thesaurus.ttl');

/** An OKF bundle whose records declare an open licence and the status stable. */
const LICENSED = Object.freeze({
  'index.md': '---\nokf_version: "0.2"\nlicense: CC0-1.0\n---\n',
  'a.md': '---\ntype: concept\nkind: explainer\ntitle: First note\nlicense: CC0-1.0\nstatus: stable\n---\n\nThe first.\n',
  'b.md': '---\ntype: concept\nkind: explainer\ntitle: Second note\nlicense: CC0-1.0\nstatus: stable\n---\n\nThe second.\n',
});

/** The items under `content/` of a directory, `content/<plural>/<slug>.md` -> frontmatter. */
function itemsUnder(dir) {
  const out = new Map();
  const root = path.join(dir, 'content');
  for (const folder of fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()) : []) {
    for (const name of fs.readdirSync(path.join(root, folder.name)).sort()) {
      out.set(`${folder.name}/${name}`, splitItem(fs.readFileSync(path.join(root, folder.name, name), 'utf8')).frontmatter);
    }
  }
  return out;
}

/** A copy of the Bundle's identity and nothing else, to import into (persona-g's "copy that holds no item"). */
function emptyCopy(world) {
  const target = world.temp('agsc-acc-copy-');
  for (const rel of ['agsc.config.json', 'content/index.md', '.well-known/security.txt', 'LICENSE-CONTENT']) {
    if (!world.exists(rel)) continue;
    fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
    fs.copyFileSync(path.join(world.dir, rel), path.join(target, rel));
  }
  return target;
}

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
      // one server's ten tools.
      assert.deepStrictEqual(names, ['ask', 'brief', 'check', 'compose', 'explain', 'links', 'propose', 'read', 'remember', 'search']);
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
    pattern: 'a SKOS thesaurus "thesaurus.ttl" with a scheme, a collection and two concepts',
    run(world) {
      world.bundle();
      world.write('thesaurus.ttl', fs.readFileSync(THESAURUS, 'utf8'));
    },
  },
  {
    pattern: 'every item the SKOS import wrote is a draft with the provenance "imported", keeping its SKOS IRI in "x-skos-iri"',
    run(world) {
      const items = itemsUnder(world.state.target);
      assert.deepStrictEqual([...items.keys()], ['clusters/instruments.md', 'clusters/strings.md', 'concepts/cello.md', 'concepts/violin.md']);
      for (const [rel, frontmatter] of items) {
        assert.strictEqual(frontmatter.status, 'draft', rel);
        assert.strictEqual(frontmatter.prov.origin, 'imported', rel);
        assert.match(frontmatter['x-skos-iri'], /^https:\/\/example\.org\/instruments\//u, rel);
      }
      const violin = items.get('concepts/violin.md');
      assert.deepStrictEqual(violin.aliases, ['Fiddle']);
      assert.deepStrictEqual(violin.clusters, ['instruments', 'strings']);
      assert.deepStrictEqual(violin.related, ['cello']);
      assert.strictEqual(violin['x-skos-license'], 'https://creativecommons.org/publicdomain/zero/1.0/');
    },
  },
  {
    pattern: 'a statement the SKOS import cannot carry is reported as "AGSC-E506" naming its subject and predicate',
    run(world) {
      const said = world.last.stderr;
      assert.match(said, /^warn: AGSC-E506 https:\/\/example\.org\/instruments\/violin: the statement http:\/\/www\.w3\.org\/2004\/02\/skos\/core#notation /mu, said);
      assert.match(said, /^warn: AGSC-E506 https:\/\/example\.org\/instruments\/Instrument: the statement http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type /mu, said);
    },
  },
  {
    pattern: /^an OKF bundle "([a-z-]+)" whose records declare the open licence "([^"]+)" and the status "([a-z]+)"$/u,
    run(world, folder, licence, status) {
      world.bundle();
      for (const [rel, text] of Object.entries(LICENSED)) {
        world.write(`${folder}/${rel}`, text.replace(/CC0-1\.0/gu, licence).replace(/status: stable/u, `status: ${status}`));
      }
    },
  },
  {
    pattern: 'every item the OKF import wrote is a draft, with one "AGSC-E506" warning each that names the status it replaced',
    run(world) {
      const items = itemsUnder(world.state.target);
      assert.strictEqual(items.size, 2);
      for (const [rel, frontmatter] of items) {
        assert.strictEqual(frontmatter.status, 'draft', rel);
        assert.strictEqual(frontmatter.license, 'CC0-1.0', `${rel} keeps the licence the source declared`);
      }
      const said = world.last.stderr.split('\n').filter((line) => /status: draft/u.test(line));
      assert.strictEqual(said.length, 2, world.last.stderr);
      for (const line of said) assert.match(line, /the status the source gave it, "stable", was not kept/u);
    },
  },
  {
    pattern: '"dist/export/okf/export-manifest.json" lists every other file of the export with its digest, the item count and the items digest',
    run(world) {
      const manifest = JSON.parse(world.read('dist/export/okf/export-manifest.json'));
      const written = [];
      const walk = (sub) => {
        for (const entry of fs.readdirSync(path.join(world.dir, 'dist/export/okf', sub), { withFileTypes: true })) {
          const rel = sub === '' ? entry.name : `${sub}/${entry.name}`;
          if (entry.isDirectory()) walk(rel);
          else if (rel !== 'export-manifest.json') written.push(rel);
        }
      };
      walk('');
      assert.deepStrictEqual(manifest.files.map((f) => f.path), written.sort());
      for (const file of manifest.files) assert.match(file.content_digest, /^sha-256=:[A-Za-z0-9+/]{43}=:$/u, file.path);
      assert.ok(manifest.item_count > 0);
      assert.match(manifest.items_digest, /^[0-9a-f]{64}$/u);
      assert.match(manifest.bundle_hash, /^[0-9a-f]{64}$/u);
    },
  },
  {
    pattern: 'one exported file is edited and the folder is imported into a copy of the Bundle that holds no item',
    run(world) {
      const file = `dist/export/okf/content/concepts/${fs.readdirSync(path.join(world.dir, 'dist/export/okf/content/concepts')).sort()[0]}`;
      fs.appendFileSync(path.join(world.dir, file), '\nEdited after the export.\n');
      world.state.edited = file.replace('dist/export/okf/', '');
      world.state.target = emptyCopy(world);
      world.agsc(['import', path.join(world.dir, 'dist/export/okf'), '--from', 'okf'], { cwd: world.state.target, offline: true });
      assert.strictEqual(world.last.exit, 0, world.last.stdout + world.last.stderr);
    },
  },
  {
    pattern: 'the import warns once with "AGSC-E506" that the edited file differs from the manifest, and still writes the items',
    run(world) {
      const lines = world.last.stderr.split('\n').filter((line) => line.includes('export-manifest.json'));
      assert.strictEqual(lines.length, 1, world.last.stderr);
      assert.ok(lines[0].includes('AGSC-E506') && lines[0].includes(`${world.state.edited} differs`), lines[0]);
      assert.ok(itemsUnder(world.state.target).size > 0, 'the items were written');
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
    pattern: '"dist/export/skos.ttl" types the Bundle as a skos:ConceptScheme and each published concept, lesson and cluster as a skos:Concept or skos:Collection, and holds no episode, procedure or gate',
    run(world) {
      const SKOS = 'http://www.w3.org/2004/02/skos/core#';
      const ASC = 'https://w3id.org/agentic-system-core/ns#';
      const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
      const typed = (quads) => quads.filter((q) => q.predicate.value === TYPE).map((q) => [q.subject.value, q.object.value]);
      const graph = typed(new N3.Parser({ format: 'N-Quads' }).parse(world.read('www/graph.nq')));
      const view = typed(new N3.Parser().parse(world.read('dist/export/skos.ttl')));
      const skosTypeOf = { [`${ASC}Concept`]: 'Concept', [`${ASC}Lesson`]: 'Concept', [`${ASC}Cluster`]: 'Collection' };
      const wanted = graph.filter(([, cls]) => skosTypeOf[cls]).map(([iri, cls]) => `${iri} ${SKOS}${skosTypeOf[cls]}`);
      assert.ok(wanted.length > 0, 'the Bundle publishes no concept');
      const bundle = graph.find(([, cls]) => cls === `${ASC}Bundle`)[0];
      assert.deepStrictEqual(view.map(([iri, cls]) => `${iri} ${cls}`).sort(), [...wanted, `${bundle} ${SKOS}ConceptScheme`].sort());
      const left = graph.filter(([, cls]) => [`${ASC}Episode`, `${ASC}Procedure`, `${ASC}Gate`].includes(cls)).map(([iri]) => iri);
      for (const iri of left) assert.ok(!world.read('dist/export/skos.ttl').includes(`<${iri}>`), `${iri} is in the view`);
    },
  },
  {
    pattern: '"dist/export/skos.ttl" is Turtle that a second run writes again byte for byte',
    run(world) {
      const first = world.read('dist/export/skos.ttl');
      assert.ok(new N3.Parser().parse(first).length > 0);
      const again = world.agsc(world.last.argv, { offline: true });
      assert.strictEqual(again.exit, 0, again.stdout + again.stderr);
      assert.strictEqual(world.read('dist/export/skos.ttl'), first);
    },
  },
  {
    pattern: 'a note "alpha" that links to the note "beta" in its body, with no Link between them',
    run(world) {
      world.bundle();
      const note = (title, body) => ['---', 'type: concept', 'kind: principle', `title: ${title}`,
        'description: A note written for the scenario that asks which notes should be linked.',
        'tags:', '  - agents', '  - protocols', 'clusters:', '  - agent-patterns',
        'prov:', '  origin: human', '  operator: human:tester', '---', '', body, ''].join('\n');
      world.write('content/concepts/alpha.md', note('Alpha note', 'This builds on [the next note](beta).'));
      world.write('content/concepts/beta.md', note('Beta note', 'A short body.'));
      world.state.contentBefore = world.snapshot('content');
    },
  },
  {
    pattern: '"dist/suggestions.json" proposes the Link "related" from "alpha" to "beta" with the evidence "mention"',
    run(world) {
      const { suggestions } = JSON.parse(world.read('dist/suggestions.json'));
      assert.deepStrictEqual(suggestions.find((s) => s.source === 'alpha' && s.target === 'beta'),
        { evidence: [{ kind: 'mention' }], generator: 'G1', key: 'related', source: 'alpha', target: 'beta' });
    },
  },
  {
    pattern: 'the content folder is byte for byte what it was before the suggestions were asked for',
    run(world) {
      assert.deepStrictEqual(world.snapshot('content'), world.state.contentBefore);
    },
  },
  {
    pattern: '"dist/suggestions.json" is canonical JSON that a second run writes again byte for byte',
    run(world) {
      const first = world.read('dist/suggestions.json');
      assert.ok(first.endsWith('}\n') && !first.endsWith('\n\n'));
      assert.strictEqual(`${jcs.canonicalize(JSON.parse(first))}\n`, first);
      const again = world.agsc(world.last.argv, { offline: true });
      assert.strictEqual(again.exit, 0, again.stdout + again.stderr);
      assert.strictEqual(world.read('dist/suggestions.json'), first);
    },
  },
  {
    pattern: '"dist/export/closure.nt" holds triples that the OWL 2 RL rules entail, none of them in "www/graph.nq"',
    run(world) {
      const closure = world.read('dist/export/closure.nt');
      const asserted = new Set(world.read('www/graph.nq').split('\n'));
      const lines = closure.split('\n').slice(0, -1);
      assert.ok(lines.length > 0, 'the closure of the acceptance Bundle is empty');
      for (const line of lines) assert.ok(!asserted.has(line), `${line} is already in graph.nq`);
      assert.ok(lines.some((line) => line.includes('skos/core#Concept>')), 'no concept is typed skos:Concept');
    },
  },
  {
    pattern: '"dist/export/closure.nt" is N-Quads that a second run writes again byte for byte',
    run(world) {
      const first = world.read('dist/export/closure.nt');
      assert.strictEqual(new N3.Parser({ format: 'N-Quads' }).parse(first).length, first.split('\n').length - 1);
      const again = world.agsc(world.last.argv, { offline: true });
      assert.strictEqual(again.exit, 0, again.stdout + again.stderr);
      assert.strictEqual(world.read('dist/export/closure.nt'), first);
    },
  },
  {
    pattern: /^no file under "([^"]+)" has "([^"]+)" in its name$/u,
    run(world, folder, text) {
      const found = [...world.snapshot(folder).keys()].filter((rel) => rel.includes(text));
      assert.deepStrictEqual(found, []);
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
