'use strict';
// AGSC-06-13a beyond disc-0006/disc-0007: the exclusions, the "Other" section, the
// single-line description and the absence of an `Optional` section at 1.x.

const test = require('node:test');
const assert = require('node:assert');
const llms = require('../../src/distribution/llms.js');

const OPTIONS = { generatedAt: '2026-01-01T00:00:00Z', specVersion: '1.0.0-rc.4' };
const BUNDLE = {
  base: 'https://a.example/',
  title: 'Node',
  description: 'One line\nbroken over two.',
  license_prose: 'CC-BY-4.0',
  clusters: [{ slug: 'empty', title: 'Empty' }, { slug: 'c', title: 'C' }],
  items: [
    { slug: 'kept', title: 'Kept', clusters: ['c'], description: 'Kept.', body: 'Body.\n' },
    { slug: 'retired', title: 'Retired', status: 'retired', clusters: ['c'] },
    { slug: 'draft', title: 'Draft', status: 'draft' },
    { slug: 'loose', title: 'Loose' },
    { slug: 'c', type: 'cluster', title: 'C' },
  ],
};

test('the description becomes one line and the licence is the authored one', () => {
  const text = llms.llmsTxt(BUNDLE, OPTIONS);
  assert.ok(text.includes('> One line broken over two.\n'));
  assert.ok(text.includes('license: CC-BY-4.0\n'));
  // AGSC-06-18: `terms` is the constant, independent of `bundle.license_prose`.
  assert.ok(text.includes('terms: LicenseRef-AgenticSystemCore-Content-Use-1.0\n'));
});

test('retired and draft items appear in neither file, and a cluster has no link line', () => {
  const text = llms.llmsTxt(BUNDLE, OPTIONS);
  assert.ok(!text.includes('/retired/'), 'a retired item reached /llms.txt (AGSC-11-22)');
  assert.ok(!text.includes('/draft/'), 'a draft item reached /llms.txt (AGSC-06-30)');
  assert.ok(!text.includes('/clusters/c/'), 'a cluster got a link line of its own');
});

test('a cluster with no primary member emits no section; loose items go to Other', () => {
  const text = llms.llmsTxt(BUNDLE, OPTIONS);
  assert.ok(!text.includes('## Empty'), 'an empty cluster emitted a section (V7-08)');
  assert.ok(text.includes('## Other\n\n- [Loose](https://a.example/concepts/loose/): Loose\n'));
});

test('no Optional section is emitted at 1.x, and the file ends in exactly one LF', () => {
  const text = llms.llmsTxt(BUNDLE, OPTIONS);
  assert.ok(!text.includes('## Optional'));
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
});

test('/llms-full.txt fences every body as text agsc-content (AGSC-06-15)', () => {
  const full = llms.llmsFullTxt(BUNDLE, OPTIONS);
  assert.ok(full.includes('<!-- agsc:item https://a.example/concepts/kept/ -->\n```text agsc-content\nBody.\n```\n'));
  assert.ok(full.startsWith(llms.llmsTxt(BUNDLE, OPTIONS)), 'the full file does not repeat the index');
});
