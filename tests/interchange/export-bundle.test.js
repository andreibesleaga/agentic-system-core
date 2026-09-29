'use strict';
// tests/interchange/export-bundle.test.js — AGSC-01-26, the byte-preserving folder
// exports (`export --markdown`, `export --okf`). Unit tests over the pure module;
// the verb, the round trip and the draft sweep are in the files beside this one.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const path = require('node:path');

const exportBundle = require('../../src/interchange/export-bundle.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const ROOT = path.resolve(__dirname, '..', '..');
const ITEM_SCHEMA = readSchemas(ROOT).item;

const INDEX = `---
spec_version: "1.0.0-rc.6"
okf_version: "0.2"
title: A Bundle
description: A Bundle whose root document carries every key AGSC-01-04 requires of one.
base: https://example.org/
---

The root document body.
`;

/** One loaded item, in the shape `application/bundle.js` produces. */
function item(slug, frontmatter, body = '# Body\n') {
  const type = frontmatter.type || 'concept';
  return {
    body,
    frontmatter: { title: slug, type, ...frontmatter },
    path: `content/${type === 'cluster' ? 'clusters' : `${type}s`}/${slug}.md`,
    slug,
    type,
  };
}

function bundleOf(items, config = {}) {
  return { config: { bundle: { license_prose: 'CC-BY-4.0' }, ...config }, index: null, items };
}

function sourcesOf(items) {
  const map = new Map();
  for (const one of items) {
    const lines = ['---'];
    for (const [key, value] of Object.entries(one.frontmatter)) {
      lines.push(typeof value === 'object'
        ? `${key}:\n${Object.entries(value).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
        : `${key}: ${value}`);
    }
    lines.push('---', '');
    map.set(one.path, `${lines.join('\n')}${one.body}`);
  }
  return map;
}

function planOf(items, options = {}) {
  return exportBundle.plan(bundleOf(items, options.config), {
    bundleVersion: options.bundleVersion,
    indexSource: options.indexSource === undefined ? INDEX : options.indexSource,
    itemSchema: ITEM_SCHEMA,
    licenseContent: options.licenseContent === undefined ? 'TERMS TEXT\n' : options.licenseContent,
    licenseProse: 'CC-BY-4.0',
    okf: options.okf === true,
    sources: sourcesOf(items),
  });
}

const at = (plan, p) => (plan.files.find((f) => f.path === p) || {}).text;

test('AGSC-01-26: --markdown emits one .md per published item, plus the index and the terms', () => {
  const items = [item('a', { kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } }),
    item('b', { kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } })];
  const plan = planOf(items);
  assert.deepStrictEqual(plan.files.map((f) => f.path),
    ['LICENSE-CONTENT', 'content/concepts/a.md', 'content/concepts/b.md', 'content/index.md']);
  assert.strictEqual(at(plan, 'LICENSE-CONTENT'), 'TERMS TEXT\n');
  assert.deepStrictEqual(plan.withheld, []);
});

test('AGSC-01-26: --okf adds content/log.md, one line per item in slug order', () => {
  const items = [item('b', { date: '2026-02-02', kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } }),
    item('a', { modified: '2026-03-03', date: '2026-01-01', kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } }),
    item('c', { kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } })];
  const plan = planOf(items, { okf: true });
  // `modified`, else `date`, else the empty string — in slug order.
  assert.strictEqual(at(plan, 'content/log.md'), '- a: 2026-03-03\n- b: 2026-02-02\n- c: \n');
});

test('AGSC-01-26: log.md of a Bundle with no item is the empty file', () => {
  assert.strictEqual(exportBundle.logFile([]), '');
  assert.strictEqual(at(planOf([], { okf: true }), 'content/log.md'), '');
});

test('AGSC-01-26: the export is LOSSLESS — every authored key survives, unknown ones included', () => {
  const one = item('a', {
    kind: 'explainer',
    prov: { origin: 'human', operator: 'human:x' },
    'x-vendor-key': 'kept verbatim',
    zzz_unknown: 'also kept',
  });
  const text = at(planOf([one]), 'content/concepts/a.md');
  for (const key of ['title', 'type', 'kind', 'prov', 'x-vendor-key', 'zzz_unknown']) {
    assert.ok(new RegExp(`^${key}:`, 'mu').test(text), `${key} was dropped`);
  }
  assert.match(text, /kept verbatim/u);
  assert.match(text, /also kept/u);
});

test('AGSC-01-26 + AGSC-04-19: the emitted bytes ARE the lint-normalized bytes', () => {
  const one = item('a', { kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } });
  const sources = sourcesOf([one]);
  const fix = require('../../src/governance/fix.js');
  const fixed = fix.fixItem(one, {
    itemSchema: ITEM_SCHEMA, source: sources.get(one.path), typeOfSlug: new Map([['a', 'concept']]),
  });
  assert.strictEqual(at(planOf([one]), 'content/concepts/a.md'), fixed.after);
});

test('AGSC-06-30: a draft, a retired and a release-gated item never leave through an export', () => {
  const items = [
    item('published', { kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } }),
    item('drafted', { kind: 'explainer', status: 'draft', prov: { origin: 'human', operator: 'human:x' } }),
    item('gone', { kind: 'explainer', status: 'retired', prov: { origin: 'human', operator: 'human:x' } }),
    item('held', { kind: 'explainer', release: 'v2', prov: { origin: 'human', operator: 'human:x' } }),
  ];
  const plan = planOf(items, { config: { releases: { v2: false } } });
  assert.deepStrictEqual(plan.files.map((f) => f.path),
    ['LICENSE-CONTENT', 'content/concepts/published.md', 'content/index.md']);
  assert.deepStrictEqual(plan.withheld, ['drafted', 'gone', 'held']);
});

test('AGSC-01-26: index.md keeps its authored bytes when it already carries `license`', () => {
  const withLicense = INDEX.replace('base: https://example.org/\n',
    'base: https://example.org/\nlicense: CC-BY-4.0\n');
  const plan = planOf([], { indexSource: withLicense });
  assert.strictEqual(at(plan, 'content/index.md'), withLicense);
  assert.deepStrictEqual(plan.findings.filter((f) => f.file === 'content/index.md'), []);
});

test('AGSC-01-26: a missing `license` is APPENDED as one line, quoted, and reported', () => {
  const plan = planOf([]);
  const text = at(plan, 'content/index.md');
  assert.match(text, /\nlicense: "CC-BY-4.0"\n---\n/u);
  // Everything the author wrote is still there, byte for byte, including the quoting
  // of `okf_version: "0.2"`, which a re-serialisation would have turned into a float.
  assert.match(text, /okf_version: "0\.2"/u);
  assert.match(text, /The root document body\./u);
  assert.deepStrictEqual(plan.findings.map((f) => f.code), ['AGSC-E506']);
});

test('AGSC-01-26: bundle_version is the ONE derived key of the export', () => {
  // A caller that hands in no content version writes none: the value is derived by
  // the BUILD (AGSC-04-25) and this module only formats it.
  assert.ok(!/bundle_version/u.test(at(planOf([]), 'content/index.md')));

  // Handed one, it is appended as one line and is NOT reported: adding a derived
  // key is not a normalisation of something the author wrote.
  const added = planOf([], { bundleVersion: 'v1.4.0' });
  assert.match(at(added, 'content/index.md'), /\nbundle_version: "v1\.4\.0"\n---\n/u);
  assert.deepStrictEqual(added.findings.map((f) => f.code), ['AGSC-E506'],
    'only the appended `license` is reported');

  // A document that already carries the SAME value is left alone, byte for byte.
  const withSame = INDEX.replace('base: https://example.org/\n',
    'base: https://example.org/\nlicense: CC-BY-4.0\nbundle_version: "v1.4.0"\n');
  const same = planOf([], { bundleVersion: 'v1.4.0', indexSource: withSame });
  assert.strictEqual(at(same, 'content/index.md'), withSame);
  assert.deepStrictEqual(same.findings.filter((f) => f.file === 'content/index.md'), []);

  // A document carrying a DIFFERENT value has it replaced, and that IS reported:
  // a byte the export was asked to preserve moved.
  const stale = INDEX.replace('base: https://example.org/\n',
    'base: https://example.org/\nlicense: CC-BY-4.0\nbundle_version: "v0.9.0"\n');
  const replaced = planOf([], { bundleVersion: 'v1.4.0', indexSource: stale });
  const text = at(replaced, 'content/index.md');
  assert.ok(!text.includes('v0.9.0'), text);
  assert.match(text, /\nbundle_version: "v1\.4\.0"\n---\n/u);
  assert.match(text, /okf_version: "0\.2"/u, 'nothing else moved');
  const one = replaced.findings.find((f) => /bundle_version was replaced/u.test(f.message));
  assert.ok(one !== undefined, JSON.stringify(replaced.findings));
  assert.strictEqual(one.code, 'AGSC-E506');
  assert.strictEqual(one.severity, 'warn');
});

test('AGSC-01-26: --okf appends okf_version when the root document has none', () => {
  const noVersion = INDEX.replace('okf_version: "0.2"\n', '');
  const plan = planOf([], { indexSource: noVersion, okf: true });
  assert.match(at(plan, 'content/index.md'), /\nokf_version: "0\.2"\n/u);
  assert.deepStrictEqual(plan.findings.map((f) => f.code), ['AGSC-E506', 'AGSC-E506']);
});

test('a Bundle with no content/index.md still gets a root document', () => {
  const plan = planOf([], { indexSource: '' });
  assert.match(at(plan, 'content/index.md'), /^---\nlicense: "CC-BY-4\.0"\n---\n/u);
});

test('an index whose frontmatter this engine cannot read is not re-serialised', () => {
  const broken = '---\na: &anchor value\n---\n\nbody\n';
  const plan = planOf([], { indexSource: broken });
  const text = at(plan, 'content/index.md');
  assert.match(text, /a: &anchor value/u, 'the authored block was rewritten');
  assert.match(text, /license: "CC-BY-4\.0"/u);
});

test('an index whose frontmatter is a sequence, not a mapping, is handled', () => {
  const plan = planOf([], { indexSource: '---\n- one\n- two\n---\n\nbody\n' });
  assert.match(at(plan, 'content/index.md'), /license: "CC-BY-4\.0"/u);
});

test('AGSC-01-26 + AGSC-06-18: no LICENSE-CONTENT at the Bundle root is an error', () => {
  const plan = planOf([], { licenseContent: null });
  assert.ok(!plan.files.some((f) => f.path === 'LICENSE-CONTENT'));
  const one = plan.findings.find((f) => f.code === 'AGSC-E901');
  assert.strictEqual(one.severity, 'error');
  assert.match(one.message, /AGSC-01-26/u);
});

test('AGSC-01-23: the same Bundle exports the same bytes twice', () => {
  const items = [item('a', { kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } })];
  const one = planOf(items, { okf: true });
  const two = planOf(items, { okf: true });
  assert.deepStrictEqual(one.files, two.files);
});

test('published() reads a LOADED item, and defaults `licenseProse` to the terms', () => {
  assert.strictEqual(exportBundle.published({ frontmatter: { status: 'stable' } }), true);
  assert.strictEqual(exportBundle.published({ frontmatter: { status: 'draft' } }), false);
  assert.strictEqual(exportBundle.published({}), true);
  const plan = exportBundle.plan(bundleOf([]), {
    indexSource: '', itemSchema: ITEM_SCHEMA, licenseContent: 'x\n', sources: new Map(),
  });
  assert.match(at(plan, 'content/index.md'), /LicenseRef-AgenticSystemCore-Content-Use-1\.0/u);
});

test('a loader that saw a file the port cannot re-read exports what it has', () => {
  const one = item('a', { kind: 'explainer', prov: { origin: 'human', operator: 'human:x' } });
  const plan = exportBundle.plan(bundleOf([one]), {
    indexSource: INDEX, itemSchema: ITEM_SCHEMA, licenseContent: 'x\n',
    licenseProse: 'CC-BY-4.0', sources: new Map(),
  });
  assert.deepStrictEqual(plan.files.map((f) => f.path), ['LICENSE-CONTENT', 'content/index.md']);
});

test('the real fixture exports its own content tree byte for byte', () => {
  const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
  const { loadBundle } = require('../../src/application/bundle.js');
  const { createFileSystem } = require('../../src/adapters/node-fs.js');
  const validate = require('../../src/knowledge/validate.js');
  const fs = createFileSystem(FIXTURE);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const sources = new Map(bundle.items.map((one) => [one.path, String(fs.readFile(one.path, 'utf8'))]));
  const plan = exportBundle.plan(bundle, {
    indexSource: String(fs.readFile('content/index.md', 'utf8')),
    itemSchema: ITEM_SCHEMA,
    licenseContent: nodeFs.readFileSync(path.join(ROOT, 'LICENSE-CONTENT'), 'utf8'),
    licenseProse: (bundle.config.bundle || {}).license_prose,
    sources,
  });
  for (const file of plan.files) {
    if (!file.path.startsWith('content/') || file.path === 'content/index.md') continue;
    assert.strictEqual(file.text, sources.get(file.path),
      `${file.path} is not a byte-identical copy of the already-normalised source`);
  }
});
