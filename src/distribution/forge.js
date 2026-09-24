'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: `dist/forge/`.
 *
 * Implements AGSC-08-12 as amended at rc.5 (the third of the three
 * silently unmet MUSTs): "`ci` (AGSC-09-07) is the verb that compiles them, once per
 * run, into `dist/forge/` (a generated directory, AGSC-01-08 — never into
 * `build.out`, whose route set AGSC-06-01 closes, and never into `content/`,
 * AGSC-08-02)". The four `enforce[]` values and their targets:
 *
 *   `status-check` → `dist/forge/status-checks.json`  the check names the Bundle's
 *        `gate` items imply (AGSC-08-09), as a JCS-canonical array in code-point
 *        order. **These bytes are pinned by the rule** and are derived from nothing
 *        else.
 *   `hook`        → `dist/forge/pre-commit`
 *   `codeowner`   → `dist/forge/CODEOWNERS`
 *   `ruleset`     → `dist/forge/ruleset.json` (JCS-canonical)
 *
 * **What the rule does NOT pin, stated plainly.** For the last three it names the
 * target path and the determinism obligation and says nothing about the CONTENT, so
 * two conforming engines will emit different bytes for the same Bundle. The
 * derivations below are therefore this implementation's, documented here and
 * recorded on the specification items list rather than presented as the
 * rule's: `pre-commit` runs `agsc lint` and nothing else; `CODEOWNERS` assigns every
 * path to the forge logins of `channels[].owner` (AGSC-01-18), falling back to the
 * identifier of `bundle.operator`; `ruleset.json` carries the same check names under
 * one active branch rule.
 *
 * Drift (AGSC-08-12): "Where the repository already carries the corresponding file
 * and its bytes differ, `ci` MUST report the difference as `AGSC-E707` and MUST NOT
 * overwrite it." The corresponding file is the target path itself, so a second run
 * over an untouched tree is idempotent and a hand-edit is reported, never lost.
 * `AGSC-07-15` admits exactly one executable — the hook file — and this module emits
 * no other.
 *
 * Pure derivation plus one `write` that goes through the injected FileSystem port.
 */

const { canonicalize } = require('../knowledge/jcs.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');

/** AGSC-01-08: the generated directory, never `build.out` and never `content/`. */
const FORGE_DIR = 'dist/forge';

/** AGSC-08-12: the four values and the file each compiles to. */
const TARGETS = Object.freeze({
  codeowner: 'CODEOWNERS',
  hook: 'pre-commit',
  ruleset: 'ruleset.json',
  'status-check': 'status-checks.json',
});

/** AGSC-08-09: `level: L1` covers these two checks. */
const L1_CHECKS = Object.freeze(['links', 'schema']);
/** AGSC-08-09: `level: L2` adds these three. */
const L2_EXTRA = Object.freeze(['determinism', 'provenance', 'review']);

/**
 * AGSC-08-09: "A `gate` item's `checks[]` MUST compile to named required status
 * checks, one per value; `level: L1` covers `schema` and `links`, `level: L2` adds
 * `provenance`, `determinism` and `review`." The name of a check is its value —
 * "one per value" names no other mapping — and the level supplies the set a gate
 * item that declares no `checks[]` implies.
 *
 * @param {Array<object>} items every item of the Bundle, flattened.
 * @returns {Array<string>} the check names, code-point ordered, without repetition.
 */
function checkNames(items) {
  const names = new Set();
  for (const item of items || []) {
    if (item === null || typeof item !== 'object' || item.type !== 'gate') continue;
    const declared = Array.isArray(item.checks) ? item.checks.map(String) : null;
    const implied = declared === null || declared.length === 0
      ? [...L1_CHECKS, ...(item.level === 'L2' ? L2_EXTRA : [])]
      : declared;
    for (const name of implied) names.add(name);
  }
  return [...names].sort(compareCodePoint);
}

/** Every `enforce[]` value any `gate` item declares, code-point ordered. */
function enforcedValues(items) {
  const values = new Set();
  for (const item of items || []) {
    if (item === null || typeof item !== 'object' || item.type !== 'gate') continue;
    for (const value of Array.isArray(item.enforce) ? item.enforce : []) values.add(String(value));
  }
  return [...values].sort(compareCodePoint);
}

/**
 * The forge logins `CODEOWNERS` assigns. `channels[].owner` is a forge login
 * (AGSC-01-18); `bundle.operator` is a `human:<id>` actor string (AGSC-01-25) whose
 * identifier is used when no channel declares an owner. An empty result is not an
 * error: the file then assigns nothing and says so, rather than inventing a name.
 */
function owners(config) {
  const out = new Set();
  for (const channel of Array.isArray(config && config.channels) ? config.channels : []) {
    if (channel && typeof channel.owner === 'string' && channel.owner !== '') out.add(channel.owner);
  }
  if (out.size === 0) {
    const operator = (config && config.bundle && config.bundle.operator) || '';
    const id = String(operator).startsWith('human:') ? String(operator).slice('human:'.length) : '';
    if (id !== '') out.add(id);
  }
  return [...out].sort(compareCodePoint);
}

/** The four artefacts, as text, for the values a Bundle actually enforces. */
function compile(items, config) {
  const names = checkNames(items);
  const files = new Map();
  for (const value of enforcedValues(items)) {
    if (value === 'status-check') {
      files.set(TARGETS[value], `${canonicalize(names)}\n`);
    } else if (value === 'hook') {
      files.set(TARGETS[value], ['#!/bin/sh',
        '# GENERATED by `agsc ci` from a gate item\'s enforce[] (AGSC-08-12). Do not edit:',
        '# an edit is reported as AGSC-E707 on the next run and is never overwritten.',
        'set -e',
        'agsc lint', ''].join('\n'));
    } else if (value === 'codeowner') {
      const list = owners(config);
      files.set(TARGETS[value], ['# GENERATED by `agsc ci` (AGSC-08-12). Owners come from',
        '# channels[].owner, else bundle.operator (AGSC-01-18, AGSC-01-25).',
        list.length === 0
          ? '# No owner is declared in this Bundle, so no path is assigned.'
          : `* ${list.map((o) => `@${o}`).join(' ')}`, ''].join('\n'));
    } else if (value === 'ruleset') {
      files.set(TARGETS[value], `${canonicalize({
        enforcement: 'active',
        name: 'agsc',
        rules: { required_status_checks: names },
        target: 'branch',
      })}\n`);
    }
  }
  return new Map([...files.keys()].sort(compareCodePoint).map((k) => [k, files.get(k)]));
}

/**
 * AGSC-08-12: compile once per `ci` run, write what is absent, and report drift.
 *
 * @param {Array<object>} items flattened items.
 * @param {object} config `agsc.config.json`.
 * @param {object} ports `{fs}` — the Bundle-rooted FileSystem port.
 * @returns {{files:Map<string,string>, findings:Array<object>, written:Array<string>,
 *   drift:Array<string>}}
 */
function write(items, config, ports) {
  const files = compile(items, config);
  const findings = [];
  const written = [];
  const drift = [];
  const fs = ports && ports.fs;
  // A value the schema admits and this engine has no compiler for: AGSC-08-12's
  // second obligation ("`lint` MUST report an `enforce[]` value it cannot compile as
  // `AGSC-E707` as well"), stated here as a check so it cannot silently become true.
  for (const value of enforcedValues(items)) {
    if (TARGETS[value] === undefined) {
      findings.push(finding('AGSC-E707',
        `the enforce[] value "${value}" has no compilation target and cannot be compiled (AGSC-08-12)`,
        { file: 'content' }));
    }
  }
  if (files.size === 0 || !fs || typeof fs.writeFile !== 'function') {
    return { drift, files, findings, written };
  }
  for (const [name, text] of files) {
    const at = `${FORGE_DIR}/${name}`;
    let existing = null;
    try {
      if (typeof fs.exists === 'function' && fs.exists(at)) existing = String(fs.readFile(at, 'utf8'));
    } catch (e) {
      existing = null; // unreadable is "absent" for this purpose; the write reports itself
    }
    if (existing !== null && existing !== text) {
      drift.push(at);
      findings.push(finding('AGSC-E707',
        `${at} differs from the artefact this Bundle's enforce[] compiles to; it was NOT overwritten (AGSC-08-12)`,
        { file: at }));
      continue;
    }
    if (existing === text) continue;
    if (typeof fs.mkdirp === 'function') fs.mkdirp(FORGE_DIR);
    fs.writeFile(at, text);
    written.push(at);
  }
  return { drift, files, findings, written };
}

module.exports = {
  FORGE_DIR, L1_CHECKS, L2_EXTRA, TARGETS,
  checkNames, compile, enforcedValues, owners, write,
};
