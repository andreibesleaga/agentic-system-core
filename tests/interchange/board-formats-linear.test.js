'use strict';
// The board readers and writers scan imported text in linear steps: a board file has
// no size cap, and three patterns they used scanned to the end of the text from every
// start position.
//
//   - a peer board's IRI base (AGSC-10-13, AGSC-11-15): the last two path segments
//     are removed; the pattern took about 27 s on 100,000 characters with no "/";
//   - a Markdown heading line: the pattern needed cubic time on a heading with a long
//     run of spaces before its last word (20,000 spaces took more than 100 s);
//   - the trailing line feeds of a card body: the pattern took about 35 s on 100,000
//     line feeds followed by one more character.
//
// Steps are counted, not timed (tests/_linear-kit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const boards = require('../../src/interchange/board-formats.js');
const { MIB, assertLinear } = require('../_linear-kit.js');

test('the base of an IRI with no "/" in 1 MiB is read in linear steps and is the IRI itself', () => {
  const iri = 'a'.repeat(MIB);
  assert.equal(assertLinear('peerBase, no slash', boards.peerBase, iri, 4), iri);
});

test('the base of long IRIs drops the last two segments, in linear steps', () => {
  const long = 'a'.repeat(MIB);
  assert.equal(assertLinear('peerBase, a long last segment', boards.peerBase, `https://peer.example/boards/${long}`, 4),
    'https://peer.example/');
  assert.equal(assertLinear('peerBase, a long first segment', boards.peerBase, `${long}/x.json`, 4), '');
  assert.equal(assertLinear('peerBase, a run of "/"', boards.peerBase, '/'.repeat(MIB), 4), '/'.repeat(MIB));
  assert.equal(assertLinear('peerBase, segments of one character', boards.peerBase, 'a/'.repeat(MIB / 2), 4),
    'a/'.repeat(MIB / 2 - 2));
});

test('a peer board whose IRI is a 1 MiB run without "/" is read, and a blocker expands on that IRI', () => {
  const iri = 'a'.repeat(MIB);
  const task = { iri: `${iri}/t1`, slug: 't1', title: 'One', state: 'TASK_STATE_WORKING', blocked_by: ['x'] };
  const read = boards.FORMATS['agsc-board'].parse(JSON.stringify({ iri, board: 'b', tasks: [task] }), 'b.json');
  assert.equal(read.rows.length, 1);
  assert.deepEqual(read.rows[0].blockedBy, [`${iri}concepts/x/`]);
});

test('a heading line with a 1 MiB run of spaces before its last word is read in linear steps', () => {
  const line = `# a${' '.repeat(MIB)}x`;
  assert.deepEqual(assertLinear('markdownHeading, spaces', boards.markdownHeading, line, 4),
    { marks: '#', text: `a${' '.repeat(MIB)}x` });
  const closing = `## Lane${' '.repeat(MIB)}${'#'.repeat(MIB)}${'\t'.repeat(MIB)}`;
  assert.deepEqual(assertLinear('markdownHeading, a closing sequence', boards.markdownHeading, closing, 4),
    { marks: '##', text: 'Lane' });
  // Only the last closing sequence is removed, as the pattern did.
  const marks = `## Lane${' #'.repeat(MIB / 2)}`;
  assert.deepEqual(assertLinear('markdownHeading, closing marks', boards.markdownHeading, marks, 4),
    { marks: '##', text: `Lane${' #'.repeat(MIB / 2 - 1)}` });
  assert.equal(assertLinear('markdownHeading, all spaces', boards.markdownHeading, `#${' '.repeat(MIB)}`, 4).text, ' ');
  assert.equal(assertLinear('markdownHeading, seven marks', boards.markdownHeading, '#'.repeat(MIB), 4), null);
});

test('a Markdown board with a hostile heading is read, and the lane is the heading text', () => {
  const text = `# Board\n\n## Doing${' '.repeat(MIB)}now\n\n- [ ] One\n`;
  const read = boards.FORMATS.markdown.parse(text, 'board.md');
  assert.equal(read.rows.length, 1);
  assert.equal(read.rows[0].state, `Doing${' '.repeat(MIB)}now`);
});

test('the trailing line feeds of a body are removed in linear steps', () => {
  const body = `${'\n'.repeat(MIB)}x${'\n'.repeat(MIB)}`;
  assert.equal(assertLinear('withoutTrailingFeeds', boards.withoutTrailingFeeds, body, 4), `${'\n'.repeat(MIB)}x`);
  assert.equal(boards.withRecord(`${'\n'.repeat(MIB)}x\n`, null), `${'\n'.repeat(MIB)}x`);
  const card = `${'\n'.repeat(MIB)}x\n\n<!-- agsc-item QUJD -->`;
  assert.deepEqual(boards.takeRecord(card), { record: 'QUJD', text: `${'\n'.repeat(MIB)}x` });
});
