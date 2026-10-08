'use strict';
// tests/arch/package-links.test.js — no Markdown file the npm package ships links to a
// file the package does not ship.
//
// npm packs a `README.md` from every directory it enters, so the folder READMEs of
// `docs/`, `tests/` and `tools/` travel in the tarball while most of what they link to
// (`docs/TESTING.md`, `docs/START-HERE.md`, `tests/arch/`, …) stays in the repository.
// Until 2026-10-07 an installed copy carried 42 relative links to nothing. A link that
// leaves the package is written as an absolute link to the repository, which resolves
// from anywhere.
//
// Deterministic: `npm pack --dry-run --json` reads the manifest and the tree and
// touches no network; every link is resolved against the listed paths only.

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..');

/** The files `npm pack` would ship, as npm itself lists them. */
function packedFiles() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = cp.spawnSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts', '--offline'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32',
  });
  assert.equal(result.status, 0, `npm pack --dry-run failed: ${result.stderr}`);
  return JSON.parse(result.stdout)[0].files.map((f) => f.path);
}

/** `[text](target)` targets of a Markdown text, outside fenced blocks and code spans. */
function linkTargets(markdown) {
  const out = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/u.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    for (const m of line.replace(/`[^`]*`/gu, '').matchAll(/\]\(([^)\s]+)\)/gu)) out.push(m[1]);
  }
  return out;
}

/** Resolve a relative target from `file`, POSIX, `..` applied; `null` above the root. */
function resolveFrom(file, target) {
  const segments = path.posix.dirname(file).split('/').filter((s) => s !== '' && s !== '.');
  for (const s of target.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (segments.length === 0) return null; segments.pop(); continue; }
    segments.push(s);
  }
  return segments.join('/');
}

describe('the npm package', () => {
  it('ships no Markdown file whose relative link leaves the package', () => {
    const files = packedFiles();
    const shipped = new Set(files);
    // Items of the example Bundles link to one another by slug, which the engine resolves
    // (AGSC-03-02); they are not documentation of the package and are left out.
    const markdown = files.filter((f) => f.endsWith('.md') && !/(^|\/)content\//u.test(f));
    assert.ok(markdown.some((f) => f === 'docs/README.md') && markdown.some((f) => f === 'tests/README.md'),
      'the folder READMEs are in the pack list (if they are not, this test has nothing to check)');
    const dead = [];
    for (const file of markdown) {
      for (const target of linkTargets(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
        if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('#')) continue;
        const resolved = resolveFrom(file, target.split('#')[0]);
        const ok = resolved !== null && (shipped.has(resolved) || shipped.has(`${resolved}/README.md`)
          || files.some((f) => f.startsWith(`${resolved}/`)));
        if (!ok) dead.push(`${file}: ${target}`);
      }
    }
    assert.deepEqual(dead, [], `${dead.length} link(s) to files the package does not ship`);
  });
});
