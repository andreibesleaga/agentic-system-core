// src/application/config/load.js — AGSC-09-09 / AGSC-01-37: configuration precedence.
//
// Precedence, highest first: flags > process environment >
// .env file > project configuration (agsc.config.json) > user configuration >
// schema defaults.
'use strict';

const env = require('./env.js');

function setPath(obj, dottedPath, value) {
  const segs = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (typeof cur[s] !== 'object' || cur[s] === null || Array.isArray(cur[s])) cur[s] = {};
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
      // configuration key), reported as a finding, never applied.
      findings.push({ code: 'AGSC-E004', message: `unknown configuration override ${name}`, severity: 'error' });
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
 * able to run without it (2026-09-18 — `chunks.max_bytes` is
 *   never clamped by the emitter, it is refused here).
 *
 * `sources[path]` is one of 'flag'|'env'|'dotenv'|'project'|'user'|'default'.
 */
function load(options) {
  const opts = options || {};
  const ports = opts.ports;
  const root = opts.root;

  const config = {};
  const sources = {};
  const credentials = new Map();
  const findings = [];

  // 1. schema defaults (lowest precedence). config.schema.json is frozen at
  // the current tag and does not carry a literal JSON-Schema `default` for
  // four keys the spec prose nonetheless defaults (reported as a schema
  // defect, fixed at the next release candidate — report). Applied
  // here, explicitly, so the engine behaves per the spec today regardless
  // of the schema gap:
  //   - AGSC-01-19: `build.out` MUST default to "www".
  //   - spec/06-surfaces.md ("/feed.xml is emitted only when build.feed is
  //     true (default true)"): `build.feed` defaults to true — NOTE this
  //     corrects the coordinator's 2026-09-18 instruction, which stated
  //     "build.feed false"; the specification text is the authoritative
  //     value per project rule 6 ("the specification is the truth"), and it
  //     is unambiguous here.
  //   - AGSC-01-18: `i18n.default` defaults to "en".
  //   - AGSC-09-94 (AGSC-01-18 "run{enabled,...} required... enabled default
  //     false"): `run.enabled` defaults to false.
  const PROSE_DEFAULTS = [
    ['build.out', 'www'], // AGSC-01-19
    ['build.feed', true], // spec/06-surfaces.md ("default true")
    ['i18n.default', 'en'], // AGSC-01-18
    ['run.enabled', false] // AGSC-09-94, AGSC-01-18
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

module.exports = { load };
