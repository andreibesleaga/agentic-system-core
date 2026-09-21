'use strict';
// Every WIRED verb of AGSC-09-07, end to end, over a real copy of
// `tests/fixtures/minimal` in a temporary directory — never the repository, so
// a test can leave nothing behind. Deterministic: one fixed
// `SOURCE_DATE_EPOCH`, no network (the refusing adapter is the only Network
// port there is), and the ProcessRunner is a stub with fixed answers wherever
// a git fact is needed.
//
// It is the counterpart of `verbs-sixteen.test.js`, which proves the SET;
// this one proves that each wired verb does what its rule says (WP-10-G).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { main } = require('../../../src/application/cli/main.js');
const helpers = require('../../../src/application/cli/verbs/_helpers.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true });
});

/** A throwaway copy of the fixture (or of nothing, for `init`). */
function workspace(copyFixture = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-verbs-'));
  temporaries.push(dir);
  if (copyFixture) fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Run the real CLI shell against a directory, with a fixed clock. */
function run(argv, dir, options = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const exit = main(argv, {
    env: { SOURCE_DATE_EPOCH: EPOCH, ...(options.env || {}) },
    ports: { fs: createFileSystem(dir), proc: options.proc },
    root: dir,
    specVersion: '1.0.0-rc.4',
    stderr,
    stdout,
    version: '0.0.0',
  });
  const text = stdout.text();
  const json = argv.includes('--json') && text !== '';
  return { envelope: json ? JSON.parse(text) : null, exit, stderr: stderr.text(), stdout: text };
}

/** A ProcessRunner whose answers are fixed, so no test depends on a checkout. */
function fakeProc(answers) {
  return { run: (cmd, args) => (answers[`${cmd} ${args.join(' ')}`] || { code: 1, stderr: '', stdout: '' }) };
}

// ---------------------------------------------------------------- lint / ci

test('AGSC-09-11/09-12: lint on the fixture is a clean envelope and exit 0', () => {
  const { envelope, exit } = run(['lint', '--json'], workspace());
  assert.strictEqual(exit, 0);
  assert.deepStrictEqual(envelope.counts, { error: 0, warn: 0 });
  assert.strictEqual(envelope.verb, 'lint');
});

test('AGSC-01-37: a tracked .env is AGSC-E403, and the lane says when it cannot look', () => {
  const dir = workspace();
  fs.writeFileSync(path.join(dir, '.env'), 'AGSC_MODEL_API_KEY=x\n');
  const proc = fakeProc({ 'git ls-files -z': { code: 0, stderr: '', stdout: `.env\u0000agsc.config.json\u0000` } });
  const withGit = run(['lint', '--json'], dir, { proc });
  assert.ok(withGit.envelope.findings.some((f) => f.code === 'AGSC-E403'), JSON.stringify(withGit.envelope.findings));

  const withoutGit = run(['lint', '--json'], dir);
  assert.ok(!withoutGit.envelope.findings.some((f) => f.code === 'AGSC-E403'));
  assert.match(withoutGit.stderr, /without the tracked-file check of AGSC-01-37/u);
});

test('AGSC-09-08: ci runs lint, build and verify, names its lanes, and exits 0', () => {
  const { envelope, exit, stderr } = run(['ci', '--json'], workspace());
  assert.strictEqual(exit, 0);
  assert.deepStrictEqual(envelope.counts, { error: 0, warn: 0 });
  assert.match(stderr, /lane: governance/u);
  assert.match(stderr, /skipped: \/ledger\.jsonl/u);
});

test('AGSC-01-37: ci prints the NAMES of the overrides in effect, never their values', () => {
  const dir = workspace();
  const { stderr } = run(['ci', '--json'], dir, { env: { AGSC_MODEL_API_KEY: 'super-secret-value' } });
  assert.match(stderr, /AGSC_MODEL_API_KEY/u);
  assert.ok(!stderr.includes('super-secret-value'), 'a credential value reached stderr');
});

// ---------------------------------------------------------------- build / verify

test('AGSC-06-01/AGSC-01-19: build writes the route set under build.out, inside the Bundle', () => {
  const dir = workspace();
  const { exit } = run(['build', '--json'], dir);
  assert.strictEqual(exit, 0);
  for (const route of ['www/llms.txt', 'www/search.json', 'www/.well-known/knowledge-linkset',
    'www/index.html', 'www/concepts/supervisor/index.html', 'www/pages/supervisor.jsonld']) {
    assert.ok(fs.existsSync(path.join(dir, route)), `${route} was not written`);
  }
});

test('AGSC-10-02: build --level 0 writes the Level-0 artefacts and no generated page', () => {
  const dir = workspace();
  run(['build', '--level', '0', '--json'], dir);
  assert.ok(fs.existsSync(path.join(dir, 'www', 'graph.jsonld')));
  assert.ok(!fs.existsSync(path.join(dir, 'www', 'index.html')));
  // AGSC-06-32: no /ns/context.jsonld is emitted at Level 0.
  assert.ok(!fs.existsSync(path.join(dir, 'www', 'ns', 'context.jsonld')));
  // CHANGED 2026-09-21 (NS-03): this assertion used to read `!('@context' in …)`,
  // on the pre-rc.5 reading that a document may name no context when the node
  // serves none. AGSC-05-09 as amended at rc.5 overturned it — "The URL is a
  // constant of this specification, resolvable by every reader at every Level, so
  // a Level-0 graph.jsonld is expandable without the node serving a context of its
  // own" — and the old behaviour lost half the triples in a conforming processor.
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'www', 'graph.jsonld'), 'utf8'))['@context'],
    'https://w3id.org/agentic-system-core/ns/1.0.0-draft.1/context.jsonld');
});

test('AGSC-04-02: verify builds twice and compares bytes', () => {
  const { envelope, exit } = run(['verify', '--json'], workspace());
  assert.strictEqual(exit, 0);
  assert.deepStrictEqual(envelope.findings, []);
});

test('AGSC-08-20a: verify --ledger with no git-log file is AGSC-E703, never a green ledger', () => {
  const { envelope, exit } = run(['verify', '--ledger', '--json'], workspace());
  assert.strictEqual(exit, 1);
  assert.deepStrictEqual(envelope.findings.map((f) => f.code), ['AGSC-E703']);
});

test('AGSC-04-09: a build with no SOURCE_DATE_EPOCH warns AGSC-E606 and still emits', () => {
  const dir = workspace();
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const stdout = captureStream();
  const exit = main(['build', '--json', '--quiet'], {
    env: {}, ports: { fs: createFileSystem(dir) }, root: dir, stderr: captureStream(), stdout, version: '0.0.0',
  });
  const envelope = JSON.parse(stdout.text());
  assert.strictEqual(exit, 0);
  assert.deepStrictEqual(envelope.findings.map((f) => f.code), ['AGSC-E606']);
});

// ---------------------------------------------------------------- compose

test('AGSC-07-04…09: compose closes a selection and reports the verdict', () => {
  const { envelope, exit, stderr } = run(['compose', 'supervisor', '--json'], workspace());
  assert.strictEqual(exit, 0);
  assert.strictEqual(envelope.counts.error, 0);
  // AGSC-07-05: only `requires` closes; `uses` does not, so `handoff` is not
  // pulled in and AGSC-07-07's AGSC-E803 warning names the gap — as a WARNING.
  assert.deepStrictEqual(envelope.findings.map((f) => [f.code, f.severity]), [['AGSC-E803', 'warn']]);
  assert.match(stderr, /verdict: \{"added":\[\],"conflicts":\[\],"hidden":\[\],"selection":\["supervisor"\],"valid":true/u);
  // AGSC-07-12/07-13: the Harness IS written now, into `dist/harness/<name>/`, `<name>`
  // being the selection key of `harness.harnessName` — and the note names the directory
  // and the file count so no invocation is a silent success.
  assert.match(stderr, /harness_emitted: true/u);
  assert.match(stderr, /harness: dist\/harness\/[0-9a-f]{16}\/ \([0-9]+ files\)/u);
});

test('AGSC-07-03: a selection naming no item is AGSC-E802', () => {
  const { envelope, exit } = run(['compose', 'nosuch', '--json'], workspace());
  assert.strictEqual(exit, 1);
  assert.deepStrictEqual(envelope.findings.map((f) => f.code), ['AGSC-E802']);
});

test('AGSC-07-24: compose --from reads the saved composition, and reports when there is none', () => {
  const { envelope } = run(['compose', '--from', 'supervisor', '--json'], workspace());
  // The fixture's `supervisor` is not a `kind: architecture` concept, so there
  // is no `agsc-selection` block and the verdict is empty, not invented.
  assert.ok(Array.isArray(envelope.findings));
});

test('AGSC-07-18: compose --emit says the target renderings are not written', () => {
  const { envelope, exit, stderr } = run(['compose', 'supervisor', '--emit', 'gabbe', '--json'], workspace());
  assert.strictEqual(exit, 1);
  assert.ok(envelope.findings.some((f) => /AGSC-07-18/u.test(f.message)),
    `no finding cites AGSC-07-18: ${JSON.stringify(envelope.findings)}`);
  // AGSC-07-12: the seven files themselves ARE written now, so the note says true —
  // what `--emit` adds is a target RENDERING of them, and that is what is absent.
  assert.match(stderr, /harness_emitted: true/u);
});

// ---------------------------------------------------------------- propose / review / refresh

test('AGSC-08-04/08-05: propose writes the two files, prints the commands, writes nothing else', () => {
  const dir = workspace();
  const { exit, stderr } = run(['propose', 'supervisor', '--json'], dir);
  assert.strictEqual(exit, 0);
  const body = fs.readFileSync(path.join(dir, 'dist', 'proposal', '1.md'), 'utf8');
  assert.ok(body.startsWith('<!-- agsc:proposal v1 -->'), 'the AGSC-08-05 marker is missing');
  assert.match(body, /## Affected slugs\n\n- supervisor/u);
  assert.match(body, /prov\.origin: human/u);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '1.patch')));
  assert.match(stderr, /run: git apply dist\/proposal\/1\.patch/u);

  // A second Proposal takes the next number, never the same one.
  run(['propose', 'handoff', '--json'], dir);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '2.md')));
});

test('propose refuses without a slug (AGSC-E003) and with an unknown one (AGSC-E301)', () => {
  const dir = workspace();
  assert.strictEqual(run(['propose', '--json'], dir).envelope.findings[0].code, 'AGSC-E003');
  assert.strictEqual(run(['propose', 'nosuch', '--json'], dir).envelope.findings[0].code, 'AGSC-E301');
});

test('AGSC-04-19: a Proposal that changes nothing says so instead of claiming a change', () => {
  const dir = workspace();
  const { envelope } = run(['propose', 'supervisor', '--json'], dir);
  const patch = fs.readFileSync(path.join(dir, 'dist', 'proposal', '1.patch'), 'utf8');
  const empty = envelope.findings.some((f) => f.code === 'AGSC-E506');
  assert.strictEqual(empty, !/^[-+][^-+]/mu.test(patch),
    'the empty-Proposal warning and the patch disagree');

  // Put the item INTO its canonical form, and the next Proposal is empty and
  // says so — AGSC-E506, a warning, never a silent "done".
  // eslint-disable-next-line global-require
  const proposeVerb = require('../../../src/application/cli/verbs/propose.js');
  // eslint-disable-next-line global-require
  const { loadBundle } = require('../../../src/application/bundle.js');
  // eslint-disable-next-line global-require
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const bundle = loadBundle({ fs: createFileSystem(dir) }, { schemas: helpers.schemas() });
  const item = bundle.byslug.get('supervisor');
  fs.writeFileSync(path.join(dir, item.path), proposeVerb.canonicalItem(item));

  const second = run(['propose', 'supervisor', '--json'], dir);
  assert.strictEqual(second.exit, 0);
  assert.deepStrictEqual(second.envelope.findings.map((f) => [f.code, f.severity]), [['AGSC-E506', 'warn']]);
});

test('AGSC-08-27: review is lint-only and no model call is reachable from it', () => {
  const dir = workspace();
  const clean = run(['review', '--json'], dir);
  assert.strictEqual(clean.exit, 0);
  assert.match(clean.stderr, /no model call is reachable/u);

  const flagged = run(['review', '--json'], dir, { env: { AGSC_FEATURE_LLM_REVIEW: '1' } });
  assert.deepStrictEqual(flagged.envelope.findings.map((f) => f.code), ['AGSC-E510']);
  assert.strictEqual(flagged.envelope.counts.error, 0, 'the optional lane must be non-blocking');
  // NFR-11: the file itself contains no model call and no network reference.
  const text = fs.readFileSync(path.join(ROOT, 'src', 'application', 'cli', 'verbs', 'review.js'), 'utf8');
  assert.ok(!/fetch\(|http|api_key/iu.test(text.replace(/\/\/.*$/gmu, '')), 'review.js reaches outward');
});

test('AGSC-08-28: refresh --agent --dry-run runs the lane gates and writes the two files', () => {
  const dir = workspace();
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  config.channels = [{ kind: 'github', name: 'main', target: 'https://github.com/x/y' }];
  config.agents = [{
    budget_usd_month: 1, channel: 'main', enabled: true, model: 'test-model',
    name: 'curator', schedule: 'weekly', tasks: ['refresh'], types: ['concept'],
  }];
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);

  const ok = run(['refresh', '--agent', 'curator', '--dry-run', '--json'], dir);
  assert.strictEqual(ok.exit, 0, JSON.stringify(ok.envelope && ok.envelope.findings));
  const body = fs.readFileSync(path.join(dir, 'dist', 'proposal', '1.md'), 'utf8');
  assert.match(body, /^task: refresh$/mu, 'the lane task does not ride on the Proposal');
  assert.match(fs.readFileSync(path.join(dir, 'dist', 'proposal', '1.patch'), 'utf8'), /^# dry run/u);

  // AGSC-E509: a task the lane never declared is refused BEFORE anything is written.
  const refused = run(['refresh', '--agent', 'curator', '--task', 'work', '--dry-run', '--json'], dir);
  assert.deepStrictEqual(refused.envelope.findings.map((f) => f.code), ['AGSC-E509']);

  // Without --dry-run there is no model adapter and the verb says so.
  const live = run(['refresh', '--agent', 'curator', '--json'], dir);
  assert.match(live.envelope.findings[0].message, /AGSC-08-28\(f\)/u);
});

test('refresh refuses a missing or undeclared agent (AGSC-E003 / AGSC-E509)', () => {
  const dir = workspace();
  assert.strictEqual(run(['refresh', '--json'], dir).envelope.findings[0].code, 'AGSC-E003');
  assert.strictEqual(run(['refresh', '--agent', 'ghost', '--json'], dir).envelope.findings[0].code, 'AGSC-E509');
});

// ---------------------------------------------------------------- init

test('AGSC-02-90…95: init adopts a folder of bare Markdown, and never errors', () => {
  const dir = workspace(false);
  fs.writeFileSync(path.join(dir, 'A Note.md'), '# A Note\n\nSomething worth keeping for later reading.\n');
  const proc = fakeProc({ 'git config --get user.email': { code: 0, stderr: '', stdout: 'a@example.org\n' } });
  const { envelope, exit } = run(['init', '--json'], dir, { proc });

  assert.ok(fs.existsSync(path.join(dir, 'agsc.config.json')));
  assert.ok(fs.existsSync(path.join(dir, 'content', 'index.md')));
  assert.ok(fs.existsSync(path.join(dir, '.gitignore')));
  assert.ok(fs.existsSync(path.join(dir, 'content', 'concepts', 'a-note.md')));
  // AGSC-02-92: adoption never errors; every finding is a warning, so exit is 0.
  assert.strictEqual(envelope.counts.error, 0, JSON.stringify(envelope.findings));
  assert.strictEqual(exit, 0);
  // AGSC-02-94: a second run overwrites nothing.
  const again = run(['init', '--json'], dir, { proc });
  assert.strictEqual(again.envelope.counts.error, 0);
});

test('init resolves the operator from git when a runner is wired, and copes without one', () => {
  const dir = workspace(false);
  fs.writeFileSync(path.join(dir, 'note.md'), '# Note\n\nA sentence that is long enough to be a description.\n');
  const { envelope } = run(['init', '--json'], dir);
  assert.strictEqual(envelope.counts.error, 0);
});

// ---------------------------------------------------------------- conform

test('AGSC-09-03: conform writes the report and its class is the Level name', () => {
  const dir = workspace();
  const { exit } = run(['conform', '--level', '0', '--json'], dir);
  assert.strictEqual(exit, 0);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'conformance-report.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(report), ['class', 'impl', 'results', 'spec_version', 'summary', 'version']);
  assert.strictEqual(report.class, 'publisher');
  assert.ok(report.summary.pass > 0 && report.summary.fail === 0);
});

test('conform --to writes where it is told, and a bad --level is AGSC-E003', () => {
  const dir = workspace();
  run(['conform', '--level', '1', '--to', 'reports/level-1.json', '--json'], dir);
  assert.ok(fs.existsSync(path.join(dir, 'reports', 'level-1.json')));
  assert.strictEqual(run(['conform', '--level', '9', '--json'], dir).envelope.findings[0].code, 'AGSC-E003');
});

test('a distribution with no area handlers reports skip, never a silent pass', () => {
  // eslint-disable-next-line global-require
  const conformVerb = require('../../../src/application/cli/verbs/conform.js');
  assert.strictEqual(conformVerb.handlerFor('no-such-area'), null);
});

test('AGSC-09-02: a vector that does not pass is AGSC-E001, and a withdrawn one is silent', () => {
  // eslint-disable-next-line global-require
  const conformVerb = require('../../../src/application/cli/verbs/conform.js');
  const results = [
    { id: 'disc-0006', rule: 'AGSC-06-13a', status: 'pass' },
    { id: 'disc-0008', rule: 'AGSC-06-14', status: 'fail', detail: 'sections: got ["Coordination"]' },
    { id: 'lint-0026', rule: 'AGSC-04-19', status: 'skip', detail: 'no handler for lint-0026' },
    { id: 'bnd-0005', rule: 'AGSC-11-09', status: 'skip', withdrawn: true, detail: 'withdrawn' },
    { id: 'cli-0007', rule: 'AGSC-09-14a', status: 'fail' },
  ];
  const findings = conformVerb.findingsFor(results);
  assert.deepStrictEqual(findings.map((f) => f.code), ['AGSC-E001', 'AGSC-E001', 'AGSC-E001']);
  assert.ok(findings.every((f) => f.severity === 'error'));
  assert.strictEqual(findings[0].message,
    'vector disc-0008 (AGSC-06-14) fail: sections: got ["Coordination"]');
  assert.strictEqual(findings[1].message, 'vector lint-0026 (AGSC-04-19) skip: no handler for lint-0026');
  // A missing `detail` never prints `undefined`, and a WITHDRAWN vector is silent.
  assert.strictEqual(findings[2].message, 'vector cli-0007 (AGSC-09-14a) fail: ');
  assert.ok(!findings.some((f) => f.message.includes('bnd-0005')), 'a withdrawn vector was counted');
  assert.deepStrictEqual(conformVerb.findingsFor(), []);

  // And the real run over the fixture at Level 0 reports nothing.
  const dir = workspace();
  assert.deepStrictEqual(run(['conform', '--level', '0', '--json'], dir).envelope.findings, []);
});

// ---------------------------------------------------------------- helpers

test('the helpers read attachments through the port and hash through node:crypto', () => {
  const dir = workspace();
  fs.mkdirSync(path.join(dir, 'content', 'attachments', 'supervisor'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'content', 'attachments', 'supervisor', 'note.txt'), 'attached text\n');
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const ctx = { ports: { fs: createFileSystem(dir) } };
  const bundle = {
    items: [
      { frontmatter: { attachments: [{ file: 'note.txt', media_type: 'text/plain' }] }, slug: 'supervisor' },
      { frontmatter: { attachments: [{ file: 'absent.txt' }, null, { nofile: 1 }] }, slug: 'handoff' },
      { frontmatter: {}, slug: 'other' },
    ],
  };
  const facts = helpers.attachmentFacts(ctx, bundle);
  assert.strictEqual(facts.attachmentBytes['content/attachments/supervisor/note.txt'], 'attached text\n');
  assert.strictEqual(facts.filesPresent['content/attachments/handoff/absent.txt'], false);
  const none = helpers.attachmentFacts({ ports: {} }, bundle);
  assert.deepStrictEqual([Object.keys(none.attachmentBytes), Object.keys(none.filesPresent)], [[], []]);

  assert.strictEqual(helpers.sha256(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('the tracked-path lane fails closed on every way git can fail', () => {
  assert.strictEqual(helpers.trackedPaths({ ports: {} }), null);
  assert.strictEqual(helpers.trackedPaths({ ports: { proc: { run: () => { throw new Error('no git'); } } } }), null);
  assert.strictEqual(helpers.trackedPaths({ ports: { proc: fakeProc({}) } }), null);
  assert.deepStrictEqual(
    helpers.trackedPaths({ ports: { proc: fakeProc({ 'git ls-files -z': { code: 0, stdout: 'a\u0000b\u0000' } }) } }),
    ['a', 'b']
  );
});

test('the note helper is silent under --quiet and writes to stderr otherwise', () => {
  const stderr = captureStream();
  helpers.note({ flags: { quiet: true }, stderr }, 'hidden');
  assert.strictEqual(stderr.text(), '');
  helpers.note({ flags: {}, stderr }, 'shown');
  assert.strictEqual(stderr.text(), 'shown\n');
  helpers.note({}, 'nowhere');
});

test('AGSC-01-37: without --json the override names are printed as prose, still without values', () => {
  const { stderr } = run(['ci'], workspace(), { env: { AGSC_MODEL_API_KEY: 'another-secret' } });
  assert.match(stderr, /^override in effect: AGSC_MODEL_API_KEY$/mu);
  assert.ok(!stderr.includes('another-secret'));
});

test('init copes with a git identity that answers with nothing at all', () => {
  const dir = workspace(false);
  fs.writeFileSync(path.join(dir, 'note.md'), '# Note\n\nA sentence that is long enough to be a description.\n');
  const proc = fakeProc({ 'git config --get user.email': { code: 0, stderr: '', stdout: '  \n' } });
  assert.strictEqual(run(['init', '--json'], dir, { proc }).envelope.counts.error, 0);

  // A runner that cannot run git at all is not a failure either: adoption is
  // TOTAL (AGSC-02-92) and falls back to `bundle.operator`.
  const broken = { run: () => { throw new Error('git is not installed'); } };
  const other = workspace(false);
  fs.writeFileSync(path.join(other, 'note.md'), '# Note\n\nA sentence that is long enough to be a description.\n');
  assert.strictEqual(run(['init', '--json'], other, { proc: broken }).envelope.counts.error, 0);
});

// ---------------------------------------------------------------------------
// V9-D lens (b) — three branches that no test reached: a mutation of each
// survived the whole suite.

test('AGSC-02-90: `init` takes the operator from git when a runner is wired', () => {
  const identity = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')).bundle.operator;

  const withDir = workspace(false);
  const withGit = run(['init', '--json'], withDir, {
    proc: fakeProc({ 'git config --get user.email': { code: 0, stderr: '', stdout: 'a.person@example.org\n' } }),
  });
  assert.strictEqual(withGit.exit, 0, withGit.stderr);
  assert.strictEqual(identity(withDir), 'human:a.person',
    'AGSC-02-90(2): the local part, normalised to human:<id>');

  // No runner at all, a runner that fails, and a runner that answers with blank
  // output must all reach the SAME defaulted operator — never a crash, and never
  // the git identity invented out of nothing.
  const cases = [
    ['no runner', undefined],
    ['failing runner', fakeProc({})],
    ['blank answer', fakeProc({ 'git config --get user.email': { code: 0, stderr: '', stdout: '  \n' } })],
  ];
  for (const [label, proc] of cases) {
    const dir = workspace(false);
    const result = run(['init', '--json'], dir, { proc });
    assert.strictEqual(result.exit, 0, `${label}: ${result.stderr}`);
    assert.notStrictEqual(identity(dir), 'human:a.person', label);
    assert.ok(/^human:/u.test(identity(dir)), `${label}: ${identity(dir)}`);
  }
});

test('AGSC-01-37: `ci` prints override NAMES as JSON under --json and as text otherwise', () => {
  const dir = workspace();
  const env = { AGSC_SITE_BASE: 'https://override.example/' };
  const asJson = run(['ci', '--json'], dir, { env });
  const lines = asJson.stderr.split('\n').filter((l) => l.includes('AGSC_SITE_BASE'));
  assert.strictEqual(lines.length, 1, asJson.stderr);
  assert.deepStrictEqual(JSON.parse(lines[0]), { override: 'AGSC_SITE_BASE' },
    'under --json every stderr line is one JSON object (AGSC-09-10)');

  const asText = run(['ci'], dir, { env });
  const textLines = asText.stderr.split('\n').filter((l) => l.includes('AGSC_SITE_BASE'));
  assert.strictEqual(textLines.length, 1, asText.stderr);
  assert.strictEqual(textLines[0], 'override in effect: AGSC_SITE_BASE');
  assert.ok(!textLines[0].includes('override.example'), 'the VALUE is never printed');
});

// V9-D lens (a/f): every composition conflict used to be printed as
// "composition conflict on <key>: <a> / <b> (AGSC-07-06)". Three of the four
// conflict kinds are NOT AGSC-07-06 — an absent or retired slug is AGSC-07-03 and
// a superseded hard dependency is AGSC-07-05a, which even prescribes the message
// form — so the citation was wrong and the sentence told a person nothing.
test('AGSC-07-03/05a/06: a composition conflict names its own rule and what to do', () => {
  const dir = workspace();
  const absent = run(['compose', 'nosuchslug', '--json'], dir);
  assert.strictEqual(absent.exit, 1);
  const one = absent.envelope.findings.find((f) => f.code === 'AGSC-E802');
  assert.ok(one, JSON.stringify(absent.envelope.findings));
  assert.ok(one.message.includes('AGSC-07-03'), one.message);
  assert.ok(!one.message.includes('AGSC-07-06'), one.message);
  assert.ok(one.message.includes('nosuchslug'), one.message);
  assert.ok(!/nosuchslug \/ nosuchslug/u.test(one.message),
    `an absent slug is not in conflict with itself: ${one.message}`);

  // A real mutex conflict still cites AGSC-07-06.
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'left.md'), [
    '---', 'type: concept', 'title: Left Hand Side',
    'description: One half of a deliberate mutual exclusion used to check the message of AGSC-07-06.',
    'kind: pattern', 'excludes:', '  - right', 'prov:', '  origin: human',
    '  operator: human:andreibesleaga', '---', '', '## Intent', '', 'Left.', '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'right.md'), [
    '---', 'type: concept', 'title: Right Hand Side',
    'description: The other half of a deliberate mutual exclusion used to check the message of AGSC-07-06.',
    'kind: pattern', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
    '---', '', '## Intent', '', 'Right.', '',
  ].join('\n'));
  const mutex = run(['compose', 'left', 'right', '--json'], dir);
  const clash = mutex.envelope.findings.find((f) => f.code === 'AGSC-E801');
  assert.ok(clash, JSON.stringify(mutex.envelope.findings));
  assert.ok(clash.message.includes('AGSC-07-06'), clash.message);
  assert.ok(clash.message.includes('left') && clash.message.includes('right'), clash.message);
});

// V9-D lens (a/f), continued: the remaining three conflict kinds, each with the
// rule that raises it. A retired selection and a superseded hard dependency were
// reachable only through the real verb, so they are exercised there.
test('AGSC-07-03/05a: a retired slug and a superseded hard dependency say what to do', () => {
  const dir = workspace();
  const item = (slug, title, extra) => [
    '---', 'type: concept', `title: ${title}`,
    `description: A generated item named ${slug}, used to reach one composition conflict kind exactly.`,
    'kind: pattern', ...extra, 'prov:', '  origin: human', '  operator: human:andreibesleaga',
    '---', '', '## Intent', '', `The ${slug} item.`, '',
  ].join('\n');
  const write = (slug, title, extra) =>
    fs.writeFileSync(path.join(dir, 'content', 'concepts', `${slug}.md`), item(slug, title, extra));

  write('gone', 'Gone Long Ago', ['status: retired']);
  write('needer', 'The Needing Item', ['requires:', '  - old']);
  write('old', 'The Old Item', []);
  write('newer', 'The Newer Item', ['supersedes:', '  - old']);
  write('dangler', 'The Dangling Item', ['requires:', '  - absent']);

  const retired = run(['compose', 'gone', '--json'], dir);
  const r1 = retired.envelope.findings.find((f) => f.code === 'AGSC-E802');
  assert.ok(r1, JSON.stringify(retired.envelope.findings));
  assert.ok(r1.message.includes('retired') && r1.message.includes('AGSC-07-03'), r1.message);

  const superseded = run(['compose', 'needer', 'newer', '--json'], dir);
  const r2 = superseded.envelope.findings.find((f) => f.code === 'AGSC-E802');
  assert.ok(r2, JSON.stringify(superseded.envelope.findings));
  assert.ok(r2.message.startsWith('required item superseded — select `newer`'),
    `AGSC-07-05a fixes the message form: ${r2.message}`);
  assert.ok(r2.message.includes('AGSC-07-05a'), r2.message);

  // A `requires` target that is in no item at all: the closure reports it, and it
  // is not a superseding case, so the sentence must not promise a substitute.
  const dangling = run(['compose', 'dangler', '--json'], dir);
  const r3 = dangling.envelope.findings.find((f) => f.code === 'AGSC-E802');
  assert.ok(r3, JSON.stringify(dangling.envelope.findings));
  assert.ok(r3.message.includes('absent') && r3.message.includes('not in the graph'), r3.message);
  assert.ok(!r3.message.includes('superseded'), r3.message);
});

test('AGSC-02-90: a .md file the port cannot decode is recorded as binary, never guessed', () => {
  // eslint-disable-next-line global-require
  const initVerb = require('../../../src/application/cli/verbs/init.js');
  const port = {
    readFile: (file) => {
      if (file === 'broken.md') throw new Error('not decodable as UTF-8');
      return `# ${file}\n`;
    },
    walk: () => ['note.md', 'broken.md', 'logo.png', '.git/config', 'node_modules/x/y.md'],
  };
  assert.deepStrictEqual(initVerb.filesUnder(port), [
    { markdown: '# note.md\n', path: 'note.md' },
    { binary: true, markdown: null, path: 'broken.md' },
    { markdown: null, path: 'logo.png' },
  ]);
});
