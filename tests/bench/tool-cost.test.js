'use strict';
// bench/tool-cost.js measures what the ten tools cost an agent. These tests hold its shape on the
// reference fixture: ten definitions and ten answers, sizes that agree with the text they count,
// the token fallback named in the output, and a usage error that exits 2. Deterministic: the
// fixture is read from the repository, nothing reads the network or a clock.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const toolCost = require('../../bench/tool-cost.js');
const { manifest } = require('../../src/distribution/mcp-tools.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'minimal');
const NAMES = ['ask', 'brief', 'check', 'compose', 'explain', 'links', 'propose', 'read', 'remember', 'search'];

test('without a tokenizer folder, tokens are characters divided by four, rounded up, and the method says so', () => {
  const { count, method } = toolCost.tokenizer(null);
  assert.equal(count('abcde'), 2);
  assert.equal(count(''), 0);
  assert.match(method, /characters \/ 4/u);
});

test('the definitions cover the ten tools, in code-point order, and the bytes are those of the JSON', () => {
  const { count } = toolCost.tokenizer(null);
  const sizes = toolCost.definitionSizes(count);
  assert.deepEqual(sizes.rows.map((r) => r.tool), NAMES);
  const search = manifest().tools.find((t) => t.name === 'search');
  const row = sizes.rows.find((r) => r.tool === 'search');
  assert.equal(row.page.bytes, Buffer.byteLength(JSON.stringify(search), 'utf8'));
  assert.ok(row.mcp.bytes > 0 && row.page.bytes > 0);
  assert.equal(sizes.total.mcp.bytes, sizes.rows.reduce((t, r) => t + r.mcp.bytes, 0));
});

test('the answers on the fixture cover the ten tools and none of the typical calls is an error', () => {
  const { count } = toolCost.tokenizer(null);
  const answers = toolCost.answerSizes(FIXTURE, {}, count);
  assert.deepEqual(answers.rows.map((r) => r.tool).sort(), NAMES);
  for (const row of answers.rows) {
    assert.notEqual(row.type, 'error', `${row.tool} ${row.args}`);
    assert.ok(row.mcp_result.bytes > row.envelope.bytes, `${row.tool}: the MCP result carries the envelope twice`);
  }
  assert.equal(answers.rows.find((r) => r.tool === 'search').total, null, 'under the bound there is no total');
});

test('main exits 2 with no Bundle and on an unknown argument', () => {
  const write = process.stderr.write;
  process.stderr.write = () => true;
  try {
    assert.equal(toolCost.main([]), 2);
    assert.equal(toolCost.main(['--nope']), 2);
    assert.equal(toolCost.main(['--bundle', path.join(__dirname)]), 2);
  } finally {
    process.stderr.write = write;
  }
});

test('main exits 2 with the usage line when an option that takes a value has none', () => {
  const write = process.stderr.write;
  const seen = [];
  process.stderr.write = (text) => { seen.push(String(text)); return true; };
  try {
    for (const option of ['--bundle', '--deps', '--query', '--slug']) {
      assert.equal(toolCost.main([option]), 2, option);
      assert.equal(toolCost.main(['--bundle', FIXTURE, option]), 2, `${option} last`);
    }
  } finally {
    process.stderr.write = write;
  }
  assert.ok(seen.every((text) => /needs a value/u.test(text) && /Exit 0 measured, 2 usage/u.test(text)));
});
