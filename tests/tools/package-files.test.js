'use strict';
// `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` exist in the repository and
// MUST be in `package.json` `files`: without them `npm pack` ships none, and a
// consumer of the npm package finds no security-reporting address, no contribution
// terms and no change history.
//
// AGSC-06-01 calls these repository files rather than routes, so no rule is touched:
// this test simply pins what the published package must carry, measured through the
// release tool's own pack list, which is what `npm pack` walks.
//
// Deterministic: reads the repository, no clock, no network, no subprocess.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, tool } = require('./helpers');

/** Every document an npm consumer must find inside the tarball. */
const REQUIRED = Object.freeze([
  'CHANGELOG.md', 'CITATION.cff', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'GOVERNANCE.md',
  'LICENSE', 'LICENSE-CONTENT', 'README.md', 'SECURITY.md', 'TRADEMARK-POLICY.md',
  'docs/CONFORMANCE-STATEMENTS.md',
]);

describe('the published package carries the documents a consumer needs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const shipped = tool('release').packList(REPO, manifest);

  it('ships every required document', () => {
    for (const name of REQUIRED) {
      assert.ok(fs.existsSync(path.join(REPO, name)), `${name} is missing from the repository`);
      assert.ok(shipped.includes(name), `${name} is in the repository and not in the pack list`);
    }
  });

  it('ships no private path', () => {
    for (const name of shipped) {
      assert.ok(!name.startsWith('GABBE/'), `the pack carries the private governance tree: ${name}`);
      assert.ok(!name.includes('discovery' + '-product'), `the pack carries a private path: ${name}`);
      assert.ok(!/(^|\/)\.env/u.test(name), `the pack carries an environment file: ${name}`);
    }
  });

  it('declares every required document in `files`, so npm and the release tool agree', () => {
    const declared = new Set(manifest.files || []);
    for (const name of REQUIRED) {
      // npm always ships `package.json`, `README.md` and the licence; the rest must
      // be declared or they silently disappear from the tarball.
      if (['README.md', 'LICENSE'].includes(name)) continue;
      assert.ok(declared.has(name), `package.json "files" does not name ${name}`);
    }
  });
});
