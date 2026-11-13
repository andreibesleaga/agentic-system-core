'use strict';
// tests/interchange/_memory-network-trap.js — run a function with every way this
// process could open a connection or resolve a name replaced by a function that
// records the attempt and throws, then put everything back. The in-process twin of
// `tests/acceptance/steps/_offline.js`: a memory adapter never reaches the network
// (AGSC-00-24), and a test that runs one under this trap proves it, because an
// attempt the code under test catches and ignores is still recorded and fails here.
//
// Not a test file: its name starts with `_`.

const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const dgram = require('node:dgram');

/** [object, member] of every entry point the trap replaces. */
const DOORS = Object.freeze([
  [net, 'connect'], [net, 'createConnection'], [net.Socket.prototype, 'connect'], [tls, 'connect'],
  [http, 'request'], [http, 'get'], [https, 'request'], [https, 'get'],
  [dns, 'lookup'], [dns, 'resolve'], [dns.promises, 'lookup'], [dns.promises, 'resolve'],
  [dgram, 'createSocket'], [globalThis, 'fetch'],
]);

/**
 * Run `fn` with the network closed. Throws when `fn` attempted any network call, even
 * one it swallowed; otherwise returns what `fn` returned.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function trapNetwork(fn) {
  const attempts = [];
  const saved = DOORS.map(([object, member]) => [object, member, object[member]]);
  for (const [object, member] of DOORS) {
    object[member] = function refused() {
      attempts.push(member);
      throw new Error(`network call refused (${member})`);
    };
  }
  try {
    const value = fn();
    if (attempts.length > 0) throw new Error(`the code under test attempted the network: ${attempts.join(', ')}`);
    return value;
  } finally {
    for (const [object, member, original] of saved) object[member] = original;
  }
}

module.exports = { DOORS, trapNetwork };
