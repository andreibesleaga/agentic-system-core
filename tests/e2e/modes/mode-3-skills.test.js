'use strict';
// verifies AGSC-07-19, AGSC-07-20, AGSC-07-21, AGSC-07-22, AGSC-01-01
// MODE 3 — evolving skills: packs are emitted, installed into the three targets
// (verified against the lockfile beside them, with a diff on update), fetched by an
// agent from the published node, and imported back — a pack of this format splits
// into its procedures, filed in its Cluster — while a verb that needs a Bundle
// refuses to run where there is none.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const kit = require('./_kit.js');

test('Mode 3: outside a Bundle, skills, skills install and mcp refuse instead of doing nothing', () => {
  const empty = path.join(kit.scratch('m3-empty'), 'nothing');
  fs.mkdirSync(empty);
  for (const args of [['skills'], ['skills', 'install'], ['mcp']]) {
    const r = kit.agsc(empty, args, { input: '' });
    assert.strictEqual(r.code, 1, `${args.join(' ')} exited ${r.code}`);
    assert.match(r.stderr, /AGSC-E901[^\n]*agsc\.config\.json is missing/u, `${args.join(' ')}: ${r.stderr}`);
  }
  assert.deepStrictEqual(fs.readdirSync(empty), [], 'a refused verb wrote something');
});

test('Mode 3, a person and an agent: emit, install, verify, update with a diff, import back split', () => {
  const dir = kit.projectBundle('m3');
  kit.commitAll(dir, 'the memory');
  const emitted = kit.agsc(dir, ['skills']);
  assert.strictEqual(emitted.code, 0, emitted.stderr);
  const index = JSON.parse(kit.read(dir, 'dist/skills/index.json'));
  assert.ok(index.packs.some((p) => p.name === 'login'));

  // Install into each of the three targets; a second run changes nothing.
  for (const target of ['.agents/skills', '.claude/skills', '.github/skills']) {
    const first = kit.agsc(dir, ['skills', 'install', target]);
    assert.strictEqual(first.code, 0, first.stderr);
    assert.ok(fs.existsSync(path.join(dir, target, 'login', 'SKILL.md')));
    assert.match(kit.agsc(dir, ['skills', 'install', target]).stderr, /0 written, \d+ unchanged/u);
  }
  // An update shows a real diff.
  kit.write(dir, '.agents/skills/login/SKILL.md', `${kit.read(dir, '.agents/skills/login/SKILL.md')}\nA local note.\n`);
  const updated = kit.agsc(dir, ['skills', 'install']);
  assert.strictEqual(updated.code, 0, updated.stderr);
  assert.match(updated.stderr, /^-A local note\.$/mu, 'the update showed no diff');
  // A pack edited after it was emitted no longer matches its lockfile: nothing installs.
  kit.write(dir, 'dist/skills/login/SKILL.md', `${kit.read(dir, 'dist/skills/login/SKILL.md')}\nInjected.\n`);
  const tampered = kit.agsc(dir, ['skills', 'install', '.github/skills', '--json']);
  assert.strictEqual(tampered.code, 1);
  assert.ok(kit.codes(tampered).includes('AGSC-E413'), JSON.stringify(tampered.envelope));
  assert.doesNotMatch(kit.read(dir, '.github/skills/login/SKILL.md'), /Injected\./u);

  // An agent fetches the published pack: the lock in /skills/index.json is the hash of
  // the served bytes, and the index names the content version.
  assert.strictEqual(kit.agsc(dir, ['build']).code, 0);
  const served = JSON.parse(kit.read(dir, 'www/skills/index.json'));
  const pack = served.packs.find((p) => p.name === 'login');
  assert.strictEqual(createHash('sha256').update(fs.readFileSync(path.join(dir, 'www/skills/login/SKILL.md'))).digest('hex'), pack.lock['SKILL.md']);
  assert.match(served.bundle_version, /^0\.0\.0\+1\.g[0-9a-f]{12}$/u);

  // Import the published pack into another Bundle: it splits into its procedures,
  // filed in the pack's Cluster; the rest of the pack is reported, not imported.
  const other = kit.projectBundle('m3-other');
  fs.rmSync(path.join(other, 'content/procedures/run-the-tests.md'));
  kit.write(other, 'incoming/SKILL.md', kit.read(dir, 'www/skills/login/SKILL.md'));
  const imported = kit.agsc(other, ['skills', 'import', 'incoming/SKILL.md', '--json']);
  assert.strictEqual(imported.code, 0, imported.stderr);
  const procedure = kit.read(other, 'content/procedures/run-the-tests.md');
  assert.match(procedure, /^type: procedure$/mu);
  assert.match(procedure, /^clusters:\n {2}- login$/mu);
  assert.match(procedure, /^1\. Run the tests\.$/mu);
  assert.ok(!fs.existsSync(path.join(other, 'content/procedures/login.md')), 'the whole pack became one procedure');
  assert.ok(kit.codes(imported).every((c) => c === 'AGSC-E506'));
  assert.strictEqual(kit.agsc(other, ['lint']).code, 0, 'the imported procedure does not lint');
  // Into the Bundle that already holds the procedure, the import writes nothing over it.
  const clash = kit.agsc(dir, ['skills', 'import', 'www/skills/login/SKILL.md', '--json']);
  assert.ok(kit.codes(clash).includes('AGSC-E206'));

  // A foreign skill imported with --cluster joins that Cluster's pack.
  const clone = path.join(kit.ROOT, 'tests', 'fixtures', 'skills-agentskills');
  const foreign = kit.agsc(other, ['import', clone, '--from', 'skills', '--cluster', 'login']);
  assert.strictEqual(foreign.code, 0, foreign.stderr);
  assert.match(kit.read(other, 'content/procedures/pdf-notes.md'), /^clusters:\n {2}- login$/mu);
  assert.strictEqual(kit.agsc(other, ['skills']).code, 0);
  assert.match(kit.read(other, 'dist/skills/login/SKILL.md'), /^- item: https:\/\/proj\.example\/procedures\/pdf-notes\/$/mu);
});
