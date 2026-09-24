'use strict';
/**
 * src/application/plugins.js — the engine's PLUGIN CONTRACT.
 *
 * AGSC-00-24 closes the extension points of this format at EIGHT kinds and says
 * that "a capability that is none of them is a change to this specification, not a
 * plugin". This module is the engine's side of that sentence: one registry per
 * kind, one place that says what each kind may read, may emit and may never do, and
 * one capability check every plugin passes before it is registered.
 *
 * APPLICATION LAYER, deliberately. A plugin is host wiring — a module resolved from
 * a path or a package name — and no bounded context may resolve a module. The rules
 * the registries enforce are the specification's; the resolution is this layer's.
 *
 * THREE PROPERTIES THIS MODULE GUARANTEES
 *
 *  1. **Nothing is auto-loaded from the network.** A specifier that names a
 *     protocol is refused with `AGSC-E905`, the code AGSC-04-03 already uses for a
 *     network access this node refuses. A plugin arrives as a local path or an npm
 *     package name a person installed, and from nowhere else.
 *  2. **A mismatch is a registered finding, never a crash.** A plugin declares the
 *     specification version and the plugin-API version it targets; a plugin that
 *     targets a version this engine does not implement — or that is malformed, or
 *     that claims a kind this specification does not define — is `AGSC-E004`, the
 *     code AGSC-00-20 and AGSC-01-22 already use for "a version this tool does not
 *     claim", and the registry answers with a Finding and keeps running.
 *  3. **The contract is additive within 1.x.** A row of `KINDS` may gain a member
 *     and a new kind may NOT be added, because the kind list is the
 *     specification's and closed (AGSC-00-24). `PLUGIN_API_VERSION` moves MINOR for
 *     an addition and MAJOR only with the specification's own MAJOR.
 *
 * `docs/PLUGINS.md` is the prose of this file: how to write one of the eight, what
 * it may do, how it is discovered and what this engine promises about it.
 */

const { finding } = require('../knowledge/validate.js');

/**
 * The version of THIS contract — the shapes below, the registry's behaviour and
 * the names a plugin declares. Additive within 1.x: a plugin written against 1.0
 * keeps working against every 1.x engine, and an engine refuses a plugin that
 * targets a MINOR it does not implement rather than running it half-understood.
 */
const PLUGIN_API_VERSION = '1.0.0';

/**
 * AGSC-00-24's eight kinds, each with the selector that names one, and the three
 * universal obligations resolved for that row.
 *
 *   `selector`  where a name for this kind comes from — the ONE place this
 *               specification admits, so that nothing is discovered by scanning a
 *               directory or by reading an environment variable.
 *   `network`   `false` means no plugin of this kind may reach the network at all;
 *               `'ci'` means only in the CI lane, where AGSC-04-03 admits the
 *               Network port. No row grants it during `build`, `lint`, `verify`
 *               or `ci`'s own gates (AGSC-04-03, AGSC-08-30).
 *   `emits`     the outputs a plugin of this kind may write, and no others. Never
 *               inside `content/`, never outside the Bundle root, never through a
 *               link (AGSC-08-02, AGSC-01-16, AGSC-01-35).
 *   `reads`     what it is given. A plugin reads its inputs and not the Bundle.
 *   `never`     stated positively so that a reader of one row learns the limit
 *               without reading the whole specification.
 *   `rules`     the rules that own this row; a difference between a row and the
 *               kind's own rule is settled by the rule (AGSC-00-24's own words).
 */
const KINDS = Object.freeze({
  'memory-adapter': Object.freeze({
    emits: Object.freeze(['dist/export/<form>/**', 'the items an import writes']),
    network: false,
    never: 'change an item\'s authored bytes, or invent prov it did not receive',
    reads: Object.freeze(['the published projection', 'the foreign corpus it is given']),
    rules: Object.freeze(['AGSC-01-26a', 'AGSC-01-22', 'AGSC-09-09']),
    selector: 'export --to <name> / import --from <name>',
  }),
  'channel-adapter': Object.freeze({
    emits: Object.freeze(['a Proposal under dist/', 'a diagnostic']),
    network: 'ci',
    never: 'write into content/, or merge anything by itself',
    reads: Object.freeze(['the Proposal it is given', 'its own configuration entry']),
    rules: Object.freeze(['AGSC-01-30', 'AGSC-08-30']),
    selector: 'channels[].adapter in agsc.config.json',
  }),
  'forge-shim': Object.freeze({
    emits: Object.freeze(['a workflow file under the forge\'s own directory']),
    network: false,
    never: 'read a credential, or write anything the Gate did not ask for',
    reads: Object.freeze(['a gate item\'s enforce[]']),
    rules: Object.freeze(['AGSC-08-12']),
    selector: 'a gate item\'s enforce[]',
  }),
  'deployment-profile': Object.freeze({
    emits: Object.freeze(['the host\'s own header and redirect files']),
    network: false,
    never: 'change the route set of AGSC-06-01 or the bytes of any route',
    reads: Object.freeze(['the emitted route set', 'the header sets of AGSC-06-17']),
    rules: Object.freeze(['AGSC-06-01', 'AGSC-09-01']),
    selector: 'the writer\'s own deployment target, stated in its conformance claim',
  }),
  surface: Object.freeze({
    emits: Object.freeze(['its own route', 'its rel#surface declaration']),
    network: false,
    never: 'declare a surface the node does not actually serve',
    reads: Object.freeze(['the published projection']),
    rules: Object.freeze(['AGSC-11-16', 'AGSC-11-02']),
    selector: 'derived from what the writer emits, or surfaces[] in agsc.config.json',
  }),
  'page-tool': Object.freeze({
    emits: Object.freeze(['its own answer to the caller, in the page']),
    network: false,
    never: 'reach the network, read a credential, or see an unpublished item',
    reads: Object.freeze(['the published projection the page holds']),
    rules: Object.freeze(['AGSC-09-16']),
    selector: 'registerTool() in the page',
  }),
  'composition-emitter': Object.freeze({
    emits: Object.freeze(['files OUTSIDE dist/harness/<name>/']),
    network: false,
    never: 'change the seven Harness file kinds, or add a file inside the Harness',
    reads: Object.freeze(['the seven files of AGSC-07-12']),
    rules: Object.freeze(['AGSC-07-18', 'AGSC-07-12']),
    selector: 'compose --emit <target>, from the closed registry of AGSC-07-18',
  }),
  checker: Object.freeze({
    emits: Object.freeze(['the AGSC-09-11 diagnostic envelope, on stdout']),
    network: false,
    never: 'write a file, or pass over no input at all',
    reads: Object.freeze(['the distribution\'s own files']),
    rules: Object.freeze(['AGSC-09-90', 'AGSC-09-91', 'AGSC-09-92']),
    selector: 'one of the nine of AGSC-09-90',
  }),
});

/** The eight names, in the order AGSC-00-24 states them. */
const KIND_NAMES = Object.freeze(Object.keys(KINDS));

/** The members every plugin of every kind declares. */
const REQUIRED_MEMBERS = Object.freeze(['kind', 'name', 'agsc_spec_version', 'plugin_api_version']);

/** The MAJOR and MINOR of a SemVer-shaped version, or `null`. */
function majorMinor(version) {
  const m = /^(\d+)\.(\d+)\./u.exec(String(version == null ? '' : version));
  return m === null ? null : { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * AGSC-00-15's compatibility, applied to a declaration: the same MAJOR, and a
 * MINOR no greater than the one the host implements.
 *
 * @param {*} declared the version the plugin targets.
 * @param {string} implemented the version this host implements.
 * @returns {boolean}
 */
function compatible(declared, implemented) {
  const want = majorMinor(declared);
  const have = majorMinor(implemented);
  if (want === null || have === null) return false;
  return want.major === have.major && want.minor <= have.minor;
}

/**
 * A specifier that names a protocol is not a plugin this engine will load. There
 * is no fetching, no cache and no fallback: a plugin is a file a person put on
 * this machine (AGSC-04-03, AGSC-08-30).
 *
 * @param {*} specifier
 * @returns {boolean}
 */
function isRemote(specifier) {
  // A scheme of at least TWO characters, so that a Windows drive letter
  // (`C:\\plugins\\p.js`) stays a local path and `http:`, `https:`, `file:`,
  // `data:` and `npm:` do not.
  return /^[a-zA-Z][a-zA-Z0-9+.-]+:/u.test(String(specifier == null ? '' : specifier));
}

/**
 * The capability check every plugin passes BEFORE it is registered: the declared
 * shape, the kind, and the two versions it targets. Every fault is one Finding
 * with a registered code and nothing throws — a host that crashed on a bad plugin
 * would make the plugin's author the author of the host's failure mode.
 *
 * @param {*} plugin the module a specifier resolved to.
 * @param {{kind?:string, specVersion:string, pluginApiVersion?:string}} options
 * @returns {Array<object>} Findings; empty means the plugin may be registered.
 */
function admit(plugin, options) {
  const opts = options || {};
  const api = opts.pluginApiVersion === undefined ? PLUGIN_API_VERSION : opts.pluginApiVersion;
  const where = { file: 'agsc.config.json', severity: 'error' };
  if (plugin === null || typeof plugin !== 'object' || Array.isArray(plugin)) {
    return [finding('AGSC-E004',
      'a plugin must be an object declaring kind, name, agsc_spec_version and'
      + ' plugin_api_version (AGSC-00-24)', where)];
  }
  const out = [];
  for (const member of REQUIRED_MEMBERS) {
    if (plugin[member] === undefined || String(plugin[member]) === '') {
      out.push(finding('AGSC-E004',
        `a plugin must declare "${member}"; this one does not (AGSC-00-24)`, where));
    }
  }
  if (out.length > 0) return out;

  const kind = String(plugin.kind);
  if (!KIND_NAMES.includes(kind)) {
    out.push(finding('AGSC-E004',
      `"${kind}" is not one of the eight plugin kinds of AGSC-00-24`
      + ` (${KIND_NAMES.join(', ')}); a capability that is none of them is a change to the`
      + ' specification, not a plugin', where));
  } else if (opts.kind !== undefined && opts.kind !== kind) {
    out.push(finding('AGSC-E004',
      `this plugin declares kind "${kind}" and was offered to the "${opts.kind}" registry`,
      where));
  }
  if (!compatible(plugin.agsc_spec_version, opts.specVersion)) {
    out.push(finding('AGSC-E004',
      `the plugin targets specification version ${JSON.stringify(String(plugin.agsc_spec_version))},`
      + ` which this engine (${JSON.stringify(String(opts.specVersion))}) does not implement`
      + ' (AGSC-00-15, AGSC-00-20)', where));
  }
  if (!compatible(plugin.plugin_api_version, api)) {
    out.push(finding('AGSC-E004',
      `the plugin targets plugin-API version ${JSON.stringify(String(plugin.plugin_api_version))},`
      + ` which this engine (${JSON.stringify(String(api))}) does not implement; the plugin API is`
      + ' additive within 1.x, so a newer MINOR may use a hook this host does not offer', where));
  }
  return out;
}

/**
 * One registry, for one kind. `register` never throws: it answers the Findings of
 * the capability check, and a plugin with any Finding is NOT registered.
 *
 * @param {string} kind one of AGSC-00-24's eight.
 * @param {{specVersion:string, pluginApiVersion?:string}} options
 */
function createRegistry(kind, options) {
  const opts = options || {};
  const entries = new Map();
  const row = KINDS[kind];
  return {
    /** The row of AGSC-00-24 this registry enforces, as data. */
    contract: row === undefined ? null : row,
    /** Every registered plugin, in registration order. */
    entries: () => [...entries.values()],
    /** One registered plugin by name, or `undefined`. */
    get: (name) => entries.get(String(name)),
    kind,
    /** The registered names, in registration order. */
    names: () => [...entries.keys()],
    /**
     * @param {*} plugin
     * @returns {{registered:boolean, findings:Array<object>}}
     */
    register(plugin) {
      if (row === undefined) {
        return {
          findings: [finding('AGSC-E004',
            `"${kind}" is not one of the eight plugin kinds of AGSC-00-24`,
            { file: 'agsc.config.json', severity: 'error' })],
          registered: false,
        };
      }
      const findings = admit(plugin, {
        kind,
        pluginApiVersion: opts.pluginApiVersion,
        specVersion: opts.specVersion,
      });
      if (findings.length > 0) return { findings, registered: false };
      const name = String(plugin.name);
      if (entries.has(name)) {
        return {
          findings: [finding('AGSC-E004',
            `two plugins of kind "${kind}" both call themselves ${JSON.stringify(name)};`
            + ' a name selects exactly one (AGSC-00-24)',
            { file: 'agsc.config.json', severity: 'error' })],
          registered: false,
        };
      }
      entries.set(name, plugin);
      return { findings: [], registered: true };
    },
  };
}

/**
 * Resolve one specifier to a plugin and register it. Discovery is exactly two
 * shapes, both of them local:
 *
 *   * a path this Bundle names — `./plugins/my-adapter.js` — resolved against the
 *     Bundle root by the caller's `resolveModule`;
 *   * an npm package name a person installed — `@acme/agsc-adapter`.
 *
 * Anything carrying a protocol is `AGSC-E905`; a module that cannot be resolved or
 * that throws while loading is `AGSC-E901`, because a plugin that is not there is
 * an I/O fact and not a version fault. Nothing here reaches the network, and this
 * function never throws.
 *
 * @param {object} registry from `createRegistry`.
 * @param {string} specifier the path or package name.
 * @param {{resolveModule:(s:string)=>*}} options
 * @returns {{registered:boolean, findings:Array<object>, plugin:*}}
 */
function loadInto(registry, specifier, options) {
  const where = { file: 'agsc.config.json', severity: 'error' };
  const name = String(specifier == null ? '' : specifier);
  if (name === '') {
    return { findings: [finding('AGSC-E004', 'an empty plugin specifier names nothing', where)], plugin: null, registered: false };
  }
  if (isRemote(name)) {
    return {
      findings: [finding('AGSC-E905',
        `${JSON.stringify(name)} names a remote plugin; this engine loads a plugin from a local`
        + ' path or an installed package and never from the network (AGSC-04-03, AGSC-08-30)',
        where)],
      plugin: null,
      registered: false,
    };
  }
  let plugin;
  try {
    plugin = (options || {}).resolveModule(name);
  } catch (e) {
    return {
      findings: [finding('AGSC-E901',
        `the plugin ${JSON.stringify(name)} could not be loaded: ${e && e.message}`, where)],
      plugin: null,
      registered: false,
    };
  }
  const result = registry.register(plugin);
  return { findings: result.findings, plugin: result.registered ? plugin : null, registered: result.registered };
}

module.exports = {
  KINDS,
  KIND_NAMES,
  PLUGIN_API_VERSION,
  REQUIRED_MEMBERS,
  admit,
  compatible,
  createRegistry,
  isRemote,
  loadInto,
  majorMinor,
};
