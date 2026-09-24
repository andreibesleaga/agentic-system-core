'use strict';
// Preloaded with `node --require` into a child the World runs with `offline: true`: every way a
// Node process opens a connection or resolves a name is replaced by a function
// that records the attempt and throws. A command that still passes under this
// preload reached no network and therefore no model service; the record file,
// named by ACCEPTANCE_NETWORK_TRAP (not an AGSC_* name, which the engine would read
// as a configuration override), is how the scenario proves no attempt was
// swallowed by an error handler.
//
// Not a step definition file: its name starts with `_`.

const fs = require('node:fs');

const record = process.env.ACCEPTANCE_NETWORK_TRAP;

function refuse(what) {
  return function refused() {
    if (record) {
      try { fs.appendFileSync(record, `${what}\n`); } catch (e) { /* the throw below still stops it */ }
    }
    throw new Error(`acceptance: network call refused (${what})`);
  };
}

const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const dgram = require('node:dgram');

net.connect = refuse('net.connect');
net.createConnection = refuse('net.createConnection');
tls.connect = refuse('tls.connect');
http.request = refuse('http.request');
http.get = refuse('http.get');
https.request = refuse('https.request');
https.get = refuse('https.get');
dns.lookup = refuse('dns.lookup');
dns.resolve = refuse('dns.resolve');
dns.promises.lookup = refuse('dns.promises.lookup');
dns.promises.resolve = refuse('dns.promises.resolve');
dgram.createSocket = refuse('dgram.createSocket');
globalThis.fetch = refuse('fetch');
