'use strict';
// Clarifications of the item, link, graph and composition chapters (spec/02, 03,
// 05 and 07). Each test reads one rule's text and checks the sentence that settles
// an open reading; where the engine can be asked, the same test runs the engine and
// checks that it does what the sentence says, so the text cannot drift from the
// behaviour. Deterministic: fixed instants, no network, nothing written outside
// the system temporary directory.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, richBuild } = require('./_fixture.js');
const { compose, verdictOf } = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');
const links = require('../../src/knowledge/links.js');
const { rewriteWikilinks } = require('../../src/governance/fix.js');
const markdown = require('../../src/knowledge/markdown.js');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SPEC = fs.readdirSync(path.join(ROOT, 'spec')).filter((f) => f.endsWith('.md')).sort()
  .map((f) => read(`spec/${f}`)).join('\n');
/** The text of one rule: from its bold id to the next rule's bold id. */
const ruleText = (id) => {
  const at = SPEC.indexOf(`**${id}**`);
  assert.ok(at >= 0, `${id} is not in the specification`);
  const end = SPEC.indexOf('\n- **AGSC-', at + 1);
  return SPEC.slice(at, end < 0 ? undefined : end);
};
/** A rule's text without its dated amendment notes, which quote the old wording. */
const normative = (id) => ruleText(id).replace(/\*\(Amended [^]*?\)\*/gu, '');
const concept = (slug, extra = {}) => ({ slug, type: 'concept', ...extra });

// ---------------------------------------------------------------- 02 item

test('AGSC-02-13: diagram.file names the slug of the item that carries it', () => {
  assert.ok(ruleText('AGSC-02-13').includes('the slug of the item that carries the key'));
});

test('AGSC-02-20: an unescaped brace or angle bracket has no finding code, and raw HTML is AGSC-E109', () => {
  const rule = ruleText('AGSC-02-20');
  assert.ok(rule.includes('has no finding code'), 'AGSC-02-20 does not say the SHOULD NOT has no code');
  assert.deepStrictEqual(markdown.constructs('a { b } and a < b\n'), []);
  assert.deepStrictEqual(markdown.constructs('x <b>y</b>\n').map((c) => c.construct), ['raw HTML', 'raw HTML']);
});

test('AGSC-02-21: the procedure, episode and lesson heading lists are under the same warning', () => {
  assert.ok(ruleText('AGSC-02-21').includes('under the same warning'));
});

test('AGSC-02-23: a lint sees a status transition only when it is given the previous status', () => {
  assert.ok(ruleText('AGSC-02-23').includes('previous status'));
});

test('AGSC-02-24: the closed keyword subset binds the item and Bundle schemas, not the configuration schema', () => {
  const rule = ruleText('AGSC-02-24');
  assert.ok(!normative('AGSC-02-24').includes('three item-facing schemas'), 'the configuration schema is still counted as item-facing');
  assert.ok(rule.includes('`schema/item.schema.json` and `schema/bundle.schema.json`'));
});

// ---------------------------------------------------------------- 03 links

test('AGSC-03-01, AGSC-03-18: five of the core nine carry composition semantics; advisory is defined', () => {
  const r0301 = ruleText('AGSC-03-01');
  assert.ok(!normative('AGSC-03-01').includes('Only the core nine carry composition semantics'));
  assert.ok(r0301.includes('never change a composition'));
  assert.ok(ruleText('AGSC-03-18').includes('`advisory`'), 'AGSC-03-18 does not define the combiner advisory');
});

test('AGSC-03-02: every key\'s unresolved target is AGSC-E301, whatever the Lint column says', () => {
  assert.ok(ruleText('AGSC-03-02').includes('all fourteen keys'));
  for (const key of ['related', 'uses', 'excludes', 'contradicts']) {
    const { findings } = links.resolve([concept('a', { [key]: ['nowhere'] })]);
    assert.ok(findings.some((f) => f.code === 'AGSC-E301'), `${key}: ${JSON.stringify(findings)}`);
  }
});

test('AGSC-03-08: both cluster bounds count the broader values authored on cluster files', () => {
  assert.ok(ruleText('AGSC-03-08').includes('authored on cluster files'));
  const cluster = (slug, extra = {}) => ({ slug, type: 'cluster', ...extra });
  // fam-c names one parent itself; fam-a names it as a child through `narrower`.
  const { findings } = links.resolve([cluster('fam-a', { narrower: ['fam-c'] }), cluster('fam-b'),
    cluster('fam-c', { broader: ['fam-b'] })]);
  assert.ok(!findings.some((f) => f.code === 'AGSC-E308'), JSON.stringify(findings));
});

test('AGSC-03-10: a computed inverse is an inbound Link; an inline mention is not', () => {
  const rule = ruleText('AGSC-03-10');
  assert.ok(rule.includes('authored or computed') && rule.includes('asc:mentions'));
  const { findings } = links.resolve([concept('a', { related: ['b'] }), concept('b'),
    concept('c', { body: 'See [b](b).' })]);
  const orphans = findings.filter((f) => f.code === 'AGSC-E305').map((f) => f.slug);
  assert.deepStrictEqual(orphans, ['c']);
});

test('AGSC-03-12: embeds, alias-less wikilinks and unresolved wikilinks are settled', () => {
  const rule = ruleText('AGSC-03-12');
  assert.ok(rule.includes('`.webp`') && rule.includes('its target slug as the link text'));
  assert.ok(rule.includes('`AGSC-E506`') && rule.includes('without `--fix`'));
  const out = rewriteWikilinks('[[b]] [[b#x|B]] [[none]] ![[p.png]] ![[d.pdf]]', new Map([['b', 'concept']]));
  assert.strictEqual(out.body, '[b](../concepts/b.md) [B](../concepts/b.md#x) [[none]] ![p.png](p.png) ');
  assert.deepStrictEqual(out.left, ['none']);
});

// ---------------------------------------------------------------- 05 graph

test('AGSC-05-09: @version and @protected belong to the context file; the compaction sentence is exact', () => {
  const rule = ruleText('AGSC-05-09');
  assert.ok(!normative('AGSC-05-09').includes('mark every term'), 'graph.jsonld is still asked to mark terms @protected');
  assert.ok(rule.includes('"@protected": true'));
  assert.ok(rule.includes('where the term has no `@type`'));
  assert.ok(rule.includes('compaction algorithm'), 'the informative sentence on compaction is missing');
  const { out } = richBuild();
  const graph = JSON.parse(fs.readFileSync(path.join(out, 'graph.jsonld'), 'utf8'));
  assert.deepStrictEqual(Object.keys(graph).sort(), ['@context', '@graph']);
  const context = JSON.parse(fs.readFileSync(path.join(out, 'ns', 'context.jsonld'), 'utf8'))['@context'];
  assert.strictEqual(context['@protected'], true);
  assert.strictEqual(context['@version'], 1.1);
});

test('AGSC-05-22: the ontology check rejects a construct outside OWL 2 RL with AGSC-E203', () => {
  const rule = ruleText('AGSC-05-22');
  assert.ok(rule.includes('tools/validate-ontology') && rule.includes('AGSC-E203'));
});

test('AGSC-05-23: derivation-of is the one computed inverse with no RDF property', () => {
  assert.ok(ruleText('AGSC-05-23').includes('`derivation-of`'));
});

// ---------------------------------------------------------------- 07 composition

test('AGSC-07-03: an unknown slug is one AGSC-E802 conflict with key selection and the slug twice', () => {
  assert.ok(ruleText('AGSC-07-03').includes('"key": "selection"'));
  const verdict = verdictOf(compose([concept('a')], ['a', 'nope']));
  assert.deepStrictEqual(verdict.conflicts, [{ code: 'AGSC-E802', key: 'selection', pair: ['nope', 'nope'] }]);
  assert.strictEqual(verdict.valid, false);
});

test('AGSC-07-05: a hidden item still hides what it supersedes', () => {
  assert.ok(ruleText('AGSC-07-05').includes('a hidden item included'));
  const items = [concept('a', { supersedes: ['b'] }), concept('b', { supersedes: ['c'] }), concept('c')];
  const all = verdictOf(compose(items, ['a', 'b', 'c']));
  assert.deepStrictEqual([all.hidden, all.selection], [['b', 'c'], ['a']]);
  const gap = verdictOf(compose(items, ['a', 'c']));
  assert.deepStrictEqual([gap.hidden, gap.selection], [[], ['a', 'c']]);
});

test('AGSC-07-07: a contradicts pair yields one warning, not two', () => {
  assert.ok(ruleText('AGSC-07-07').includes('one warning, not two'));
  const items = [concept('a', { contradicts: ['b'] }), concept('b', { contradicts: ['a'] }),
    concept('d', { contradicts: ['a'] })];
  assert.deepStrictEqual(verdictOf(compose(items, ['d', 'b', 'a'])).warnings, [
    { code: 'AGSC-E803', key: 'contradicts', source: 'a', target: 'b' },
    { code: 'AGSC-E803', key: 'contradicts', source: 'd', target: 'a' },
  ]);
});

test('AGSC-07-12: decision records of items the closure added follow in added[] order, Concepts alone', () => {
  const rule = ruleText('AGSC-07-12');
  assert.ok(rule.includes('`added[]`') && rule.includes('Concepts alone'));
  const items = [concept('z', { requires: ['m', 'b'] }), concept('m'), concept('b'),
    { slug: 'p', type: 'procedure' }, concept('y')];
  const result = compose(items, ['z', 'p', 'y']);
  const records = harness.decisionRecords(result, {
    items, instant: '2026-01-01T00:00:00Z', licenseProse: 'CC-BY-4.0', selectionDigest: '0'.repeat(64),
    specVersion: '1.0.0', base: 'https://example.org/',
  });
  assert.deepStrictEqual(records.map((r) => r.path),
    ['decisions/0001-z.md', 'decisions/0002-y.md', 'decisions/0003-b.md', 'decisions/0004-m.md']);
});

test('AGSC-07-13a: entry names sort by code point; UTF-16 order is for JSON member names only', () => {
  const rule = ruleText('AGSC-07-13a');
  assert.ok(!normative('AGSC-07-13a').includes("this specification's only ordering"));
  assert.ok(rule.includes('member names only'));
});

test('AGSC-07-16: every emitted file states both licence facts', () => {
  const rule = ruleText('AGSC-07-16');
  assert.ok(rule.includes('every emitted file') && rule.includes('`CC0-1.0`'));
  const items = [concept('a', { title: 'A thing', description: 'A thing that is described here.' }),
    { slug: 'p', type: 'procedure', title: 'A procedure' }];
  const result = compose(items, ['a', 'p']);
  const { files } = harness.emit(result, {
    items, instant: '2026-01-01T00:00:00Z', licenseProse: 'CC-BY-4.0', selectionDigest: '0'.repeat(64),
    specVersion: '1.0.0', base: 'https://example.org/', name: '0'.repeat(16),
  });
  assert.strictEqual(files.size, 7);
  for (const [file, text] of files) {
    assert.ok(text.includes('CC0-1.0') && text.includes('CC-BY-4.0'), `${file} does not state both licences`);
  }
});

test('AGSC-07-19: /skills/index.json carries exactly the members the rule names', () => {
  const rule = ruleText('AGSC-07-19');
  const top = ['bundle_version', 'license', 'packs', 'spec_version', 'terms'];
  const entry = ['description', 'lock', 'members', 'name', 'path'];
  for (const member of [...top, ...entry]) assert.ok(rule.includes(`\`${member}\``), `AGSC-07-19 does not name ${member}`);
  const { out } = richBuild();
  const index = JSON.parse(fs.readFileSync(path.join(out, 'skills', 'index.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(index).sort(), top);
  assert.ok(index.packs.length > 0, 'the fixture emits no pack');
  for (const pack of index.packs) {
    assert.deepStrictEqual(Object.keys(pack).sort(), entry);
    assert.deepStrictEqual(Object.keys(pack.lock), ['SKILL.md']);
    assert.strictEqual(pack.path, `/skills/${pack.name}/SKILL.md`);
    assert.deepStrictEqual(pack.members, [...pack.members].sort());
  }
});

test('AGSC-07-20: a pack whose bytes do not match its lock is refused with AGSC-E413', () => {
  assert.ok(ruleText('AGSC-07-20').includes('AGSC-E413'));
});
