// src/application/config/load.js — AGSC-09-09 / AGSC-01-37: configuration precedence.
//
// Precedence, highest first: flags > process environment >
// .env file > project configuration (agsc.config.json) > user configuration >
// schema defaults.
'use strict';

const env = require('./env.js');
const { buildOutFault } = require('../../knowledge/validate.js');

/**
 * Names that address JavaScript's object machinery rather than a configuration key.
 * Configuration is CLOSED (AGSC-01-18): none of them is a key of the schema, so the
 * config lane reports each as `AGSC-E004`; the merge never writes through them, so
 * `{"__proto__": {"x": 1}}` in `agsc.config.json` cannot set `Object.prototype.x` for
 * the whole engine process.
 */
const UNSAFE_SEGMENTS = Object.freeze(new Set(['__proto__', 'constructor', 'prototype']));

function setPath(obj, dottedPath, value) {
  const segs = dottedPath.split('.');
  if (segs.some((s) => UNSAFE_SEGMENTS.has(s))) return;
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!Object.prototype.hasOwnProperty.call(cur, s) || typeof cur[s] !== 'object' || cur[s] === null || Array.isArray(cur[s])) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}

/**
 * Merge one layer's plain object into `config`, recording the layer name as
 * the source of every leaf path it sets. An array is treated as an atomic
 * leaf (it replaces wholesale, never element-merges).
 */
function mergeLayer(config, sources, layerObj, layerName, prefix) {
  if (layerObj === undefined) return;
  if (layerObj === null || typeof layerObj !== 'object' || Array.isArray(layerObj)) {
    const p = prefix.join('.');
    setPath(config, p, layerObj);
    sources[p] = layerName;
    return;
  }
  for (const [k, v] of Object.entries(layerObj)) {
    if (UNSAFE_SEGMENTS.has(k)) continue;
    mergeLayer(config, sources, v, layerName, prefix.concat([k]));
  }
}

function coerce(rawValue, type) {
  if (type === 'boolean') {
    if (rawValue === 'true') return { ok: true, value: true };
    if (rawValue === 'false') return { ok: true, value: false };
    return { ok: false };
  }
  if (type === 'integer') {
    if (/^-?[0-9]+$/.test(rawValue)) return { ok: true, value: parseInt(rawValue, 10) };
    return { ok: false };
  }
  return { ok: true, value: rawValue };
}

/**
 * The reason a string an environment layer sets is refused, or `null`.
 * @param {string} name the AGSC_* name
 * @param {{path:string, type:string, pattern?:string}} desc
 * @param {*} value the coerced value
 * @returns {string|null}
 */
function grammarFault(name, desc, value) {
  if (typeof value !== 'string') return null;
  if (typeof desc.pattern === 'string' && !new RegExp(desc.pattern, 'u').test(value)) {
    return `${name}: ${JSON.stringify(value)} does not match the grammar of ${desc.path} (${desc.pattern})`;
  }
  if (desc.path === 'build.out') {
    const fault = buildOutFault(value);
    if (fault !== null) return `${name}: ${fault}`;
  }
  return null;
}

/**
 * AGSC-01-37: the message for an `AGSC_` name this engine does not know, naming the
 * layer it came from and the remedy.
 * @param {string} name the AGSC_* name
 * @param {string} layerName 'env' (the process environment) or 'dotenv' (the `.env` file)
 * @returns {string}
 */
function unknownNameMessage(name, layerName) {
  return layerName === 'dotenv'
    ? `${name} in the .env file is not a configuration name this engine knows; remove that line (AGSC-01-37)`
    : `environment variable ${name} is not a configuration name this engine knows; unset it (AGSC-01-37)`;
}

/**
 * Apply one env-style layer (a Map<AGSC_name, rawStringValue>) on top of
 * `config`/`sources`/`credentials`, per AGSC-01-37's addressing rules.
 * Returns the list of recognised AGSC_* names this layer actually touched
 * (env-name level, for AGSC-09-10's "overrides in effect" reporting).
 */
function applyEnvLayer(config, sources, credentials, findings, entries, layerName) {
  const touched = [];
  for (const [name, rawValue] of entries) {
    const desc = env.pathForEnvName(name);
    if (!desc) {
      // Recognised AGSC_ prefix but not a known key: AGSC-E004 (invalid/unknown
      // configuration key), reported as a finding, never applied. The message says
      // where the name came from and how to clear it, because the usual cause is a
      // shell variable the operator set for something else.
      findings.push({ code: 'AGSC-E004', message: unknownNameMessage(name, layerName), severity: 'error' });
      continue;
    }
    if (desc.kind === 'environment') {
      // AGSC-08-27: a feature flag, read by the lane that owns it and by
      // nothing else. It configures nothing, so it is not an override either.
      continue;
    }
    if (desc.kind === 'credential') {
      credentials.set(name, rawValue);
      touched.push(name);
      continue;
    }
    if (desc.kind === 'scalar') {
      const c = coerce(rawValue, desc.type);
      if (!c.ok) {
        findings.push({ code: 'AGSC-E204', message: `${name} does not match the ${desc.type} type of ${desc.path}`, severity: 'error', path: desc.path });
        continue;
      }
      // The value of a key meets that key's grammar whichever layer sets it
      // (AGSC-01-37): the schema `pattern`, and for `build.out` the rule that it
      // never names `content/` or `dist/` (AGSC-01-19). Checking the project file
      // alone would let `AGSC_BUILD_OUT=content` build into the source tree with
      // exit 0.
      const grammar = grammarFault(name, desc, c.value);
      if (grammar !== null) {
        findings.push({ code: 'AGSC-E204', message: grammar, severity: 'error', path: desc.path });
        continue;
      }
      setPath(config, desc.path, c.value);
      sources[desc.path] = layerName;
      touched.push(name);
      continue;
    }
    // agent / channel named-entry override
    const arrKey = desc.kind === 'agent' ? 'agents' : 'channels';
    if (!Array.isArray(config[arrKey])) config[arrKey] = [];
    let entry = config[arrKey].find((e) => e && e.name === desc.entryName);
    if (!entry) {
      entry = { name: desc.entryName };
      config[arrKey].push(entry);
    }
    const c = coerce(rawValue, desc.type);
    if (!c.ok) {
      findings.push({ code: 'AGSC-E204', message: `${name} does not match the ${desc.type} type of ${desc.key}`, severity: 'error' });
      continue;
    }
    entry[desc.key] = c.value;
    sources[`${arrKey}.${desc.entryName}.${desc.key}`] = layerName;
    touched.push(name);
  }
  return touched;
}

/**
 * load({root, ports, argvFlags, env: processEnv, dotenvText, checkBoundary}) ->
 *   { config, sources, findings, envOverrides, ignoredEnvNames }
 *
 * - root: the Bundle root; informational here (e.g. for a caller building
 *   other paths) — `ports` is expected to already be rooted at it
 *   (src/ports/filesystem.js: paths given to a FileSystem port are
 *   repository-relative, e.g. adapters/node-fs.js#createFileSystem(root)),
 *   so this function never joins `root` into a path itself.
 * - ports: { readFile(path) -> string|Buffer, exists(path) -> boolean } (a
 *   FileSystem port, or a subset of one, already rooted); OPTIONAL — a caller that already
 *   has the project config and/or dotenv text in hand may omit ports and
 *   pass `projectConfig` / `dotenvText` directly (used by the conformance
 *   area handlers, which build cases in memory with no real filesystem).
 * - projectConfig: OPTIONAL pre-loaded agsc.config.json object (bypasses ports).
 * - userConfig: OPTIONAL pre-loaded user configuration object.
 * - argvFlags: OPTIONAL {'dotted.path': rawStringValue} pre-parsed --flag overrides.
 * - env: OPTIONAL {NAME: value} snapshot of the process environment (never read
 *   from `process.env` directly here — the caller supplies it, AGSC-04-11's
 *   determinism discipline extended to configuration).
 * - dotenvText: OPTIONAL literal .env file contents (bypasses ports).
 *
 * - checkBoundary: OPTIONAL `(config) => Finding[]` — AGSC-11-01's range check
 *   over `federation{}`, `chunks{}`, `contribute[]`, `visibility` and
 *   `related[]`, reported as `AGSC-E209`. It is INJECTED, not imported:
 *   AGSC-11-01 belongs to the Boundary context
 *   (`boundary/visibility.js#checkBoundaryConfig`) and this module must be
 * able to run without it (`chunks.max_bytes` is
 *   never clamped by the emitter, it is refused here).
 *
 * `sources[path]` is one of 'flag'|'env'|'dotenv'|'project'|'user'|'default'.
 */
function load(options) {
  const opts = options || {};
  const ports = opts.ports;

  const config = {};
  const sources = {};
  const credentials = new Map();
  const findings = [];

  // 1. schema defaults (lowest precedence). config.schema.json is frozen at
  // the current tag and does not carry a literal JSON-Schema `default` for
  // three keys the spec prose nonetheless defaults (a schema gap). Applied
  // here, explicitly, so the engine behaves per the spec today regardless
  // of the schema gap:
  //   - AGSC-01-19: `build.out` MUST default to "www".
  //   - AGSC-01-18: `i18n.default` defaults to "en".
  //   - AGSC-09-94 (AGSC-01-18 "run{enabled,...} required... enabled default
  //     false"): `run.enabled` defaults to false.
  // `build.feed` gets no default: it is a name reserved to 1.1 that a 1.0 tool
  // refuses in a configuration file (AGSC-00-20, AGSC-06-01), and nothing reads it.
  const PROSE_DEFAULTS = [
    ['build.out', 'www'], // AGSC-01-19
    ['i18n.default', 'en'], // AGSC-01-18
    ['run.enabled', false], // AGSC-09-94, AGSC-01-18
  ];
  for (const [p, v] of env.allDefaults()) {
    setPath(config, p, v);
    sources[p] = 'default';
  }
  for (const [p, v] of PROSE_DEFAULTS) {
    if (!(p in sources)) {
      setPath(config, p, v);
      sources[p] = 'default';
    }
  }

  // 2. user configuration — no Bundle-rooted FileSystem port can reach a
  // path outside the Bundle root (src/ports/filesystem.js: paths are
  // repository-relative, an escaping path is AGSC-E902), so a real
  // per-user configuration file (if one is ever specified) needs its own,
  // unrestricted access; only the pre-loaded object form is supported here
  //
  const userConfig = opts.userConfig;
  if (userConfig) mergeLayer(config, sources, userConfig, 'user', []);

  // 3. project configuration (agsc.config.json). Paths given to `ports` are
  // repository-relative (src/ports/filesystem.js) — root is where the port
  // itself is rooted (e.g. adapters/node-fs.js#createFileSystem(root)),
  // never re-joined here.
  let projectConfig = opts.projectConfig;
  if (projectConfig === undefined && ports) {
    try {
      if (!ports.exists || ports.exists('agsc.config.json')) {
        projectConfig = JSON.parse(String(ports.readFile('agsc.config.json')));
      }
    } catch (e) {
      projectConfig = undefined;
    }
  }
  if (projectConfig) mergeLayer(config, sources, projectConfig, 'project', []);

  // 4. .env file (repository-relative, see above)
  let dotenvText = opts.dotenvText;
  if (dotenvText === undefined && ports) {
    if (ports.exists && ports.exists('.env')) {
      dotenvText = String(ports.readFile('.env'));
    }
  }
  let ignoredEnvNames = [];
  let dotenvTouched = [];
  if (typeof dotenvText === 'string') {
    const parsed = env.parseDotenv(dotenvText);
    ignoredEnvNames = parsed.ignored;
    dotenvTouched = applyEnvLayer(config, sources, credentials, findings, parsed.entries, 'dotenv');
  }

  // 5. process environment (AGSC_* names only)
  const processEnv = opts.env || {};
  const envEntries = new Map();
  for (const [k, v] of Object.entries(processEnv)) {
    if (/^AGSC_[A-Z0-9_]+$/.test(k)) envEntries.set(k, String(v));
  }
  const envTouched = applyEnvLayer(config, sources, credentials, findings, envEntries, 'env');

  // 6. flags (highest precedence)
  const argvFlags = opts.argvFlags || {};
  const flagTouched = [];
  for (const [p, rawValue] of Object.entries(argvFlags)) {
    const name = env.envNameFor(p);
    const desc = name ? env.pathForEnvName(name) : null;
    const type = desc && desc.kind === 'scalar' ? desc.type : 'string';
    const c = coerce(String(rawValue), type);
    setPath(config, p, c.ok ? c.value : rawValue);
    sources[p] = 'flag';
    if (name) flagTouched.push(name);
  }

  // overrides_in_effect: every AGSC_* name that actually influenced the
  // resolved config or credentials, i.e. every name touched by the dotenv,
  // env or flag layers (project/user/default are not "overrides" in the
  // AGSC-01-37 sense — they are the configuration being overridden).
  const envOverrides = Array.from(new Set([...dotenvTouched, ...envTouched, ...flagTouched])).sort();

  // 7. AGSC-11-01 / AGSC-E209: the boundary chapter's ranges, over the RESOLVED
  // configuration — an override that puts a value out of range is as invalid as
  // an authored one.
  if (typeof opts.checkBoundary === 'function') {
    for (const f of opts.checkBoundary(config)) findings.push(f);
  }

  return { config, sources, findings, envOverrides, ignoredEnvNames, credentials };
}

/** The layers of AGSC-01-37 that override the configuration file (AGSC-09-09's order). */
const OVERRIDE_LAYERS = new Set(['dotenv', 'env', 'flag']);
/** The arrays whose named entries an override addresses (`AGSC_AGENT_<NAME>_<KEY>`, env.js). */
const NAMED_ENTRIES = Object.freeze(['agents', 'channels']);

/** The value at a dotted path of a plain object, or `undefined`. */
function valueAt(obj, segs) {
  let cur = obj;
  for (const s of segs) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, s)) return undefined;
    cur = cur[s];
  }
  return cur;
}

/**
 * AGSC-01-37 / AGSC-04-18: the configuration input of the build — `agsc.config.json`
 * with the environment overrides applied, and nothing else. Only the values an
 * override layer set (the `.env` file, the process environment, a flag) are taken
 * from the resolved configuration; the schema defaults and a user configuration are
 * not overrides and are not build inputs (AGSC-04-18 names four inputs), so a build
 * with no override is the build of the file alone, byte for byte. A named entry of
 * `agents[]` or `channels[]` is matched by `name`, and one the file does not hold is
 * added, in the resolved configuration's order. The file's object is never changed:
 * with no override it is returned as it is, otherwise a copy is.
 *
 * @param {object} file the parsed `agsc.config.json`
 * @param {{config?:object, sources?:object}} resolved the result of `load`
 * @returns {object}
 */
function withOverrides(file, resolved) {
  const sources = (resolved && resolved.sources) || {};
  const paths = Object.keys(sources).filter((p) => OVERRIDE_LAYERS.has(sources[p])).sort();
  if (paths.length === 0) return file;
  const out = JSON.parse(JSON.stringify(file || {}));
  const config = resolved.config || {};
  for (const p of paths) {
    const segs = p.split('.');
    if (!NAMED_ENTRIES.includes(segs[0])) setPath(out, p, valueAt(config, segs));
  }
  for (const key of NAMED_ENTRIES) {
    for (const entry of (Array.isArray(config[key]) ? config[key] : [])) {
      const keys = paths.filter((p) => p.startsWith(`${key}.${entry && entry.name}.`)).map((p) => p.split('.')[2]);
      if (keys.length === 0) continue;
      if (!Array.isArray(out[key])) out[key] = [];
      let target = out[key].find((e) => e && e.name === entry.name);
      if (target === undefined) {
        target = { name: entry.name };
        out[key].push(target);
      }
      for (const k of keys) target[k] = entry[k];
    }
  }
  return out;
}

module.exports = { load, withOverrides };
