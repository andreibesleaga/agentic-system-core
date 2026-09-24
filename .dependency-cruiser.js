'use strict';
// The dependency rule, checked by a tool (`npm run arch`), beside the text-level
// architecture tests in tests/arch/. docs/ARCHITECTURE-DDD.md §2 is the map:
//
//   shared       -> nothing                       (the shared kernel)
//   knowledge    -> knowledge, shared
//   governance   -> knowledge, governance, ports, shared
//   composition  -> knowledge, composition, ports, shared
//   boundary     -> knowledge, boundary, ports, shared
//   interchange  -> knowledge, governance, interchange, ports, shared
//   distribution -> knowledge, governance, composition, boundary, distribution, ports, shared
//   application  -> everything, adapters included (the only layer that wires)
//   adapters     -> ports, adapters, shared
//
// Every rule below is an error: a violation fails the gate.

const CONTEXTS = {
  shared: [],
  knowledge: ['knowledge', 'shared'],
  governance: ['knowledge', 'governance', 'ports', 'shared'],
  composition: ['knowledge', 'composition', 'ports', 'shared'],
  boundary: ['knowledge', 'boundary', 'ports', 'shared'],
  interchange: ['knowledge', 'governance', 'interchange', 'ports', 'shared'],
  distribution: ['knowledge', 'governance', 'composition', 'boundary', 'distribution', 'ports', 'shared'],
  adapters: ['ports', 'adapters', 'shared'],
  ports: [],
};

/** Node built-ins each part of src/ may use; everything that touches the host goes through a port. */
const BUILTINS = {
  // AGSC-04-03: the pure contexts hash, and nothing else.
  'knowledge|governance|composition|interchange|distribution|shared': ['crypto'],
  // The boundary classifies addresses and host names; it opens no connection.
  boundary: ['crypto', 'net', 'url'],
};

const contextRules = Object.entries(CONTEXTS).map(([from, allowed]) => ({
  name: `context-${from}`,
  comment: `src/${from}/ may require only ${allowed.length ? allowed.join(', ') : 'nothing inside src/'} (docs/ARCHITECTURE-DDD.md §2)`,
  severity: 'error',
  from: { path: `^src/${from}/` },
  to: { path: '^src/', pathNot: allowed.length ? `^src/(${allowed.join('|')})/` : '^$' },
}));

const builtinRules = Object.entries(BUILTINS).map(([from, allowed]) => ({
  name: `builtins-${from.split('|')[0]}`,
  comment: `src/(${from})/ may use only these Node built-ins: ${allowed.join(', ')}; the rest reach the host through a port`,
  severity: 'error',
  from: { path: `^src/(${from})/` },
  to: { dependencyTypes: ['core'], pathNot: `^(node:)?(${allowed.join('|')})$` },
}));

module.exports = {
  forbidden: [
    ...contextRules,
    ...builtinRules,
    {
      name: 'adapters-wired-by-application-only',
      comment: 'only src/application/ and bin/ construct an adapter; a bounded context receives a port',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(application|adapters)/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'interchange-distribution-apart',
      comment: 'Interchange (import/export) and Distribution (the published node) meet only in the application layer',
      severity: 'error',
      from: { path: '^src/(interchange|distribution)/' },
      to: { path: '^src/(interchange|distribution)/', pathNot: '^src/$1/' },
    },
    {
      name: 'plugins-loaded-never-required',
      comment: 'a plugin is loaded through src/application/plugin-loader.js by path; no module requires a sample plugin or a checker',
      severity: 'error',
      from: { path: '^(src|bin)/|^index\\.js$' },
      to: { path: '^(examples|tools|plugins)/' },
    },
    {
      name: 'no-dev-dependency-at-run-time',
      comment: 'the engine runs on its dependencies only; devDependencies serve the tests and the gates',
      severity: 'error',
      from: { path: '^(src|bin)/|^index\\.js$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-undeclared-package',
      comment: 'every package the engine requires is declared, pinned, in package.json',
      severity: 'error',
      from: { path: '^(src|bin)/|^index\\.js$' },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown', 'undetermined'] },
    },
    {
      name: 'no-unresolvable',
      comment: 'every require resolves',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      comment: 'the require graph has no cycle',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'every module under src/ is reachable (the port typedefs are documentation and required by nothing)',
      severity: 'error',
      from: { orphan: true, path: '^src/', pathNot: '^src/ports/' },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(node_modules|GABBE|tests/vectors|tests/fixtures)/' },
    moduleSystems: ['cjs'],
    combinedDependencies: false,
    // Two pinned libraries publish ES modules only; Node >= 22.13 requires them
    // (require(esm)), so the resolver reads their `import` export condition too.
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['require', 'node', 'import', 'default'] },
  },
};
