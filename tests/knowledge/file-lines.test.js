'use strict';
// AGSC-09-11: the `line` of a finding is a line of the FILE the finding names. A
// finding about the body of an item (a body reference, an unsupported construct, an
// `export` fence, a `run` block) is found on a line of the body, which starts after
// the frontmatter block; the parsed item carries the file line the body starts on
// (`lineOffset`), and every such finding adds it. A record that is not a parsed item
// (the flat records the conformance cases state) has no frontmatter block, so its
// body lines are its file lines.
// Deterministic: no clock, no network, no filesystem — items are parsed from strings.

const test = require('node:test');
const assert = require('node:assert');
const fm = require('../../src/knowledge/frontmatter.js');
const links = require('../../src/knowledge/links.js');
const runblocks = require('../../src/knowledge/runblocks.js');
const validate = require('../../src/knowledge/validate.js');
const lint = require('../../src/governance/lint.js');
const { readSchemas } = require('../../src/adapters/node-fs.js');

const S = validate.schemas(readSchemas());

/** A file whose frontmatter block takes lines 1–9, so its body starts on line 10. */
function file(type, body) {
  return [
    '---', // 1
    `type: ${type}`, // 2
    'title: Lines', // 3
    'description: An item whose body findings are reported on the lines of its file.', // 4
    'prov:', // 5
    '  origin: human', // 6
    '  operator: human:tester', // 7
    'kind: explainer', // 8
    '---', // 9
    body, // 10…
  ].join('\n');
}

const parsed = (type, slug, body) => fm.parseItem(file(type, body),
  { path: `content/${type}s/${slug}.md`, schemas: S });

test('a parsed item carries the file line its body starts on', () => {
  const item = parsed('concept', 'lines', '\nText.\n');
  assert.strictEqual(item.lineOffset, 10);
  assert.strictEqual(links.view(item).lineOffset, 10);
  assert.strictEqual(links.view({ slug: 'flat', type: 'concept', body: 'x' }).lineOffset, 1);
});

test('AGSC-03-11: an unresolved body reference is AGSC-E310 on its file line', () => {
  // body line 4 is file line 13; body line 6 is file line 15.
  const item = parsed('concept', 'lines', '\n## Intent\n\nSee [gone](missing.md).\n\nAnd [here](#nowhere).\n');
  const found = links.resolve([item]).errors.filter((f) => f.code === 'AGSC-E310');
  assert.deepStrictEqual(found.map((f) => f.line).sort((a, b) => a - b), [13, 15]);
});

test('AGSC-01-35: a body reference outside the path grammar is AGSC-E902 on its file line', () => {
  const item = parsed('concept', 'lines', '\nText.\n\n[out](../../../etc/passwd)\n');
  const found = links.resolve([item]).errors.filter((f) => f.code === 'AGSC-E902');
  assert.deepStrictEqual(found.map((f) => f.line), [13]);
});

test('a flat record keeps its body lines, which are its file lines', () => {
  const found = links.resolve([{ slug: 'flat', type: 'concept', body: 'one\n\n[gone](missing.md)\n' }])
    .errors.filter((f) => f.code === 'AGSC-E310');
  assert.deepStrictEqual(found.map((f) => f.line), [3]);
});

test('AGSC-02-20 and AGSC-02-22: AGSC-E109 and AGSC-E415 are reported on their file lines', () => {
  const item = parsed('concept', 'lines', [
    '', // body 1 = file 10
    'Some ~~struck~~ text.', // body 2 = file 11
    '', // body 3 = file 12
    '```turtle export', // body 4 = file 13
    '<a:x> <a:y> <a:z> .', // body 5
    '```', // body 6
    '',
  ].join('\n'));
  assert.deepStrictEqual(lint.checkConstructs(item).map((f) => [f.code, f.line]), [['AGSC-E109', 11]]);
  assert.deepStrictEqual(lint.checkFences(item).map((f) => [f.code, f.line]), [['AGSC-E415', 13]]);
});

test('AGSC-09-94: a run block is named by its file line when the item carries one', () => {
  const item = parsed('procedure', 'lines', '\n## Steps\n\n```run\nnode -v | cat\n```\n');
  const record = { ...item.frontmatter, body: item.body, path: item.path, slug: item.slug,
    type: item.type, lineOffset: item.lineOffset };
  const { findings, steps } = runblocks.steps(record, { allow: ['node'] });
  assert.deepStrictEqual(steps.map((s) => s.line), [13]);
  assert.deepStrictEqual(findings.map((f) => [f.code, f.line]), [['AGSC-E203', 13], ['AGSC-E406', 13]]);
  assert.match(findings[1].message, /at line 13 /u);
  // a record without the offset keeps the block's body line.
  const bare = runblocks.steps({ ...record, lineOffset: undefined }, { allow: ['node'] });
  assert.deepStrictEqual(bare.steps.map((s) => s.line), [4]);
});

test('a reference or a construct on a later line of a paragraph is reported on that line', () => {
  const item = parsed('concept', 'lines', [
    '', // body 1 = file 10
    'See [Grind size](lines.md) before you start.', // body 2 = file 11
    'Salt it like [pasta water](salting.md).', // body 3 = file 12
    'A <b>bold</b> note,', // body 4 = file 13
    'and ~~struck~~ text,', // body 5 = file 14
    'then ![a figure](missing.png) and www.example.com.', // body 6 = file 15
    '',
  ].join('\n'));
  const found = links.resolve([item]).errors.filter((f) => f.code === 'AGSC-E310');
  assert.deepStrictEqual(found.map((f) => [f.message.match(/"([^"]+)"/u)[1], f.line]),
    [['salting.md', 12], ['missing.png', 15]]);
  assert.deepStrictEqual(lint.checkConstructs(item).map((f) => [f.message.split(':')[0], f.line]), [
    ['unsupported Markdown construct, raw HTML', 13],
    ['unsupported Markdown construct, raw HTML', 13],
    ['unsupported Markdown construct, strikethrough', 14],
    ['unsupported Markdown construct, autolink literal', 15],
  ]);
});
