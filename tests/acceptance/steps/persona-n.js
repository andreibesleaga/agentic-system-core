'use strict';
// verifies AGSC-05-06
// Steps of features/persona-n-researcher.feature: a researcher who measures a node
// with the shipped benchmark kit, offline, gets the same numbers twice, checks that
// the three graph dumps of a build hold one graph, and cites exactly what was
// measured — the release (CITATION.cff), the node and its content version (the
// graph dumps and the provenance header of llms.txt) and the conformance report.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const N3 = require('n3');
const jsonld = require('jsonld');
const YAML = require('yaml');

const { ROOT } = require('./_world.js');

const GENERATOR = path.join(ROOT, 'bench', 'gen-bundle.js');
const BENCH = path.join(ROOT, 'tools', 'bench');
const BENCH_SURFACES = ['chunks', 'llms', 'search'];

/** One RDF term as a comparable string; literals keep their datatype or language. */
function termKey(t) {
  if (t.termType === 'NamedNode') return `<${t.value}>`;
  if (t.termType === 'BlankNode') return `_:${t.value}`;
  if (t.termType === 'Literal') return `${JSON.stringify(t.value)}${t.language ? `@${t.language}` : `^^<${t.datatype.value}>`}`;
  throw new Error(`unexpected term type ${t.termType}`);
}

/** The triples of a list of RDF/JS quads, graph names dropped, as a set of strings. */
function triples(quads) {
  return new Set(quads.map((q) => [q.subject, q.predicate, q.object].map(termKey).join(' ')));
}

/** The provenance header block of an llms.txt, as name → value. */
function provenance(text) {
  const m = /<!-- agsc:provenance\n([\s\S]*?)\n-->/u.exec(text);
  assert.ok(m, 'no provenance header');
  return Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
}

/** The Bundle node of a build's graph.jsonld. */
function bundleNode(world) {
  return JSON.parse(world.read('www/graph.jsonld'))['@graph'].find((n) => n['@type'] === 'Bundle');
}

module.exports = [
  {
    pattern: /^the synthetic Bundle generator writes the Bundle of seed (\d+) twice$/u,
    run(world, seed) {
      const scratch = world.temp('agsc-acc-generated-');
      world.state.generated = ['first', 'second'].map((name) => {
        const out = path.join(scratch, name);
        const r = spawnSync(process.execPath, [GENERATOR, '--items', seed, '--out', out], { encoding: 'utf8', env: world.offlineEnv() });
        assert.strictEqual(r.status, 0, r.stdout + r.stderr);
        return out;
      });
    },
  },
  {
    pattern: 'the two generated Bundles are byte-identical',
    run(world) {
      const [first, second] = world.state.generated.map((dir) => {
        world.dir = dir;
        return world.snapshot();
      });
      assert.ok(first.size > 20, `only ${first.size} files were generated`);
      assert.deepStrictEqual([...second.entries()], [...first.entries()]);
    },
  },
  {
    pattern: /^a labelled query set in the BEIR layout whose gold items are "([a-z0-9-]+)", "([a-z0-9-]+)" and "([a-z0-9-]+)"$/u,
    run(world, first, second, third) {
      const gold = [first, second, third];
      const texts = {
        'a2a': 'agents from different vendors delegate tasks to one another',
        'mcp': 'one standard way for an agent to reach tools and data sources',
        'tool-use-retries': 'retry a failed tool call with backoff',
      };
      const set = world.temp('agsc-acc-queries-');
      fs.mkdirSync(path.join(set, 'qrels'));
      fs.writeFileSync(path.join(set, 'queries.jsonl'),
        gold.map((slug, i) => `${JSON.stringify({ _id: `q${i + 1}`, text: texts[slug] })}\n`).join(''));
      fs.writeFileSync(path.join(set, 'qrels', 'test.tsv'),
        `query-id\tcorpus-id\tscore\n${gold.map((slug, i) => `q${i + 1}\t${slug}\t1\n`).join('')}`);
      world.state.querySet = set;
    },
  },
  {
    pattern: 'the researcher runs "tools/bench" over the built node with that set, twice, under the network trap',
    run(world) {
      world.state.reports = [1, 2].map(() => {
        const r = spawnSync(process.execPath, [BENCH, '--node', 'www', '--set', world.state.querySet, '--json'],
          { cwd: world.dir, encoding: 'utf8', env: world.offlineEnv() });
        assert.strictEqual(r.status, 0, r.stdout + r.stderr);
        return r.stdout;
      });
    },
  },
  {
    pattern: /^both runs score recall and precision at (\d+) on the surfaces "([a-z]+)", "([a-z]+)" and "([a-z]+)"$/u,
    run(world, k, one, two, three) {
      const surfaces = [one, two, three];
      assert.deepStrictEqual(surfaces, BENCH_SURFACES);
      for (const text of world.state.reports) {
        const report = JSON.parse(text);
        assert.strictEqual(report.status, 'pass');
        assert.strictEqual(report.k, Number(k));
        assert.strictEqual(report.queries, 3);
        assert.deepStrictEqual(Object.keys(report.surfaces).sort(), surfaces);
        for (const name of surfaces) {
          const s = report.surfaces[name];
          assert.strictEqual(s.queries_scored, 3, name);
          for (const measure of ['recall', 'precision']) {
            assert.ok(typeof s[measure] === 'number' && s[measure] >= 0 && s[measure] <= 1, `${name} ${measure}`);
          }
        }
      }
    },
  },
  {
    pattern: 'the two reports are byte-identical',
    run(world) {
      assert.strictEqual(world.state.reports[1], world.state.reports[0]);
    },
  },
  {
    pattern: /^the agent parses "(www\/graph\.jsonld)", "(www\/graph\.ttl)" and "(www\/graph\.nq)" with standard RDF parsers, offline$/u,
    async run(world, jsonldFile, turtleFile, nquadsFile) {
      const base = JSON.parse(world.read('agsc.config.json')).site.base;
      // The context is read from the node's own byte-identical copy (AGSC-05-09):
      // under its base, or under /ns/<version>/ for the persistent versioned URL.
      // Nothing is fetched.
      const documentLoader = async (url) => {
        const persistent = /^https:\/\/w3id\.org\/agentic-system-core\/ns\/([^/]+)\/context\.jsonld$/u.exec(url);
        let rel = null;
        if (url.startsWith(base)) rel = url.slice(base.length);
        else if (persistent) rel = `ns/${persistent[1]}/context.jsonld`;
        assert.ok(rel, `the JSON-LD context is neither the node's nor the persistent one: ${url}`);
        return { contextUrl: null, document: JSON.parse(world.read(`www/${rel}`)), documentUrl: url };
      };
      world.state.graphs = {
        jsonld: triples(await jsonld.toRDF(JSON.parse(world.read(jsonldFile)), { documentLoader })),
        nquads: triples(new N3.Parser({ format: 'application/n-quads' }).parse(world.read(nquadsFile))),
        turtle: triples(new N3.Parser({ format: 'text/turtle' }).parse(world.read(turtleFile))),
      };
    },
  },
  {
    pattern: 'the three give the same set of triples',
    run(world) {
      const { jsonld: a, nquads: b, turtle: c } = world.state.graphs;
      assert.ok(a.size > 0, 'the JSON-LD dump holds no triple');
      assert.deepStrictEqual([...b].sort(), [...a].sort(), 'graph.nq and graph.jsonld differ');
      assert.deepStrictEqual([...c].sort(), [...a].sort(), 'graph.ttl and graph.jsonld differ');
    },
  },
  {
    pattern: 'no triple of the three names a blank node',
    run(world) {
      for (const [name, set] of Object.entries(world.state.graphs)) {
        assert.ok(![...set].some((t) => t.startsWith('_:') || t.includes(' _:')), `${name} names a blank node`);
      }
    },
  },
  {
    pattern: 'the engine\'s "CITATION.cff" names its title, its authors, its licence and its code repository, and any version it names is the package version',
    run() {
      const cff = YAML.parse(fs.readFileSync(path.join(ROOT, 'CITATION.cff'), 'utf8'));
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      assert.strictEqual(cff['cff-version'], '1.2.0');
      assert.ok(typeof cff.title === 'string' && cff.title.length > 0, 'no title');
      assert.ok(Array.isArray(cff.authors) && cff.authors.length > 0, 'no author');
      // The licence of the release, as one SPDX id or a list; each one is in the package's expression.
      const named = [].concat(cff.license);
      const expression = pkg.license.split(/\s+(?:AND|OR)\s+/u);
      assert.ok(named.length > 0 && named.every((id) => expression.includes(id)), `${named} is not in ${pkg.license}`);
      assert.match(cff['repository-code'], /^https:\/\/github\.com\/[^/]+\/agentic-system-core$/u);
      if (cff.version !== undefined) assert.strictEqual(String(cff.version), pkg.version);
    },
  },
  {
    pattern: 'the conformance report names the implementation, its version and the specification version the graph dumps carry',
    run(world) {
      const report = JSON.parse(world.read('report.json'));
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const envelope = world.json();
      assert.strictEqual(report.impl, pkg.name);
      assert.strictEqual(report.version, pkg.version);
      assert.strictEqual(report.spec_version, envelope.spec_version);
      assert.ok(report.summary && typeof report.summary === 'object', 'the report has no summary');
      // The node itself states which specification version it was built under.
      const config = JSON.parse(world.read('agsc.config.json'));
      assert.strictEqual(bundleNode(world).specVersion, config.spec_version);
      assert.ok(world.read('www/graph.ttl').includes(`asc:specVersion "${config.spec_version}"`));
      assert.ok(world.read('www/graph.nq').includes(`"${config.spec_version}"^^`));
    },
  },
  {
    pattern: /^"(www\/llms\.txt)" names the node's content version and the specification version in its provenance header$/u,
    run(world, rel) {
      const header = provenance(world.read(rel));
      const node = bundleNode(world);
      assert.strictEqual(header.bundle, node['@id']);
      assert.strictEqual(header.spec_version, node.specVersion);
      assert.match(header.bundle_version, /^\S+$/u);
      assert.match(header.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
    },
  },
];
