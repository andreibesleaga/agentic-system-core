'use strict';
// tests/application/cli/eng5-verbs.test.js — the verb paths added:
// `export --markdown|--okf|--steer` (AGSC-01-26, AGSC-01-28), `skills` with its two
// sub-commands (spec/07 §7.4), `run` (AGSC-09-94) and `trace` (AGSC-09-94).
//
// Each verb is driven through its own module with a real port bag over a real copy of
// `tests/fixtures/minimal` in a temporary directory and a fixed clock. The one thing
// that is NOT real is the ProcessRunner: `run`'s execution path is exercised with an
// injected runner, which is what keeps the suite deterministic and offline.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { createClock } = require('../../../src/adapters/node-clock.js');
const exportVerb = require('../../../src/application/cli/verbs/export.js');
const skillsVerb = require('../../../src/application/cli/verbs/skills.js');
const runVerb = require('../../../src/application/cli/verbs/run.js');
const traceVerb = require('../../../src/application/cli/verbs/trace.js');
const site = require('../../../src/distribution/site.js');
const steer = require('../../../src/interchange/steer.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

const PROCEDURE = `---
type: procedure
title: Greet
description: A tiny runnable procedure that prints one line, so the run verb has something real.
when: when the run verb needs a step
prov:
  operator: human:andreibesleaga
  origin: human
---

# Greet

\`\`\`run
echo hello
\`\`\`

\`\`\`expect
hello
\`\`\`
`;

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function workspace(extra = {}) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-eng5-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  for (const [at, text] of Object.entries(extra)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function ctxFor(dir, options = {}) {
  const lines = [];
  const config = JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  return {
    argv: options.argv || [],
    config: { ...config, ...(options.config || {}) },
    env: {},
    flags: { json: false, quiet: false },
    notes: lines,
    ports: {
      clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }),
      fs: createFileSystem(dir),
      proc: options.proc,
    },
    root: dir,
    runCwd: options.runCwd,
    specVersion: '1.0.0-rc.6',
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

const read = (dir, at) => nodeFs.readFileSync(path.join(dir, at), 'utf8');
const exists = (dir, at) => nodeFs.existsSync(path.join(dir, at));

// ------------------------------------------------------------------ export

test('AGSC-01-26: export --markdown writes the content tree byte for byte under its own root', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { markdown: true } });
  const result = exportVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity !== 'warn'), []);
  for (const at of ['content/concepts/handoff.md', 'content/concepts/supervisor.md',
    'content/clusters/agent-patterns.md']) {
    assert.strictEqual(read(dir, `dist/export/markdown/${at}`), read(dir, at), at);
  }
  // AGSC-01-26 as amended at rc.6: `content/index.md` is the ONE file of a
  // byte-preserving export that gains a derived key — the content version of
  // AGSC-04-25 — so it is the authored document plus exactly that one line.
  const exportedIndex = read(dir, 'dist/export/markdown/content/index.md');
  const version = /\nbundle_version: "([^"]+)"\n/u.exec(exportedIndex);
  assert.ok(version !== null, exportedIndex);
  assert.match(version[1], /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u);
  assert.strictEqual(exportedIndex.replace(`bundle_version: "${version[1]}"\n`, ''),
    read(dir, 'content/index.md'));
  assert.strictEqual(read(dir, 'dist/export/markdown/LICENSE-CONTENT'), read(dir, 'LICENSE-CONTENT'));
  assert.ok(!exists(dir, 'www'), 'export wrote into build.out');
  assert.match(ctx.notes.join(''), /export --markdown: 5 files under dist\/export\/markdown\//u);
});

test('AGSC-01-26: export --okf adds content/log.md and reports every write with its digest', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { okf: true } });
  exportVerb.run(ctx);
  assert.strictEqual(read(dir, 'dist/export/okf/content/log.md'),
    '- agent-patterns: 2026-01-01\n- handoff: 2026-01-01\n- supervisor: 2026-01-01\n');
  assert.match(ctx.notes.join(''), /wrote: dist\/export\/okf\/content\/log\.md sha256:[0-9a-f]{64}/u);
});

test('AGSC-06-30: a draft item is withheld from the export and the operator is told', () => {
  const dir = workspace({
    'content/concepts/secret.md': '---\ntype: concept\nkind: explainer\ntitle: Secret\n'
      + 'description: A draft item that must never leave this node through any export at all.\n'
      + 'status: draft\nprov:\n  origin: human\n  operator: human:x\n---\n\nSECRET.\n',
  });
  const ctx = ctxFor(dir, { verbFlags: { markdown: true, okf: true, steer: true } });
  exportVerb.run(ctx);
  assert.ok(!exists(dir, 'dist/export/markdown/content/concepts/secret.md'));
  assert.ok(!exists(dir, 'dist/export/okf/content/concepts/secret.md'));
  assert.match(ctx.notes.join(''), /1 unpublished item withheld \(draft, retired or release-gated/u);
  // And no export output anywhere carries the draft's prose.
  const walk = (at) => nodeFs.readdirSync(at, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? walk(path.join(at, e.name)) : [path.join(at, e.name)]));
  for (const file of walk(path.join(dir, 'dist/export'))) {
    assert.ok(!nodeFs.readFileSync(file, 'utf8').includes('SECRET.'), file);
  }
});

test('AGSC-01-28: export --steer writes the default two targets, identical, under its own root', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { steer: true } });
  exportVerb.run(ctx);
  assert.strictEqual(read(dir, 'dist/export/steer/AGENTS.md'), read(dir, 'dist/export/steer/CLAUDE.md'));
  // The repository's own AGENTS.md, if any, is never touched: the export has a root.
  assert.ok(!exists(dir, 'AGENTS.md'));
  assert.match(ctx.notes.join(''), /export --steer: 2 targets \(agents, claude\)/u);
  assert.match(ctx.notes.join(''), /steer lane: channel-auto: NOT RUN/u);
});

test('AGSC-01-28: --target takes a comma-separated list and refuses a name outside the eleven', () => {
  assert.deepStrictEqual(exportVerb.targetsOf({ target: 'agents, gemini ,,cursor' }),
    ['agents', 'gemini', 'cursor']);
  assert.strictEqual(exportVerb.targetsOf({}), undefined);
  const dir = workspace();
  const ok = exportVerb.run(ctxFor(dir, { verbFlags: { steer: true, target: 'gemini,cursor' } }));
  assert.deepStrictEqual(ok.findings.filter((f) => f.severity !== 'warn'), []);
  assert.ok(exists(dir, `dist/export/steer/${steer.TARGETS.gemini}`));
  assert.ok(exists(dir, `dist/export/steer/${steer.TARGETS.cursor}`));

  const bad = workspace();
  const refused = exportVerb.run(ctxFor(bad, { verbFlags: { steer: true, target: 'notepad' } }));
  // rc.6, AGSC-00-23: a value outside a CLOSED operator list is AGSC-E203
  // and a finding at exit 1; AGSC-E002 and exit 2 are for an unknown FLAG.
  assert.strictEqual(refused.findings[0].code, 'AGSC-E203');
  assert.ok(!exists(bad, 'dist'), 'a refused target wrote something');
});

test('the Bundle root with no LICENSE-CONTENT is an error, and the index still carries `license`', () => {
  const dir = workspace();
  nodeFs.rmSync(path.join(dir, 'LICENSE-CONTENT'));
  const result = exportVerb.run(ctxFor(dir, { verbFlags: { markdown: true } }));
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E901' && f.severity === 'error'));
  assert.strictEqual(exportVerb.licenseContentOf(ctxFor(dir)), null);
});

// ------------------------------------------------------------------ skills

test('AGSC-07-19: skills emits one pack per Cluster into dist/skills/, with the index', () => {
  const dir = workspace();
  const ctx = ctxFor(dir);
  const result = skillsVerb.run(ctx);
  assert.deepStrictEqual(result.findings, []);
  assert.ok(exists(dir, 'dist/skills/agent-patterns/SKILL.md'));
  const index = JSON.parse(read(dir, 'dist/skills/index.json'));
  assert.deepStrictEqual(index.packs.map((p) => p.name), ['agent-patterns']);
  assert.match(ctx.notes.join(''), /skills: 1 pack under dist\/skills\//u);
});

test('the pack `build` publishes and the pack `skills` writes are the same bytes', () => {
  const dir = workspace();
  skillsVerb.run(ctxFor(dir));
  const built = site.build(
    require('../../../src/application/bundle.js').loadBundle(createFileSystem(dir), {
      schemas: require('../../../src/knowledge/validate.js')
        .schemas(require('../../../src/adapters/node-fs.js').readSchemas(ROOT)),
    }),
    { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    { specVersion: '1.0.0-rc.6', version: '0.0.2' },
  );
  assert.strictEqual(built.files.get('/skills/agent-patterns/SKILL.md'),
    read(dir, 'dist/skills/agent-patterns/SKILL.md'));
  assert.strictEqual(built.files.get('/skills/index.json'), read(dir, 'dist/skills/index.json'));
  assert.ok(built.files.has('/skills/index.html'), 'AGSC-06-01 names /skills/ as a route');
  // And no route of AGSC-06-01 is reported as unproduced any more for the packs.
  assert.ok(!built.skipped.some((s) => s.startsWith('/skills/')), built.skipped.join('\n'));
});

test('AGSC-07-21: skills install verifies the lockfile, writes once and is idempotent', () => {
  const dir = workspace();
  const first = ctxFor(dir, { argv: ['install'] });
  assert.deepStrictEqual(skillsVerb.run(first).findings, []);
  assert.ok(exists(dir, '.agents/skills/agent-patterns/SKILL.md'));
  const second = ctxFor(dir, { argv: ['install'] });
  skillsVerb.run(second);
  assert.match(second.notes.join(''), /0 written, 1 unchanged/u);

  // An edited install is UPDATED, with a diff.
  nodeFs.writeFileSync(path.join(dir, '.agents/skills/agent-patterns/SKILL.md'), 'stale\n');
  const third = ctxFor(dir, { argv: ['install', '.claude/skills'] });
  const updated = skillsVerb.run(third);
  assert.deepStrictEqual(updated.findings, []);
  assert.ok(exists(dir, '.claude/skills/agent-patterns/SKILL.md'));
});

test('AGSC-07-21: an install target outside the three of the rule is AGSC-E003', () => {
  const dir = workspace();
  const result = skillsVerb.run(ctxFor(dir, { argv: ['install', '/etc'] }));
  assert.strictEqual(result.findings[0].code, 'AGSC-E003');
  assert.match(result.findings[0].message, /AGSC-07-21/u);
});

test('AGSC-07-22: skills import maps a SKILL.md to a procedure item', () => {
  const dir = workspace();
  skillsVerb.run(ctxFor(dir));
  const result = skillsVerb.run(ctxFor(dir, { argv: ['import', 'dist/skills/agent-patterns/SKILL.md'] }));
  assert.deepStrictEqual(result.findings, []);
  const written = read(dir, 'content/procedures/agent-patterns.md');
  assert.match(written, /^---\ntype: procedure\n/u);
  assert.match(written, /origin: imported/u);
  assert.ok(!written.includes('```text agsc-content'));

  // The two error paths.
  assert.strictEqual(skillsVerb.run(ctxFor(dir, { argv: ['import'] })).findings[0].code, 'AGSC-E003');
  assert.strictEqual(skillsVerb.run(ctxFor(dir, { argv: ['import', 'nope.md'] })).findings[0].code, 'AGSC-E901');
});

test('skills takes no other argument, and says what it does take', () => {
  const result = skillsVerb.run(ctxFor(workspace(), { argv: ['publish'] }));
  assert.strictEqual(result.status, 'fail');
  assert.strictEqual(result.findings[0].code, 'AGSC-E003');
  assert.match(result.findings[0].message, /install \[<target>\]/u);
});

// ------------------------------------------------------------------ run

/** A ProcessRunner that declares isolation and answers from a table. */
function fakeRunner(table, isolated = true) {
  const calls = [];
  return {
    calls,
    isolated,
    run(cmd, args, options) {
      calls.push({ args, cmd, cwd: options && options.cwd });
      const key = [cmd, ...args].join(' ');
      return table[key] === undefined ? { code: 127, stderr: 'not found', stdout: '' } : table[key];
    },
  };
}

const RUN_CONFIG = { run: { allow: ['echo'], enabled: true } };

test('AGSC-09-94: run --dry-run prints the resolved command list and executes nothing', () => {
  const dir = workspace({ 'content/procedures/greet.md': PROCEDURE });
  const proc = fakeRunner({});
  const ctx = ctxFor(dir, {
    argv: ['greet'], config: RUN_CONFIG, proc, verbFlags: { 'dry-run': true },
  });
  assert.deepStrictEqual(runVerb.run(ctx).findings, []);
  assert.deepStrictEqual(proc.calls, [], 'a dry run executed something');
  assert.match(ctx.notes.join(''), /run: step 1: echo hello/u);
  assert.match(ctx.notes.join(''), /compares with its expect block/u);
  assert.match(ctx.notes.join(''), /1 step\(s\) resolved, nothing executed/u);
});

test('AGSC-09-94: run refuses to execute against a runner that does not declare isolation', () => {
  const dir = workspace({ 'content/procedures/greet.md': PROCEDURE });
  const proc = fakeRunner({ 'echo hello': { code: 0, stderr: '', stdout: 'hello\n' } }, false);
  const result = runVerb.run(ctxFor(dir, { argv: ['greet'], config: RUN_CONFIG, proc }));
  assert.strictEqual(result.status, 'fail');
  assert.strictEqual(result.findings[0].code, 'AGSC-E001');
  assert.match(result.findings[0].message, /no network/u);
  assert.deepStrictEqual(proc.calls, [], 'a refused run executed something');
  // And the adapter this distribution ships is exactly that runner.
  assert.strictEqual(require('../../../src/adapters/node-proc.js')
    .createProcessRunner().isolated, false);
});

test('AGSC-09-94: with an isolated runner the step runs outside the Bundle and is compared', () => {
  const dir = workspace({ 'content/procedures/greet.md': PROCEDURE });
  const proc = fakeRunner({ 'echo hello': { code: 0, stderr: '', stdout: 'hello\n' } });
  const ctx = ctxFor(dir, { argv: ['greet'], config: RUN_CONFIG, proc });
  assert.deepStrictEqual(runVerb.run(ctx).findings, []);
  assert.deepStrictEqual(proc.calls.map((c) => [c.cmd, ...c.args]), [['echo', 'hello']]);
  assert.notStrictEqual(proc.calls[0].cwd, dir, 'the step ran inside the Bundle');
  assert.strictEqual(proc.calls[0].cwd, os.tmpdir());
  assert.match(ctx.notes.join(''), /1 of 1 step\(s\) reproduced their expect block/u);
});

test('AGSC-09-94: a captured result that differs from the expect block is a finding', () => {
  const dir = workspace({ 'content/procedures/greet.md': PROCEDURE });
  const wrong = fakeRunner({ 'echo hello': { code: 0, stderr: '', stdout: 'goodbye\n' } });
  const result = runVerb.run(ctxFor(dir, { argv: ['greet'], config: RUN_CONFIG, proc: wrong }));
  assert.strictEqual(result.findings[0].code, 'AGSC-E602');
  assert.match(result.findings[0].message, /did not reproduce its expect block/u);

  const failed = fakeRunner({ 'echo hello': { code: 3, stderr: 'boom', stdout: '' } });
  const exited = runVerb.run(ctxFor(dir, { argv: ['greet'], config: RUN_CONFIG, proc: failed }));
  assert.strictEqual(exited.findings[0].code, 'AGSC-E602');
  assert.match(exited.findings[0].message, /exited 3/u);
});

test('AGSC-09-94: a program outside run.allow[] is never spawned', () => {
  const dir = workspace({ 'content/procedures/greet.md': PROCEDURE });
  const proc = fakeRunner({ 'echo hello': { code: 0, stderr: '', stdout: 'hello\n' } });
  const result = runVerb.run(ctxFor(dir, {
    argv: ['greet'], config: { run: { allow: ['node'], enabled: true } }, proc,
  }));
  assert.ok(result.findings.some((f) => f.code === 'AGSC-E203'));
  assert.deepStrictEqual(proc.calls, []);
});

test('run names its argument, its Bundle and its port when one is missing', () => {
  const dir = workspace({ 'content/procedures/greet.md': PROCEDURE });
  assert.strictEqual(runVerb.run(ctxFor(dir, { config: RUN_CONFIG })).findings[0].code, 'AGSC-E003');
  assert.strictEqual(runVerb.run(ctxFor(dir, { argv: ['nope'], config: RUN_CONFIG })).findings[0].code,
    'AGSC-E301');
  const noPort = runVerb.run(ctxFor(dir, { argv: ['greet'], config: RUN_CONFIG }));
  assert.strictEqual(noPort.findings[0].code, 'AGSC-E003');
  assert.match(noPort.findings[0].message, /ProcessRunner/u);
});

test('a Procedure with no run block says so and runs nothing', () => {
  const dir = workspace({
    'content/procedures/quiet.md': PROCEDURE.replace(/```run[\s\S]*$/u, '# Quiet\n'),
  });
  const proc = fakeRunner({});
  const ctx = ctxFor(dir, { argv: ['quiet'], config: RUN_CONFIG, proc });
  assert.deepStrictEqual(runVerb.run(ctx).findings, []);
  assert.match(ctx.notes.join(''), /carries no run block/u);
  assert.deepStrictEqual(proc.calls, []);
});

test('settings() and resolvedLine() read the configuration and print the refusal', () => {
  assert.deepStrictEqual(runVerb.settings({}), { allow: [] });
  assert.deepStrictEqual(runVerb.settings({ config: { run: { allow: ['a'] } } }), { allow: ['a'] });
  assert.match(runVerb.resolvedLine({ ordinal: 2 }, { allowed: false, args: [], program: 'rm' }),
    /step 2: rm {3}\[REFUSED: not in run\.allow\[\]\]/u);
});

// ------------------------------------------------------------------ trace

// AGSC-09-94 as amended at rc.6 names the members of a trace record:
// `started`, and optionally `ended`, `actor`, `title`, `outcome`, `body`, `usage`.
// Everything else — including the older names this engine used to accept — is
// preserved under `x-<vendor>-<key>`.
const TRACE = JSON.stringify({
  actor: 'process:refresh',
  agent: 'process:ignored',
  body: 'It ran.',
  outcome: 'done',
  started: '2026-01-01T00:00:00Z',
  title: 'Nightly refresh',
  usage: { cost_usd: 0.01, estimate: false, model: 'x', tokens_in: 10, tokens_out: 5 },
  weird_key: 'kept',
});

test('AGSC-09-94: trace maps a captured record to an Episode and executes no process', () => {
  const dir = workspace({ 'trace.json': TRACE });
  const ctx = ctxFor(dir, { argv: ['trace.json'] });
  const result = traceVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity !== 'warn'), []);
  const written = read(dir, 'content/episodes/nightly-refresh.md');
  assert.match(written, /^---\ntype: episode\n/u);
  assert.match(written, /started: "2026-01-01T00:00:00Z"/u);
  assert.match(written, /actor: process:refresh/u);
  assert.match(written, /outcome: partial/u);
  assert.match(written, /cost_usd: 0\.01/u);
  assert.match(written, /x-trace-weird-key: kept/u);
  assert.match(written, /x-trace-outcome: done/u);
  // A member under one of the names this engine used to accept is PRESERVED, not
  // silently placed: `agent` is not AGSC-09-94's name for the actor.
  assert.match(written, /x-trace-agent: process:ignored/u);
  assert.match(written, /It ran\./u);
  assert.match(ctx.notes.join(''), /no process was executed/u);
});

test('AGSC-01-23: tracing the same record twice writes the same bytes', () => {
  const dir = workspace({ 'trace.json': TRACE });
  traceVerb.run(ctxFor(dir, { argv: ['trace.json'] }));
  const first = read(dir, 'content/episodes/nightly-refresh.md');
  traceVerb.run(ctxFor(dir, { argv: ['trace.json'] }));
  assert.strictEqual(read(dir, 'content/episodes/nightly-refresh.md'), first);
});

test('trace names what it needs: an argument, JSON, and an instant', () => {
  const dir = workspace({ 'bad.json': 'not json', 'noinstant.json': '{"title":"X"}' });
  assert.strictEqual(traceVerb.run(ctxFor(dir)).findings[0].code, 'AGSC-E003');
  assert.strictEqual(traceVerb.run(ctxFor(dir, { argv: ['bad.json'] })).findings[0].code, 'AGSC-E201');
  const noInstant = traceVerb.run(ctxFor(dir, { argv: ['noinstant.json'] }));
  assert.strictEqual(noInstant.findings[0].code, 'AGSC-E202');
  assert.match(noInstant.findings[0].message, /AGSC-04-11/u);
  assert.ok(!exists(dir, 'content/episodes'), 'a refused trace wrote something');
});

test('the written Episode is a conforming item: the Bundle lints with no new error', () => {
  const dir = workspace({ 'trace.json': TRACE });
  traceVerb.run(ctxFor(dir, { argv: ['trace.json'] }));
  const lintVerb = require('../../../src/application/cli/verbs/lint.js');
  const result = lintVerb.run(ctxFor(dir));
  const errors = result.findings.filter((f) => f.severity !== 'warn');
  assert.deepStrictEqual(errors, [], JSON.stringify(errors, null, 1));
});

// ------------------------------------------------- the ports that can refuse

test('a Bundle root file the port cannot read is treated as absent, never as a crash', () => {
  const dir = workspace();
  const throwing = {
    ...ctxFor(dir).ports.fs,
    exists: () => true,
    readFile: () => { throw new Error('unreadable'); },
  };
  assert.strictEqual(exportVerb.readOptional({ ports: { fs: throwing } }, 'LICENSE-CONTENT'), null);
  assert.strictEqual(exportVerb.licenseContentOf({ ports: { fs: throwing } }), null);
});

test('an installed pack the port cannot read is overwritten rather than compared', () => {
  const dir = workspace();
  skillsVerb.run(ctxFor(dir));
  const ctx = ctxFor(dir, { argv: ['install'] });
  const real = ctx.ports.fs;
  ctx.ports.fs = {
    ...real,
    exists: (at) => (String(at).endsWith('SKILL.md') ? true : real.exists(at)),
    readFile: (at, enc) => {
      if (String(at).startsWith('.agents/skills/')) throw new Error('unreadable');
      return real.readFile(at, enc);
    },
    mkdirp: (at) => real.mkdirp(at),
    writeFile: (at, text) => real.writeFile(at, text),
  };
  assert.deepStrictEqual(skillsVerb.run(ctx).findings, []);
  assert.ok(exists(dir, '.agents/skills/agent-patterns/SKILL.md'));
});

test('AGSC-09-94: trace keeps a valid outcome and refuses a record that is not an object', () => {
  const dir = workspace({
    'good.json': JSON.stringify({ outcome: 'success', started: '2026-01-01T00:00:00Z', title: 'Good run' }),
    'array.json': '[]',
  });
  const good = traceVerb.run(ctxFor(dir, { argv: ['good.json'] }));
  assert.deepStrictEqual(good.findings, []);
  assert.match(read(dir, 'content/episodes/good-run.md'), /outcome: success/u);

  const array = traceVerb.run(ctxFor(dir, { argv: ['array.json'] }));
  assert.strictEqual(array.status, 'fail');
  assert.strictEqual(array.findings[0].code, 'AGSC-E201');
  assert.match(array.findings[0].message, /one JSON object/u);
});
