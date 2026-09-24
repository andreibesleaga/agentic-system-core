'use strict';
/**
 * src/application/plugin-loader.js — the verbs' way to a plugin (AGSC-00-24).
 *
 * `plugins.js` holds the registries and the capability check; this module is what a
 * verb calls when the value of its selector flag is not one of the engine's own
 * names. It decides what the value is, resolves it, and hands it to the registry of
 * the kind the flag selects:
 *
 *   * a value that carries a protocol (`https:`, `file:`, `npm:`, `data:`, …) is
 *     refused with `AGSC-E905`, and nothing is resolved — no fetching, no cache;
 *   * a PATH (`./plugins/tsv.js`, `../x.js`, `/abs/x.js`, `C:\x.js`) is resolved
 *     against the Bundle root;
 *   * anything else that is a valid npm package name (`tsv-adapter`,
 *     `@acme/agsc-adapter`) is resolved as an INSTALLED package, looked up from the
 *     Bundle root the way Node looks up any package.
 *
 * A plugin that cannot be resolved or throws while loading is `AGSC-E901`; one whose
 * declaration fails the capability check is `AGSC-E004` and is not used. Nothing
 * here throws, reads the network or scans a directory.
 *
 * APPLICATION LAYER: resolving a module is host wiring, which no bounded context may
 * do.
 */

const path = require('node:path');

const plugins = require('./plugins.js');
const { finding } = require('../knowledge/validate.js');

/** An npm package name, scoped or not (lower case, the registry's own grammar). */
const PACKAGE_NAME = /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/u;

/** The grammar of a name a plugin gives itself: AGSC-01-10's slug grammar. */
const PLUGIN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * What a selector value is.
 * @param {*} specifier
 * @returns {'remote'|'path'|'package'|'invalid'}
 */
function classify(specifier) {
  const text = String(specifier == null ? '' : specifier);
  if (text === '') return 'invalid';
  if (plugins.isRemote(text)) return 'remote';
  if (/^(?:\.{1,2}(?:[/\\]|$)|[/\\]|[A-Za-z]:[/\\])/u.test(text)) return 'path';
  if (PACKAGE_NAME.test(text)) return 'package';
  return 'invalid';
}

/**
 * Resolve one selector value to an admitted plugin of `kind`.
 *
 * @param {string} kind one of AGSC-00-24's eight.
 * @param {string} specifier the flag's value.
 * @param {{root:string, specVersion:string, flag:string}} options `flag` names the
 *   selector in messages (`export --to`).
 * @returns {{plugin:(object|null), findings:Array<object>, missing:boolean}}
 *   `missing` is true when a package name resolved to nothing, so that a verb can
 *   answer an unknown bare name the way it always has.
 */
function load(kind, specifier, options) {
  const opts = options || {};
  const where = { file: '', severity: 'error' };
  const name = String(specifier == null ? '' : specifier);
  const kindOf = classify(name);
  if (kindOf === 'remote') {
    return {
      findings: [finding('AGSC-E905',
        `${opts.flag} ${JSON.stringify(name)} names a remote plugin; this engine loads a plugin from a`
        + ' local path or an installed package and never from the network (AGSC-04-03, AGSC-00-24)', where)],
      missing: false,
      plugin: null,
    };
  }
  if (kindOf === 'invalid') {
    return {
      findings: [finding('AGSC-E004',
        `${opts.flag} ${JSON.stringify(name)} is neither a path nor an npm package name (AGSC-00-24)`, where)],
      missing: false,
      plugin: null,
    };
  }
  const root = opts.root || '.';
  let resolved;
  if (kindOf === 'path') {
    resolved = path.resolve(root, name);
  } else {
    try {
      resolved = require.resolve(name, { paths: [path.resolve(root)] });
    } catch (e) {
      return { findings: [], missing: true, plugin: null };
    }
  }
  const registry = plugins.createRegistry(kind, { specVersion: opts.specVersion });
  const loaded = plugins.loadInto(registry, name, {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    resolveModule: () => require(resolved),
  });
  const findings = loaded.findings.map((f) => ({ ...f, file: '' }));
  if (!loaded.registered) return { findings, missing: false, plugin: null };
  if (!PLUGIN_NAME.test(String(loaded.plugin.name))) {
    return {
      findings: [finding('AGSC-E004',
        `the plugin at ${JSON.stringify(name)} calls itself ${JSON.stringify(String(loaded.plugin.name))};`
        + ' a plugin name follows the slug grammar of AGSC-01-10, because the engine writes under it', where)],
      missing: false,
      plugin: null,
    };
  }
  return { findings: [], missing: false, plugin: loaded.plugin };
}

/**
 * A path a plugin asked the engine to write: relative, inside the directory it is
 * joined to, no `..`, no backslash, no drive and no NUL. `null` when it is safe,
 * else the reason.
 * @param {*} rel
 * @returns {string|null}
 */
function unsafePath(rel) {
  const text = String(rel == null ? '' : rel);
  if (text === '') return 'an empty path';
  if (/[\\\0]/u.test(text) || /^[A-Za-z]:/u.test(text) || text.startsWith('/')) return 'not a relative path';
  if (text.split('/').some((part) => part === '..' || part === '.' || part === '')) return 'a path that leaves its directory';
  return null;
}

/**
 * Call a plugin hook, turning a throw into a registered finding (AGSC-E901).
 * @returns {{value:*, findings:Array<object>}}
 */
function call(plugin, hook, args, label) {
  if (typeof plugin[hook] !== 'function') {
    return {
      findings: [finding('AGSC-E004',
        `${label}: the ${plugin.kind} plugin "${plugin.name}" has no ${hook}() hook (docs/PLUGINS.md §4)`,
        { file: '', severity: 'error' })],
      value: null,
    };
  }
  try {
    return { findings: [], value: plugin[hook](...args) };
  } catch (e) {
    return {
      findings: [finding('AGSC-E901', `${label}: the plugin "${plugin.name}" failed: ${e && e.message}`,
        { file: '', severity: 'error' })],
      value: null,
    };
  }
}

/** The plugin's own findings, kept only when they carry a registered code. */
function pluginFindings(value) {
  const list = value && Array.isArray(value.findings) ? value.findings : [];
  return list.filter((f) => f && /^AGSC-E\d{3}$/u.test(String(f.code))).map((f) => ({
    code: String(f.code),
    file: f.file == null ? '' : String(f.file),
    message: String(f.message == null ? '' : f.message),
    severity: f.severity === 'warn' ? 'warn' : 'error',
  }));
}

/** A frozen, detached copy, so a plugin cannot change what the engine holds. */
function detached(value) {
  const copy = JSON.parse(JSON.stringify(value === undefined ? null : value));
  const freeze = (v) => {
    if (v !== null && typeof v === 'object') {
      Object.freeze(v);
      for (const k of Object.keys(v)) freeze(v[k]);
    }
    return v;
  };
  return freeze(copy);
}

module.exports = { PACKAGE_NAME, PLUGIN_NAME, call, classify, detached, load, pluginFindings, unsafePath };
