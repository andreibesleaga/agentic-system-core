'use strict';
// tests/interchange/okf-header-attacks.test.js — AGSC-01-22: a header that holds an inline map is not
// read; the item gets the synthesised header 1.1.0 wrote, and nothing `lint` checks across items can
// change. Each source is hand-made; its control is the same source with the inline map spelled as an
// anchor, which the strict reader refuses for the same reason, so the control is what 1.1.0 writes.
// After the import, source and control must have the same written files byte for byte, the same
// finding codes from `lint`, the same errors from the import, the same exit class, and 1.1.0's warning.
// Deterministic: fixed clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function temp(prefix) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

function ctxFor(dir, options = {}) {
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: [],
    openRoot: (at) => createFileSystem(path.resolve(dir, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0',
    stderr: { write: () => {} },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

const D = 'description: A page written for a check of the import path of the engine.\n';
const H = (title, extra = '', type = 'concept', kind = 'kind: explainer\n') => `---\ntype: ${type}\ntitle: ${title}\n${D}${kind}${extra}---\n\n`;
const F = 'x-meta: {a: b}\n';

const ATTACKS = {
  'generated: { by: x, at: ... } with a title and tags': { 'a.md': `---\ntype: concept\ntitle: Alpha page\ntags: [agents, patterns]\n${D}kind: explainer\ngenerated: { by: x, at: 2026-01-01T10:00:00+00:00 }\n---\n\nBody.\n` },
  'tags: [foo, bar] beside an inline map': { 'a.md': `${H('Page with tags outside the list', `${F}tags: [foo, bar]\n`)}Body.\n` },
  'a title that holds a token-like string': { 'a.md': `---\ntype: concept\ntitle: ${'gh' + 'p_'}${'0123456789abcdef'.repeat(2)}0123\n${D}kind: explainer\n${F}---\n\nBody.\n` },
  'requires to a page that does not exist': { 'a.md': `${H('Page with a ghost link', `${F}requires: [ghost]\n`)}Body.\n` },
  'a type that moves the page, with a plain link from a sibling': {
    'a.md': `${H('Page A plain header')}See [b](b.md).\n`,
    'b.md': `${H('Page B moves folder', F, 'cluster', '')}Body.\n`,
  },
  'a type that collides with a file of the Bundle (handoff as a cluster)': { 'handoff.md': `${H('Handoff as a cluster', F, 'cluster', '')}Body.\n` },
};

/** Import `files` into a copy of the minimal Bundle and report what a user can see afterwards. */
function seen(files) {
  const target = temp('agsc-okf-attack-');
  nodeFs.cpSync(FIXTURE, target, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(target, 'LICENSE-CONTENT'));
  const source = temp('agsc-okf-attack-src-');
  for (const [name, text] of Object.entries(files)) {
    nodeFs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    nodeFs.writeFileSync(path.join(source, name), text);
  }
  const imported = importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
  const tree = {};
  const walk = (dir, prefix) => {
    for (const entry of nodeFs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else tree[`${prefix}${entry.name}`] = nodeFs.readFileSync(path.join(dir, entry.name), 'utf8');
    }
  };
  walk(path.join(target, 'content'), 'content/');
  const codes = (findings) => [...new Set(findings.filter((f) => f.severity === 'error').map((f) => f.code))].sort();
  return {
    importErrors: codes(imported.findings),
    lintCodes: codes(lintVerb.run(ctxFor(target)).findings),
    status: imported.status || 'ok',
    tree,
  };
}

for (const [name, files] of Object.entries(ATTACKS)) {
  test(`${name}: the import, the written files, lint and 1.1.0's warning are what 1.1.0 gives`, () => {
    const control = Object.fromEntries(Object.entries(files).map(([file, text]) => [file, text.replace('x-meta: {a: b}', 'x-meta: &a b')]));
    const attack = seen(files);
    const base = seen(control);
    assert.deepStrictEqual(attack.tree, base.tree, 'the same files with the same bytes');
    assert.deepStrictEqual(attack.lintCodes, base.lintCodes, 'lint gives what it gives after the 1.1.0 import');
    assert.deepStrictEqual(attack.importErrors, base.importErrors);
    assert.strictEqual(attack.status, base.status);
  });
}

test('an inline-map header gives the synthesised header and the warning text of 1.1.0', () => {
  const okf = require('../../src/interchange/okf.js');
  const { readSchemas } = require('../../src/adapters/node-fs.js');
  const plan = okf.plan([{ path: 'a.md', text: `---\ntype: concept\ntitle: Alpha page\ntags: [agents]\n${D}generated: { by: x }\n---\n\nBody.\n` }],
    { itemSchema: readSchemas(ROOT).item, operator: 'human:x' });
  assert.strictEqual(plan.totals.unreadable_frontmatter, 1);
  assert.ok(plan.findings.some((f) => f.message === 'a.md: the frontmatter is outside the YAML subset AGSC-02-02 reads (flow mappings are outside the permitted subset (AGSC-02-02)); the body was imported and the frontmatter synthesized (AGSC-01-22)'));
  assert.doesNotMatch(plan.writes[0].text, /Alpha page|agents|generated/u);
});
