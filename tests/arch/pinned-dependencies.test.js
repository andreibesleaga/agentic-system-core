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
//
// An advisory with no fixed version cannot be removed by an update. Such an
// advisory may be listed in `audit-exceptions.json`, each entry with a reason and
// an expiry date, on two conditions the tests below hold: the dependencies that
// ship (`--omit=dev`) have no advisory at all, and the entry has not expired.
// An expired entry fails this lane on every push and at release.
// `npm run audit` is the same lane: npm names the running script in npm_lifecycle_event.
const AUDIT_LANE = process.env.AGSC_AUDIT === '1' || process.env.npm_lifecycle_event === 'audit';
const AUDIT = { skip: AUDIT_LANE ? false : 'the audit lane reaches the npm registry and runs only with AGSC_AUDIT=1 or as `npm run audit`' };
const EXCEPTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-exceptions.json'), 'utf8'));

/** `npm audit --json`, through a shell so that Windows finds `npm.cmd`; npm exits 1 when it finds an advisory. */
function audit(flags) {
  const { spawnSync } = require('node:child_process');
  const run = spawnSync(`npm audit --json ${flags}`, { cwd: ROOT, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(run.stdout);
}

/** The advisory identifiers (GHSA-…) a report names. */
function advisoryIds(report) {
  const ids = new Set();
  for (const entry of Object.values(report.vulnerabilities || {})) {
    for (const via of entry.via) {
      if (typeof via === 'object') ids.add(String(via.url).split('/').pop());
    }
  }
  return [...ids].sort();
}

/** True for a real calendar day written YYYY-MM-DD ("2027-02-30" and "9999" are not). */
function isCalendarDay(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(text))) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

test('npm audit reports 0 vulnerabilities in what ships', AUDIT, () => {
  const total = audit('--omit=dev').metadata.vulnerabilities.total;
  assert.strictEqual(total, 0, `${total} advisories reach the published package`);
});

test('npm audit reports no advisory outside the dated exceptions', AUDIT, () => {
  const allowed = new Set(EXCEPTIONS.map((e) => e.id));
  const unexpected = advisoryIds(audit('')).filter((id) => !allowed.has(id));
  assert.deepStrictEqual(unexpected, []);
});

test('every audit exception gives a reason and has not expired', AUDIT, () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const e of EXCEPTIONS) {
    assert.match(e.id, /^GHSA(-[0-9a-z]{4}){3}$/u);
    assert.ok(e.package && e.reason, `${e.id} gives no package or reason`);
    for (const day of [e.recorded, e.expires]) {
      assert.ok(isCalendarDay(day), `${e.id}: "${day}" is not a calendar date written YYYY-MM-DD`);
    }
    assert.ok(e.recorded < e.expires, `${e.id} expires before it was recorded`);
    assert.ok(e.expires > today, `${e.id} expired on ${e.expires}: update the dependency or review the exception`);
  }
});
