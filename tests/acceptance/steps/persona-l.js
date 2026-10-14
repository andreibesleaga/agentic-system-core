'use strict';
// verifies AGSC-06-10, AGSC-09-02, AGSC-09-03, AGSC-09-05, AGSC-10-01, AGSC-10-02
// Steps of features/persona-l-port-implementer.feature (persona P10). The first
// scenario writes a Level-0 node with a few lines of plain Node — nothing from
// src/ is loaded — and judges it with the shipped checker only. The second runs
// the Python checker package, from its checkout beside the engine, over the same
// vector files as the engine's `conform`, and compares the two reports vector by
// vector; it runs where that checkout and a Python 3.9+ interpreter exist (its pending file
// under tests/acceptance/pending/ is `conditional`, probed by steps/_python-package.js) and is reported as skipped,
// with the reason, where they do not. The third reads the report of the reference
// engine's own Level-3 run against the case files themselves: which cases are
// required and which withdrawn is read from `tests/vectors/`, never from the engine.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ROOT, pythonPackage } = require('./_world.js');

const NODE = 'https://node.example/';

/** Every case file of `tests/vectors/`, read as data: its id and its level. */
function vectorCases() {
  const dir = path.join(ROOT, 'tests', 'vectors');
  return fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .map((c) => ({ id: c.id, level: c.level }));
}

module.exports = [
  {
    pattern: '"report.json" names the implementation "agentic-system-core" and the class "full-engine", which is Level 3 (AGSC-10-01, AGSC-09-03)',
    run(world) {
      const report = JSON.parse(world.read('report.json'));
      world.state.report = report;
      // AGSC-09-03: {impl, version, spec_version, class, results:[{id, status, got?}], summary}.
      assert.deepStrictEqual(Object.keys(report).sort(), ['class', 'impl', 'results', 'spec_version', 'summary', 'version']);
      assert.strictEqual(report.impl, 'agentic-system-core');
      // AGSC-10-01: publisher = 0, reader = 1, writer = 2, full engine = 3.
      assert.strictEqual(report.class, 'full-engine');
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      assert.strictEqual(report.version, pkg.version);
      assert.strictEqual(typeof report.spec_version, 'string');
    },
  },
  {
    pattern: 'every required case of the Level-3 set is reported "pass" by its id, and "summary.fail" is 0',
    run(world) {
      const { report } = world.state;
      const cases = vectorCases();
      // AGSC-10-05: Level 3 runs every area, so its set is every case file on disk.
      assert.strictEqual(report.results.length, cases.length, 'the report lists every case of the Level-3 set once');
      const status = new Map(report.results.map((r) => [r.id, r.status]));
      assert.strictEqual(status.size, report.results.length, 'a case id is reported twice');
      const required = cases.filter((c) => c.level === 'required');
      assert.ok(required.length > 0);
      for (const c of required) assert.strictEqual(status.get(c.id), 'pass', `required case ${c.id} is ${status.get(c.id)}`);
      assert.strictEqual(report.summary.fail, 0);
      assert.ok(report.results.every((r) => r.status !== 'fail'));
    },
  },
  {
    pattern: 'every withdrawn case is reported apart as "skip", never counted as a pass, and "summary.pass" counts only the cases that ran and passed (AGSC-09-02, AGSC-09-05)',
    run(world) {
      const { report } = world.state;
      const cases = vectorCases();
      const withdrawn = cases.filter((c) => c.level === 'withdrawn');
      const counted = cases.filter((c) => c.level !== 'withdrawn');
      for (const c of withdrawn) {
        const result = report.results.find((r) => r.id === c.id);
        assert.strictEqual(result.status, 'skip', `withdrawn case ${c.id} is ${result.status}`);
        assert.match(String(result.got), /withdrawn/u, `withdrawn case ${c.id} is not reported as withdrawn`);
      }
      // No skip stands in for a pass: the only skips are the withdrawn cases, and
      // the passes are exactly the required and optional cases that ran.
      const skipped = report.results.filter((r) => r.status === 'skip').map((r) => r.id).sort();
      assert.deepStrictEqual(skipped, withdrawn.map((c) => c.id).sort());
      const passed = report.results.filter((r) => r.status === 'pass').map((r) => r.id).sort();
      assert.deepStrictEqual(passed, counted.map((c) => c.id).sort());
      assert.deepStrictEqual(report.summary, { fail: 0, pass: counted.length, skip: withdrawn.length });
    },
  },
  {
    pattern: 'a publisher writes, without the engine, two Markdown items, "graph.jsonld", "llms.txt" and "/.well-known/knowledge-linkset" with no digest and no "agsc-*" attribute',
    run(world) {
      world.dir = world.temp('agsc-acc-level0-');
      const items = [
        ['handoff', 'Handoff', 'The transfer of control and context from one agent to another, recorded for audit.'],
        ['supervisor', 'Supervisor', 'A coordinating agent that routes work to specialised workers and collects results.'],
      ];
      for (const [slug, title, description] of items) {
        world.write(`content/concepts/${slug}.md`, ['---', 'type: concept', `title: ${title}`, `description: ${description}`,
          'prov:', '  origin: human', '  operator: human:publisher', 'kind: pattern', '---', '', `# ${title}`, '', description, ''].join('\n'));
      }
      world.write('graph.jsonld', `${JSON.stringify({
        '@context': { '@vocab': 'https://w3id.org/agentic-system-core/ns#' },
        '@graph': items.map(([slug, title]) => ({ '@id': `${NODE}concepts/${slug}/`, '@type': 'Concept', prefLabel: title })),
      })}\n`);
      world.write('llms.txt', `# A hand-made node\n\n> Two items, no engine.\n\n## Items\n\n${items
        .map(([slug, title, d]) => `- [${title}](${NODE}concepts/${slug}/): ${d}`).join('\n')}\n`);
      world.state.document = {
        linkset: [{
          alternate: [{ href: `${NODE}llms.txt`, type: 'text/plain' }],
          anchor: NODE,
          describedby: [{ href: `${NODE}graph.jsonld`, type: 'application/ld+json' }],
        }],
      };
      world.write('.well-known/knowledge-linkset', `${JSON.stringify(world.state.document)}\n`);
      assert.doesNotMatch(world.read('.well-known/knowledge-linkset'), /digest|agsc-/u);
    },
  },
  {
    pattern: 'the port implementer runs the shipped "validate-wellknown" tool on that discovery file at Level 0',
    run(world) {
      world.state.check = world.tool('validate-wellknown',
        [path.join(world.dir, '.well-known', 'knowledge-linkset'), '--level', '0', '--json']);
    },
  },
  {
    pattern: 'it exits 0 and reports "pass" (AGSC-10-02)',
    run(world) {
      const { exit, stdout, stderr } = world.state.check;
      assert.strictEqual(exit, 0, stdout + stderr);
      assert.strictEqual(JSON.parse(stdout).status, 'pass');
    },
  },
  {
    pattern: 'the same file with a relation name that is neither registered nor an extension of the format exits 1 (AGSC-06-10)',
    run(world) {
      const document = structuredClone(world.state.document);
      document.linkset[0]['made-up'] = [{ href: `${NODE}llms.txt` }];
      world.write('.well-known/knowledge-linkset', `${JSON.stringify(document)}\n`);
      const r = world.tool('validate-wellknown', [path.join(world.dir, '.well-known', 'knowledge-linkset'), '--level', '0', '--json']);
      assert.strictEqual(r.exit, 1, r.stdout);
      assert.ok(JSON.parse(r.stdout).findings.some((f) => f.severity === 'error' && /made-up/u.test(f.message)), r.stdout);
    },
  },
  {
    pattern: 'the Python checker package is checked out beside the engine',
    run(world) {
      const found = pythonPackage();
      assert.ok(found.available, found.reason);
      world.state.python = found;
    },
  },
  {
    pattern: 'the port implementer runs the engine\'s "conform" and the Python package\'s "run-vectors" over the same "tests/vectors/"',
    run(world) {
      world.bundle();
      const conform = world.agsc(['conform'], { offline: true });
      assert.strictEqual(conform.exit, 0, conform.stdout + conform.stderr);
      world.state.engine = new Map(JSON.parse(world.read('dist/conformance-report.json')).results.map((r) => [r.id, r]));
      const { python, source } = world.state.python;
      const r = spawnSync(python, ['-m', 'agentic_system_core.cli', 'run-vectors', path.join(ROOT, 'tests', 'vectors'),
        '--pending', path.join(ROOT, 'tests', 'conformance', 'pending.json'), '--json'], {
        cwd: world.dir,
        encoding: 'utf8',
        // No bytecode is written into the other checkout; nothing else of the host leaks in.
        env: { ...world.env(), PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONPATH: source },
      });
      assert.strictEqual(r.status, 0, r.stdout + r.stderr);
      world.state.port = JSON.parse(r.stdout);
    },
  },
  {
    pattern: 'every vector the Python package runs has the same result as in the engine\'s conformance report',
    run(world) {
      const { engine, port } = world.state;
      const vectors = fs.readdirSync(path.join(ROOT, 'tests', 'vectors'), { recursive: true }).map(String)
        .filter((f) => f.endsWith('.json'));
      assert.strictEqual(port.total, vectors.length);
      assert.strictEqual(engine.size, vectors.length);
      let compared = 0;
      for (const result of port.results) {
        if (result.status === 'not-run') continue;
        assert.ok(engine.has(result.id), `${result.id} is not in the engine's report`);
        assert.strictEqual(result.status, engine.get(result.id).status, `${result.id}: ${result.detail || ''}`);
        compared += 1;
      }
      assert.strictEqual(port.tally.fail, 0);
      assert.ok(port.tally.pass > 0 && compared === port.tally.pass + port.tally.skip, JSON.stringify(port.tally));
    },
  },
  {
    pattern: 'every vector it does not run is reported as not run with a reason, never counted as a pass',
    run(world) {
      const { port } = world.state;
      const notRun = port.results.filter((r) => r.status === 'not-run');
      assert.strictEqual(notRun.length, port.tally.not_run);
      for (const r of notRun) assert.ok(typeof r.detail === 'string' && r.detail.length > 0, `${r.id} has no reason`);
      assert.strictEqual(port.tally.pass + port.tally.skip + port.tally.not_run + port.tally.fail, port.total);
    },
  },
];
