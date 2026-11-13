'use strict';
// tests/arch/property-seeds.test.js — every property test fixes its seed.
//
// fast-check draws a fresh random seed on each run unless the options of `fc.assert`
// name one, so a property test without `seed` can pass today and fail tomorrow on the
// same code. The suite's tests are deterministic (docs/TESTING.md), so this test parses
// every test file (the TypeScript compiler, a development dependency, reads JavaScript)
// and refuses an `fc.assert` call whose options, the second argument, name no `seed`,
// directly or through a constant of the same file (`const RUNS = { numRuns: 150, seed: 1 }`).
//
// Deterministic: it reads files only; no clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const TESTS = path.resolve(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(path.join(dir, e.name))
    : [path.join(dir, e.name)]));
}

/** Every node of the tree, depth first (a callback of forEachChild that returns a value stops it). */
function nodes(node, out = []) {
  out.push(node);
  ts.forEachChild(node, (child) => {
    nodes(child, out);
  });
  return out;
}

/**
 * True when options name a `seed`: an object literal with a `seed` member (itself or through
 * a spread), a constant that holds one, or the loop variable of `for (const runs of f(...))`
 * where the function `f` of the same file builds options with a `seed`.
 */
function namesSeed(expression, constants) {
  if (!expression) return false;
  if (ts.isIdentifier(expression)) return namesSeed(constants.get(expression.text), constants);
  if (ts.isCallExpression(expression)) return namesSeed(expression.expression, constants);
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return /\bseed\b/u.test(expression.getText());
  if (!ts.isObjectLiteralExpression(expression)) return false;
  return expression.properties.some((p) => (ts.isSpreadAssignment(p)
    ? namesSeed(p.expression, constants)
    : p.name && p.name.getText() === 'seed'));
}

/** The constants of a file by name: each declaration's initializer, or the iterated value of a for-of. */
function constantsOf(all) {
  return new Map(all.filter((n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)).map((n) => [n.name.text,
    n.initializer || (ts.isForOfStatement(n.parent.parent) ? n.parent.parent.expression : undefined)]));
}

test('every fc.assert of the suite names a fixed seed', () => {
  const found = [];
  for (const file of walk(TESTS).filter((f) => f.endsWith('.js')).sort()) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const all = nodes(source);
    const constants = constantsOf(all);
    for (const call of all.filter((n) => ts.isCallExpression(n) && n.expression.getText() === 'fc.assert')) {
      if (!namesSeed(call.arguments[1], constants)) {
        const { line } = source.getLineAndCharacterOfPosition(call.getStart());
        found.push(`${path.relative(TESTS, file).split(path.sep).join('/')}:${line + 1}`);
      }
    }
  }
  assert.deepStrictEqual(found, []);
});
