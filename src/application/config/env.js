// src/application/config/env.js — AGSC-01-37: the .env file and the AGSC_*
// environment mapping.
//
// This module reads schema/config.schema.json once, through the adapter that is
// the one door the schemas enter by (`adapters/node-fs.js#readSchemas`), to
// derive its name table mechanically (never hand-typed). Raw `.env` syntax is parsed by `dotenv@18.0.0` (`.parse()` only —
// never `.config()`, which would touch `process.env` itself); the AGSC_*
// name filtering, credential exclusion and AGSC-09-09 precedence stay this
// module's own (ADR-019: hand-write only what a library does not do).
'use strict';

const dotenv = require('dotenv');
const { readSchemas } = require('../../adapters/node-fs.js');

// AGSC-08-15 / AGSC-01-37: credentials are environment-only and never configuration keys.
const CREDENTIAL_NAMES = new Set(['AGSC_MODEL_API_KEY', 'AGSC_MODEL_BASE_URL']);

// AGSC-08-15 via AGSC-01-37: a tracked .env file is AGSC-E403 (raised by C's secrets lint;
// this module only exposes the code so the lint does not hand-type it).
const TRACKED_ENV_CODE = 'AGSC-E403';

const AGSC_NAME_RE = /^AGSC_[A-Z0-9_]+$/;

function isCredentialName(name) {
  return CREDENTIAL_NAMES.has(name);
}

/**
 * Resolve a $ref against the schema's own $defs (the only kind of $ref
 * config.schema.json uses, per knowledge/schema.js's documented subset).
 */
function resolveRef(schema, node) {
  if (!node || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string') {
    const m = /^#\/\$defs\/(.+)$/.exec(node.$ref);
    if (m && schema.$defs && schema.$defs[m[1]]) return schema.$defs[m[1]];
  }
  return node;
}

function leafType(schema, node) {
  const resolved = resolveRef(schema, node);
  if (resolved.type === 'boolean') return 'boolean';
  if (resolved.type === 'integer' || resolved.type === 'number') return 'integer';
  if (resolved.type === 'string') return 'string';
  // A bare `enum` (e.g. `visibility`) carries no `type` keyword; every enum
  // in config.schema.json is string-valued, so it is a scalar too.
  if (Array.isArray(resolved.enum)) return 'string';
  return null;
}

// name segments that get the special AGSC_AGENT_<NAME>_<KEY> / AGSC_CHANNEL_<NAME>_<KEY>
// treatment instead of the generic dotted-path walk (AGSC-01-37).
const NAMED_ENTRY_ARRAYS = {
  agents: 'AGENT',
  channels: 'CHANNEL',
};

let _table = null;

/**
 * Mechanically derive the AGSC_* <-> config-path table from config.schema.json.
 * Every scalar (string/boolean/integer) key reachable by walking nested `object`
 * properties gets one name; arrays and their contents are skipped by the generic
 * walk (agents[]/channels[] get the special per-entry treatment below; other
 * arrays — peers, tags.allowed, contribute, surfaces, related, releases{} — are
 * not individually addressable at 1.0, AGSC-01-37 names only "every scalar key").
 */
function buildTable() {
  if (_table) return _table;
  const schema = readSchemas().config;
  const nameToPath = new Map(); // AGSC_* name -> {path: 'a.b.c', type}
  const pathToName = new Map(); // 'a.b.c' -> AGSC_* name
  const pathToDefault = new Map(); // 'a.b.c' -> default value (only where the schema declares one)

  function walk(node, segs) {
    const resolved = resolveRef(schema, node);
    if (!resolved || typeof resolved !== 'object' || !resolved.properties) return;
    for (const [key, sub] of Object.entries(resolved.properties)) {
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTRY_ARRAYS, key) && segs.length === 0) {
        continue; // handled by the named-entry mapping, not the generic walk
      }
      const nextSegs = segs.concat([key]);
      const subResolved = resolveRef(schema, sub);
      const type = subResolved.type;
      if (type === 'object') {
        walk(sub, nextSegs);
      } else if (type === 'array') {
        continue;
      } else {
        const t = leafType(schema, sub);
        if (!t) continue;
        const name = 'AGSC_' + nextSegs.map((s) => s.toUpperCase()).join('_');
        const p = nextSegs.join('.');
        nameToPath.set(name, { path: p, type: t });
        pathToName.set(p, name);
        if (Object.prototype.hasOwnProperty.call(subResolved, 'default')) {
          pathToDefault.set(p, subResolved.default);
        }
      }
    }
  }
  walk(schema, []);

  // Per-entry key types for agents[] and channels[] (AGSC_AGENT_<NAME>_<KEY> etc.).
  const entryKeyTypes = {};
  for (const arrName of Object.keys(NAMED_ENTRY_ARRAYS)) {
    entryKeyTypes[arrName] = {};
    const arrSchema = schema.properties && schema.properties[arrName];
    const itemSchema = arrSchema && arrSchema.items;
    const props = itemSchema && itemSchema.properties;
    if (props) {
      for (const [key, sub] of Object.entries(props)) {
        const t = leafType(schema, sub);
        if (t) entryKeyTypes[arrName][key] = t;
      }
    }
  }

  _table = { nameToPath, pathToName, pathToDefault, entryKeyTypes };
  return _table;
}

/**
 * allDefaults() -> Map<'dotted.path', defaultValue> for every scalar key that
 * config.schema.json declares a default for (mechanically derived, never hand-typed).
 */
function allDefaults() {
  return new Map(buildTable().pathToDefault);
}

/**
 * envNameFor(path) -> the AGSC_* name for a dotted scalar config path
 * ('build.out' -> 'AGSC_BUILD_OUT'), or null if the path is not a generically
 * addressable scalar key.
 */
function envNameFor(configPath) {
  const t = buildTable();
  return t.pathToName.get(configPath) || null;
}

/**
 * pathForEnvName(name) -> a descriptor of what an AGSC_* name overrides:
 *   { kind: 'scalar', path: 'build.out', type: 'string' }
 *   { kind: 'agent'|'channel', entryName: 'editor', key: 'budget_usd_month', type: 'integer' }
 *   { kind: 'credential' }                          — AGSC_MODEL_API_KEY / _BASE_URL
 *   null                                             — unrecognised AGSC_* name
 */
/**
 * AGSC-08-27: `AGSC_FEATURE_LLM_REVIEW` is an ENVIRONMENT FEATURE FLAG, not a
 * configuration key — "no Bundle file, configuration key or PR content may
 * enable it". It is therefore recognised here and mapped to no path, so that
 * setting it is not reported as an unknown configuration key (AGSC-E004).
 * Added at integration.
 */
const ENVIRONMENT_ONLY_NAMES = Object.freeze(['AGSC_FEATURE_LLM_REVIEW']);

function pathForEnvName(name) {
  if (ENVIRONMENT_ONLY_NAMES.includes(name)) return { kind: 'environment' };
  if (isCredentialName(name)) return { kind: 'credential' };
  const t = buildTable();
  const scalar = t.nameToPath.get(name);
  if (scalar) return { kind: 'scalar', path: scalar.path, type: scalar.type };

  for (const [arrName, tag] of Object.entries(NAMED_ENTRY_ARRAYS)) {
    const prefix = `AGSC_${tag}_`;
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length); // '<NAME>_<KEY...>' in upper case with '_'
      const keys = Object.keys(t.entryKeyTypes[arrName] || {});
      // Longest matching key suffix wins (keys may themselves contain '_').
      let best = null;
      for (const key of keys) {
        const keyPart = '_' + key.toUpperCase();
        if (rest.endsWith(keyPart)) {
          const entryUpper = rest.slice(0, rest.length - keyPart.length);
          if (entryUpper.length > 0 && (!best || key.length > best.key.length)) {
            best = { key, entryUpper };
          }
        }
        // a key with no leading '_' boundary case: rest === key.toUpperCase() alone
        // is invalid (no entry name); skip.
      }
      if (best) {
        const entryName = best.entryUpper.toLowerCase().replace(/_/g, '-');
        return {
          kind: arrName === 'agents' ? 'agent' : 'channel',
          entryName,
          key: best.key,
          type: t.entryKeyTypes[arrName][best.key],
        };
      }
      return null;
    }
  }
  return null;
}

/**
 * parseDotenv(text) -> { entries: Map<name,value>, ignored: string[], findings: [] }
 *
 * Raw `NAME=value` tokenising is `dotenv@18.0.0`'s `parse()` (ADR-019;
 * a later line wins over an earlier one, comments and blank lines are
 * skipped — the object `dotenv.parse` returns already reflects that, since
 * a later key simply overwrites the earlier one). This module's own job,
 * per AGSC-01-37, is everything after that: only names matching
 * `^AGSC_[A-Z0-9_]+$` are kept in `entries`; every other assignment's name
 * is reported in `ignored`, in first-seen order (never in `entries`, never
 * printed with its value by a caller — AGSC-01-37 "names printed never
 * values"). `dotenv.parse` never touches `process.env` (only `.config()`
 * would); this function receives and returns plain data.
 */
function parseDotenv(text) {
  const raw = dotenv.parse(String(text)); // {NAME: value}, last line wins
  const entries = new Map();
  const ignored = [];
  for (const name of Object.keys(raw)) {
    if (AGSC_NAME_RE.test(name)) {
      entries.set(name, raw[name]);
    } else {
      ignored.push(name);
    }
  }
  return { entries, ignored, findings: [] };
}

module.exports = {
  TRACKED_ENV_CODE,
  isCredentialName,
  envNameFor,
  pathForEnvName,
  parseDotenv,
  allDefaults,
};
