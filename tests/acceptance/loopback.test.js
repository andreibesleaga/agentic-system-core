'use strict';
// The node served on loopback is reached at the address `localhost` resolves to
// first, whatever the host's resolver order: the shipped `validate-wellknown`
// connects to exactly that first address (verbatim order), and the configuration
// schema admits a plain-HTTP base only for `localhost`. On a machine whose hosts
// file maps `localhost` to `127.0.0.1` alone this holds trivially; on the hosted CI
// runners `localhost` maps to `::1` first. `steps/_localhost-v6-first.js` gives
// that order here, in this process and in every child, so the test does not depend
// on the machine it runs on.
//
// Deterministic: the World's fixed build instant; nothing reaches the network
// except the loopback servers the test starts and stops.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');

const V6_FIRST = path.join(__dirname, 'steps', '_localhost-v6-first.js');
require(V6_FIRST); // this process: `localhost` is ::1 first, as on the CI runners

const runner = require('./_runner.js');
const { HOST, World, built } = require('./steps/_world.js');

const definitions = runner.loadDefinitions(path.join(__dirname, 'steps'));

/** A World whose children resolve `localhost` as this process does. */
class V6FirstWorld extends World {
  env(extra = {}) {
    return super.env({ NODE_OPTIONS: `--require ${JSON.stringify(V6_FIRST)}`, ...extra });
  }
}

async function step(world, text) {
  const found = runner.matches(definitions, text);
  assert.strictEqual(found.length, 1, `"${text}" matches ${found.length} definitions`);
  await found[0].definition.run(world, ...found[0].captures);
}

/** `agsc-host serve` bound to one fixed address; resolves with its port. */
function serveAt(world, bind) {
  const child = spawn(process.execPath, [HOST, 'serve', '--site', path.join(world.dir, 'www'), '--port', '0', '--bind', bind], {
    cwd: world.dir, env: world.env(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  world.servers.push(child);
  return new Promise((resolve, reject) => {
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const m = /at http:\/\/127\.0\.0\.1:(\d+)\//u.exec(out);
      if (m) resolve(Number(m[1]));
    });
    child.on('exit', (code) => reject(new Error(`agsc-host serve stopped with exit ${code}: ${out}`)));
  });
}

test('control: with localhost resolving to ::1 first, a server bound to 127.0.0.1 is not reached through localhost', async () => {
  const world = new V6FirstWorld();
  try {
    world.bundle();
    built(world);
    const port = await serveAt(world, '127.0.0.1');
    const r = world.tool('validate-wellknown',
      [`http://localhost:${port}/.well-known/knowledge-linkset`, '--level', '1', '--dev', '--json']);
    assert.strictEqual(r.exit, 1, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /AGSC-E907/u);
    assert.match(r.stdout, /ECONNREFUSED ::1:/u, 'the preload did not reach the shipped checker');
  } finally {
    await world.close();
  }
});

test('the built node served on loopback passes the shipped checker when localhost resolves to ::1 first', async () => {
  const world = new V6FirstWorld();
  try {
    await step(world, 'a fresh copy of the acceptance Bundle');
    await step(world, 'the Bundle is built and served on loopback');
    const { base, origin } = world.state.loopback;
    assert.match(origin, /^http:\/\/\[::1\]:\d+$/u, 'the server is not on the address localhost resolves to first');
    assert.strictEqual(base, `http://localhost:${new URL(origin).port}/`);
    await step(world, 'the shipped validate-wellknown passes at Level 2 over loopback');
  } finally {
    await world.close();
  }
});

test('the preload answers only localhost', async () => {
  const dns = require('node:dns');
  assert.deepStrictEqual(await dns.promises.lookup('localhost', { all: true, verbatim: true }),
    [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }]);
  assert.deepStrictEqual(await dns.promises.lookup('localhost', { family: 4 }), { address: '127.0.0.1', family: 4 });
  assert.deepStrictEqual(await dns.promises.lookup('127.0.0.1'), { address: '127.0.0.1', family: 4 });
});
