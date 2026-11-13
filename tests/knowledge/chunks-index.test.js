'use strict';
// Requirement: PRD-079 (docs/PRD.md).
// AGSC-06-37: `/chunks-index.toon`, the tabular index of `/chunks.jsonl`, written by the pinned
// TOON encoder (`@toon-format/toon`) and read back by its decoder. Beyond chk-0010: the quoting
// the encoder applies to a title, the row order and the determinism of the bytes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { decode } = require('@toon-format/toon');

const chunks = require('../../src/knowledge/chunks.js');
const chunksIndex = require('../../src/knowledge/chunks-index.js');
const llmContext = require('../../src/interchange/adapters/llm-context.js');

const HEADER = 'chunks[1]{id,item,kind,section,ordinal,title,digest}:';
const recordsOf = (items) => chunks.records(items, { base: 'https://a.example/' }).records;
const concept = (slug, title, body = 'Text.\n') => ({ body, slug, title, type: 'concept' });

test('the header names the count and the seven columns; one row per line; one trailing LF', () => {
  const records = recordsOf([concept('one', 'One', 'A.\n\n## B\n\nC.\n')]);
  const text = chunksIndex.chunksIndexToon(records);
  assert.equal(text.split('\n')[0], 'chunks[2]{id,item,kind,section,ordinal,title,digest}:');
  assert.equal(text.split('\n').length - 2, records.length);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
});

test('a title is quoted where TOON 4.1 requires it, and bare otherwise (AGSC-06-37)', () => {
  const cases = [
    ['a,b', '"a,b"'], ['a:b', '"a:b"'], ['say "hi"', '"say \\"hi\\""'], ['back\\slash', '"back\\\\slash"'],
    [' lead', '" lead"'], ['trail ', '"trail "'], ['true', '"true"'], ['null', '"null"'], ['42', '"42"'],
    ['plain title', 'plain title'],
  ];
  for (const [title, written] of cases) {
    const [record] = recordsOf([concept('x', title)]);
    const text = chunksIndex.chunksIndexToon([record]);
    assert.equal(text.split('\n')[0], HEADER);
    assert.ok(text.split('\n')[1].includes(`,0,${written},`), `${title}: ${text}`);
    assert.equal(decode(text).chunks[0].title, title, 'the decoder reads the title back');
  }
});

test('the interchange adapter writes the same bytes as the node route (one writer)', () => {
  const records = recordsOf([concept('one', 'One'), concept('two', 'Two')]);
  assert.equal(llmContext.chunksIndexToon(records), chunksIndex.chunksIndexToon(records));
});

test('property: rows follow the records, decode back to their seven members, and the bytes are deterministic', () => {
  const title = fc.string({ maxLength: 12 }).filter((t) => !/[\n\r]/u.test(t));
  fc.assert(fc.property(fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/u), { minLength: 1, maxLength: 6 }), title, (slugs, t) => {
    const records = recordsOf(slugs.map((slug) => concept(slug, `${t}${slug}`, `${slug}.\n\n## S\n\nT.\n`)));
    const text = chunksIndex.chunksIndexToon(records);
    assert.equal(chunksIndex.chunksIndexToon(records), text);
    const rows = decode(text).chunks;
    assert.equal(rows.length, records.length);
    rows.forEach((row, i) => {
      assert.deepEqual(row, {
        id: records[i].id.slice(0, 16), item: records[i].item, kind: records[i].kind, section: records[i].section,
        ordinal: records[i].ordinal, title: records[i].title, digest: records[i].digest.slice(0, 16),
      });
    });
  }), { numRuns: 100, seed: 20261107 });
});
