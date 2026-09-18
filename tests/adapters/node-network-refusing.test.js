'use strict';
// AGSC-04-03: a build MUST NOT resolve the network. The 1.0 adapter refuses.

const test = require('node:test');
const assert = require('node:assert');
const { createNetwork, NetworkRefusedError } = require('../../src/adapters/node-network-refusing.js');

test('every fetch is refused with AGSC-E905', async () => {
  const net = createNetwork();
  await assert.rejects(net.fetch('https://example.org/'), (e) => {
    assert.ok(e instanceof NetworkRefusedError);
    assert.strictEqual(e.code, 'AGSC-E905');
    assert.match(e.message, /example\.org/u);
    return true;
  });
  await assert.rejects(net.fetch(7), (e) => e.code === 'AGSC-E905');
});
