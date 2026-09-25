'use strict';
// CONTEXT Distribution (Emission) — the `ci` use case: lint → build → verify.
// Implements AGSC-09-08 (the exit codes: 0 success, 1 findings or a non-reproducible
// build, 2 a usage or configuration fault), AGSC-04-02 (the build is run twice and
// the bytes compared), AGSC-02-92 (adoption's warnings never fail `ci`, so a folder
// of bare notes is green offline) and AGSC-08-27/08-30 (the `ci` lane contains no
// model call — nothing here can reach one).
//
// The four N9 lints are `governance/lint.js`, owned by another package of this
// milestone. They are INJECTED as `options.lint`; when neither an injected lint nor
// that module is present, `ci` still runs the schema-and-placement obligations that
// `knowledge/validate.js` owns — the AGSC-02-92 pass that `adopt-0006` asserts —
// and names the missing lane in its result rather than reporting a false green.

const { sortFindings } = require('../knowledge/validate.js');
const { canonicalize } = require('../knowledge/jcs.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const site = require('./site.js');
const forge = require('./forge.js');

/** AGSC-08-10: where `ci` writes the gate verdict. */
const GATE_FILE = 'dist/gate.json';

/** A finding of severity `error` is what fails a gate (AGSC-09-08, AGSC-09-11). */
function countOf(findings) {
  return {
    error: findings.filter((f) => f.severity !== 'warn').length,
    warn: filterWarn(findings).length,
  };
}

/**
 * AGSC-04-02: two emissions are the same when their BYTES are. An authored asset or
 * an attachment is emitted as a byte array, and comparing two of them with `!==`
 * compared their identity, so every Bundle with an asset failed `ci` as
 * non-reproducible (AGSC-E602).
 */
function sameBytes(a, b) {
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }
  return a === b;
}

function filterWarn(findings) {
  return findings.filter((f) => f.severity === 'warn');
}

/** One `checks[]` entry of AGSC-08-10: a lane, its status and its findings. */
function check(name, findings) {
  const sorted = sortFindings(findings);
  return {
    findings: sorted.map((f) => ({
      code: f.code, col: f.col, file: f.file, line: f.line, message: f.message, severity: f.severity,
    })),
    name,
    status: sorted.some((f) => f.severity !== 'warn') ? 'fail' : 'pass',
  };
}

/**
 * AGSC-08-10: the gate verdict — `{gate, level, checks, status}` for the Bundle's own
 * gate; `gate: "ci"` with `level: "L1"` when the Bundle holds no `gate` item; one
 * object per gate, as an array in slug order, when it holds several.
 */
function gateVerdict(items, checks) {
  const status = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
  const gates = (items || []).filter((i) => i && i.type === 'gate' && typeof i.slug === 'string')
    .sort((a, b) => compareCodePoint(a.slug, b.slug));
  if (gates.length === 0) return { checks, gate: 'ci', level: 'L1', status };
  const records = gates.map((g) => ({ checks, gate: g.slug, level: g.level, status }));
  return records.length === 1 ? records[0] : records;
}

/** Write the verdict JCS-canonical with one trailing LF (AGSC-04-04), through the port. */
function writeGate(verdict, ports) {
  const fs = ports && ports.fs;
  if (!fs || typeof fs.writeFile !== 'function') return false;
  if (typeof fs.mkdirp === 'function') fs.mkdirp('dist');
  fs.writeFile(GATE_FILE, `${canonicalize(verdict)}\n`);
  return true;
}

/**
 * Run the pipeline.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {object} ports `{fs, clock, proc}`.
 * @param {object} [options] everything `site.build` takes, plus:
 * @param {(bundle:object, context:object)=>Array<object>} [options.lint] the N9 lints.
 * @returns {{exit:number, counts:{error:number,warn:number}, findings:Array<object>,
 *   files:Map<string,string>, skipped:Array<string>, lanes:Array<string>}}
 */
function ci(bundle, ports, options = {}) {
  const lanes = [];
  const findings = [...(bundle.findings || [])];
  const checks = [];

  // ---- lint
  const lint = options.lint;
  const lintFindings = [...(bundle.findings || [])];
  if (typeof lint === 'function') {
    lintFindings.push(...lint(bundle, { ports }));
    findings.push(...lintFindings.slice(findings.length));
    lanes.push('lint');
  } else {
    lanes.push('lint (validate-only: the four N9 lints of governance/lint.js were not wired)');
  }
  checks.push(check('lint', lintFindings));

  // ---- build
  // When a lint lane ran, it already reported the publication checks of PRD-019 and
  // RFC 9116; the build still refuses to emit an invalid security contact, it simply
  // does not repeat the reason (AGSC-09-11: one fault is counted once).
  const buildOptions = typeof lint === 'function' ? { ...options, publication: false } : options;
  const built = site.build(bundle, ports, buildOptions);
  findings.push(...built.findings);
  lanes.push('build');
  checks.push(check('build', built.findings));

  // ---- verify (AGSC-04-02: build twice, compare bytes)
  const second = site.build(bundle, ports, buildOptions);
  const verifyFindings = [];
  for (const key of new Set([...built.files.keys(), ...second.files.keys()])) {
    if (!sameBytes(built.files.get(key), second.files.get(key))) {
      verifyFindings.push({
        code: 'AGSC-E602',
        col: 1,
        file: key,
        line: 1,
        message: `two builds of one Bundle differ at ${key} (AGSC-04-02)`,
        severity: 'error',
      });
    }
  }
  findings.push(...verifyFindings);
  lanes.push('verify');
  checks.push(check('verify', verifyFindings));

  // ---- forge (AGSC-08-12): compile `enforce[]` ONCE per run, into `dist/forge/`.
  // A Bundle whose gate items enforce nothing compiles nothing and the lane says so,
  // rather than creating an empty generated directory.
  const items = (bundle.items || []).map((item) => (item && item.frontmatter
    ? { ...item.frontmatter, slug: item.slug, type: item.type }
    : item));
  const compiled = forge.write(items, bundle.config || {}, ports);
  findings.push(...compiled.findings);
  checks.push(check('forge', compiled.findings));
  lanes.push(compiled.files.size === 0
    ? 'forge (no gate item declares enforce[]; AGSC-08-12)'
    : `forge (${compiled.files.size} artefact${compiled.files.size === 1 ? '' : 's'}, `
      + `${compiled.written.length} written, ${compiled.drift.length} drifted)`);

  // ---- the gate verdict (AGSC-08-10), once per run, JCS-canonical at dist/gate.json.
  const gate = gateVerdict(items, checks);
  const gateWritten = writeGate(gate, ports);
  lanes.push(gateWritten ? `gate (${GATE_FILE})` : 'gate (no writable FileSystem port; verdict returned only)');

  const sorted = sortFindings(findings);
  const counts = countOf(sorted);
  return {
    exit: counts.error > 0 ? 1 : 0,
    counts,
    findings: sorted,
    files: built.files,
    forge: compiled,
    gate,
    skipped: built.skipped,
    lanes,
  };
}

module.exports = { GATE_FILE, ci, gateVerdict, sameBytes };
