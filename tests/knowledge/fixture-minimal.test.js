'use strict';
// tests/fixtures/minimal is a CONFORMING Bundle, and this test is the promise:
// every file is UTF-8/LF/NFC with one trailing LF (AGSC-01-14), the configuration
// validates (AGSC-01-17), the root validates (AGSC-01-04), every item validates and
// is correctly placed (AGSC-01-02/03, AGSC-02) and every slug is unique
// (AGSC-01-11). The other packages build, lint, compose and serve it, so a defect
// here would look like a defect in theirs.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const validate = require('../../src/knowledge/validate.js');
const frontmatter = require('../../src/knowledge/frontmatter.js');
const slugs = require('../../src/knowledge/slug.js');
const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'minimal');
const port = createFileSystem(FIXTURE);
const S = validate.schemas(readSchemas());
const config = JSON.parse(port.readFile('agsc.config.json'));

test('every file is UTF-8, LF, NFC, with exactly one trailing LF (AGSC-01-14)', () => {
  const files = [...port.walk('content'), 'agsc.config.json', 'README.md'];
  for (const file of files) {
    const text = port.readFile(file);
    assert.ok(!text.includes('\r'), `${file} has CR`);
    assert.strictEqual(text.charCodeAt(0) === 0xfeff, false, `${file} has a BOM`);
    assert.strictEqual(text.normalize('NFC'), text, `${file} is not NFC`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${file} must end with exactly one LF`);
  }
});

test('the configuration validates (AGSC-01-17, AGSC-01-18)', () => {
  assert.deepStrictEqual(validate.config(config, { schemas: S }), []);
  assert.strictEqual(config.spec_version, '1.0.0-rc.5');
});

test('the Bundle root validates and its base equals site.base (AGSC-01-04)', () => {
  const root = frontmatter.parseItem(port.readFile('content/index.md'), {});
  assert.deepStrictEqual(validate.index(root.frontmatter, { schemas: S }), []);
  assert.strictEqual(root.frontmatter.base, config.site.base);
});

test('every item validates, is placed correctly and has a unique slug', () => {
  const files = port.walk('content').filter((f) => f !== 'content/index.md');
  assert.deepStrictEqual(files, [
    'content/clusters/agent-patterns.md',
    'content/concepts/handoff.md',
    'content/concepts/supervisor.md',
  ]);
  const found = [];
  for (const file of files) {
    const item = frontmatter.parseItem(port.readFile(file), { path: file, schemas: S, config });
    assert.deepStrictEqual(item.findings, [], `${file}: ${JSON.stringify(item.findings)}`);
    found.push(item.slug);
  }
  assert.deepStrictEqual(slugs.check(found, { files }), []);
  assert.deepStrictEqual(found, ['agent-patterns', 'handoff', 'supervisor']);
});

test('the fixture is two concepts and one cluster, with prov everywhere', () => {
  const types = port.walk('content').filter((f) => f !== 'content/index.md')
    .map((f) => frontmatter.parseItem(port.readFile(f), { schemas: S }))
    .map((i) => {
      assert.strictEqual(i.frontmatter.prov.operator, 'human:andreibesleaga');
      assert.strictEqual(i.frontmatter.prov.origin, 'human');
      return i.type;
    });
  assert.deepStrictEqual(types.slice().sort(), ['cluster', 'concept', 'concept']);
});
