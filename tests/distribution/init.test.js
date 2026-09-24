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
    OPTIONS,
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

// AGSC-02-95: a reference is checked against where the files ARE after the move. Two
// notes that link to each other and move together into content/concepts/ still
// resolve, so no warning is reported and the target is not duplicated into assets.
test('AGSC-02-95: a link between two adopted notes that move together still resolves', () => {
  const planned = init.plan([
    { path: 'brewing.md', markdown: '# Brewing\n\nSee [Grind size](grind-size.md).\n' },
    { path: 'grind-size.md', markdown: '# Grind size\n\nFiner for espresso.\n' },
    { path: 'photo.png', binary: true },
    { path: 'with-photo.md', markdown: '# With photo\n\n![A photo](photo.png)\n' },
  ], OPTIONS);
  const moved = new Map(planned.writes.filter((w) => w.from).map((w) => [w.from, w.path]));
  assert.strictEqual(moved.get('brewing.md').replace(/[^/]+$/u, ''), moved.get('grind-size.md').replace(/[^/]+$/u, ''));
  const warned = planned.findings.filter((f) => f.code === 'AGSC-E507');
  assert.ok(!warned.some((f) => f.reference === 'grind-size.md'), JSON.stringify(warned));
  assert.ok(!planned.copies.some((c) => c.from === 'grind-size.md'), 'an adopted note was duplicated into assets');
  // A reference to a file that does NOT move is still reported and copied.
  assert.ok(warned.some((f) => f.reference === 'photo.png'));
  assert.ok(planned.copies.some((c) => c.from === 'photo.png'));
});

// AGSC-02-91 / AGSC-01-23: `init` run again over an adopted and built Bundle changes
// nothing. The build output, `dist/` and the copies AGSC-02-95 put under
// content/assets/ are never adopted, and a slug an item under content/ already holds
// is taken — so no adopted file can land on (and replace) an existing item.
test('AGSC-02-91: a second init over an adopted, built Bundle adopts nothing and replaces nothing', () => {
  const item = (slug) => `---\ntype: concept\ntitle: ${slug}\nprov:\n  origin: human\n  operator: human:a\nkind: explainer\n---\n\n# ${slug}\n`;
  const planned = init.plan([
    { path: 'agsc.config.json', markdown: null },
    { path: 'content/index.md', markdown: '---\ntitle: Mine\n---\n' },
    { path: 'content/concepts/agents.md', markdown: item('agents') },
    { path: 'content/concepts/x.md', markdown: item('x') },
    { path: 'content/assets/sub/x.md', markdown: '# X\n\nx.\n' },
    { path: 'content/assets/agents.md', markdown: '# Agents\n' },
    { path: 'www/now.md', markdown: '# NOW\n' },
    { path: 'dist/proposal/1.md', markdown: '<!-- agsc:proposal v1 -->\n' },
  ], { ...OPTIONS, config: { build: { out: 'www/' } } });
  assert.deepStrictEqual(planned.writes.filter((w) => w.from !== undefined), [], JSON.stringify(planned.writes));
  assert.deepStrictEqual(planned.copies, []);
  // A new note whose stem an existing item already holds takes the next free slug.
  const fresh = init.plan([
    { path: 'content/concepts/agents.md', markdown: item('agents') },
    { path: 'notes/agents.md', markdown: '# Agents again\n' },
  ], OPTIONS);
  const moved = fresh.writes.find((w) => w.from === 'notes/agents.md');
  assert.strictEqual(moved.path, 'content/concepts/agents-2.md');
});
