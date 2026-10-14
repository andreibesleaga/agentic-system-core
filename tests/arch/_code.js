'use strict';
// The code of a module as the architecture tests read it: parsed by the pinned
// linter's parser (a devDependency), never executed. Two things follow from parsing
// instead of matching lines:
//
//   - every comment is removed, the one at the end of a line of code as well as the
//     one on a line of its own, so a comment may NAME what the code may not do;
//   - a `//` inside a string (a URL) is not a comment, so it cannot hide the code
//     that follows it on the same line.
//
// `requiresOf` lists the modules a file loads by a literal name, in any quote style,
// through `require(…)` or `import(…)`. A computed name is left to
// `context-fitness.test.js`, which refuses it in every bounded context.

const { builtinModules } = require('node:module');
const { Linter } = require('eslint');

const PARSE = [{
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
}];

/** Parsed trees by source text: every test of a run reads the same modules. */
const TREES = new Map();

/** The syntax tree of one module, with its comments; a module that does not parse is an error. */
function parse(text, filename = 'probe.js') {
  if (TREES.has(text)) return TREES.get(text);
  const linter = new Linter({ configType: 'flat' });
  const fatal = linter.verify(text, PARSE, { filename }).find((m) => m.fatal === true);
  if (fatal) throw new Error(`${filename}:${fatal.line} does not parse: ${fatal.message}`);
  const tree = linter.getSourceCode().ast;
  TREES.set(text, tree);
  return tree;
}

/** The text with every comment replaced by spaces (line breaks kept, so line numbers hold). */
function codeOf(text, filename) {
  let out = '';
  let at = 0;
  for (const { range: [start, end] } of parse(text, filename).comments) {
    out += text.slice(at, start) + text.slice(start, end).replace(/[^\n]/gu, ' ');
    at = end;
  }
  return out + text.slice(at);
}

/** A string literal's value, or a template's when it has no `${…}`; otherwise null. */
function literal(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

/** Every module name loaded by a literal `require(…)` or `import(…)`, in source order. */
function requiresOf(text, filename) {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const name = literal(node.arguments[0]);
      if (name !== null) found.push(name);
    }
    if (node.type === 'ImportExpression') {
      const name = literal(node.source);
      if (name !== null) found.push(name);
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'parent' && key !== 'loc' && key !== 'range' && child && typeof child === 'object') visit(child);
    }
  };
  visit(parse(text, filename).body);
  return found;
}

/** The Node built-in a specifier names (`fs` for both `fs` and `node:fs`), or null. */
function builtinOf(specifier) {
  const bare = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  const top = bare.split('/')[0];
  if (builtinModules.includes(specifier) || builtinModules.includes(bare) || builtinModules.includes(top)) return top;
  return null;
}

module.exports = { parse, codeOf, requiresOf, builtinOf };
