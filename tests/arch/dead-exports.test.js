'use strict';
// Fitness function: every name a `src/` module exports is used outside that module.
//
// An export no other file names is dead surface: it widens what a reader must keep
// stable and hides that the code behind it is only used inside its own module. A name
// counts as used when any other file of the tree names it in its code (comments
// removed): `src/`, `src-ts/`, `bin/`, `tools/`, `bench/`, `packages/`, `plugins/`,
// `examples/`, `tests/` and `index.js`. Two kinds of export are exempt:
//
//   - a name the module lists in a `…PORTABLE` array: the page emits that function as its
//     own source text, so the export is how the page writer reads it;
//   - a name `src/REFERENCE.md` or `docs/PLUGINS.md` documents: a documented name is
//     public, and has a test of its own.
//
// Reads text and parses it with the pinned linter's parser; never executes a module.
// Deterministic: no clock, no network, no writes.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, sources, walk } = require('./_scan.js');
const { parse, codeOf } = require('./_code.js');

const READERS = ['src', 'src-ts', 'bin', 'tools', 'bench', 'packages', 'plugins', 'examples', 'tests'];
const DOCUMENTED = ['src/REFERENCE.md', 'docs/PLUGINS.md']
  .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');

/** The names of `module.exports = { … }` and of every `…PORTABLE` array in one module. */
function exportsOf(text, filename) {
  const names = [];
  const portable = new Set();
  for (const statement of parse(text, filename).body) {
    const assignment = statement.type === 'ExpressionStatement' ? statement.expression : null;
    if (assignment && assignment.type === 'AssignmentExpression' && isModuleExports(assignment.left)
      && assignment.right.type === 'ObjectExpression') {
      for (const p of assignment.right.properties) if (p.type === 'Property' && p.key.type === 'Identifier') names.push(p.key.name);
    }
    if (statement.type === 'VariableDeclaration') {
      for (const d of statement.declarations) for (const name of portableNames(d)) portable.add(name);
    }
  }
  return { names, portable };
}

function isModuleExports(node) {
  return node.type === 'MemberExpression' && node.object.name === 'module' && node.property.name === 'exports';
}

/** The string members of `const …PORTABLE = Object.freeze([...])` or `= [...]`. */
function portableNames(declaration) {
  if (declaration.id.type !== 'Identifier' || !/PORTABLE$/u.test(declaration.id.name) || !declaration.init) return [];
  const array = declaration.init.type === 'CallExpression' ? declaration.init.arguments[0] : declaration.init;
  if (!array || array.type !== 'ArrayExpression') return [];
  return array.elements.filter((e) => e && e.type === 'Literal').map((e) => e.value);
}

/**
 * Every file that may use an export, as `{ absolute, text, code() }`: `code()` is the text with its
 * comments removed, parsed once and only when the raw text names an export, so the scan stays fast.
 */
function readers() {
  const files = READERS.flatMap((dir) => walk(path.join(ROOT, dir))).concat([path.join(ROOT, 'index.js')])
    .filter((f) => !f.split(path.sep).includes('node_modules') && !f.split(path.sep).includes('vendor'))
    .filter((f) => /\.(?:js|cjs|mjs|ts)$/u.test(f) || !path.basename(f).includes('.'))
    .filter((f) => f !== __filename);
  return files.map((absolute) => reader(absolute, fs.readFileSync(absolute, 'utf8')));
}

function reader(absolute, text) {
  let code = null;
  return {
    absolute,
    text,
    code() {
      if (code === null) code = absolute.endsWith('.js') ? withoutComments(text, absolute) : text;
      return code;
    },
  };
}

/** A file the linter's parser refuses (none today) is read as it is. */
function withoutComments(text, filename) {
  try { return codeOf(text, filename); } catch { return text; }
}

const word = (name) => new RegExp(`(?<![\\w$])${name.replace(/\$/gu, '\\$')}(?![\\w$])`, 'u');

/** `<module>#<name>` for every export no other reader names, PORTABLE and documented names left out. */
function unusedExports(modules, corpus, documented) {
  const unused = [];
  for (const m of modules) {
    const { names, portable } = exportsOf(m.text, m.rel);
    for (const name of names) {
      if (portable.has(name)) continue;
      const pattern = word(name);
      if (pattern.test(documented)) continue;
      if (corpus.some((r) => r.absolute !== m.absolute && pattern.test(r.text) && pattern.test(r.code()))) continue;
      unused.push(`${m.rel}#${name}`);
    }
  }
  return unused;
}

const MODULES = sources();
const CORPUS = readers();

test('every export of a src/ module is used outside it, or is PORTABLE, or is documented', () => {
  assert.deepStrictEqual(unusedExports(MODULES, CORPUS, DOCUMENTED), [],
    'drop these from module.exports, or use or document them');
});

test('the scan catches a planted export that nothing uses, and passes it once a reader names it', () => {
  const host = MODULES.find((m) => m.rel === 'src/knowledge/links.js');
  assert.ok(host, 'src/knowledge/links.js is not among the sources');
  const name = 'agscPlantedNeverUsed';
  // A second `module.exports = { … }` is read like the first: the scan collects both.
  const text = `${host.text}\nfunction ${name}() { return 1; }\nmodule.exports = { ${name} };\n`;
  const modules = MODULES.map((m) => (m === host ? { ...m, text } : m));
  assert.deepStrictEqual(unusedExports(modules, CORPUS, DOCUMENTED), [`src/knowledge/links.js#${name}`]);
  const user = reader(path.join(ROOT, 'tests', 'probe.js'), `require('x').${name}();`);
  assert.deepStrictEqual(unusedExports(modules, [...CORPUS, user], DOCUMENTED), []);
  assert.deepStrictEqual(unusedExports(modules, CORPUS, `${DOCUMENTED}\n\`${name}\``), [], 'a documented name is exempt');
});

test('a name in a PORTABLE list is exempt, and a name only a comment of another file mentions is not used', () => {
  const rel = 'src/probe.js';
  const probe = { absolute: path.join(ROOT, rel), rel,
    text: "const PORTABLE = Object.freeze(['emitted']);\nfunction emitted() {}\nfunction hidden() {}\nmodule.exports = { PORTABLE, emitted, hidden };\n" };
  const user = reader(path.join(ROOT, 'tests', 'probe.test.js'),
    "// hidden is named in a comment only\nrequire('../src/probe.js').PORTABLE;\n");
  assert.deepStrictEqual(unusedExports([probe], [user], ''), ['src/probe.js#hidden']);
});
