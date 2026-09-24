'use strict';
// AGSC-09-02/04/05 and AGSC-10-15, as `src/application/conformance.js`
// implements them — the ONE run that both `agsc conform` and the vector runner
// call. The cases here are the ones the repository's own vector set cannot
// produce (a pending id, a missing handler, a handler that throws), so they are
// built in memory. Pure: no filesystem, no clock, no network.

const test = require('node:test');
const assert = require('node:assert');

const conformance = require('../../src/application/conformance.js');

const PASSING = { run: () => ({ status: 'pass', detail: '' }) };
const FAILING = { run: () => ({ status: 'fail', detail: 'bytes differ' }) };
const THROWING = { run: () => { throw new Error('handler is broken'); } };

const vector = (over) => ({ area: 'slug', id: 'x-0001', level: 'required', rule: 'AGSC-01-10', ...over });

test('AGSC-00-16 / AGSC-09-05: a withdrawn vector is skipped and counted for nothing', () => {
  const { results, tally } = conformance.runAll([vector({ level: 'withdrawn' })], { handlerFor: () => FAILING });
  assert.strictEqual(results[0].withdrawn, true);
  assert.deepStrictEqual(tally, { fail: 0, pass: 0, pending: 0, skip: 1, withdrawn: 1 });
});

test('a pending id is skipped with its reason, and counted as pending, not withdrawn', () => {
  const { results, tally } = conformance.runAll([vector()], {
    handlerFor: () => FAILING, pending: new Set(['x-0001']), reason: { 'x-0001': 'waits for D' },
  });
  assert.strictEqual(results[0].detail, 'waits for D');
  assert.deepStrictEqual(tally, { fail: 0, pass: 0, pending: 1, skip: 1, withdrawn: 0 });
  // With no reason recorded, it still skips — silently defaulting is not a pass.
  assert.strictEqual(conformance.runAll([vector()], {
    handlerFor: () => FAILING, pending: new Set(['x-0001']),
  }).results[0].detail, 'pending');
});

test('AGSC-09-04: a vector naming an undeclared surface is skipped AS PASSED', () => {
  const undeclared = vector({ requires_surface: ['responder'] });
  assert.strictEqual(conformance.runAll([undeclared], { handlerFor: () => FAILING }).tally.pass, 1);
  // A surface this node DOES declare must run, and its result stands.
  const declared = vector({ requires_surface: ['mcp'] });
  assert.strictEqual(conformance.runAll([declared], { handlerFor: () => FAILING }).tally.fail, 1);
  assert.deepStrictEqual(conformance.DECLARED_SURFACES, ['mcp', 'webmcp']);
});

test('a required vector with no handler FAILS; silence is never a pass', () => {
  const { results, tally } = conformance.runAll([vector()], { handlerFor: () => null });
  assert.strictEqual(tally.fail, 1);
  assert.match(results[0].detail, /no handler for area "slug"/u);
  assert.strictEqual(conformance.runAll([vector()], { handlerFor: () => ({}) }).tally.fail, 1);
});

test('a handler that throws is a FAILING vector, not a crashed run', () => {
  const { results, tally } = conformance.runAll([vector()], { handlerFor: () => THROWING });
  assert.strictEqual(tally.fail, 1);
  assert.match(results[0].detail, /handler threw: handler is broken/u);
});

test('the summary line is the one line every runner prints', () => {
  const { tally } = conformance.runAll(
    [vector(), vector({ id: 'x-0002', level: 'withdrawn' })], { handlerFor: () => PASSING },
  );
  assert.strictEqual(conformance.summaryLine(tally, 2),
    'vectors: 1 pass, 0 fail, 1 skip (1 withdrawn, 0 pending) of 2');
});

test('AGSC-09-03: the report carries `got` for everything that did not pass, and only then', () => {
  const { results } = conformance.runAll(
    [vector(), vector({ area: 'jcs', id: 'x-0002' })],
    { handlerFor: (area) => (area === 'jcs' ? FAILING : PASSING) },
  );
  const document = conformance.report(results, {
    impl: 'agentic-system-core', level: 2, spec_version: '1.0.0-rc.4', version: '0.0.0',
  });
  assert.strictEqual(document.class, 'writer');
  assert.deepStrictEqual(document.summary, { fail: 1, pass: 1, skip: 0 });
  assert.deepStrictEqual(Object.keys(document.results[0]), ['id', 'status']);
  assert.strictEqual(document.results[1].got, 'bytes differ');
  // A result with no detail at all still carries `got`, empty rather than absent.
  assert.strictEqual(conformance.report([{ id: 'a', status: 'fail' }], {}).results[0].got, '');
});

test('AGSC-10-15: loading is restricted to the Level’s area set', () => {
  const walked = [];
  const fs = {
    readFile: (f) => JSON.stringify({ area: f.split('/')[2], id: f.split('/')[3].slice(0, -5), rule: 'AGSC-01-10' }),
    walk: (dir) => {
      walked.push(dir);
      return ['tests/vectors/slug/b-0001.json', 'tests/vectors/jcs/a-0001.json', 'tests/vectors/slug/README.md'];
    },
  };
  assert.deepStrictEqual(conformance.vectors(fs, { areas: ['slug'] }).map((v) => v.id), ['b-0001']);
  // No area set means every area on disk, and the order is by id, never by path.
  assert.deepStrictEqual(conformance.vectors(fs).map((v) => v.id), ['a-0001', 'b-0001']);
  assert.deepStrictEqual(walked, ['tests/vectors', 'tests/vectors']);
});
