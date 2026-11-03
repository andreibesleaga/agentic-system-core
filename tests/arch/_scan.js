'use strict';
// Shared source scanner for the architecture tests. It reads text, never executes
// a module, so a module with a side effect cannot hide a boundary violation.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(path.join(dir, e.name))
    : [path.join(dir, e.name)]));
}

/** Every `.js` under src/, as `{ rel, dir, text, requires: string[] }`. */
function sources() {
  return walk(SRC).filter((f) => f.endsWith('.js')).sort().map((absolute) => {
    const rel = path.relative(ROOT, absolute).split(path.sep).join('/');
    const text = fs.readFileSync(absolute, 'utf8');
    const requires = [...text.matchAll(/\brequire\(\s*'([^']+)'\s*\)/gu)].map((m) => m[1]);
    return { absolute, rel, dir: path.relative(SRC, path.dirname(absolute)).split(path.sep).join('/'), text, requires };
  });
}

/**
 * The `src/`-relative context a relative specifier points into, or null when it
 * points at a package, a Node built-in, or anything outside `src/` (package.json,
 * a schema file). Only a module INSIDE src/ can carry a context arrow.
 */
function contextOf(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(file.absolute), specifier);
  const rel = path.relative(SRC, resolved).split(path.sep).join('/');
  if (rel === '' || rel.startsWith('..')) return null;
  return rel.split('/')[0];
}

/**
 * Every `src/` module the given modules require, directly or through another, by its
 * root-relative path. The fitness tests use it to show what a build, a lint or the Harness
 * writer can reach.
 */
function reachable(roots) {
  const byRel = new Map(sources().map((file) => [file.rel, file]));
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const rel = stack.pop();
    if (seen.has(rel) || !byRel.has(rel)) continue;
    seen.add(rel);
    const file = byRel.get(rel);
    for (const specifier of file.requires.filter((s) => s.startsWith('.'))) {
      stack.push(path.relative(ROOT, path.resolve(path.dirname(file.absolute), specifier)).split(path.sep).join('/'));
    }
  }
  return seen;
}

module.exports = { ROOT, SRC, sources, contextOf, reachable, walk };
