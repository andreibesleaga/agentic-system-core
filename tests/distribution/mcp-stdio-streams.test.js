'use strict';
// AGSC-09-13: the stdio tool server speaks over the two streams the application layer
// hands it, and starts on neither when one is missing — a programming fault named as
// such, before any transport is created. Pure: no process is started, no stream is
// opened, nothing is read from the disk.

const test = require('node:test');
const assert = require('node:assert');
const { PassThrough } = require('node:stream');

const { serve } = require('../../src/distribution/mcp-stdio.js');

const bundle = () => ({ config: {}, items: [{ body: '', frontmatter: {}, slug: 'a', type: 'concept' }] });
const REQUIRED = /^mcp-stdio\.serve: ctx\.stdin and ctx\.stdout are required/u;

test('AGSC-09-13: serve refuses to start without stdin', () => {
  assert.throws(() => serve({ bundle: bundle(), stdout: new PassThrough() }), (e) => e instanceof TypeError && REQUIRED.test(e.message));
});

test('AGSC-09-13: serve refuses to start without stdout', () => {
  const stdin = new PassThrough();
  assert.throws(() => serve({ bundle: bundle(), stdin }), (e) => e instanceof TypeError && REQUIRED.test(e.message));
  assert.strictEqual(stdin.listenerCount('end'), 0, 'no listener was attached to the stream it was given');
});

test('AGSC-09-13: serve refuses to start with neither stream', () => {
  assert.throws(() => serve({ bundle: bundle() }), (e) => e instanceof TypeError && REQUIRED.test(e.message));
});
