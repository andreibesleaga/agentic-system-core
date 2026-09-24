'use strict';
// Configuration management (SWEBOK): every dependency is pinned to an EXACT version
// and every library `src/` requires is declared. An unpinned range would make two
// installs of the same commit produce different bytes, which AGSC-04-01 forbids.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { isBuiltin } = require('node:module');
const { ROOT, sources } = require('./_scan.js');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

test('every dependency is pinned to an exact version', () => {
  for (const group of ['dependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(pkg[group] || {})) {
      assert.match(range, EXACT, `${group}.${name} is "${range}", not an exact version`);
    }
  }
});

test('every library src/ requires is declared as a dependency', () => {
  const declared = new Set(Object.keys(pkg.dependencies || {}));
  for (const file of sources()) {
    for (const specifier of file.requires) {
      if (specifier.startsWith('.') || isBuiltin(specifier)) continue;
      const name = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      assert.ok(declared.has(name), `${file.rel} requires "${name}", which package.json does not declare`);
    }
  }
});

// ---------------------------------------------------------------------------
// Added at integration: the lockfile and the audit gate.
// ---------------------------------------------------------------------------

test('the lockfile pins every installed package to one exact version', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  assert.strictEqual(lock.lockfileVersion, 3, 'the lockfile is not npm 7+ format');
  for (const [where, entry] of Object.entries(lock.packages || {})) {
    if (where === '' || entry.link === true) continue;
    assert.match(String(entry.version), EXACT, `${where} is locked at "${entry.version}"`);
    assert.ok(String(entry.resolved || '').startsWith('https://registry.npmjs.org/'),
      `${where} resolves to "${entry.resolved}", not the public registry`);
  }
});

// `npm audit` queries the advisory service, so it is NOT part of the default
// suite: tests here are deterministic and reach no network (-CONTRACT,
// test discipline). It is the release gate, run explicitly:
//
//   AGSC_AUDIT=1 node --test tests/arch/pinned-dependencies.test.js
//
// The result of the run this milestone recorded is 0 vulnerabilities.
test('npm audit reports 0 vulnerabilities', { skip: process.env.AGSC_AUDIT !== '1' }, () => {
  const { execFileSync } = require('node:child_process');
  const raw = execFileSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const total = JSON.parse(raw).metadata.vulnerabilities;
  assert.strictEqual(Object.values(total).reduce((a, b) => a + b, 0), 0, JSON.stringify(total));
});
