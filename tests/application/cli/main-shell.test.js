'use strict';
// The CLI shell's own obligations, in the cases the verbs cannot reach:
// AGSC-09-10's two output modes, AGSC-09-13's streaming verb, and what happens
// when a verb module is broken — a thrown error is a PROGRAMMING fault, never a
// Finding with an invented code (spec/09 §9.4 registers none for it).
//
// A verb module is replaced through `require.cache` and restored afterwards, so
// nothing outside this file sees the substitution and the suite stays
// order-independent.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { main } = require('../../../src/application/cli/main.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const VERBS_DIR = path.resolve(__dirname, '..', '..', '..', 'src', 'application', 'cli', 'verbs');

const PORT = {
  exists: () => false,
  mkdirp: () => {},
  readFile: () => '',
  readdir: () => [],
  remove: () => {},
  root: '',
  stat: () => ({}),
  walk: () => [],
  writeFile: () => {},
};

/** Swap one verb's `run` for the duration of `body`, then put it back. */
async function withVerb(verb, run, body) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const module = require(path.join(VERBS_DIR, `${verb}.js`));
  const original = module.run;
  module.run = run;
  try {
    return await body();
  } finally {
    module.run = original;
  }
}

async function shell(argv, options = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const exit = await main(argv, {
    env: { SOURCE_DATE_EPOCH: '1767225600' },
    ports: { fs: PORT },
    root: '.',
    specVersion: '1.0.0-rc.4',
    stderr,
    stdout,
    version: '0.0.0',
    ...options,
  });
  return { exit, stderr: stderr.text(), stdout: stdout.text() };
}

test('AGSC-09-10: without --json, stdout carries one human line and stderr the findings', async () => {
  const result = await withVerb('lint', () => ({
    findings: [
      { code: 'AGSC-E305', file: 'content/concepts/a.md', message: 'orphan', severity: 'warn' },
      { code: 'AGSC-E301', file: 'content/concepts/a.md', message: 'unresolved', severity: 'error' },
    ],
  }), () => shell(['lint']));
  assert.strictEqual(result.exit, 1);
  assert.strictEqual(result.stdout, 'lint: fail (1 error, 1 warn)\n');
  // AGSC-09-10: ordered by (file, line, col, code), code-point-wise.
  assert.strictEqual(result.stderr,
    'error: AGSC-E301 unresolved\nwarn: AGSC-E305 orphan\n');
});

test('AGSC-09-11: a finding with no message still prints, and a pass exits 0', async () => {
  const result = await withVerb('lint', () => ({ findings: [{ code: 'AGSC-E506', severity: 'warn' }] }), () => shell(['lint']));
  assert.strictEqual(result.exit, 0);
  assert.strictEqual(result.stdout, 'lint: pass (0 error, 1 warn)\n');
  assert.strictEqual(result.stderr, 'warn: AGSC-E506 \n');
});

test('a verb that throws is an internal error on stderr and exit 1, never a fabricated code', async () => {
  const result = await withVerb('lint', () => { throw new Error('a programming fault'); }, () => shell(['lint', '--json']));
  assert.strictEqual(result.exit, 1);
  assert.strictEqual(result.stdout, '', 'a crashed run emitted an envelope');
  assert.strictEqual(result.stderr, 'agsc: internal error: lint: a programming fault\n');
  assert.ok(!result.stderr.includes('AGSC-'), 'an unregistered code was invented for an internal fault');
});

test('AGSC-09-13: the streaming verb writes no envelope and no diagnostic line on stdout', async () => {
  const calls = [];
  const result = await withVerb('mcp', (ctx) => {
    calls.push(typeof ctx.ports.fs);
    return Promise.resolve();
  }, () => shell(['mcp', '--json']));
  assert.strictEqual(result.exit, 0);
  assert.strictEqual(result.stdout, '', 'the shell wrote to a streaming verb’s stdout');
  assert.deepStrictEqual(calls, ['object']);
});

test('AGSC-09-13: a streaming verb that fails reports on stderr and exits 1', async () => {
  const result = await withVerb('mcp', () => Promise.reject(new Error('transport gone')),
    () => shell(['mcp']));
  assert.strictEqual(result.exit, 1);
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(JSON.parse(result.stderr).message, 'mcp: transport gone');
});

test('AGSC-11-01: a configuration finding reaches even a streaming verb, on stderr', async () => {
  const result = await withVerb('mcp', () => Promise.resolve(), () => shell(['mcp'], {
    env: { AGSC_CHUNKS_MAX_BYTES: '4', SOURCE_DATE_EPOCH: '1767225600' },
  }));
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(JSON.parse(result.stderr.split('\n')[0]).code, 'AGSC-E209');
});

test('AGSC-09-09: --version answers in both modes and reads no Bundle', async () => {
  assert.deepStrictEqual(await shell(['--version']), { exit: 0, stderr: '', stdout: 'agsc 0.0.0\n' });
  assert.strictEqual(JSON.parse((await shell(['--version', '--json'])).stdout).version, '0.0.0');
  // With no version supplied at all, the shell reads its own package.json.
  const stdout = captureStream();
  main(['--version'], { env: {}, stdout });
  // The package version is a SemVer string, and at a release candidate it carries a
  // pre-release part (`1.0.0-rc.6`) — which is what publishes to npm.
  assert.match(stdout.text(), /^agsc \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\n$/u);
});

test('AGSC-04-09: a malformed SOURCE_DATE_EPOCH is AGSC-E603 and exit 2 in both modes', async () => {
  const plain = await shell(['lint'], { env: { SOURCE_DATE_EPOCH: 'yesterday' } });
  assert.strictEqual(plain.exit, 2);
  assert.match(plain.stderr, /^agsc: AGSC-E603 /u);
  const json = await shell(['lint', '--json'], { env: { SOURCE_DATE_EPOCH: 'yesterday' } });
  assert.strictEqual(JSON.parse(json.stderr).code, 'AGSC-E603');
});

// F27-07: a thrown error carrying a code REGISTERED in spec/09 §9.4 is a domain fact,
// not a programming fault. It used to exit 1 with `agsc: internal error:` and an EMPTY
// stdout under --json — no envelope (AGSC-09-12), no finding line (AGSC-09-10), and the
// registered code lost. AGSC-E902, AGSC-E903, AGSC-E904 and AGSC-E603 are all registered.
test('AGSC-09-11: a thrown REGISTERED code becomes a finding in the envelope', async () => {
  const fs = require('node:fs');
  const registry = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'spec', '09-conformance.md'), 'utf8');
  const { FsError } = require('../../../src/adapters/node-fs.js');

  for (const code of ['AGSC-E902', 'AGSC-E903', 'AGSC-E904']) {
    assert.ok(registry.includes(`| \`${code}\``), `${code} is registered in spec/09 §9.4`);
    const thrown = new FsError(code, `${code} was thrown`, 'content/concepts/a.md');
    const result = await withVerb('lint', () => { throw thrown; }, () => shell(['lint', '--json']));
    assert.strictEqual(result.exit, 1);
    const envelope = JSON.parse(result.stdout);
    assert.strictEqual(result.stdout.split('\n').filter((l) => l !== '').length, 1,
      'AGSC-09-10: exactly one envelope on stdout');
    assert.strictEqual(envelope.status, 'fail');
    assert.strictEqual(envelope.verb, 'lint');
    assert.deepStrictEqual(envelope.counts, { error: 1, warn: 0 });
    assert.deepStrictEqual(envelope.findings, [{
      code, col: 1, file: 'content/concepts/a.md', line: 1, message: `${code} was thrown`, severity: 'error',
    }]);
    assert.ok(!result.stderr.includes('internal error'), 'the internal-error path was not taken');
  }
});

test('an unregistered fault keeps the internal-error path and an empty stdout', async () => {
  const odd = Object.assign(new Error('not a domain fact'), { code: 'ENOENT' });
  const result = await withVerb('lint', () => { throw odd; }, () => shell(['lint', '--json']));
  assert.strictEqual(result.exit, 1);
  assert.strictEqual(result.stdout, '', 'the internal-error path prints nothing on stdout');
  assert.strictEqual(result.stderr, 'agsc: internal error: lint: not a domain fact\n');
});

// ---------------------------------------------------------------------------
// lens (f) — what a person sees. AGSC-09-07 makes anything that is not one
// of the sixteen verbs exit 2 with AGSC-E001, and this shell keeps that; what it
// must NOT do is answer the first command anyone types with the word "null" and
// no way forward (R64: explain before you decide).

const { VERBS } = require('../../../src/application/cli/main.js');

const usage = (argv) => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exit = main(argv, { env: {}, root: '.', stderr, stdout, version: '0.0.0' });
  return { exit, stderr: stderr.text(), stdout: stdout.text() };
};

test('AGSC-09-07: a missing or unknown verb names the sixteen verbs on stderr', () => {
  // rc.5 (V9D-02): `--help` is a global flag with its own exit 0 — see the test
  // below. `-h` and `help` are named by no rule and stay usage errors.
  for (const argv of [[], ['-h'], ['help'], ['nosuch']]) {
    const r = usage(argv);
    assert.strictEqual(r.exit, 2, `${JSON.stringify(argv)} is a usage error (AGSC-09-08)`);
    assert.strictEqual(r.stdout, '', 'diagnostics never go to stdout (AGSC-09-10)');
    assert.ok(r.stderr.includes('AGSC-E001'), r.stderr);
    assert.ok(!/\bnull\b/u.test(r.stderr), `"null" is not a verb a person typed: ${r.stderr}`);
    for (const verb of VERBS) {
      assert.ok(r.stderr.includes(verb), `${JSON.stringify(argv)}: the usage text names ${verb}`);
    }
  }
});

test('AGSC-09-10: under --json the same usage error is ONE finding object per line', () => {
  for (const argv of [['--json'], ['-h', '--json'], ['nosuch', '--json']]) {
    const r = usage(argv);
    assert.strictEqual(r.exit, 2);
    assert.strictEqual(r.stdout, '');
    const lines = r.stderr.split('\n').filter((l) => l !== '');
    assert.strictEqual(lines.length, 1, `one line, not a usage block: ${r.stderr}`);
    const one = JSON.parse(lines[0]);
    assert.strictEqual(one.code, 'AGSC-E001');
    assert.strictEqual(one.severity, 'error');
    assert.ok(typeof one.message === 'string' && one.message !== '');
    assert.ok(!/\bnull\b/u.test(one.message), one.message);
  }
});

test('AGSC-09-09 (rc.5, V9D-02): --help prints to stdout and exits 0', () => {
  // "MUST print the verb set of AGSC-09-07 and this flag list to stdout and exit 0;
  // with a verb, it MUST print that verb's flags." It is the one flag that is not a
  // diagnostic, so unlike the usage block it does NOT go to stderr.
  const bare = usage(['--help']);
  assert.strictEqual(bare.exit, 0);
  assert.strictEqual(bare.stderr, '', '--help is not a diagnostic (AGSC-09-09)');
  for (const verb of VERBS) assert.ok(bare.stdout.includes(verb), `--help names ${verb}`);
  for (const flag of ['--json', '--quiet', '--plain', '--no-input', '--help', '--version']) {
    assert.ok(bare.stdout.includes(flag), `--help names ${flag}`);
  }

  // With a verb, that verb's flags — and not another verb's.
  const lint = usage(['lint', '--help']);
  assert.strictEqual(lint.exit, 0);
  assert.strictEqual(lint.stderr, '');
  assert.ok(lint.stdout.includes('--fix'), lint.stdout);
  // rc.5: `--self` is gone — AGSC-09-09 names `--fix` and no other flag on `lint`.
  assert.ok(!lint.stdout.includes('--self'), lint.stdout);
  assert.ok(!lint.stdout.includes('--ledger'), lint.stdout);
  const compose = usage(['compose', '--help']);
  assert.ok(compose.stdout.includes('--out') && compose.stdout.includes('--emit'), compose.stdout);

  // Under --json it takes the shape --version already takes: one canonical JSON
  // object on stdout, never a usage block in a machine-readable pipeline.
  const asJson = usage(['--help', '--json']);
  assert.strictEqual(asJson.exit, 0);
  assert.strictEqual(asJson.stderr, '');
  const document = JSON.parse(asJson.stdout);
  assert.deepStrictEqual(document.verbs, [...VERBS]);
  assert.strictEqual(asJson.stdout, `${JSON.stringify(document, Object.keys(document).sort())}\n`,
    'the --json form is canonical');
  const verbJson = JSON.parse(usage(['verify', '--help', '--json']).stdout);
  assert.deepStrictEqual(verbJson, { flags: ['--ledger'], global_flags: document.global_flags, verb: 'verify', version: '0.0.0' });

  // --version still wins: it is handled first and answers a different question.
  assert.strictEqual(usage(['--help', '--version']).stdout, 'agsc 0.0.0\n');
});

test('AGSC-09-07: an unknown verb says what was typed, so a typo is visible', () => {
  const r = usage(['buidl']);
  assert.ok(r.stderr.includes('buidl'), r.stderr);
});

test('AGSC-09-09 (rc.6): a value flag given twice is AGSC-E002, in both modes', async () => {
  // AGSC-01-28 says it in as many words of `--target`: "one comma-separated list of
  // registry names, never a repeated flag". Commander keeps the LAST occurrence of
  // a repeated value flag, so `--target agents --target claude` used to export
  // `claude` alone and say nothing — a silent loss of what the operator asked for.
  const plain = await shell(['export', '--steer', '--target', 'agents', '--target', 'claude']);
  assert.strictEqual(plain.exit, 2);
  assert.match(plain.stderr, /^agsc: AGSC-E002 --target is given more than once/u);
  assert.match(plain.stderr, /--target a,b/u, 'the message must show the form that works');
  assert.strictEqual(plain.stdout, '');

  // `--flag=value` is the same flag by another spelling.
  const equals = await shell(['export', '--steer', '--target=agents', '--target=claude']);
  assert.strictEqual(equals.exit, 2);

  // Under --json the diagnostic is one JSON object per line on stderr: no verb ran,
  // so there is no AGSC-09-11 envelope, and stdout carries nothing.
  const json = await shell(['export', '--steer', '--target', 'a', '--target', 'b', '--json']);
  assert.strictEqual(json.exit, 2);
  assert.strictEqual(json.stdout, '');
  assert.deepStrictEqual(JSON.parse(json.stderr), {
    code: 'AGSC-E002',
    severity: 'error',
    message: JSON.parse(json.stderr).message,
  });
  assert.match(JSON.parse(json.stderr).message, /every flag takes one value/u);

  // ONE occurrence is not a repetition, and a repeated BOOLEAN flag is not either:
  // a boolean carries no value to lose.
  assert.strictEqual((await shell(['export', '--steer', '--target', 'agents,claude'])).exit, 0);
  assert.notStrictEqual((await shell(['lint', '--json', '--json'])).exit, 2);
});

