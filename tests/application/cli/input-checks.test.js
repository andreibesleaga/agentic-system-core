'use strict';
// The command line refuses inputs that a rule already excludes (verification findings
// of 2026-10-06). Before that day each of these ran and exited 0, or ended in an
// internal error:
//
//   C8   `build.out` naming the source tree: `"build": {"out": "content"}` wrote the
//        whole site into `content/` (AGSC-08-02: a build never writes into `content/`),
//        and `dist` was accepted the same way (AGSC-01-08: generated, never an input).
//        Now `AGSC-E204`, from the configuration check of lint, build and ci
//        (AGSC-01-19 as amended 2026-10-06).
//   C14  closed lists that answered the names of `Object.prototype` members:
//        `export --steer --target constructor` wrote a file named
//        `function Object() { [native code] }`; `export --to board --format toString`
//        exited 0; `export --to constructor` and `import --from constructor` ended in
//        an internal error. Each is now refused like any other unknown name.
//   C15  `--level` on `build` and `ci` was not checked: `--level constructor` and
//        `--level 9` were ignored and `--level -1` built 11 files. It is now checked as
//        `conform` checks it: `AGSC-E003`, exit 2 (AGSC-09-07 as amended 2026-10-06).
//   C19  a directory with `agsc.config.json` and no `content/index.md` linted and built
//        clean. The Bundle root is required (AGSC-01-01, AGSC-01-04): `AGSC-E901`.
//   C28  `trace` wrote an Episode it never validated: `"tokens_in": 1e999` became
//        `tokens_in: Infinity`, which the next build refused. The Episode is now checked
//        against the item schema before it is written, and nothing is written when it
//        fails.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { agsc, codes, scratch, writeConfig } = require('./_bundle-run.js');

const PROTOTYPE_NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];

// ------------------------------------------------------------------ C8

test('C8: build.out may not name content/ or dist/, or a path under either', async (t) => {
  for (const out of ['content', 'content/', 'content/site', 'Content', 'dist', 'dist/www', 'DIST']) {
    const dir = scratch(t);
    writeConfig(dir, (c) => { c.build.out = out; });
    for (const verb of ['lint', 'build', 'ci']) {
      const r = await agsc(dir, [verb, '--json']);
      const hit = r.findings.find((f) => f.code === 'AGSC-E204' && f.key === 'build.out');
      assert.ok(hit, `${verb} with build.out ${out}: ${JSON.stringify(r.findings)}`);
      assert.notEqual(r.exit, 0, `${verb} with build.out ${out}`);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'content', 'index.html')), `${out}: the site was written into content/`);
    assert.ok(!fs.existsSync(path.join(dir, 'content', 'site')), `${out}: the site was written under content/`);
    assert.ok(!fs.existsSync(path.join(dir, 'dist', 'index.html')), `${out}: the site was written into dist/`);
  }
});

test('C8: a build.out that only starts with the same letters is accepted', async (t) => {
  for (const out of ['contents', 'content-site', 'distribution', 'site/content']) {
    const dir = scratch(t);
    writeConfig(dir, (c) => { c.build.out = out; });
    const r = await agsc(dir, ['build', '--json']);
    assert.equal(r.exit, 0, `${out}: ${JSON.stringify(r.findings)}`);
    assert.ok(fs.existsSync(path.join(dir, out, 'index.html')), out);
  }
});

// ------------------------------------------------------------------ C14

test('C14: every selector answers a prototype member name as it answers any unknown name', async (t) => {
  // The twin differs in its last letter: an unknown name of the same shape, whose
  // answer (code and exit) is the one the prototype name must get.
  const twin = (name) => `${name.slice(0, -1)}x`;
  for (const name of PROTOTYPE_NAMES) {
    const dir = scratch(t);
    const cases = [
      (n) => ['export', '--steer', '--target', n],
      (n) => ['export', '--to', 'board', '--format', n],
      (n) => ['export', '--to', n],
      (n) => ['import', '--from', n, 'elsewhere'],
      (n) => ['compose', '--emit', n, 'handoff'],
    ];
    for (const argvOf of cases) {
      const r = await agsc(dir, [...argvOf(name), '--json']);
      const control = await agsc(dir, [...argvOf(twin(name)), '--json']);
      const label = argvOf(name).join(' ');
      assert.doesNotMatch(r.stderr, /internal error/u, `${label}: ${r.stderr}`);
      assert.notEqual(r.exit, 0, label);
      assert.deepEqual([codes(r), r.exit], [codes(control), control.exit], `${label}: ${JSON.stringify(r.findings)}`);
    }
    const steer = await agsc(dir, ['export', '--steer', '--target', name, '--json']);
    assert.ok(codes(steer).includes('AGSC-E203'), JSON.stringify(steer.findings));
    const out = path.join(dir, 'dist', 'export', 'steer');
    const written = fs.existsSync(out) ? fs.readdirSync(out) : [];
    assert.ok(!written.some((f) => /native code|object Object/u.test(f)), JSON.stringify(written));
  }
});

test('C14: an import record and a status word named after a prototype member are not table hits', () => {
  const status = require('../../../src/interchange/status.js');
  for (const name of PROTOTYPE_NAMES) {
    const mapped = status.status(name);
    assert.equal(typeof mapped.status, 'string', name);
    assert.equal(mapped.status, 'draft', name);
  }
  const gabbe = require('../../../src/interchange/adapters/gabbe.js');
  for (const name of PROTOTYPE_NAMES) assert.equal(gabbe.outcomeOf(name), null, name);
});

// ------------------------------------------------------------------ C15

test('C15: --level on build and ci is 0, 1, 2 or 3, or AGSC-E003 with exit 2', async (t) => {
  const dir = scratch(t);
  for (const verb of ['build', 'ci']) {
    for (const level of ['constructor', '9', '-1', '1.5', '', '02']) {
      const r = await agsc(dir, [verb, '--level', level, '--json']);
      assert.ok(codes(r).includes('AGSC-E003'), `${verb} --level ${JSON.stringify(level)}: ${JSON.stringify(r.findings)}`);
      assert.equal(r.exit, 2, `${verb} --level ${JSON.stringify(level)}`);
    }
  }
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'a refused level wrote nothing');
  for (const level of ['0', '1', '2', '3']) {
    const r = await agsc(dir, ['build', '--level', level, '--json']);
    assert.equal(r.exit, 0, `build --level ${level}: ${JSON.stringify(r.findings)}`);
  }
});

// ------------------------------------------------------------------ C19

test('C19: a Bundle without content/index.md is AGSC-E901 in lint, build and ci', async (t) => {
  for (const remove of [path.join('content', 'index.md'), 'content']) {
    const dir = scratch(t);
    fs.rmSync(path.join(dir, remove), { force: true, recursive: true });
    for (const verb of ['lint', 'build', 'ci']) {
      const r = await agsc(dir, [verb, '--json']);
      assert.ok(r.findings.some((f) => f.code === 'AGSC-E901' && f.file === 'content/index.md'),
        `${verb} without ${remove}: ${JSON.stringify(r.findings)}`);
      assert.equal(r.exit, 1, `${verb} without ${remove}`);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'www')), `without ${remove}: the build wrote a site`);
  }
});

// ------------------------------------------------------------------ C28

test('C28: trace writes no Episode that fails the item schema', async (t) => {
  const dir = scratch(t);
  writeConfig(dir, (c) => { c.run = { enabled: true }; });
  // Written as text: JSON.stringify cannot spell 1e999, and JSON.parse reads it as Infinity.
  fs.writeFileSync(path.join(dir, 'record.json'),
    '{"actor":"process:refresh","started":"2026-01-01T00:00:00Z","title":"Escape Script","usage":{"tokens_in":1e999}}\n');
  const r = await agsc(dir, ['trace', 'record.json', '--json']);
  assert.equal(r.exit, 1, JSON.stringify(r.findings));
  assert.ok(r.findings.some((f) => f.severity === 'error' && /tokens_in/u.test(f.message)), JSON.stringify(r.findings));
  assert.ok(!fs.existsSync(path.join(dir, 'content', 'episodes')), 'a refused Episode was written');

  // A record that maps to a conforming Episode is still written.
  fs.writeFileSync(path.join(dir, 'good.json'),
    '{"actor":"process:refresh","started":"2026-01-01T00:00:00Z","title":"Nightly Refresh","usage":{"tokens_in":10}}\n');
  const good = await agsc(dir, ['trace', 'good.json', '--json']);
  assert.equal(good.exit, 0, JSON.stringify(good.findings));
  assert.ok(fs.existsSync(path.join(dir, 'content', 'episodes', 'nightly-refresh.md')));
  const lint = await agsc(dir, ['lint', '--json']);
  assert.equal(lint.exit, 0, JSON.stringify(lint.findings));
});

// ------------------------------------------------------------------ C8, the environment layers
// (verification finding of 2026-10-07): the same value through `AGSC_BUILD_OUT` or a
// `.env` file in the Bundle folder bypassed the check above.

test('C8: build.out from AGSC_BUILD_OUT or a .env file is refused like the project value', async (t) => {
  for (const out of ['content', 'Content/site', 'dist', '.', '..']) {
    for (const layer of ['env', 'dotenv']) {
      const dir = scratch(t);
      const options = layer === 'env' ? { env: { AGSC_BUILD_OUT: out } } : {};
      if (layer === 'dotenv') fs.writeFileSync(path.join(dir, '.env'), `AGSC_BUILD_OUT=${out}\n`);
      for (const verb of ['lint', 'build', 'ci']) {
        const r = await agsc(dir, [verb, '--json'], options);
        const hit = r.findings.find((f) => f.code === 'AGSC-E204' && /AGSC_BUILD_OUT/u.test(f.message || ''));
        assert.ok(hit, `${verb} with ${layer} build.out ${out}: ${JSON.stringify(r.findings)}`);
        assert.notEqual(r.exit, 0, `${verb} with ${layer} build.out ${out}`);
      }
      assert.ok(!fs.existsSync(path.join(dir, 'content', 'index.html')), `${layer} ${out}: the site was written into content/`);
      assert.ok(!fs.existsSync(path.join(dir, 'content', 'site')), `${layer} ${out}: the site was written under content/`);
      assert.ok(!fs.existsSync(path.join(dir, 'dist', 'index.html')), `${layer} ${out}: the site was written into dist/`);
      assert.ok(!fs.existsSync(path.join(dir, 'index.html')), `${layer} ${out}: the site was written into the Bundle root`);
    }
  }
});
