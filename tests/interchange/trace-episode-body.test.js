'use strict';
// The Episode body a trace writes adds only the sections the record's text lacks, and
// AGSC-02-21 compares heading text only, at any heading level.

const test = require('node:test');
const assert = require('node:assert/strict');
const { episodeBody } = require('../../src/interchange/trace.js');

const count = (text, heading) => text.split('\n').filter((l) => /^#{1,6}\s+/u.test(l) && l.replace(/^#+\s+/u, '') === heading).length;

test('episodeBody: a section the record has at another heading level is not added again', () => {
  const body = episodeBody('Run', '### Outcome\n\nDone.\n\n# Next\n\nAgain.', 'partial');
  assert.equal(count(body, 'Outcome'), 1, body);
  assert.equal(count(body, 'Next'), 1, body);
  assert.equal(count(body, 'What happened'), 1, body);
});

test('episodeBody: a record with none of the sections gets all three', () => {
  const body = episodeBody('Run', 'It ran.', 'ok');
  for (const heading of ['What happened', 'Outcome', 'Next']) assert.equal(count(body, heading), 1, heading);
});
