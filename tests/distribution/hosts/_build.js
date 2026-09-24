'use strict';
// tests/distribution/hosts/_build.js — the fixture Bundle, built for the hosting
// profile tests: a throwaway copy of `tests/fixtures/minimal`, a fixed
// SOURCE_DATE_EPOCH and a ProcessRunner stub that answers a fixed two-commit history,
// so that the build publishes a real ledger (Level 2, AGSC-10-04) without git, a
// repository or a child process. Deterministic and offline.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

const RS = String.fromCharCode(30);
const US = String.fromCharCode(31);
const GS = String.fromCharCode(29);

/** Two commits in the shape the git-log read asks for (AGSC-08-20b). */
const HISTORY = [
  [`${'a'.repeat(40)}`, '', '1764547200', 'tag: v1.0.0', 'first\n', 'content/index.md\n'],
  [`${'b'.repeat(40)}`, 'a'.repeat(40), '1767225600', 'HEAD -> main', 'second\n', 'content/concepts/handoff.md\n'],
].map(([sha, parents, seconds, decorations, message, files]) => `${RS}${[sha, parents, seconds, decorations, message].join(US)}${GS}\n${files}`).join('');

/** The stub runner: the history, and a tree hash for `content/`. */
const proc = {
  run(cmd, args) {
    if (cmd === 'git' && args.includes('log')) return { code: 0, stderr: '', stdout: HISTORY };
    if (cmd === 'git' && args[0] === 'rev-parse') return { code: 0, stderr: '', stdout: `${'c'.repeat(40)}\n` };
    return { code: 1, stderr: '', stdout: '' };
  },
};

const temporaries = [];

/** A throwaway directory, removed by `cleanup`. */
function temporary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-hosts-'));
  temporaries.push(dir);
  return dir;
}

/** Remove every directory this module made. */
function cleanup() {
  for (const dir of temporaries.splice(0)) fs.rmSync(dir, { force: true, recursive: true });
}

/**
 * A fresh copy of the fixture, built. `base` overrides `site.base` (for a loopback
 * origin); `into` names the (not yet existing) Bundle root to use, `parent` the
 * directory to make one in. Returns the Bundle root; the build is `<root>/www`.
 */
function buildFixture(options = {}) {
  let dir = options.into;
  if (dir === undefined) {
    dir = fs.mkdtempSync(path.join(options.parent || os.tmpdir(), 'agsc-hosts-'));
    if (!options.parent) temporaries.push(dir);
  }
  fs.cpSync(FIXTURE, dir, { recursive: true });
  if (options.base) {
    const file = path.join(dir, 'agsc.config.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    config.site.base = options.base;
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  }
  const stdout = captureStream();
  const stderr = captureStream();
  const exit = main(['build', '--json', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: EPOCH },
    ports: { fs: createFileSystem(dir), proc },
    root: dir,
    stderr,
    stdout,
    version: '0.0.0',
  });
  if (exit !== 0) throw new Error(`fixture build failed (${exit}): ${stdout.text()}${stderr.text()}`);
  return dir;
}

/** Every file under a directory, as sorted site-relative paths with their bytes. */
function snapshot(dir) {
  const out = new Map();
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else out.set(child, fs.readFileSync(path.join(dir, child)));
    }
  };
  walk('');
  return new Map([...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

module.exports = { EPOCH, ROOT, buildFixture, cleanup, proc, snapshot, temporary };
