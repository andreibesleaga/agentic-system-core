'use strict';
// tests/governance/fix.test.js — `lint --fix` (AGSC-03-12, AGSC-04-14, AGSC-04-19,
// AGSC-04-20; the flag AGSC-09-09 named at rc.5, specification item V9D-01).
//
// The four rules are read as four separate obligations and each one is asserted on
// its own: what `--fix` MUST normalise, that it is idempotent, that the emitted YAML
// is the one fixed profile, and — the rule that is easiest to break — what it MUST
// NOT touch. No clock, no network; every input is a string in this file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const fc = require('fast-check');

const fix = require('../../src/governance/fix.js');

const ROOT = path.resolve(__dirname, '..', '..');
const ITEM_SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'item.schema.json'), 'utf8'));

const TYPES = new Map([['alpha', 'concept'], ['run-it', 'procedure'], ['pack', 'cluster']]);

function fixOne(source, type = 'concept', types = TYPES) {
  return fix.fixItem({ path: 'content/concepts/a.md', slug: 'a', type }, {
    itemSchema: ITEM_SCHEMA, source, typeOfSlug: types,
  });
}

// ------------------------------------------------------------------ AGSC-04-19

test('AGSC-04-19: the frontmatter is re-ordered into schema order, top level then branch', () => {
  const source = '---\nkind: pattern\nstatus: stable\ntype: concept\ntitle: A\n---\n\nBody.\n';
  const after = fixOne(source).after;
  const keys = after.split('\n').slice(1, 6).map((l) => l.split(':')[0]);
  // `type, title, status` are the top-level `properties` order; `kind` is the concept
  // branch's, so it follows every top-level key whatever order it was authored in.
  assert.deepStrictEqual(keys.slice(0, 4), ['type', 'title', 'status', 'kind']);
});

test('AGSC-04-19: a nested mapping takes its own $def properties order', () => {
  const source = '---\ntype: concept\ntitle: A\nprov:\n  operator: human:x\n  agreement: none\n  origin: human\n---\n\nB.\n';
  const after = fixOne(source).after;
  const provLines = after.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.trim().split(':')[0]);
  // `$defs/prov` declares origin, agent, model, operator, agreement — in that order.
  assert.deepStrictEqual(provLines, ['origin', 'operator', 'agreement']);
});

test('AGSC-04-19: an unknown key is preserved and sorted by code point after the declared ones', () => {
  const source = '---\nx-zeta-one: "1"\ntype: concept\nx-alpha-two: "2"\ntitle: A\n---\n\nB.\n';
  const after = fixOne(source).after;
  const keys = after.split('\n').slice(1).filter((l) => l !== '---').map((l) => l.split(':')[0]);
  assert.deepStrictEqual(keys.slice(0, 4), ['type', 'title', 'x-alpha-two', 'x-zeta-one']);
  // AGSC-00-15/AGSC-02-05a: nothing was dropped.
  assert.match(after, /x-zeta-one: '?"?1/u);
});

test('AGSC-04-19: line endings, NFC and exactly one trailing newline', () => {
  const crlf = '---\r\ntype: concept\r\ntitle: A\r\n---\r\n\r\nBody.\r\n\r\n\r\n';
  const result = fixOne(crlf);
  assert.ok(result.changed);
  assert.ok(!result.after.includes('\r'), 'a CR survived');
  assert.ok(result.after.endsWith('Body.\n'), 'the trailing newlines were not collapsed to one');
  // NFC: the decomposed form of "é" becomes the composed one (AGSC-04-07).
  const decomposed = `---\ntype: concept\ntitle: A\n---\n\nCaf${'é'}.\n`;
  assert.match(fixOne(decomposed).after, /Café\./u);
});

test('AGSC-04-19: applying it twice produces the same bytes as applying it once', () => {
  const sources = [
    '---\nkind: pattern\ntype: concept\ntitle: A\n---\n\nSee [[alpha]] and [[run-it#step|a step]].\n',
    '---\r\ntype: episode\r\nstarted: "2026-01-01T00:00:00Z"\r\nactor: human:x\r\ntitle: E\r\n---\r\nBody\r\n',
    '---\ntype: concept\ntitle: "A: colon"\ntags:\n  - zeta\n  - alpha\n---\n\n![[pic.png]]\n',
    'No frontmatter at all, just prose with [[alpha]].\r\n\r\n',
  ];
  for (const source of sources) {
    const once = fixOne(source).after;
    const twice = fixOne(once);
    assert.strictEqual(twice.after, once, `not idempotent: ${JSON.stringify(source)}`);
    assert.strictEqual(twice.changed, false, `the second pass still reports a change: ${JSON.stringify(source)}`);
  }
});

test('AGSC-04-19: the emitted YAML is the fixed profile — block style, two spaces, one space after the colon', () => {
  // A flow SEQUENCE of scalars is admitted by AGSC-02-02…04 (a flow MAPPING is not,
  // and `--fix` leaves a file it cannot parse alone — asserted above), so this is the
  // one authored form the profile has to convert.
  // The key order is wrong (`kind` before the top-level keys), so the block IS
  // re-emitted — and this is what it is re-emitted as. A block already in schema
  // order is left verbatim, which the AGSC-04-20 test below asserts.
  const source = '---\nkind: pattern\ntype: concept\ntitle: A\ntags: [zeta, alpha]\nprov:\n  origin: human\n---\n\nB.\n';
  const after = fixOne(source).after;
  assert.ok(!after.includes('['), 'a flow sequence survived the block-style profile');
  assert.ok(!after.includes('{'), 'a flow mapping was emitted');
  assert.match(after, /\ntags:\n {2}- zeta\n {2}- alpha\n/u);
  for (const line of after.split('\n')) {
    assert.ok(!/\s+$/u.test(line), `a line carries trailing space: ${JSON.stringify(line)}`);
    if (/^ *[a-z-]+:[^ ]/u.test(line)) assert.fail(`no space after the colon: ${line}`);
  }
  assert.ok(!after.includes('...'), 'a document marker was emitted');
});

// ------------------------------------------------------------------ AGSC-04-14 / AGSC-04-20

test('AGSC-04-14: an authored array keeps author order — the primary cluster stays first', () => {
  const source = '---\nkind: pattern\ntype: concept\ntitle: A\nclusters:\n  - zeta\n  - alpha\ntags:\n  - two\n  - one\n---\n\nB.\n';
  const after = fixOne(source).after;
  assert.ok(after.indexOf('- zeta') < after.indexOf('- alpha'), 'clusters[] was reordered');
  assert.ok(after.indexOf('- two') < after.indexOf('- one'), 'tags[] was reordered');
});

test('AGSC-04-20: no key is added, removed or inferred, and prose is otherwise untouched', () => {
  const source = '---\ntype: concept\ntitle: A\n---\n\nParagraph one.\n\n- a list item\n\n> a quote\n\n| t | u |\n|---|---|\n| 1 | 2 |\n';
  const result = fixOne(source);
  assert.strictEqual(result.changed, false, `changed: ${JSON.stringify(result.changes)}`);
  assert.strictEqual(result.after, source);
});

test('AGSC-04-20: a frontmatter this engine cannot parse is left byte-identical', () => {
  const anchored = '---\ntype: &a concept\ntitle: *a\n---\n\nB.\n';
  const result = fixOne(anchored);
  assert.strictEqual(result.after, anchored);
  assert.strictEqual(result.changed, false);
  // A block that is a sequence, not a mapping, is equally left alone.
  const sequence = '---\n- one\n- two\n---\n\nB.\n';
  assert.strictEqual(fixOne(sequence).after, sequence);
});

test('AGSC-04-20: a file with no closed frontmatter gets the three text normalisations and no block', () => {
  const source = 'Just prose.\r\nSecond line.\r\n\r\n\r\n';
  const result = fixOne(source);
  assert.strictEqual(result.after, 'Just prose.\nSecond line.\n');
  assert.deepStrictEqual(result.changes, ['line endings, NFC and the trailing newline']);
  assert.ok(!result.after.startsWith('---'), 'a frontmatter block was inferred');
});

// ------------------------------------------------------------------ AGSC-03-12

test('AGSC-03-12: a wikilink becomes a relative Markdown link, anchor and alias carried', () => {
  const source = '---\ntype: concept\ntitle: A\n---\n\n[[alpha]] · [[run-it|Run it]] · [[pack#head]] · [[run-it#step|a step]]\n';
  const after = fixOne(source).after;
  assert.match(after, /\[alpha\]\(\.\.\/concepts\/alpha\.md\)/u);
  assert.match(after, /\[Run it\]\(\.\.\/procedures\/run-it\.md\)/u);
  assert.match(after, /\[pack\]\(\.\.\/clusters\/pack\.md#head\)/u);
  assert.match(after, /\[a step\]\(\.\.\/procedures\/run-it\.md#step\)/u);
  assert.ok(!after.includes('[['), 'a wikilink survived');
});

test('AGSC-03-12: the reversed Dendron order is NOT assumed — the target is always first', () => {
  // `[[alpha|run-it]]` is read as target `alpha`, alias `run-it`, never the reverse:
  // the rule forbids assuming Dendron's order "without an explicit import flag",
  // and this module carries none.
  const after = fixOne('---\ntype: concept\ntitle: A\n---\n\n[[alpha|run-it]]\n').after;
  assert.match(after, /\[run-it\]\(\.\.\/concepts\/alpha\.md\)/u);
});

test('AGSC-03-12: an embed becomes an image or is removed, and nothing else', () => {
  const after = fixOne('---\ntype: concept\ntitle: A\n---\n\n![[a.png]] ![[b.svg|Alt]] ![[alpha]]\n').after;
  assert.match(after, /!\[a\.png\]\(a\.png\)/u);
  assert.match(after, /!\[Alt\]\(b\.svg\)/u);
  assert.ok(!after.includes('![[alpha]]'), 'a non-image embed was neither converted nor removed');
  assert.ok(!after.includes('[alpha]'), 'a non-image embed became a link instead of being removed');
});

test('AGSC-03-12: an unresolvable target is left as authored and reported as a warning', () => {
  const result = fixOne('---\ntype: concept\ntitle: A\n---\n\n[[nowhere]]\n');
  assert.match(result.after, /\[\[nowhere\]\]/u);
  assert.strictEqual(result.findings.length, 1);
  assert.strictEqual(result.findings[0].code, 'AGSC-E506');
  assert.strictEqual(result.findings[0].severity, 'warn');
  assert.match(result.findings[0].message, /AGSC-03-12/u);
});

test('AGSC-04-20: a wikilink inside a code fence or a code span is an example and is not rewritten', () => {
  const source = ['---', 'type: concept', 'title: A', '---', '',
    'Prose [[alpha]].', '', '```md', '[[alpha]]', '```', '',
    'Inline `[[alpha]]` stays.', '', '~~~', '[[alpha]]', '~~~', ''].join('\n');
  const after = fixOne(source).after;
  assert.strictEqual((after.match(/\[\[alpha\]\]/gu) || []).length, 3,
    'a wikilink inside code was rewritten, or one outside code was not');
  assert.match(after, /Prose \[alpha\]\(\.\.\/concepts\/alpha\.md\)\./u);
});

test('codeSpans finds a fence that is never closed, so the rest of the file is code', () => {
  const spans = fix.codeSpans('a\n```\n[[alpha]]\nno closing fence\n');
  assert.strictEqual(spans.length, 1);
  assert.ok(spans[0][1] >= 'a\n```\n[[alpha]]\n'.length, 'an unclosed fence did not reach the end');
});

test('rewriteWikilinks counts what it rewrote and is a total function on hostile input', () => {
  for (const body of ['[[', ']]', '[[]]', '[[|]]', '[[#]]', '![[', '[[a]]'.repeat(500), '']) {
    const out = fix.rewriteWikilinks(body, TYPES);
    assert.strictEqual(typeof out.body, 'string');
    assert.ok(Number.isInteger(out.rewritten));
  }
  assert.strictEqual(fix.rewriteWikilinks('[[alpha]] [[alpha]]', TYPES).rewritten, 2);
});

// ------------------------------------------------------------------ the helpers

test('declaredOrder is the top-level order then the matching branch, never another branch', () => {
  const concept = fix.declaredOrder(ITEM_SCHEMA, 'concept');
  const episode = fix.declaredOrder(ITEM_SCHEMA, 'episode');
  assert.strictEqual(concept[0], 'type');
  assert.ok(concept.includes('kind') && !concept.includes('started'), 'a foreign branch leaked in');
  assert.ok(episode.includes('started') && !episode.includes('kind'));
  assert.strictEqual(new Set(concept).size, concept.length, 'a key is listed twice');
  // A type no branch names still gets the top-level order, never an empty one.
  assert.deepStrictEqual(fix.declaredOrder(ITEM_SCHEMA, 'nosuchtype'),
    Object.keys(ITEM_SCHEMA.properties));
});

test('subSchema follows a local $ref and an items wrapper, and refuses anything else', () => {
  assert.deepStrictEqual(Object.keys(fix.subSchema(ITEM_SCHEMA, { $ref: '#/$defs/prov' }).properties),
    ['origin', 'agent', 'model', 'operator', 'agreement']);
  assert.deepStrictEqual(Object.keys(fix.subSchema(ITEM_SCHEMA, ITEM_SCHEMA.properties.sources).properties),
    ['id', 'resource', 'title', 'author', 'year', 'verified', 'grade']);
  assert.strictEqual(fix.subSchema(ITEM_SCHEMA, { $ref: 'https://example/x' }), null);
  assert.strictEqual(fix.subSchema(ITEM_SCHEMA, null), null);
  assert.strictEqual(fix.propertySchema(ITEM_SCHEMA, 'concept', 'nosuchkey'), null);
  assert.strictEqual(fix.propertySchema(ITEM_SCHEMA, 'episode', 'usage').properties.model.type, 'string');
});

test('orderKeys never adds, removes or reorders inside an array', () => {
  fc.assert(fc.property(
    fc.dictionary(fc.constantFrom('type', 'title', 'zz', 'aa', 'status'), fc.string(), { maxKeys: 5 }),
    (value) => {
      const ordered = fix.orderKeys(value, ['type', 'title', 'status'], ITEM_SCHEMA, 'concept', null);
      assert.deepStrictEqual(Object.keys(ordered).sort(), Object.keys(value).sort());
      for (const key of Object.keys(value)) assert.strictEqual(ordered[key], value[key]);
    }
  ), { numRuns: 200, seed: 20260921 });
  assert.deepStrictEqual(fix.orderKeys(['c', 'a', 'b'], ['x'], ITEM_SCHEMA, 'concept', null), ['c', 'a', 'b']);
  assert.strictEqual(fix.orderKeys('scalar', [], ITEM_SCHEMA, 'concept', null), 'scalar');
  assert.strictEqual(fix.orderKeys(null, [], ITEM_SCHEMA, 'concept', null), null);
});

test('normaliseText is total and idempotent', () => {
  fc.assert(fc.property(fc.string(), (s) => {
    const once = fix.normaliseText(s);
    assert.strictEqual(fix.normaliseText(once), once);
    assert.ok(once.endsWith('\n'));
    assert.ok(!once.includes('\r'));
  }), { numRuns: 300, seed: 20260921 });
});

test('relativeTarget maps every item type to its AGSC-05-01 plural', () => {
  assert.strictEqual(fix.relativeTarget('procedure', 's', ''), '../procedures/s.md');
  assert.strictEqual(fix.relativeTarget('gate', 's', 'a'), '../gates/s.md#a');
  // An unknown type falls back to the concept plural rather than inventing a folder.
  assert.strictEqual(fix.relativeTarget('nosuch', 's', ''), '../concepts/s.md');
});

// ------------------------------------------------------------------ plan()

test('plan() reports one entry per item whose bytes the caller supplied, path-ordered', () => {
  const bundle = {
    items: [
      { path: 'content/concepts/b.md', slug: 'b', type: 'concept' },
      { path: 'content/concepts/a.md', slug: 'a', type: 'concept' },
      { path: 'content/concepts/absent.md', slug: 'absent', type: 'concept' },
    ],
  };
  const planned = fix.plan(bundle, {
    itemSchema: ITEM_SCHEMA,
    sources: {
      'content/concepts/a.md': '---\ntitle: A\ntype: concept\n---\n\nX.\n',
      'content/concepts/b.md': '---\ntype: concept\ntitle: B\n---\n\nY.\n',
    },
  });
  assert.deepStrictEqual(planned.files.map((f) => f.path),
    ['content/concepts/a.md', 'content/concepts/b.md']);
  assert.deepStrictEqual(planned.changed, ['content/concepts/a.md']);
  assert.deepStrictEqual(planned.findings, []);
});

test('plan() takes a Map as well as an object, and an empty Bundle is not an error', () => {
  const planned = fix.plan({ items: [{ path: 'p.md', slug: 'p', type: 'concept' }] }, {
    itemSchema: ITEM_SCHEMA,
    sources: new Map([['p.md', '---\ntype: concept\ntitle: P\n---\n\nSee [[nowhere]].\n']]),
  });
  assert.strictEqual(planned.files.length, 1);
  assert.strictEqual(planned.findings.length, 1);
  assert.deepStrictEqual(fix.plan({}, { itemSchema: ITEM_SCHEMA }), { changed: [], files: [], findings: [] });
});

test('the first type wins when two items share a slug, so the rewrite is deterministic', () => {
  const planned = fix.plan({
    items: [
      { path: 'a.md', slug: 'dup', type: 'concept' },
      { path: 'b.md', slug: 'dup', type: 'procedure' },
    ],
  }, {
    itemSchema: ITEM_SCHEMA,
    sources: { 'a.md': '---\ntype: concept\ntitle: A\n---\n\n[[dup]]\n' },
  });
  assert.match(planned.files[0].after, /\(\.\.\/concepts\/dup\.md\)/u);
});

test('AGSC-02-04: a date and an instant stay quoted strings; nothing else is quoted for them', () => {
  const source = ['---', 'kind: pattern', 'type: concept', 'title: A',
    'date: "2026-01-01"', 'stale_after: "2027-01-01T00:00:00Z"',
    'modified: "2026-06-30T12:00:00Z"', 'status: "stable"', '---', '', 'B.', ''].join('\n');
  const after = fixOne(source).after;
  assert.match(after, /\ndate: "2026-01-01"\n/u, 'a date lost its quotes');
  assert.match(after, /\nstale_after: "2027-01-01T00:00:00Z"\n/u, 'an instant lost its quotes');
  assert.match(after, /\nmodified: "2026-06-30T12:00:00Z"\n/u);
  // A value that is not temporal is emitted plain, which is the profile's default.
  assert.match(after, /\nstatus: stable\n/u);
  // The node carries the same STRING either way — only its style is decided here.
  const quoted = fix.quoteTemporal({ a: '2026-01-01', b: 'plain', c: ['2026-01-01T00:00:00Z'] });
  assert.strictEqual(String(quoted.a), '2026-01-01');
  assert.strictEqual(quoted.a.type, 'QUOTE_DOUBLE');
  assert.strictEqual(quoted.b, 'plain');
  assert.strictEqual(quoted.c[0].type, 'QUOTE_DOUBLE');
  assert.strictEqual(fix.quoteTemporal(null), null);
  assert.strictEqual(fix.quoteTemporal(3), 3);
  // A near-miss is not temporal: millisecond precision and a local offset are both
  // outside AGSC-04-10's form, so neither is quoted for that reason.
  assert.strictEqual(fix.quoteTemporal('2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
  assert.strictEqual(fix.quoteTemporal('2026-01-01T00:00:00+01:00'), '2026-01-01T00:00:00+01:00');
});

test('the rc.5 vector for the YAML profile passes byte for byte (lint-0026)', () => {
  // `tests/vectors/lint/lint-0026-fix-yaml-profile.json` was authored by hand from the
  // rule text while this module was being written, by a different package, and is in
  // `tests/conformance/pending.json` until the vector runner adopts it. Reading it here
  // is the one cross-check that the profile was derived from AGSC-04-19 and not from
  // this implementation.
  const vector = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'tests', 'vectors', 'lint', 'lint-0026-fix-yaml-profile.json'), 'utf8'
  ));
  const once = fix.fixItem({ path: vector.input.file, slug: 'router', type: 'concept' },
    { itemSchema: ITEM_SCHEMA, source: vector.input.bytes, typeOfSlug: new Map() });
  assert.strictEqual(once.after, vector.expected.output);
  const twice = fix.fixItem({ path: vector.input.file, slug: 'router', type: 'concept' },
    { itemSchema: ITEM_SCHEMA, source: once.after, typeOfSlug: new Map() });
  assert.strictEqual(twice.after, vector.expected.twice);
  assert.strictEqual(twice.changed, false, 'AGSC-04-19 idempotence');
});
