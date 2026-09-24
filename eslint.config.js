'use strict';
// The clean-code gate: one linter, zero warnings (`npm run lint`).
//
//   Correctness  the recommended rules of ESLint.
//   Style        eslint-stylistic, set to the style the code already had, so
//                `npm run format` (eslint --fix) is the formatter.
//   Order        requires in three groups: Node built-ins, packages, then this
//                repository's own files.
//   Size         complexity and length budgets (see BUDGETS below). A budget is
//                the largest value measured when the gate was introduced,
//                rounded up; a change may lower one, never raise it silently.
//
// Everything runs offline; every plugin is a pinned devDependency.

const js = require('@eslint/js');
const globals = require('globals');
const stylistic = require('@stylistic/eslint-plugin');
const importX = require('eslint-plugin-import-x');

/** The extension-less command files, named one by one (a `dir/*` pattern would not match them). */
const COMMANDS = [
  'bin/agentic-system-core',
  'tools/bench', 'tools/count-artifacts', 'tools/gen-glossary', 'tools/gen-ns', 'tools/gen-spec-html',
  'tools/public-hygiene', 'tools/publish-set', 'tools/release', 'tools/rule-coverage',
  'tools/validate-diagrams', 'tools/validate-features', 'tools/validate-ontology',
  'tools/validate-schemas', 'tools/validate-spec', 'tools/validate-vectors', 'tools/validate-wellknown',
];

/**
 * Size budgets: [complexity, lines per function, nesting depth, parameters, lines per file].
 * Engine code (src/, bin/, tools/, index.js) and the tests are measured separately.
 */
const BUDGETS = {
  code: [150, 660, 7, 7, 1960],
  tests: [30, 210, 5, 6, 770],
};

function budgetRules([complexity, fnLines, depth, params, fileLines]) {
  return {
    complexity: ['warn', complexity],
    'max-lines-per-function': ['warn', { max: fnLines, skipBlankLines: false, skipComments: false, IIFEs: true }],
    'max-depth': ['warn', depth],
    'max-params': ['warn', params],
    'max-lines': ['warn', { max: fileLines, skipBlankLines: false, skipComments: false }],
  };
}

module.exports = [
  {
    ignores: [
      'node_modules/', 'GABBE/', 'dist/', 'www/', 'coverage/',
      'tests/vectors/', 'tests/fixtures/', 'tests/acceptance/bundle/',
      'internet-draft/', 'w3c/', 'w3id/', 'docs/', 'spec/', 'schema/', 'ontology/', 'features/',
      'bench/corpus/', 'bench/queries/',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', ...COMMANDS],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    plugins: { '@stylistic': stylistic, 'import-x': importX },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true, caughtErrors: 'none' }],
      // Off on purpose: the engine names control characters in order to refuse them
      // (AGSC-01-14, AGSC-02-24), so every such pattern is deliberate.
      'no-control-regex': 'off',
      'import-x/order': ['warn', { groups: ['builtin', 'external', ['parent', 'sibling', 'index']] }],
      '@stylistic/indent': ['warn', 2, { SwitchCase: 1, flatTernaryExpressions: true, ignoredNodes: ['ConditionalExpression'] }],
      '@stylistic/quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
      '@stylistic/semi': ['warn', 'always'],
      '@stylistic/semi-spacing': 'warn',
      '@stylistic/comma-dangle': ['warn', 'always-multiline'],
      '@stylistic/comma-spacing': 'warn',
      '@stylistic/key-spacing': 'warn',
      '@stylistic/keyword-spacing': 'warn',
      '@stylistic/space-before-blocks': 'warn',
      '@stylistic/space-infix-ops': 'warn',
      '@stylistic/space-in-parens': 'warn',
      '@stylistic/object-curly-spacing': ['warn', 'always'],
      '@stylistic/array-bracket-spacing': ['warn', 'never'],
      '@stylistic/arrow-parens': ['warn', 'always'],
      '@stylistic/arrow-spacing': 'warn',
      '@stylistic/brace-style': ['warn', '1tbs', { allowSingleLine: true }],
      '@stylistic/no-trailing-spaces': 'warn',
      '@stylistic/no-tabs': 'warn',
      '@stylistic/no-mixed-spaces-and-tabs': 'warn',
      '@stylistic/no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 0 }],
      '@stylistic/eol-last': 'warn',
      '@stylistic/linebreak-style': ['warn', 'unix'],
      ...budgetRules(BUDGETS.code),
    },
  },
  {
    files: ['tests/**/*.js', 'bench/**/*.js', 'examples/**/*.js'],
    rules: budgetRules(BUDGETS.tests),
  },
  {
    // The page tools' function SOURCE TEXT is emitted into every published node
    // (`/compose/agsc-page-tools.js`), so an edit to it changes published bytes.
    files: ['src/distribution/page-tools.js'],
    rules: { 'no-useless-assignment': 'off' },
  },
  {
    // Functions these files hand to a browser page (`page.evaluate`) run there.
    files: ['tests/e2e/browser.test.js', 'tests/e2e/modes/browser.test.js', 'bench/a11y.js'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly' } },
  },
];
