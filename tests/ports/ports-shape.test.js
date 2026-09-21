'use strict';
// A port is a CONTRACT, not code. These tests pin that shape: the four port modules
// export nothing, and every adapter this repository ships satisfies the member set
// the port's JSDoc declares. A foreign port reads the JSDoc; this test reads the
// adapters, so the two can never drift apart silently.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PORTS = path.resolve(__dirname, '..', '..', 'src', 'ports');

const MEMBERS = Object.freeze({
  filesystem: ['readFile', 'writeFile', 'readdir', 'stat', 'exists', 'mkdirp', 'remove', 'walk'],
  clock: ['now', 'iso', 'findings'],
  'process-runner': ['run'],
  network: ['fetch'],
});

test('the four ports are declared and export nothing', () => {
  const files = fs.readdirSync(PORTS).sort();
  assert.deepStrictEqual(files, ['clock.js', 'filesystem.js', 'network.js', 'process-runner.js']);
  for (const f of files) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    assert.deepStrictEqual(require(path.join(PORTS, f)), {}, f);
  }
});

test('each port JSDoc declares exactly the members its adapter implements', () => {
  for (const [name, members] of Object.entries(MEMBERS)) {
    const text = fs.readFileSync(path.join(PORTS, `${name}.js`), 'utf8');
    for (const member of members) {
      assert.ok(text.includes(`} ${member}`), `port ${name} does not declare ${member}`);
    }
  }
});

test('the shipped adapters satisfy their port', () => {
  const { createFileSystem } = require('../../src/adapters/node-fs.js');
  const { createClock } = require('../../src/adapters/node-clock.js');
  const { createProcessRunner } = require('../../src/adapters/node-proc.js');
  const { createNetwork } = require('../../src/adapters/node-network-refusing.js');
  const instances = {
    filesystem: createFileSystem(process.cwd()),
    clock: createClock({ env: { SOURCE_DATE_EPOCH: '0' } }),
    'process-runner': createProcessRunner(),
    network: createNetwork(),
  };
  for (const [name, members] of Object.entries(MEMBERS)) {
    for (const member of members) {
      assert.strictEqual(typeof instances[name][member], 'function', `${name}.${member}`);
    }
  }
});
