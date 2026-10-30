'use strict';
// AGSC-03-01 (the relation table, 1.1.0 columns included): `knowledge/relations.js`
// is the ONE server-side copy; every former copy now reads it and must yield exactly
// the list it held at 1.0.1. The page-script copies (compose, browser, harness,
// page-tools) ship their own source text and are checked here against the table.
// Deterministic: reads the frozen specification and the source files only.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const relations = require('../../src/knowledge/relations.js');
const links = require('../../src/knowledge/links.js');
const chunks = require('../../src/knowledge/chunks.js');
const nquads = require('../../src/knowledge/nquads.js');
const visibility = require('../../src/boundary/visibility.js');
const federation = require('../../src/boundary/federation.js');
const pageTools = require('../../src/distribution/page-tools.js');
const okf = require('../../src/interchange/okf.js');

// The 1.0.1 lists, typed out once so a change to the table cannot move them silently.
const KEYS_1_0_1 = ['related', 'broader', 'narrower', 'uses', 'requires', 'excludes',
  'derived-from', 'contradicts', 'supersedes', 'implements', 'verifies', 'covers',
  'blocked-by', 'decided-by'];
const INVERSES_1_0_1 = {
  related: 'related', broader: 'narrower', narrower: 'broader', uses: 'used-by',
  requires: 'required-by', excludes: 'excludes', 'derived-from': 'derivation-of',
  contradicts: 'contradicts', supersedes: 'superseded-by', implements: 'implemented-by',
  verifies: 'verified-by', covers: 'covered-by', 'blocked-by': 'blocks', 'decided-by': 'decides',
};
const NS = 'https://w3id.org/agentic-system-core/ns#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const DCTERMS = 'http://purl.org/dc/terms/';
const PROPERTIES_1_0_1 = {
  related: { property: `${SKOS}related`, symmetric: true },
  broader: { property: `${SKOS}broader`, inverse: `${SKOS}narrower` },
  narrower: { property: `${SKOS}narrower`, inverse: `${SKOS}broader` },
  uses: { property: `${NS}uses`, inverse: `${NS}usedBy` },
  requires: { property: `${DCTERMS}requires`, inverse: `${DCTERMS}isRequiredBy` },
  excludes: { property: `${NS}excludes`, symmetric: true },
  'derived-from': { property: 'http://www.w3.org/ns/prov#wasDerivedFrom' },
  contradicts: { property: `${NS}contradicts`, symmetric: true },
  supersedes: { property: `${DCTERMS}replaces`, inverse: `${DCTERMS}isReplacedBy` },
  implements: { property: `${NS}implements`, inverse: `${NS}implementedBy` },
  verifies: { property: `${NS}verifies`, inverse: `${NS}isVerifiedBy` },
  covers: { property: `${NS}covers`, inverse: `${NS}coveredBy` },
  'blocked-by': { property: `${NS}blockedBy`, inverse: `${NS}blocks` },
  'decided-by': { property: `${NS}decidedBy`, inverse: `${NS}decides` },
};

test('AGSC-03-01: the table holds the fourteen keys in specification order, nine core and five Mode-2', () => {
  assert.deepStrictEqual([...relations.LINK_KEYS], KEYS_1_0_1);
  assert.deepStrictEqual([...relations.CORE_KEYS], KEYS_1_0_1.slice(0, 9));
  assert.deepStrictEqual([...relations.MODE2_KEYS], KEYS_1_0_1.slice(9));
  assert.deepStrictEqual(relations.RELATIONS.map((r) => r.key), KEYS_1_0_1);
});

test('AGSC-03-01: every former server-side copy yields the same key list as the table', () => {
  assert.deepStrictEqual([...links.LINK_KEYS], KEYS_1_0_1);
  assert.deepStrictEqual([...links.CORE_KEYS], KEYS_1_0_1.slice(0, 9));
  assert.deepStrictEqual([...links.MODE2_KEYS], KEYS_1_0_1.slice(9));
  assert.deepStrictEqual([...chunks.LINK_KEYS], KEYS_1_0_1);
  assert.deepStrictEqual([...visibility.LINK_KEYS], KEYS_1_0_1);
  assert.deepStrictEqual([...federation.LINK_KEYS], KEYS_1_0_1);
});

test('AGSC-03-02, AGSC-03-04, AGSC-03-05: inverses, symmetric keys and computed names are those of 1.0.1', () => {
  assert.deepStrictEqual({ ...relations.INVERSE }, INVERSES_1_0_1);
  assert.deepStrictEqual({ ...links.INVERSE }, INVERSES_1_0_1);
  assert.deepStrictEqual([...relations.SYMMETRIC].sort(), ['contradicts', 'excludes', 'related']);
  assert.deepStrictEqual([...links.SYMMETRIC].sort(), ['contradicts', 'excludes', 'related']);
  assert.deepStrictEqual([...relations.COMPUTED_KEYS].sort(), ['blocks', 'covered-by', 'decides',
    'derivation-of', 'implemented-by', 'required-by', 'superseded-by', 'used-by', 'verified-by']);
});

test('AGSC-05-16: the RDF property of each key and of its inverse is that of 1.0.1', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(nquads.LINK_PROPERTIES)), PROPERTIES_1_0_1);
});

test('AGSC-03-01: the page-script copies of keys and inverses equal the table', () => {
  assert.deepStrictEqual(pageTools.pageLinkKeys(), KEYS_1_0_1);
  assert.deepStrictEqual(pageTools.pageInverseKeys(), INVERSES_1_0_1);
});

test('AGSC-03-01: the frozen table of the specification and relations.js agree cell by cell', () => {
  const text = fs.readFileSync(path.join(__dirname, '../../spec/03-links.md'), 'utf8');
  const rows = text.split('\n').filter((l) => /^\| `[a-z-]+` \| `[a-z-]+` \|/u.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  assert.strictEqual(rows.length, 14);
  const cell = (s) => s.replace(/`/gu, '');
  rows.forEach((c, i) => {
    const r = relations.RELATIONS[i];
    assert.strictEqual(r.key, cell(c[0]));
    assert.strictEqual(r.inverse, cell(c[1]));
    assert.strictEqual(r.symmetric, c[2] === 'yes');
    assert.strictEqual(r.transitive, c[6] === 'yes', `${r.key} transitive`);
    assert.strictEqual(r.meaning, c[9], `${r.key} meaning`);
    assert.strictEqual(r.selfLink, c[7].split(' ')[0], `${r.key} self-link`);
    assert.ok(cell(c[3]).startsWith(r.property), `${r.key} RDF property`);
    assert.ok(r.combiner in COMBINER_CELL && c[4].startsWith(COMBINER_CELL[r.combiner]), `${r.key} combiner`);
  });
});

test('AGSC-03-25: the expected target kinds of each key are the cells of the table', () => {
  const kinds = Object.fromEntries(relations.RELATIONS.map((r) => [r.key, r.targets]));
  assert.deepStrictEqual(kinds.related, { any: true });
  assert.deepStrictEqual(kinds.broader, { sameFamily: true });
  assert.deepStrictEqual(kinds.narrower, { sameFamily: true });
  assert.deepStrictEqual(kinds['derived-from'], { any: true, lessonTarget: { type: 'episode' } });
  assert.deepStrictEqual(kinds.supersedes, { sameType: true });
  assert.deepStrictEqual(kinds.implements, { type: 'concept', kinds: ['spec', 'pattern', 'architecture'] });
  assert.deepStrictEqual(kinds.verifies, { oneOf: [
    { type: 'concept', kinds: ['spec', 'task'] }, { type: 'procedure' }, { type: 'gate' }] });
  assert.deepStrictEqual(kinds['blocked-by'], { type: 'concept', kinds: ['task'] });
  assert.deepStrictEqual(kinds['decided-by'], { type: 'concept', kinds: ['decision'] });
});

test('AGSC-03-23: only requires, broader and narrower get a cycle for a self-link', () => {
  const cycles = relations.RELATIONS.filter((r) => r.selfLink === 'cycle').map((r) => r.key);
  assert.deepStrictEqual(cycles, ['broader', 'narrower', 'requires']);
});

test('AGSC-03-01: the table is deeply frozen', () => {
  assert.ok(Object.isFrozen(relations.RELATIONS) && Object.isFrozen(relations.RELATIONS[0]));
  assert.ok(Object.isFrozen(relations.RELATIONS[0].targets));
});

// Spec cell prefix of each combiner code.
const COMBINER_CELL = { none: 'none', advisory: 'advisory', soft: 'soft', hard: 'hard: closure',
  mutex: 'hard: mutex', 'warn-both': 'warn if both', 'hide-superseded': 'superseded item hidden' };

test('AGSC-03-01: no server-side file but relations.js retypes the fourteen keys or their inverses', () => {
  const root = path.join(__dirname, '../../src');
  const readers = ['knowledge/links.js', 'knowledge/chunks.js', 'knowledge/nquads.js',
    'boundary/visibility.js', 'boundary/federation.js'];
  for (const file of readers) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(/require\('(\.\/|\.\.\/knowledge\/)relations\.js'\)/u.test(source), `${file} does not read relations.js`);
    for (const word of ['decided-by', 'implemented-by', 'derivation-of', 'skos#related']) {
      assert.ok(!source.includes(`'${word}'`), `${file} retypes '${word}'`);
    }
  }
});

test('AGSC-03-19, AGSC-03-20: every foreign link spelling okf.js maps lands on a key of the table, never on a computed name', () => {
  for (const [foreign, key] of Object.entries(okf.FOREIGN_LINK_NAMES)) {
    assert.ok(relations.LINK_KEYS.includes(key), `${foreign} -> ${key} is not a Link key`);
    assert.ok(!relations.LINK_KEYS.includes(foreign), `${foreign} is already a Link key`);
  }
});
