'use strict';
// tests/standard/root-base.test.js — the IRI base of a 1.0 build. The Bundle root
// document carries a base that MUST equal the configured site base; a 1.0 writer forms
// every IRI from the site base, so a root base that differs changes no byte of the
// build. Reporting the difference is planned for 1.1 (the declared scope by version).
//
// verifies AGSC-01-04
//
// Built with the REAL command line from a copy of the minimal fixture whose root
// document names another base. Deterministic: a fixed build instant, no git history,
// no network; writes only under the system temporary directory and removes it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const SITE_BASE = 'https://minimal.example/';
const ROOT_BASE = 'https://elsewhere.example/';

function env(dir) {
  return {
    GIT_CONFIG_GLOBAL: path.join(dir, '.gitconfig-empty'),
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: dir,
    NO_COLOR: '1',
    PATH: process.env.PATH,
    SOURCE_DATE_EPOCH: '1767225600',
    ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
  };
}

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else out.push(full);
  }
  return out.sort();
}

test('a root base that differs from the site base: every IRI of the build is formed from the site base', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-root-base-'));
  try {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    const index = path.join(dir, 'content', 'index.md');
    const source = fs.readFileSync(index, 'utf8');
    assert.ok(source.includes(`\nbase: ${SITE_BASE}\n`), 'the fixture root names the site base');
    fs.writeFileSync(index, source.replace(`\nbase: ${SITE_BASE}\n`, `\nbase: ${ROOT_BASE}\n`));

    const run = spawnSync(process.execPath, [AGSC, 'build'], { cwd: dir, env: env(dir), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const out = path.join(dir, 'www');
    const written = files(out);
    assert.ok(written.length > 0, 'the build wrote no file');
    const naming = written.filter((f) => fs.readFileSync(f).includes(ROOT_BASE.slice(0, -1)));
    assert.deepEqual(naming.map((f) => path.relative(out, f)), [], 'a built file names the root base');

    const graph = JSON.parse(fs.readFileSync(path.join(out, 'graph.jsonld'), 'utf8'));
    const ids = (graph['@graph'] || []).map((node) => node['@id']).filter((id) => typeof id === 'string' && /^https?:/u.test(id));
    assert.ok(ids.length > 0, 'the graph names no item IRI');
    for (const id of ids) assert.ok(id.startsWith(SITE_BASE), `${id} is not formed from the site base`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
