'use strict';
// tools/validate-schemas — AGSC-09-90, PRD-054. The passing case is the shipped
// schema/ directory; every failing case is a purpose-made three-file schema set in a
// throw-away directory, one fault at a time.

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { REPO, capture, codes, envelope, tmpdir, tool, writeTree } = require('./helpers');

const { keywordsUsed, patterns, pointer } = tool('validate-schemas');

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const base = (name, body) => JSON.stringify({
  $id: `https://example.test/ns/schema/${name}`,
  $schema: DIALECT,
  description: 'a fixture',
  title: name,
  type: 'object',
  ...body,
}, null, 2);

/** A conforming three-schema set, with the obligations the rules place on it. */
function schemaRoot(overrides = {}) {
  const item = {
    $defs: {
      slug: { maxLength: 64, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: 'string' },
    },
    oneOf: [
      {
        properties: {
          description: { maxLength: 200, minLength: 40, type: 'string' },
          diagram: { properties: { alt: { minLength: 1, type: 'string' } }, type: 'object' },
          produces: { items: { maxLength: 64, pattern: '^[a-z][a-z0-9-]{0,63}$', type: 'string' }, type: 'array' },
        },
        type: 'object',
      },
      { type: 'object' },
      { properties: { when: { maxLength: 1024, minLength: 1, type: 'string' } }, type: 'object' },
    ],
    properties: {
      attachments: { items: { properties: { alt: { minLength: 1, type: 'string' } }, type: 'object' }, type: 'array' },
      title: { maxLength: 120, minLength: 3, type: 'string' },
      type: { enum: ['concept', 'episode', 'procedure', 'lesson', 'cluster', 'gate'] },
    },
  };
  const files = {
    'schema/bundle.schema.json': `${base('bundle.schema.json', { properties: { title: { type: 'string' } } })}\n`,
    'schema/config.schema.json': `${base('config.schema.json', {
      $defs: { slug: { maxLength: 64, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: 'string' } },
      properties: { site: { type: 'object' } },
    })}\n`,
    'schema/item.schema.json': `${base('item.schema.json', item)}\n`,
    'spec/00-overview.md': '`spec_version: "1.0.0-rc.5"`\n',
  };
  return writeTree(tmpdir(), { ...files, ...overrides });
}

describe('validate-schemas — usage and the envelope', () => {
  it('--help exits 0', () => {
    const result = capture('validate-schemas', ['--help']);
    assert.equal(result.code, 0);
    assert.match(result.out, /^validate-schemas \[--json\]/u);
  });

  it('an unknown flag and a second argument both exit 2', () => {
    assert.equal(capture('validate-schemas', ['--nope']).code, 2);
    assert.equal(capture('validate-schemas', [schemaRoot(), schemaRoot()]).code, 2);
  });

  it('a root with no schema/ FAILS with AGSC-E901, exit 1', () => {
    // CHANGED at rc.6: AGSC-09-90 now says a validator MUST FAIL "with
    // `AGSC-E901`" over an absent input, and AGSC-09-08 reserves exit 2 for a usage
    // error. An absent input is exit 1, the envelope and the code.
    const result = capture('validate-schemas', [tmpdir()]);
    assert.equal(result.code, 1);
    assert.match(result.err, /AGSC-E901 no schema\/ directory/u);
    assert.match(result.out, /0 input file\(s\) read/u);
  });

  it('the envelope has the AGSC-09-11 shape', () => {
    const { code, json } = envelope('validate-schemas', [schemaRoot()]);
    assert.equal(code, 0);
    assert.equal(json.verb, 'validate-schemas');
    assert.equal(json.schema, 'agsc.diagnostics.v1');
    assert.equal(json.spec_version, '1.0.0-rc.5');
    assert.deepEqual(json.counts, { error: 0, warn: 0 });
  });

  it('--quiet says nothing', () => {
    const result = capture('validate-schemas', ['--quiet', schemaRoot()]);
    assert.equal(result.out, '');
    assert.equal(result.err, '');
  });

  it('without --json the human output is one line per finding plus a summary', () => {
    const result = capture('validate-schemas', [schemaRoot({ 'schema/bundle.schema.json': '{ not json\n' })]);
    assert.equal(result.code, 1);
    assert.match(result.err, /^error: schema\/bundle\.schema\.json:1:1 AGSC-E201 /mu);
    assert.match(result.out, /^validate-schemas: 2 input file\(s\) read, 2 schemas, 1 error, 0 warn\n$/u);
  });

  it('a root with no spec/ reports spec_version unknown', () => {
    const root = schemaRoot();
    require('node:fs').rmSync(require('node:path').join(root, 'spec'), { force: true, recursive: true });
    assert.equal(envelope('validate-schemas', [root]).json.spec_version, 'unknown');
  });
});

describe('validate-schemas — the faults', () => {
  it('a missing schema is AGSC-E901', () => {
    const root = schemaRoot();
    require('node:fs').rmSync(require('node:path').join(root, 'schema', 'bundle.schema.json'));
    const { code, json } = envelope('validate-schemas', [root]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E901' && f.file === 'schema/bundle.schema.json'));
  });

  it('a byte-order mark, a CR, a doubled trailing LF and non-NFC text are AGSC-E108', () => {
    const root = schemaRoot({
      'schema/bundle.schema.json': `﻿${base('bundle.schema.json', {})}\r\n\n`,
    });
    const { json } = envelope('validate-schemas', [root]);
    const encoding = json.findings.filter((f) => f.code === 'AGSC-E108');
    assert.ok(encoding.length >= 3, JSON.stringify(encoding));
  });

  it('a non-NFC schema is AGSC-E108', () => {
    const root = schemaRoot({
      'schema/bundle.schema.json': `${base('bundle.schema.json', { description: 'é' })}\n`,
    });
    const { json } = envelope('validate-schemas', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E108' && /not NFC/u.test(f.message)));
  });

  it('a file that is not JSON is AGSC-E201', () => {
    const root = schemaRoot({ 'schema/bundle.schema.json': '{ not json\n' });
    const { json } = envelope('validate-schemas', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E201' && /not valid JSON/u.test(f.message)));
  });

  it('the wrong dialect is AGSC-E203 and a bad $id is AGSC-E204', () => {
    const root = schemaRoot({
      'schema/bundle.schema.json': `${JSON.stringify({
        $id: 'https://example.test/other.json',
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
      }, null, 2)}\n`,
    });
    const { json } = envelope('validate-schemas', [root]);
    assert.ok(codes(json).includes('AGSC-E203'));
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E204' && /does not end in/u.test(f.message)));
  });

  it('a missing $id is AGSC-E204', () => {
    const root = schemaRoot({
      'schema/bundle.schema.json': `${JSON.stringify({ $schema: DIALECT, type: 'object' }, null, 2)}\n`,
    });
    const { json } = envelope('validate-schemas', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E204' && /\$id is absent/u.test(f.message)));
  });

  it('a schema that fails the meta-schema is AGSC-E201', () => {
    const root = schemaRoot({
      'schema/bundle.schema.json': `${base('bundle.schema.json', { minLength: 'three' })}\n`,
    });
    const { json } = envelope('validate-schemas', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E201' && /meta-schema|strict mode/u.test(f.message)));
  });

  it('a keyword outside the AGSC-02-24 subset is AGSC-E203, and config may use more', () => {
    const withIf = { if: { properties: {} }, then: { properties: {} } };
    const root = schemaRoot({
      'schema/bundle.schema.json': `${base('bundle.schema.json', { allOf: [{ type: 'object' }] })}\n`,
      'schema/config.schema.json': `${base('config.schema.json', withIf)}\n`,
    });
    const { json } = envelope('validate-schemas', [root]);
    const subset = json.findings.filter((f) => /outside the subset AGSC-02-24 fixes/u.test(f.message));
    assert.deepEqual(subset.map((f) => f.file), ['schema/bundle.schema.json']);
    assert.match(subset[0].message, /"allOf"/u);
  });

  it('the item type enum is closed to the six types of AGSC-00-04', () => {
    const root = schemaRoot();
    const file = require('node:path').join(root, 'schema', 'item.schema.json');
    const document = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
    document.properties.type.enum = ['concept', 'deck'];
    require('node:fs').writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    const { json } = envelope('validate-schemas', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E203' && /type enum/u.test(f.message)));
  });

  it('a bound AGSC-02-24 names and the schema moves is AGSC-E202', () => {
    const root = schemaRoot();
    const file = require('node:path').join(root, 'schema', 'item.schema.json');
    const document = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
    document.properties.title.maxLength = 140;
    delete document.oneOf[2].properties.when;
    require('node:fs').writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    const { json } = envelope('validate-schemas', [root]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202' && /maxLength 140/u.test(f.message)));
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E202' && /does not exist/u.test(f.message)));
  });

  it('the slug grammar and its bound are AGSC-01-10’s', () => {
    const root = schemaRoot();
    const file = require('node:path').join(root, 'schema', 'item.schema.json');
    const document = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
    document.$defs.slug = { maxLength: 128, pattern: '^[a-z0-9][a-z0-9-]*$', type: 'string' };
    require('node:fs').writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    const { json } = envelope('validate-schemas', [root]);
    const slug = json.findings.filter((f) => /\$defs\/slug/u.test(f.message));
    assert.equal(slug.length, 2);
    assert.ok(slug.every((f) => f.code === 'AGSC-E204'));
  });

  it('a port name bounded only by its quantifier is AGSC-E204', () => {
    const root = schemaRoot();
    const file = require('node:path').join(root, 'schema', 'item.schema.json');
    const document = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
    document.oneOf[0].properties.produces.items = { pattern: '^[a-z][a-z0-9-]{0,99}$', type: 'string' };
    require('node:fs').writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    const { json } = envelope('validate-schemas', [root]);
    const ports = json.findings.filter((f) => /port-name/u.test(f.message));
    assert.equal(ports.length, 2);
    assert.ok(ports.every((f) => f.code === 'AGSC-E204'));
  });
});

describe('validate-schemas — the helpers it exports', () => {
  it('keywordsUsed walks schema positions and not member names', () => {
    const used = keywordsUsed({
      $defs: { slug: { pattern: 'x' } },
      enum: ['pattern'],
      properties: { pattern: { minLength: 1 } },
    });
    assert.deepEqual([...used.keys()].sort(), ['$defs', 'enum', 'minLength', 'pattern', 'properties']);
    assert.equal(used.get('minLength'), '/properties/pattern');
  });

  it('keywordsUsed descends arrays of schemas and single schemas, and stops at data', () => {
    const used = keywordsUsed({ items: { const: { type: 'never-a-keyword' } }, oneOf: [{ maxItems: 1 }] });
    assert.ok(used.has('maxItems'));
    assert.ok(!used.has('never-a-keyword'));
  });

  it('patterns reports every pattern with its sibling maxLength', () => {
    const found = patterns({ properties: { a: { maxLength: 3, pattern: 'x' } } });
    assert.deepEqual(found, [{ at: '/properties/a', maxLength: 3, pattern: 'x' }]);
  });

  it('pointer resolves a JSON Pointer and returns undefined off the tree', () => {
    assert.equal(pointer({ a: { b: 1 } }, '/a/b'), 1);
    assert.equal(pointer({ a: 1 }, '/a/b/c'), undefined);
  });
});

describe('validate-schemas — the real distribution', () => {
  it('the shipped schema/ passes every obligation', () => {
    const { code, json } = envelope('validate-schemas', [REPO]);
    assert.deepEqual(json.findings, []);
    assert.equal(json.status, 'pass');
    assert.equal(code, 0);
  });
});
