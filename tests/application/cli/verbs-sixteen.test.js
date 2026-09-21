'use strict';
// AGSC-09-07: "the verb set is exactly SIXTEEN". This suite is the promise that
// the shell and the modules agree on that set — every verb resolves to a module
// that exports `run`, a seventeenth exits 2 with AGSC-E001, and `--json` is
// honoured on every verb (AGSC-09-12). It reaches no network and no wall clock:
// the only verb that touches a real Bundle here is the one under test, over the
// in-memory port, with a fixed clock.
//
// It also records which verbs are WIRED and which answer honestly that they are
// not implemented at this milestone, so that a verb can never quietly become a
// silent success (WP-10-G, 2026-09-18).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { main, VERBS } = require('../../../src/application/cli/main.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const VERBS_DIR = path.join(ROOT, 'src', 'application', 'cli', 'verbs');

/** AGSC-09-07, verbatim. */
const SIXTEEN = Object.freeze(['init', 'lint', 'build', 'verify', 'ci', 'export', 'import',
  'compose', 'propose', 'review', 'refresh', 'skills', 'mcp', 'run', 'trace', 'conform']);

/**
 * The verbs that answer "not implemented at this milestone" (AGSC-10-05).
 * `export` left this list when `--jsonld`, `--jsonl` and `--to <adapter>` landed
 * (AGSC-01-26a/01-27); the three flags it still does not implement answer for
 * themselves, which the test below asserts flag by flag.
 */
const NOT_IMPLEMENTED = Object.freeze(['skills', 'run', 'trace']);

test('the verb set is exactly the sixteen of AGSC-09-07, in the rule order', () => {
  assert.deepStrictEqual(VERBS, [...SIXTEEN]);
  assert.strictEqual(new Set(SIXTEEN).size, 16);
});

test('every verb resolves to a module that exports run()', () => {
  for (const verb of SIXTEEN) {
    const file = path.join(VERBS_DIR, `${verb}.js`);
    assert.ok(fs.existsSync(file), `${verb} has no module`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const module = require(file);
    assert.strictEqual(typeof module.run, 'function', `${verb}.run is not a function`);
    assert.strictEqual(module.name, verb, `${verb}.js names itself "${module.name}"`);
  }
  const shipped = fs.readdirSync(VERBS_DIR).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  assert.deepStrictEqual(shipped.sort(), [...SIXTEEN].sort().map((v) => `${v}.js`),
    'a module exists for a verb AGSC-09-07 does not name');
});

test('a seventeenth verb exits 2 with AGSC-E001 (AGSC-09-07)', () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exit = main(['nosuch', '--json'], { env: {}, root: '.', stderr, stdout });
  assert.strictEqual(exit, 2);
  assert.strictEqual(stdout.text(), '', 'stdout carried something for an unknown verb');
  assert.strictEqual(JSON.parse(stderr.text()).code, 'AGSC-E001');
});

test('an unknown flag is AGSC-E002 and a missing argument AGSC-E003 (AGSC-09-08/09)', () => {
  const codeOf = (argv) => {
    const stderr = captureStream();
    const exit = main(argv, { env: {}, root: '.', stderr, stdout: captureStream() });
    return [exit, JSON.parse(stderr.text()).code];
  };
  assert.deepStrictEqual(codeOf(['lint', '--nosuch', '--json']), [2, 'AGSC-E002']);
  assert.deepStrictEqual(codeOf(['refresh', '--json', '--agent']), [2, 'AGSC-E003']);
});

test('AGSC-09-12: --json emits one JCS-canonical envelope on every verb that answers', () => {
  const { canonicalize } = require('../../../src/knowledge/jcs.js');
  // `mcp` streams and is excluded by AGSC-09-13; `run`/`trace` are refused
  // before any module runs while `run.enabled` is false (AGSC-09-94).
  for (const verb of SIXTEEN.filter((v) => !['mcp', 'run', 'trace'].includes(v))) {
    const stdout = captureStream();
    const stderr = captureStream();
    main([verb, '--json', '--quiet'], {
      env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: emptyPort() }, root: '.', specVersion: '1.0.0-rc.4', stderr, stdout, version: '0.0.0',
    });
    const text = stdout.text();
    assert.ok(text.endsWith('\n'), `${verb}: the envelope has no trailing LF`);
    const envelope = JSON.parse(text);
    assert.strictEqual(`${canonicalize(envelope)}\n`, text, `${verb}: the envelope is not JCS-canonical`);
    assert.deepStrictEqual(Object.keys(envelope),
      ['counts', 'findings', 'schema', 'spec_version', 'status', 'verb', 'version'], verb);
    assert.strictEqual(envelope.verb, verb);
  }
});

test('AGSC-09-94: run and trace are refused with AGSC-E001 while run.enabled is false', () => {
  for (const verb of ['run', 'trace']) {
    const stderr = captureStream();
    const exit = main([verb, '--json'], { env: {}, ports: { fs: emptyPort() }, root: '.', stderr, stdout: captureStream() });
    assert.strictEqual(exit, 2, verb);
    assert.strictEqual(JSON.parse(stderr.text()).code, 'AGSC-E001', verb);
  }
});

test('a verb that is not implemented says so with the rule id, and never passes', () => {
  for (const verb of NOT_IMPLEMENTED) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const result = require(path.join(VERBS_DIR, `${verb}.js`)).run({});
    assert.strictEqual(result.status, 'fail', verb);
    assert.strictEqual(result.findings.length, 1, verb);
    assert.match(result.findings[0].message, /AGSC-\d\d-\d\d/u, `${verb} cites no rule id`);
    assert.match(result.findings[0].message, /not implemented at this milestone/u, verb);
    assert.strictEqual(result.findings[0].severity, 'error', verb);
  }
});

test('export names the flag it needs, and each unimplemented flag answers for itself', () => {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const verb = require(path.join(VERBS_DIR, 'export.js'));
  // AGSC-09-09: `export` with no flag is a missing required argument, not a silent
  // success and not "not implemented" — nothing was asked of it yet.
  const bare = verb.run({});
  assert.strictEqual(bare.status, 'fail');
  assert.strictEqual(bare.findings.length, 1);
  assert.strictEqual(bare.findings[0].code, 'AGSC-E003');
  assert.match(bare.findings[0].message, /--to <adapter>/u);
  // The three flags of AGSC-01-26/01-28 this milestone does not implement each say so.
  for (const flag of ['markdown', 'okf', 'steer']) {
    const result = verb.run({ ports: { fs: emptyPort() }, verbFlags: { [flag]: true } });
    const own = result.findings.filter((f) => f.message.includes(`export --${flag}`));
    assert.strictEqual(own.length, 1, flag);
    assert.match(own[0].message, /not implemented at this milestone/u, flag);
    assert.match(own[0].message, /AGSC-\d\d-\d\d/u, `${flag} cites no rule id`);
    assert.strictEqual(own[0].severity, 'error', flag);
  }
});

/** A FileSystem port over an empty Bundle: every verb answers, none succeeds by luck. */
function emptyPort() {
  return {
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
}
