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
 *              `agsc <verb> [args…] --json` spawned inside it (lint, build, ci or the
 *              verb the case names, with its `args`; `command: "agsc-host"` spawns
 *              `agsc-host` instead, and `env` adds environment variables, the
 *              configuration layer of AGSC-01-37); a case with `git` first makes the
 *              copy a git repository with the commits and configuration it lists, and a
 *              case with `inspect: "bundle"` searches the whole copy, not `www/`, for
 *              what must not reach it. A case with `outside: true` gets an empty folder
 *              beside the copy, `<id>.outside`, whose absolute path replaces `{{outside}}`
 *              in its file texts, arguments and environment values; a `must_not_reach`
 *              entry with `under: "outside"` is looked for in that folder
 *   import     a hostile foreign corpus handed to `agsc import --from <format>`, with
 *              the case's `args` after it (`{{source}}` in one is the corpus's
 *              absolute path), optionally followed by `agsc lint` over what was written
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
 * A case with `bound: true` feeds a run just under 1 MiB long where a slow pattern
 * would stall: its command is started with a kill bound of BOUND_MS. A pattern that
 * scans such a run from every start position needs on the order of an hour, a linear
 * scan about a second, so the outcome is "finished" or "killed", far apart on either
 * side of the bound; a killed run is missed. The bound is the only time the scorer
 * uses: no duration is measured, recorded or compared.
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
/** The kill bound of a case with `bound: true`, in milliseconds (see the header). */
const BOUND_MS = 120000;
/** The two commands a `bundle` case can start. */
const COMMANDS = Object.freeze({ 'agsc': path.join('bin', 'agsc.js'), 'agsc-host': path.join('bin', 'agsc-host.js') });

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

/**
 * Start the engine. `extra` adds environment variables (a case's `env`); `bound` starts
 * it with the kill bound, and `killed` says whether the bound stopped it.
 */
function spawn(args, cwd, extra = {}, bound = false) {
  const r = cp.spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', env: { ...extra, NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH },
    maxBuffer: 64 * 1024 * 1024,
    ...(bound ? { killSignal: 'SIGKILL', timeout: BOUND_MS } : {}),
  });
  return { code: r.status, err: r.stderr || '', killed: Boolean(r.error && r.error.code === 'ETIMEDOUT'), out: r.stdout || '' };
}

/**
 * The case with every `{{outside}}` in its file texts, arguments and environment
 * values replaced by `outside`, written with forward slashes (a JSON string needs no
 * escape then). The case itself is not changed.
 */
function withOutside(c, outside) {
  const slashed = outside.split(path.sep).join('/');
  const put = (text) => String(text).split('{{outside}}').join(slashed);
  return {
    ...c,
    args: (c.args || []).map(put),
    env: Object.fromEntries(Object.entries(c.env || {}).map(([name, value]) => [name, put(value)])),
    files: (c.files || []).map((f) => (typeof f.text === 'string' ? { ...f, text: put(f.text) } : f)),
  };
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
    if (hit !== undefined) leaked.push(path.relative(root, hit).split(path.sep).join('/'));
  }
  return leaked;
}

// ------------------------------------------------------------------ the kinds

/**
 * Make `dir` a git repository: everything in it committed with the first message, one
 * empty commit per further message, then the configuration entries set — after the
 * commits, so that a hostile entry is met by the engine and not by this setup. Fixed
 * dates, no global or system configuration. A message given as a byte description
 * (`bytesOf`), such as a repeated run too long for one command-line argument, is
 * handed to git as a file.
 */
function gitHistory(dir, git) {
  const env = {
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    GIT_CONFIG_GLOBAL: path.join(dir, '.no-global-config'), GIT_CONFIG_NOSYSTEM: '1', PATH: process.env.PATH,
  };
  const run = (args) => {
    const r = cp.spawnSync('git', ['-c', 'user.name=Bench', '-c', 'user.email=bench@example.org', '-c', 'commit.gpgsign=false', ...args],
      { cwd: dir, encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(`security: git ${args[0]} failed: ${r.stderr || r.error}`);
  };
  run(['init', '-q', '-b', 'main']);
  run(['add', '-A']);
  (git.commits || []).forEach((message, n) => {
    if (typeof message === 'string') return run(['commit', '-q', '--allow-empty', '-m', message]);
    const file = path.join(path.dirname(dir), `${path.basename(dir)}.message-${n}`);
    fs.writeFileSync(file, bytesOf(message));
    try { run(['commit', '-q', '--allow-empty', '-F', file]); } finally { fs.rmSync(file, { force: true }); }
    return undefined;
  });
  for (const [key, value] of Object.entries(git.config || {})) run(['config', key, value]);
}

/** A fresh, empty folder beside the case's copy, for a case with `outside: true`. */
function outsideFolder(env, c) {
  const dir = path.join(env.scratch, 'security', `${c.id}.outside`);
  fs.rmSync(dir, { force: true, recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function runBundle(spec, env) {
  const dir = workspace(env, spec);
  const outside = spec.outside === true ? outsideFolder(env, spec) : null;
  const c = outside === null ? spec : withOutside(spec, outside);
  materialise(dir, c.files);
  if (c.git) gitHistory(dir, c.git);
  const command = COMMANDS[c.command || 'agsc'];
  if (command === undefined) throw new Error(`security: case ${c.id} names an unknown command "${c.command}"`);
  const r = spawn([path.join(REPO, command), c.verb || 'lint', ...(c.args || []), '--json'], dir, c.env, c.bound === true);
  const internal = /internal error/u.test(r.err);
  const mustNot = (c.must_not_reach || []).filter((m) => m.under !== 'outside');
  const leakedOutside = outside === null ? [] : leaksUnder(outside, (c.must_not_reach || []).filter((m) => m.under === 'outside'))
    .map((rel) => `{{outside}}/${rel}`);
  // The output inspected for a neutralisation is what the build wrote, `www/` — or the
  // whole Bundle, for a construct that would act on the Bundle itself.
  if (c.inspect === 'bundle') {
    return {
      codes: codesOf(r.out), exit: r.code, internal, killed: r.killed,
      leaked: [...leaksUnder(dir, mustNot), ...leakedOutside], ran: r.code !== null && !internal,
    };
  }
  const out = path.join(dir, 'www');
  return {
    codes: codesOf(r.out), exit: r.code, internal, killed: r.killed,
    leaked: [...leaksUnder(out, mustNot), ...leakedOutside], ran: fs.existsSync(out),
  };
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
  const slashed = target.split(path.sep).join('/');
  const args = (c.args || []).map((arg) => String(arg).split('{{source}}').join(slashed));
  const r = spawn([path.join(REPO, 'bin', 'agsc.js'), 'import', '--from', c.format, target, ...args, '--json'], dir, {}, c.bound === true);
  let codes = codesOf(r.out);
  let exit = r.code;
  if (c.then_lint === true && r.code === 0) {
    const lint = spawn([path.join(REPO, 'bin', 'agsc.js'), 'lint', '--json'], dir);
    codes = [...new Set([...codes, ...codesOf(lint.out)])].sort();
    exit = lint.code;
  }
  // What an import produced is the Bundle's `content/` tree.
  return {
    codes, exit, internal: /internal error/u.test(r.err), killed: r.killed,
    leaked: leaksUnder(path.join(dir, 'content'), c.must_not_reach), ran: r.code === 0,
  };
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
 *   finished       the case feeds a long run (`finish` names the exit codes the verb
 *                  may end with): the verb finished inside the kill bound with one of
 *                  them and no internal error
 *   neutralised    the case lists outputs under `must_not_reach`, the run produced
 *                  output, and none of them reached it
 * Anything else is MISSED — including an internal error, which is never a verdict.
 * Every observed leak is a miss whatever the codes say: a finding that lets the
 * construct through anyway has not stopped it. A run the kill bound stopped is a miss
 * too, whatever it printed before it was stopped.
 * A CONTROL passes when none of its `forbid` codes was reported.
 */
function judge(c, observed) {
  const expected = c.expect || [];
  const hit = expected.filter((code) => observed.codes.includes(code));
  if (c.fault === false) {
    const forbidden = (c.forbid || []).filter((code) => observed.codes.includes(code));
    return { forbidden_reported: forbidden, ok: forbidden.length === 0, outcome: forbidden.length === 0 ? 'clean' : 'false-positive' };
  }
  if (observed.killed === true) return { hit, killed: true, ok: false, outcome: 'missed' };
  if (observed.leaked.length > 0) return { hit, leaked: observed.leaked, ok: false, outcome: 'missed' };
  if (hit.length > 0) return { hit, ok: true, outcome: observed.exit === 0 ? 'detected' : 'refused' };
  const other = (c.accept_other || []).filter((code) => observed.codes.includes(code));
  if (other.length > 0 && observed.exit !== 0 && !observed.internal) return { hit: other, ok: true, outcome: 'refused-other' };
  if (c.finish && c.finish.exit.includes(observed.exit) && !observed.internal) return { hit, ok: true, outcome: 'finished' };
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

module.exports = { BOUND_MS, bytesOf, codesOf, gitHistory, insideRepo, judge, leaksUnder, materialise, score, tally, withOutside };
