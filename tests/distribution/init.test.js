'use strict';
// AGSC-02-90…95: adoption is TOTAL and never errors, existing files are never
// overwritten, body bytes never change, and AGSC-01-37's two credential files are
// written. adopt-0004 and adopt-0005 pin the two end-to-end cases; this suite pins
// what they do not reach.

const test = require('node:test');
const assert = require('node:assert');
const init = require('../../src/distribution/init.js');

const OPTIONS = { directory: 'My Notes', specVersion: '1.0.0-rc.4', epoch: 1767225600, gitUserEmail: 'a@example.org' };

test('existing files are never overwritten (AGSC-02-94)', () => {
  const planned = init.plan([
    { path: 'agsc.config.json', markdown: null },
    { path: 'content/index.md', markdown: '---\ntitle: Mine\n---\n' },
    { path: 'note.md', markdown: '# Note\n\nBody.\n' },
  ], OPTIONS);
  assert.strictEqual(planned.config, null, 'an existing agsc.config.json was regenerated');
  assert.strictEqual(planned.indexFrontmatter, null, 'an existing content/index.md was regenerated');
});

test('AGSC-01-37 writes .gitignore and .env.example, and neither carries a value', () => {
  const planned = init.plan([{ path: 'note.md', markdown: '# Note\n' }], OPTIONS);
  const byPath = new Map(planned.writes.map((w) => [w.path, w.text]));
  assert.ok(byPath.get('.gitignore').includes('\n.env\n'));
  assert.match(byPath.get('.env.example'), /^AGSC_MODEL_API_KEY=$/mu);
});

test('adoption never errors: every finding is a warning (AGSC-02-92)', () => {
  const planned = init.plan([
    { path: 'a b c.md', markdown: 'no heading at all\n' },
    { path: 'a-b-c.md', markdown: '# Collides\n' },
  ], OPTIONS);
  assert.ok(planned.findings.every((f) => f.severity === 'warn'),
    JSON.stringify(planned.findings.filter((f) => f.severity !== 'warn')));
});

test('a path escaping the adoption root is refused before it is used (AGSC-01-16)', () => {
  assert.strictEqual(init.normalizePath('../outside'), null);
  assert.strictEqual(init.normalizePath('a/../../outside'), null);
  assert.strictEqual(init.normalizePath('a/./b/../c'), 'a/c');
  assert.strictEqual(init.resolveFrom('notes', '../../secrets.md'), null);
  assert.strictEqual(init.resolveFrom('notes', 'img/x.png#frag'), 'notes/img/x.png');
});

test('run() moves the source and copies the assets through the port (AGSC-02-93/95)', () => {
  const store = new Map([['notes/agents.md', '# Agents\n\n![d](img/x.png)\n'], ['notes/img/x.png', 'PNG']]);
  const fs = {
    exists: (p) => store.has(p),
    readFile: (p) => store.get(p),
    writeFile: (p, data) => store.set(p, data),
    remove: (p) => store.delete(p),
    mkdirp: () => {},
  };
  const planned = init.plan(
    [{ path: 'notes/agents.md', markdown: store.get('notes/agents.md') }, { path: 'notes/img/x.png', binary: true }],
    OPTIONS
  );
  init.run({ fs }, planned);
  assert.ok(!store.has('notes/agents.md'), 'the adopted source was not moved');
  assert.ok(store.has('content/concepts/agents.md'));
  assert.strictEqual(store.get('content/assets/notes/img/x.png'), 'PNG');
});

test('the synthesized index description is ≥ 40 code points by construction (AGSC-02-94)', () => {
  const frontmatter = init.synthesizeIndex({ title: 'T', count: 0, date: '2026-01-01', specVersion: '1.0.0-rc.4' });
  assert.ok([...frontmatter.description].length >= 40, frontmatter.description);
  assert.strictEqual(frontmatter.base, init.PLACEHOLDER_BASE);
});
