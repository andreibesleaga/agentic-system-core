'use strict';
// tests/arch/bench-runners.test.js — the fitness functions of the benchmark runners
// (docs/BENCHMARKS.md, docs/ENGINEERING.md §8).
//
//   * A runner measures what a consumer of the PUBLISHED files gets, so neither the
//     retrieval tool `tools/bench` nor a runner under bench/runners/ (or its TypeScript
//     source under src-ts/bench/) requires anything of the engine under src/ — the
//     independence AGSC-09-90 gives the checkers. `npm run arch` holds the sources to the
//     same rule (`bench-runners-standalone` in .dependency-cruiser.js); this test holds the
//     compiled files and the tool, which the dependency rule does not cruise.
//   * Every runner `tools/bench` requires ships with it, by name in the package's
//     `files[]`, and a runner only a maintainer script calls (the install layer of
//     bench/measure.js) does not; each runner requires only Node built-ins, the run-time
//     dependencies and other runners.
//   * No runner and no source of one reads the clock or draws a random number: the dry
//     run's report is a function of its inputs, so two runs on different days give the
//     same bytes (a test that compares two runs made back to back cannot see a date).
//     A runner that times something is handed its timers (bench/measure.js does that for
//     the install layer).
//
// Deterministic: reads files only; no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNNERS = path.join(ROOT, 'bench', 'runners');
const SOURCES = path.join(ROOT, 'src-ts', 'bench');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** The specifiers of the `require(...)` calls and `import ... from` clauses of a file. */
function specifiers(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)|\bfrom\s+(['"])([^'"]+)\3/gu)].map((m) => m[2] || m[4]);
}

/** The root-relative POSIX path a relative specifier of `file` names, or null for a package. */
function target(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.relative(ROOT, path.resolve(path.dirname(file), specifier)).split(path.sep).join('/');
}

const listed = (dir, extension) => fs.readdirSync(dir).filter((f) => f.endsWith(extension)).map((f) => path.join(dir, f));

test('the benchmark runners and tools/bench require nothing of the engine under src/', () => {
  const files = [path.join(ROOT, 'tools', 'bench'), ...listed(RUNNERS, '.js'), ...listed(SOURCES, '.ts')];
  assert.ok(files.length >= 3, 'tools/bench, one runner and its source are read');
  for (const file of files) {
    for (const specifier of specifiers(file)) {
      const where = target(file, specifier);
      assert.ok(where === null || !/^src(?:-ts)?\//u.test(where) || where.startsWith('src-ts/bench/'),
        `${path.relative(ROOT, file)} requires ${specifier}: a runner reads the published files, never the engine`);
    }
  }
});

test('the dependency rule holds the runners\' sources to the same independence', () => {
  const rule = require(path.join(ROOT, '.dependency-cruiser.js')).forbidden.find((r) => r.name === 'bench-runners-standalone');
  assert.ok(rule, 'the rule bench-runners-standalone exists');
  assert.equal(rule.severity, 'error');
  assert.equal(rule.from.path, '^src-ts/bench/');
  assert.match('src/knowledge/jcs.js', new RegExp(rule.to.path, 'u'));
  assert.match('src-ts/bench/kit.ts', new RegExp(rule.to.pathNot, 'u'), 'a runner may require another runner');
});

test('every runner tools/bench requires ships, and needs only Node, the run-time dependencies and other runners', () => {
  const runtime = new Set(Object.keys(pkg.dependencies));
  const used = specifiers(path.join(ROOT, 'tools', 'bench')).map((s) => target(path.join(ROOT, 'tools', 'bench'), s)).filter(Boolean);
  const runners = used.filter((where) => where.startsWith('bench/runners/')).map((where) => (where.endsWith('.js') ? where : `${where}.js`));
  assert.ok(runners.length > 0, 'tools/bench requires a runner');
  const shipped = pkg.files.filter((f) => f.startsWith('bench/runners'));
  assert.deepEqual(shipped.sort(), [...new Set(runners)].sort(), 'package.json files[] ships, by name, the runners tools/bench requires and no other');
  for (const file of listed(RUNNERS, '.js')) {
    for (const specifier of specifiers(file)) {
      if (specifier.startsWith('node:')) continue;
      const where = target(file, specifier);
      if (where !== null) {
        assert.ok(where.startsWith('bench/runners/'), `${path.relative(ROOT, file)} requires ${specifier}, outside bench/runners/`);
        continue;
      }
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      assert.ok(runtime.has(name), `${path.relative(ROOT, file)} requires ${specifier}, which is no run-time dependency`);
    }
  }
});

test('no runner and no source of one reads the clock or draws a random number', () => {
  for (const file of [...listed(RUNNERS, '.js'), ...listed(SOURCES, '.ts')]) {
    const body = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/u.test(l)).join('\n');
    assert.ok(!/Date\.now|new Date\(|Math\.random/u.test(body), `${path.relative(ROOT, file)} reaches for the clock or randomness`);
  }
});
