'use strict';
/**
 * bench/security.js — the security-floor scorer (measurement layer C).
 *
 * It runs every case of a seeded fault corpus (`bench/corpus/security-floor.json`)
 * through the part of the engine that is meant to stop it, and reports, per case,
 * whether the fault was DETECTED (a finding carrying one of the expected codes,
 * exit 0), REFUSED (the same, with a non-zero exit), NEUTRALISED (the hostile
 * construct did not reach the output, which is checked byte by byte) or MISSED.
 * Valid controls are run the same way and must come back clean of their listed
 * codes, so the corpus measures false positives as well as misses.
 *
 * Six kinds of case, each driving the real code path:
 *   bundle     a copy of a base Bundle with files written, replaced or linked, then
 *              `agsc <verb> --json` spawned inside it (lint or build)
 *   import     a hostile foreign corpus handed to `agsc import --from <format>`,
 *              optionally followed by `agsc lint` over what was written
 *   wellknown  a hostile discovery document handed to `tools/validate-wellknown`
 *   federation the walk of AGSC-11-10 over hostile discovery documents served by an
 *              injected in-memory fetch (no socket is opened)
 *   redirect   AGSC-11-09's redirect guard over a hostile hop list
 *   skill      a forged skill pack or Harness file set through AGSC-07-15's checks
 *
 * What a score here is worth. AGSC-08-19: the lints "prove neither safety nor the
 * absence of novel injection". The corpus is a list of KNOWN shapes; a full score
 * says the engine stops these shapes and nothing more.
 *
 * Deterministic: a fixed `SOURCE_DATE_EPOCH`, no clock read, no network, no random
 * source. Every write goes under the scratch directory the caller names, which must
 * lie outside this repository.
 */

const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const EPOCH = '1767225600';

/** True when `dir` is this repository or lies inside it. */
function insideRepo(dir) {
  const rel = path.relative(REPO, path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** The bytes a corpus file entry describes: text, base64, or a repeated run. */
function bytesOf(entry) {
  if (typeof entry.base64 === 'string') return Buffer.from(entry.base64, 'base64');
  if (entry.repeat) {
    const r = entry.repeat;
    return Buffer.from(`${r.prefix || ''}${String(r.text).repeat(r.count)}${r.suffix || ''}`, 'utf8');
  }
  return Buffer.from(String(entry.text), 'utf8');
}

/** Write a corpus file list under `root`: plain files, symbolic links and removals. */
function materialise(root, files) {
  for (const entry of files || []) {
    const where = path.join(root, entry.path);
    fs.mkdirSync(path.dirname(where), { recursive: true });
    fs.rmSync(where, { force: true, recursive: true });
    if (entry.remove === true) continue;
    if (typeof entry.symlink === 'string') fs.symlinkSync(entry.symlink, where);
    else fs.writeFileSync(where, bytesOf(entry));
  }
}

/** Every code a CLI run reported: the envelope's findings, or a bare finding line. */
function codesOf(stdout) {
  const codes = [];
  for (const line of String(stdout).split('\n')) {
    if (!line.startsWith('{')) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (Array.isArray(parsed.findings)) for (const f of parsed.findings) codes.push(f.code);
    else if (typeof parsed.code === 'string') codes.push(parsed.code);
  }
  return [...new Set(codes)].sort();
}

function spawn(args, cwd) {
  const r = cp.spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status, err: r.stderr || '', out: r.stdout || '' };
}

/** A fresh copy of the base Bundle for one case. */
function workspace(env, c) {
  const dir = path.join(env.scratch, 'security', c.id);
  fs.rmSync(dir, { force: true, recursive: true });
  fs.cpSync(env.base, dir, { recursive: true });
  return dir;
}

/** Every file under `dir`, recursively; empty when `dir` does not exist. */
function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
}

/**
 * Which `must_not_reach` entries reached `root`. An entry with a `path` leaks when
 * that file exists (and, if `text` is given, holds it); an entry with only a `text`
 * leaks when any file under `root` holds it.
 */
function leaksUnder(root, entries) {
  const leaked = [];
  for (const m of entries || []) {
    const candidates = typeof m.path === 'string' ? [path.join(root, m.path)].filter((f) => fs.existsSync(f)) : filesUnder(root);
    const hit = candidates.find((f) => typeof m.text !== 'string' || fs.readFileSync(f, 'latin1').includes(Buffer.from(m.text, 'utf8').toString('latin1')));
    if (hit !== undefined) leaked.push(path.relative(root, hit));
  }
  return leaked;
}

// ------------------------------------------------------------------ the kinds

function runBundle(c, env) {
  const dir = workspace(env, c);
  materialise(dir, c.files);
  const r = spawn([path.join(REPO, 'bin', 'agsc.js'), c.verb || 'lint', '--json'], dir);
  // The output inspected for a neutralisation is what the build wrote, `www/`.
  const out = path.join(dir, 'www');
  return { codes: codesOf(r.out), exit: r.code, internal: /internal error/u.test(r.err), leaked: leaksUnder(out, c.must_not_reach), ran: fs.existsSync(out) };
}

function runImport(c, env) {
  const dir = workspace(env, c);
  const source = path.join(env.scratch, 'security', `${c.id}.source`);
  fs.rmSync(source, { force: true, recursive: true });
  let target = source;
  if (c.source_file) {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    target = `${source}${c.source_file.suffix}`;
    fs.writeFileSync(target, bytesOf(c.source_file));
  } else {
    fs.mkdirSync(source, { recursive: true });
    materialise(source, c.source);
  }
  const r = spawn([path.join(REPO, 'bin', 'agsc.js'), 'import', '--from', c.format, target, '--json'], dir);
  let codes = codesOf(r.out);
  let exit = r.code;
  if (c.then_lint === true && r.code === 0) {
    const lint = spawn([path.join(REPO, 'bin', 'agsc.js'), 'lint', '--json'], dir);
    codes = [...new Set([...codes, ...codesOf(lint.out)])].sort();
    exit = lint.code;
  }
  // What an import produced is the Bundle's `content/` tree.
  return { codes, exit, internal: /internal error/u.test(r.err), leaked: leaksUnder(path.join(dir, 'content'), c.must_not_reach), ran: r.code === 0 };
}

function runWellknown(c, env) {
  const dir = path.join(env.scratch, 'security', c.id);
  fs.rmSync(dir, { force: true, recursive: true });
  materialise(dir, [{ ...c.document, path: '.well-known/knowledge-linkset' }]);
  const r = spawn([path.join(REPO, 'tools', 'validate-wellknown'), path.join(dir, '.well-known', 'knowledge-linkset'), '--json'], dir);
  return { codes: codesOf(r.out), exit: r.code, internal: false, leaked: [], ran: true };
}

function runFederation(c) {
  const federation = require(path.join(REPO, 'src', 'boundary', 'federation.js'));
  const fetched = [];
  const fetch = (key) => {
    fetched.push(key);
    const doc = c.documents[key];
    if (doc === undefined) throw new Error('no such document');
    return { ok: true, peers: doc.peers };
  };
  const result = federation.walk({ federation: c.federation, fetch, resolved: c.resolved, start: c.start });
  const codes = [...new Set([...result.skipped.map((s) => s.code), ...(result.error ? [result.error] : [])])].sort();
  // A refused target must never have reached the fetch: that is the property.
  const leaked = (c.never_fetched || []).filter((k) => fetched.includes(k));
  return { codes, exit: codes.length > 0 ? 1 : 0, internal: false, leaked, ran: true };
}

function runRedirect(c) {
  const federation = require(path.join(REPO, 'src', 'boundary', 'federation.js'));
  const r = federation.followRedirects(c.peer, c.hops, { redirectLimit: c.redirect_limit, resolved: c.resolved });
  const codes = r.error ? [r.error] : [];
  return { codes, exit: codes.length > 0 ? 1 : 0, internal: false, leaked: [], ran: true };
}

function runSkill(c) {
  let findings;
  if (c.target === 'harness') {
    const harness = require(path.join(REPO, 'src', 'composition', 'harness.js'));
    findings = harness.executableViolations(c.files.map((f) => [f.path, f.text]));
  } else {
    const skills = require(path.join(REPO, 'src', 'composition', 'skills.js'));
    findings = skills.executableViolations(c.files);
  }
  const codes = [...new Set(findings.map((f) => f.code))].sort();
  return { codes, exit: codes.length > 0 ? 1 : 0, internal: false, leaked: [], ran: true };
}

const KINDS = Object.freeze({
  bundle: runBundle, federation: runFederation, import: runImport,
  redirect: runRedirect, skill: runSkill, wellknown: runWellknown,
});

/**
 * Judge one case from what its run observed.
 *
 * A FAULT is handled in one of four ways, each reported under its own name:
 *   detected       an expected code was reported and the verb exited 0 (a warning)
 *   refused        an expected code was reported and the verb exited non-zero
 *   refused-other  the verb exited non-zero with a code the case lists under
 *                  `accept_other` and none it lists under `expect`: the input was
 *                  stopped, but under a different code from the one the rule names —
 *                  handled, and still a defect of the diagnostic
 *   neutralised    the case lists outputs under `must_not_reach`, the run produced
 *                  output, and none of them reached it
 * Anything else is MISSED — including an internal error, which is never a verdict.
 * Every observed leak is a miss whatever the codes say: a finding that lets the
 * construct through anyway has not stopped it.
 * A CONTROL passes when none of its `forbid` codes was reported.
 */
function judge(c, observed) {
  const expected = c.expect || [];
  const hit = expected.filter((code) => observed.codes.includes(code));
  if (c.fault === false) {
    const forbidden = (c.forbid || []).filter((code) => observed.codes.includes(code));
    return { forbidden_reported: forbidden, ok: forbidden.length === 0, outcome: forbidden.length === 0 ? 'clean' : 'false-positive' };
  }
  if (observed.leaked.length > 0) return { hit, leaked: observed.leaked, ok: false, outcome: 'missed' };
  if (hit.length > 0) return { hit, ok: true, outcome: observed.exit === 0 ? 'detected' : 'refused' };
  const other = (c.accept_other || []).filter((code) => observed.codes.includes(code));
  if (other.length > 0 && observed.exit !== 0 && !observed.internal) return { hit: other, ok: true, outcome: 'refused-other' };
  if (Array.isArray(c.must_not_reach) && observed.ran) return { hit, ok: true, outcome: 'neutralised' };
  return { hit, ok: false, outcome: 'missed' };
}

function tally(rows) {
  const out = { beyond_rule: 0, beyond_rule_caught: 0, cases: rows.length, controls: 0, faults: 0, handled: 0, score: null };
  for (const r of rows) {
    if (r.required === false) {
      // A shape beyond what the rule enumerates: reported, never scored (AGSC-08-19).
      out.beyond_rule += 1;
      if (r.ok) out.beyond_rule_caught += 1;
      continue;
    }
    out[r.outcome] = (out[r.outcome] || 0) + 1;
    if (r.fault) { out.faults += 1; if (r.ok) out.handled += 1; } else out.controls += 1;
  }
  const clean = out.clean || 0;
  out.score = out.faults === 0 ? null : `${out.handled}/${out.faults}`;
  out.controls_clean = out.controls === 0 ? null : `${clean}/${out.controls}`;
  return out;
}

/**
 * Run the whole corpus.
 * @param {{cases:Array<object>, version:string}} corpus
 * @param {{scratch:string, base?:string}} env scratch lies outside the repository
 * @returns {{by_class:object, by_kind:object, cases:Array<object>, totals:object}}
 */
function score(corpus, env) {
  if (typeof env.scratch !== 'string' || insideRepo(env.scratch)) {
    throw new Error('security: the scratch directory must lie outside this repository');
  }
  const context = { base: env.base || path.join(REPO, 'tests', 'fixtures', 'minimal'), scratch: path.resolve(env.scratch) };
  const rows = [];
  for (const c of corpus.cases) {
    const run = KINDS[c.kind];
    if (run === undefined) throw new Error(`security: case ${c.id} has an unknown kind "${c.kind}"`);
    const observed = run(c, context);
    const verdict = judge(c, observed);
    rows.push({
      class: c.class, codes: observed.codes, exit: observed.exit, expect: c.expect || [], fault: c.fault !== false,
      id: c.id, internal_error: observed.internal, kind: c.kind, required: c.required !== false, ...verdict,
    });
  }
  const group = (key) => {
    const out = Object.create(null);
    for (const name of [...new Set(rows.map((r) => r[key]))].sort()) out[name] = tally(rows.filter((r) => r[key] === name));
    return out;
  };
  return { by_class: group('class'), by_kind: group('kind'), cases: rows, totals: tally(rows) };
}

module.exports = { bytesOf, codesOf, insideRepo, judge, leaksUnder, materialise, score, tally };
