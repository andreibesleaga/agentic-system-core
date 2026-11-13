'use strict';
// verifies AGSC-00-12, AGSC-10-01
// Unit tests for the conformance-claim module.
// AGSC-09-01, AGSC-09-02, AGSC-09-03, AGSC-04-22, AGSC-04-24, AGSC-10-15.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  areasForLevel, claimCompleteness, crossImplementationClaim, divergenceVerdict,
  divergenceVerdicts, report, CROSS_IMPLEMENTATION, CROSS_IMPLEMENTATION_1_1, HTML_REASON, LEVEL_NAMES,
} = require('../../src/composition/conform.js');

const ROOT = path.resolve(__dirname, '..', '..');

test('AGSC-10-15: a Level names its own area set, and nothing outside 0..3 is a Level', () => {
  assert.deepStrictEqual(areasForLevel(0), ['frontmatter', 'slug', 'bundle', 'discovery']);
  assert.ok(areasForLevel(1).includes('lint') && areasForLevel(1).includes('jcs'));
  assert.ok(areasForLevel(2).includes('boundary') && !areasForLevel(2).includes('compose'));
  assert.ok(areasForLevel(3).includes('compose') && areasForLevel(3).includes('conform'));
  assert.throws(() => areasForLevel(4), TypeError);
  assert.throws(() => areasForLevel('2'), TypeError);
});

test('AGSC-10-06: a higher Level includes every area of the lower Levels', () => {
  for (const level of [1, 2, 3]) {
    for (const area of areasForLevel(level - 1)) {
      assert.ok(areasForLevel(level).includes(area), `Level ${level} must include ${area}`);
    }
  }
});

test('AGSC-09-01 + AGSC-04-22: a complete claim names Level, version, Unicode and vectors', () => {
  const claim = {
    level: 2, spec_version: '1.0.0', unicode_version: '16.0.0', vectors_passed: ['slug'],
  };
  assert.deepStrictEqual(claimCompleteness(claim), { complete: true, missing: [] });
  assert.deepStrictEqual(claimCompleteness({}).missing,
    ['level', 'spec_version', 'unicode_version', 'vectors_passed']);
  assert.deepStrictEqual(claimCompleteness(Object.assign({}, claim, { vectors_passed: [] })).missing, ['vectors_passed']);
  assert.deepStrictEqual(claimCompleteness(Object.assign({}, claim, { unicode_version: '' })).missing, ['unicode_version']);
  assert.strictEqual(claimCompleteness(undefined).complete, false);
});

test('AGSC-04-22: a Unicode divergence off the vector set is documented, on it a failure', () => {
  assert.strictEqual(divergenceVerdict({ input: 'outside-vector-set' }), 'documented');
  assert.strictEqual(divergenceVerdict({ input: 'jcs-0005' }), 'failure');
  assert.strictEqual(divergenceVerdict({ input: 'jcs-0005' }, { isVectorId: () => false }), 'documented');
  assert.deepStrictEqual(divergenceVerdicts(undefined), []);
});

test('AGSC-04-24: HTML is never claimable across implementations, and the rest stands', () => {
  const result = crossImplementationClaim(['graph.nq', 'search.json', 'index.html', 'page.html']);
  assert.deepStrictEqual(result.accepted, ['graph.nq', 'search.json']);
  assert.deepStrictEqual(result.rejected, ['index.html', 'page.html']);
  assert.strictEqual(result.reason, HTML_REASON);
  assert.ok(CROSS_IMPLEMENTATION.includes('/llms-full.txt'));
});

test('AGSC-06-21/AGSC-06-31: the shards and the per-item views are claimable too', () => {
  const result = crossImplementationClaim(['search-01.json', 'chunks-02.jsonl', '/boards/index.json', 'pages/a.jsonld', 'nonsense']);
  assert.deepStrictEqual(result.rejected, ['nonsense']);
  assert.strictEqual(result.accepted.length, 4);
  assert.deepStrictEqual(crossImplementationClaim(undefined).accepted, []);
});

/** Every vector by id, read from tests/vectors/ (the cases that pin the 1.1 files). */
function vectorsById() {
  const byId = new Map();
  const dir = path.join(ROOT, 'tests', 'vectors');
  for (const area of fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of fs.readdirSync(path.join(dir, area.name)).filter((f) => f.endsWith('.json'))) {
      const text = fs.readFileSync(path.join(dir, area.name, file), 'utf8');
      byId.set(JSON.parse(text).id, text);
    }
  }
  return byId;
}

/** The text of spec/ that states `rule`: its line and the indented lines that continue it. */
function ruleText(rule) {
  const dir = path.join(ROOT, 'spec');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    const start = lines.findIndex((l) => l.startsWith(`- **${rule}**`));
    if (start < 0) continue;
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => l !== '' && !l.startsWith(' '));
    return [lines[start]].concat(end < 0 ? rest : rest.slice(0, end)).join('\n');
  }
  return '';
}

// The names a claim uses for the 1.1 files: the file names of the cases that pin them
// (`file_bytes` keys, or the rule's own name where the case pins one value).
const NAMES_1_1 = ['skos.ttl', 'closure.nt', 'dist/suggestions.json', 'BRIEF.md', 'brief.json', 'brief.mmd',
  'context.md', '/chunks-index.toon', 'context-map.json', 'blueprint/c4-context.mmd',
  'blueprint/c4-containers.mmd', 'blueprint/c4-components.mmd', 'blueprint/decisions/0001-adr-queue.md',
  'blueprint/build-plan.md', 'export-manifest.json', 'pinned.svg'];

test('AGSC-04-24 (1.1.0): every file 1.1 adds to the obligation is claimable by its case name', () => {
  const result = crossImplementationClaim(NAMES_1_1.concat(['/graph.jsonld']));
  assert.deepStrictEqual(result.rejected, []);
  assert.deepStrictEqual(result.accepted, NAMES_1_1.concat(['/graph.jsonld']));
  // The route keeps the tolerance of the 1.0 routes: without its slash it is the same route.
  assert.deepStrictEqual(crossImplementationClaim(['chunks-index.toon']).accepted, ['chunks-index.toon']);
  // A name no case uses stays outside the obligation, and HTML stays out whatever its folder.
  assert.deepStrictEqual(crossImplementationClaim(['suggestions.json', 'blueprint/decisions/1-a.md', 'Pinned.svg',
    'blueprint/index.html', 'brief.html']).accepted, []);
});

test('AGSC-04-24 (1.1.0): each 1.1 entry is pinned by live cases that use its file name', () => {
  const byId = vectorsById();
  assert.ok(CROSS_IMPLEMENTATION_1_1.length > 0);
  for (const entry of CROSS_IMPLEMENTATION_1_1) {
    assert.ok(entry.cases.length > 0, `${entry.artefact} names no case`);
    assert.ok(ruleText(entry.named_by).includes(entry.artefact.replace(/^blueprint\//u, '')),
      `${entry.named_by} does not name ${entry.artefact}`);
    for (const id of entry.cases) {
      const text = byId.get(id);
      assert.ok(text, `${entry.artefact}: no case ${id}`);
      assert.strictEqual(JSON.parse(text).level, 'required', `${entry.artefact}: ${id} is not a required case`);
    }
    // Where a case names files (`file_bytes`, `files`), the entry's name is one of them.
    const named = entry.cases.map((id) => byId.get(id)).filter((t) => /"(?:file_bytes|files)"/u.test(t));
    for (const text of named) {
      assert.ok(NAMES_1_1.some((n) => entry.test(n) && text.includes(`"${n}"`)),
        `${entry.artefact}: ${JSON.parse(text).id} does not use the name`);
    }
  }
  // Every name of the 1.1 list is matched by exactly one entry.
  for (const name of NAMES_1_1) {
    assert.strictEqual(CROSS_IMPLEMENTATION_1_1.filter((e) => e.test(name)).length, 1, name);
  }
});

test('AGSC-04-24 + AGSC-09-17: the manifest is claimable with its own spec_version excepted', () => {
  const result = crossImplementationClaim(['export-manifest.json', '/graph.nq']);
  assert.deepStrictEqual(result.accepted, ['export-manifest.json', '/graph.nq']);
  assert.deepStrictEqual(result.excepted, { 'export-manifest.json': ['spec_version'] });
  assert.deepStrictEqual(crossImplementationClaim(['/graph.nq']).excepted, {});
  assert.ok(Object.isFrozen(result.excepted['export-manifest.json']));
});

test('AGSC-09-03: the report shape, with `class` the Level name of AGSC-09-01', () => {
  const r = report({
    impl: 'agentic-system-core',
    level: 3,
    results: [{ id: 'slug-0001', status: 'pass' }, { got: 'x', id: 'slug-0002', status: 'fail' }, { id: 'slug-0003', status: 'skip' }],
    spec_version: '1.0.0',
    version: '0.0.2',
  });
  assert.deepStrictEqual(Object.keys(r), ['class', 'impl', 'results', 'spec_version', 'summary', 'version']);
  assert.strictEqual(r.class, 'full-engine');
  assert.deepStrictEqual(r.summary, { fail: 1, pass: 1, skip: 1 });
  assert.deepStrictEqual(r.results[1], { got: 'x', id: 'slug-0002', status: 'fail' });
  assert.deepStrictEqual(LEVEL_NAMES, ['publisher', 'reader', 'writer', 'full-engine']);
  assert.strictEqual(report({ level: 9 }).class, '9');
  assert.deepStrictEqual(report(undefined).results, []);
});
