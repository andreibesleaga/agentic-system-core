'use strict';
// The command line refuses inputs that a rule already excludes. Before the fix each
// of these ran and exited 0, or ended in an internal error:
//
//   (a)  `build.out` naming the source tree: `"build": {"out": "content"}` wrote the
//        whole site into `content/` (AGSC-08-02: a build never writes into `content/`),
//        and `dist` was accepted the same way (AGSC-01-08: generated, never an input).
//        Now `AGSC-E204`, from the configuration check of lint, build and ci
//        (AGSC-01-19 as amended).
//   (b)  closed lists that answered the names of `Object.prototype` members:
//        `export --steer --target constructor` wrote a file named
//        `function Object() { [native code] }`; `export --to board --format toString`
//        exited 0; `export --to constructor` and `import --from constructor` ended in
//        an internal error. Each is now refused like any other unknown name.
//   (c)  `--level` on `build` and `ci` was not checked: `--level constructor` and
//        `--level 9` were ignored and `--level -1` built 11 files. It is now checked as
//        `conform` checks it: `AGSC-E003`, exit 2 (AGSC-09-07 as amended).
//   (d)  a directory with `agsc.config.json` and no `content/index.md` linted and built
//        clean. The Bundle root is required (AGSC-01-01, AGSC-01-04): `AGSC-E901`.
//   (e)  `trace` wrote an Episode it never validated: `"tokens_in": 1e999` became
//        `tokens_in: Infinity`, which the next build refused. The Episode is now checked
//        against the item schema before it is written, and nothing is written when it
//        fails.
//   (f)  the environment layers: a value an environment layer sets that the schema
//        refuses (`AGSC_BUILD_OUT=content`, in the shell or in `.env`) was reported, but
//        the refused value was dropped and `build` still wrote the site under `www/`,
//        and `ci` wrote `dist/gate.json` with the verdict `pass` while it exited 1. A
//        configuration error from any layer now stops every verb that writes before it
//        runs; `lint` and `verify`, which write nothing, still report everything they
//        find beside it. A stray `AGSC_` name is told to be an environment variable to
//        unset (AGSC-01-37).
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ROOT, agsc, codes, scratch, writeConfig } = require('./_bundle-run.js');

const PROTOTYPE_NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty'];

// ------------------------------------------------------------------ (a)

test('(a) build.out may not name content/ or dist/, or a path under either', async (t) => {
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

test('(a) a build.out that only starts with the same letters is accepted', async (t) => {
  for (const out of ['contents', 'content-site', 'distribution', 'site/content']) {
    const dir = scratch(t);
    writeConfig(dir, (c) => { c.build.out = out; });
    const r = await agsc(dir, ['build', '--json']);
    assert.equal(r.exit, 0, `${out}: ${JSON.stringify(r.findings)}`);
    assert.ok(fs.existsSync(path.join(dir, out, 'index.html')), out);
  }
});

// ------------------------------------------------------------------ (b)

test('(b) every selector answers a prototype member name as it answers any unknown name', async (t) => {
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

test('(b) an import record and a status word named after a prototype member are not table hits', () => {
  const status = require('../../../src/interchange/status.js');
  for (const name of PROTOTYPE_NAMES) {
    const mapped = status.status(name);
    assert.equal(typeof mapped.status, 'string', name);
    assert.equal(mapped.status, 'draft', name);
  }
  const gabbe = require('../../../src/interchange/adapters/gabbe.js');
  for (const name of PROTOTYPE_NAMES) assert.equal(gabbe.outcomeOf(name), null, name);
});

// ------------------------------------------------------------------ (c)

test('(c) --level on build and ci is 0, 1, 2 or 3, or AGSC-E003 with exit 2', async (t) => {
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

// ------------------------------------------------------------------ (d)

test('(d) a Bundle without content/index.md is AGSC-E901 in lint, build and ci', async (t) => {
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

// ------------------------------------------------------------------ (e)

test('(e) trace writes no Episode that fails the item schema', async (t) => {
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

// ------------------------------------------------------------------ (f) the environment layers
// The same value through `AGSC_BUILD_OUT` or a
// `.env` file in the Bundle folder bypassed the check above.

test('(f) build.out from AGSC_BUILD_OUT or a .env file is refused like the project value', async (t) => {
  for (const out of ['content', 'Content/site', 'dist', '.', '..']) {
    for (const layer of ['env', 'dotenv']) {
      const dir = scratch(t);
      const options = layer === 'env' ? { env: { AGSC_BUILD_OUT: out } } : {};
      if (layer === 'dotenv') fs.writeFileSync(path.join(dir, '.env'), `AGSC_BUILD_OUT=${out}\n`);
      for (const verb of ['lint', 'build', 'ci']) {
        const r = await agsc(dir, [verb, '--json'], options);
        const hit = r.findings.find((f) => f.code === 'AGSC-E204' && /AGSC_BUILD_OUT/u.test(f.message || ''));
        assert.ok(hit, `${verb} with ${layer} build.out ${out}: ${JSON.stringify(r.findings)}`);
        assert.equal(r.exit, 1, `${verb} with ${layer} build.out ${out}`);
      }
      assert.ok(!fs.existsSync(path.join(dir, 'content', 'index.html')), `${layer} ${out}: the site was written into content/`);
      assert.ok(!fs.existsSync(path.join(dir, 'content', 'site')), `${layer} ${out}: the site was written under content/`);
      assert.ok(!fs.existsSync(path.join(dir, 'dist', 'index.html')), `${layer} ${out}: the site was written into dist/`);
      assert.ok(!fs.existsSync(path.join(dir, 'index.html')), `${layer} ${out}: the site was written into the Bundle root`);
      // The refused value is not replaced by the default either: nothing is written at all.
      assert.ok(!fs.existsSync(path.join(dir, 'www')), `${layer} ${out}: the site was written under the default www/`);
      assert.ok(!fs.existsSync(path.join(dir, 'dist')), `${layer} ${out}: ci wrote dist/`);
    }
  }
});

/** The pieces of a stray name, joined at run time. */
const STRAY = ['AGSC', 'DOI'].join('_');

test('(f) a stray AGSC_ name is named as an environment variable to unset, and nothing is written', async (t) => {
  for (const layer of ['env', 'dotenv']) {
    const dir = scratch(t);
    const options = layer === 'env' ? { env: { [STRAY]: '10.5281/zenodo.1' } } : {};
    if (layer === 'dotenv') fs.writeFileSync(path.join(dir, '.env'), `${STRAY}=10.5281/zenodo.1\n`);
    const expected = layer === 'env'
      ? `environment variable ${STRAY} is not a configuration name this engine knows; unset it (AGSC-01-37)`
      : `${STRAY} in the .env file is not a configuration name this engine knows; remove that line (AGSC-01-37)`;
    for (const verb of ['lint', 'build', 'ci']) {
      const r = await agsc(dir, [verb, '--json'], options);
      const hit = r.findings.find((f) => f.code === 'AGSC-E004');
      assert.ok(hit, `${verb} ${layer}: ${JSON.stringify(r.findings)}`);
      assert.equal(hit.message, expected, `${verb} ${layer}`);
      assert.equal(r.exit, 2, `${verb} ${layer}: a configuration the tool cannot run against (AGSC-09-08)`);
      const plain = await agsc(dir, [verb], options);
      assert.ok(plain.stderr.includes(`error: AGSC-E004 ${expected}`), `${verb} ${layer} plain: ${plain.stderr}`);
    }
    // Exit 2 says the tool cannot run against this configuration (AGSC-09-08), so it writes nothing.
    assert.ok(!fs.existsSync(path.join(dir, 'www')), `${layer}: build wrote www/ beside a configuration error`);
    assert.ok(!fs.existsSync(path.join(dir, 'dist')), `${layer}: ci wrote dist/ beside a configuration error`);
  }
});

test('(f) a range error in the project file (AGSC-E209) also stops build and ci before they write', async (t) => {
  const dir = scratch(t);
  writeConfig(dir, (c) => { c.visibility = 'bogus'; });
  for (const verb of ['build', 'ci']) {
    const r = await agsc(dir, [verb, '--json']);
    assert.ok(r.findings.some((f) => f.code === 'AGSC-E209' && f.key === 'visibility'), `${verb}: ${JSON.stringify(r.findings)}`);
    assert.equal(r.exit, 1, verb);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'build wrote www/ beside AGSC-E209');
  assert.ok(!fs.existsSync(path.join(dir, 'dist')), 'ci wrote dist/ beside AGSC-E209');
});

test('(f) lint and verify write nothing, so they still report every finding beside an environment error', async (t) => {
  const dir = scratch(t);
  // A concept without a description: lint reports AGSC-E408 for it, whatever the configuration.
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'bare.md'), '---\ntype: concept\ntitle: A bare concept\n'
    + 'clusters: [agent-patterns]\nprov:\n  origin: human\n  operator: human:someone\n---\n\nA concept with a body and no description.\n');
  const clean = await agsc(dir, ['lint', '--json']);
  const own = clean.findings.map((f) => f.code);
  assert.ok(own.includes('AGSC-E408'), JSON.stringify(clean.findings));
  const r = await agsc(dir, ['lint', '--json'], { env: { AGSC_BUILD_OUT: 'content' } });
  assert.deepEqual(r.findings.filter((f) => f.code !== 'AGSC-E204'), clean.findings, 'lint reports what it found');
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E204'), JSON.stringify(r.findings));
  assert.equal(r.exit, 1);
  const v = await agsc(dir, ['verify', '--json'], { env: { AGSC_BUILD_OUT: 'content' } });
  assert.ok(v.findings.some((f) => f.code === 'AGSC-E204'), JSON.stringify(v.findings));
  assert.ok(!v.findings.some((f) => f.code === 'AGSC-E001'), 'verify ran');
});

test('(f) the tool server does not start beside a configuration error; the finding goes to stderr', (t) => {
  const dir = scratch(t);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), 'mcp'], {
    cwd: dir, encoding: 'utf8', input: '', timeout: 60000,
    env: { ...env, AGSC_BUILD_OUT: 'content', NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' },
  });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, '', 'stdout carries protocol bytes only, and none were sent');
  assert.match(r.stderr, /"code":"AGSC-E204"/u);
});
