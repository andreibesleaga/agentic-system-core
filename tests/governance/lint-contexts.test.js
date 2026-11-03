'use strict';
// verifies AGSC-08-32, AGSC-05-21
// Titles unique inside one bounded context. On a node that declares contexts the label check of
// AGSC-05-21 is made inside each group (the items of one context; the items with no context), and
// inside a context two published items with equal titles after NFC and case folding are the warning
// AGSC-E419 whatever their types, on the later path, in place of AGSC-E416; every other comparison
// (an alias against a title or an alias, items of one type) is AGSC-E416 as before. A node that
// declares no context is checked exactly as before. Property tests (fast-check, fixed seed) state
// that a node with no contexts never gets AGSC-E419 and gets the findings of 1.0, and that items of
// two different contexts are never compared.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const lint = require('../../src/governance/lint.js');

const RUNS = { numRuns: 150, seed: 20261103, verbose: 0 };
const CONFIG = { domain: { contexts: [
  { cluster: 'billing', namespace: 'https://ctx.example/billing#' },
  { cluster: 'shipping', namespace: 'https://ctx.example/shipping#' },
] } };

function item({ slug, title, type = 'concept', clusters, aliases, context }) {
  const frontmatter = { type, title, ...(clusters === undefined ? {} : { clusters }),
    ...(aliases === undefined ? {} : { aliases }), ...(context === undefined ? {} : { domain_context: context }) };
  return { body: '', frontmatter, path: `content/${type}s/${slug}.md`, slug, type };
}
const found = (findings) => findings.map((f) => [f.code, f.slug]);

test('inside a context equal titles are AGSC-E419 whatever the type; across contexts they are silent', () => {
  const items = [
    item({ slug: 'account-a', title: 'Account', clusters: ['billing'] }),
    item({ slug: 'account-b', title: 'Account', clusters: ['shipping'] }),
    item({ slug: 'account-c', title: 'ACCOUNT', clusters: ['billing'] }),
    item({ slug: 'account-steps', title: 'account', type: 'procedure', clusters: ['billing'] }),
    item({ slug: 'account-moved', title: 'Account', clusters: ['billing'], context: 'shipping' }),
  ];
  const findings = lint.checkOverlappingLabels(items, CONFIG);
  assert.deepStrictEqual(found(findings), [['AGSC-E419', 'account-c'], ['AGSC-E419', 'account-moved'], ['AGSC-E419', 'account-steps']]);
  assert.ok(findings.every((f) => f.severity === 'warn'));
  assert.match(findings[0].message, /"account-a"/u);
  assert.match(findings[0].message, /context billing/u);
  assert.match(findings[1].message, /"account-b"/u, 'domain_context moves the item into shipping, beside account-b');
});

test('inside a context an alias still overlaps as AGSC-E416, between items of one type', () => {
  const items = [
    item({ slug: 'invoice', title: 'Invoice', clusters: ['billing'], aliases: ['Bill'] }),
    item({ slug: 'bill', title: 'Bill', clusters: ['billing'] }),
    item({ slug: 'receipt', title: 'Receipt', clusters: ['billing'], aliases: ['Invoice'] }),
    item({ slug: 'bill-steps', title: 'Paying', type: 'procedure', clusters: ['billing'], aliases: ['bill'] }),
    item({ slug: 'echo', title: 'Echo', clusters: ['billing'], aliases: ['ECHO'] }),
  ];
  assert.deepStrictEqual(found(lint.checkOverlappingLabels(items, CONFIG)), [['AGSC-E416', 'invoice'], ['AGSC-E416', 'receipt']]);
});

test('the items with no context form one group, checked as AGSC-05-21 checks a node without contexts', () => {
  const items = [
    item({ slug: 'glossary', title: 'Glossary' }),
    item({ slug: 'glossary-2', title: 'glossary', clusters: ['agent-patterns'] }),
    item({ slug: 'glossary-3', title: 'Glossary', clusters: ['billing'] }),
  ];
  assert.deepStrictEqual(found(lint.checkOverlappingLabels(items, CONFIG)), [['AGSC-E416', 'glossary']], 'glossary-2.md is the earlier path');
});

test('a node that declares no context gets no AGSC-E419 and the findings it had', () => {
  const items = [
    item({ slug: 'account-a', title: 'Account', clusters: ['billing'] }),
    item({ slug: 'account-b', title: 'Account', clusters: ['shipping'] }),
  ];
  for (const config of [{}, { domain: {} }, { domain: { contexts: [] } }]) {
    assert.deepStrictEqual(found(lint.checkOverlappingLabels(items, config)), [['AGSC-E416', 'account-b']]);
  }
});

const titles = fc.constantFrom('Account', 'ACCOUNT', 'Ledger', 'ledger', 'Parcel');
const anItem = fc.record({
  aliases: fc.array(titles, { maxLength: 2 }),
  clusters: fc.array(fc.constantFrom('billing', 'shipping', 'agent-patterns'), { maxLength: 2 }),
  title: titles,
  type: fc.constantFrom('concept', 'procedure'),
});
const someItems = fc.array(anItem, { maxLength: 8 })
  .map((list) => list.map((fields, n) => item({ ...fields, slug: `item-${String(n).padStart(2, '0')}` })));

test('property: with no contexts the check is that of 1.0 — no AGSC-E419, and the same AGSC-E416', () => {
  fc.assert(fc.property(someItems, (items) => {
    const without = lint.checkOverlappingLabels(items, {});
    assert.ok(without.every((f) => f.code === 'AGSC-E416'));
    assert.deepStrictEqual(lint.checkOverlappingLabels(items, { domain: { contexts: [] } }), without);
  }), RUNS);
});

test('property: items of two different contexts are never compared, and the check is deterministic', () => {
  fc.assert(fc.property(someItems, (items) => {
    const findings = lint.checkOverlappingLabels(items, CONFIG);
    assert.deepStrictEqual(lint.checkOverlappingLabels([...items].reverse(), CONFIG), findings, 'the input order does not matter');
    const billing = items.filter((i) => (i.frontmatter.clusters || [])[0] === 'billing');
    const shipping = items.filter((i) => (i.frontmatter.clusters || [])[0] === 'shipping');
    const alone = [...lint.checkOverlappingLabels(billing, CONFIG), ...lint.checkOverlappingLabels(shipping, CONFIG)];
    const inContexts = findings.filter((f) => billing.concat(shipping).some((i) => i.slug === f.slug));
    assert.deepStrictEqual(found(inContexts).sort(), found(alone).sort(), 'a context is checked as if it were alone');
  }), RUNS);
});
