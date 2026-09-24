'use strict';
// Conformance area `jcs` — AGSC-04-05, AGSC-04-21.
// Vectors jcs-0001…jcs-0005: canonical output, UTF-16 member-name order, astral
// member order, negative zero, NFC before sort.

const jcs = require('../../../src/knowledge/jcs.js');
const { checks } = require('./_assert.js');

function memberOrder(text) {
  return [...text.matchAll(/"((?:[^"\\]|\\.)*)":/gu)].map((m) => JSON.parse(`"${m[1]}"`));
}

module.exports.run = (vector) => {
  const got = jcs.canonicalize(vector.input.value);
  const list = [['output', got === vector.expected.output, `got ${JSON.stringify(got)}`]];
  if (Array.isArray(vector.expected.order)) {
    const order = memberOrder(got);
    list.push(['order',
      JSON.stringify(order) === JSON.stringify(vector.expected.order),
      `got ${JSON.stringify(order)}`]);
  }
  if (typeof vector.expected.wrong_if_sorted_before_nfc === 'string') {
    list.push(['nfc-before-sort', got !== vector.expected.wrong_if_sorted_before_nfc, 'sorted before NFC']);
  }
  if (Array.isArray(vector.expected.wrong_order_if_sorted_by_code_point)) {
    const order = memberOrder(got);
    list.push(['not-code-point-order',
      JSON.stringify(order) !== JSON.stringify(vector.expected.wrong_order_if_sorted_by_code_point),
      'member names were sorted by code point, not UTF-16 code units']);
  }
  return checks(list);
};
