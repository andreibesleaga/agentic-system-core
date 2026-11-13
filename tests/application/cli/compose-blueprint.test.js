'use strict';
// verifies AGSC-07-29, AGSC-07-13a, AGSC-07-12
// The blueprint outputs through the command line, on scratch copies of `tests/fixtures/minimal`
// with a saved architecture added. `compose --from <architecture> --brief` (or `compose.brief`
// set to true) writes them into `<harness dir>.companion/blueprint/`: never into the Harness
// directory and never into the `--zip` archive, whose bytes are those of the same composition
// without them; two runs write the same bytes. No other invocation writes them: no `--brief`,
// an explicit selection, or a `--from` item that is not an architecture. Fixed clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { main } = require('../../../src/application/cli/main.js');
const { captureStream } = require('../../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const BLUEPRINT = ['blueprint/build-plan.md', 'blueprint/c4-components.mmd', 'blueprint/c4-containers.mmd',
  'blueprint/c4-context.mmd', 'blueprint/decisions/0001-use-a-supervisor.md'];

/** One item file of the fixture's cluster. */
function item(type, slug, title, extra = [], body = 'Body text.') {
  return [`---`, `type: ${type}`, `title: ${title}`,
    `description: ${title}, an item the blueprint test adds to the minimal fixture.`,
    'clusters:', '  - agent-patterns', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
    ...extra, '---', '', `# ${title}`, '', body, ''].join('\n');
}

const SELECTION = '```yaml agsc-selection\n- supervisor\n- run-handoff\n```';
const ADDED = {
  'content/concepts/agent-team.md': item('concept', 'agent-team', 'Agent team', ['kind: architecture'], `The team.\n\n${SELECTION}`),
  'content/concepts/plain-note.md': item('concept', 'plain-note', 'Plain note', ['kind: pattern'], `A note.\n\n${SELECTION}`),
  'content/concepts/use-a-supervisor.md': item('concept', 'use-a-supervisor', 'Use a supervisor', ['kind: decision']),
  'content/procedures/run-handoff.md': item('procedure', 'run-handoff', 'Run the handoff', ['uses:', '  - handoff', 'decided-by:', '  - use-a-supervisor']),
};

/** A scratch copy of the fixture with the items added and `extra` files. */
function scratch(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-compose-blueprint-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  fs.rmSync(path.join(dir, 'www'), { force: true, recursive: true });
  for (const [file, text] of Object.entries({ ...ADDED, ...extra })) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}

/** `agsc <argv> --json` over the Bundle at `dir`: the exit code and the findings. */
function run(dir, ...argv) {
  const stdout = captureStream();
  const exit = main([...argv, '--json', '--quiet'], {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(dir) }, root: dir,
    specVersion: '1.0.0', stderr: captureStream(), stdout, version: '1.0.0',
  });
  return { exit, findings: JSON.parse(stdout.text() || '{}').findings || [] };
}

/** Every file under `dir`, relative, with its bytes; `{}` when there is no such directory. */
function tree(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, entry);
    if (fs.statSync(file).isFile()) out[entry.split(path.sep).join('/')] = fs.readFileSync(file, 'utf8');
  }
  return out;
}

/** The one Harness directory and its companion under `dist/harness/`, with the archive's bytes. */
function written(dir) {
  const at = path.join(dir, 'dist', 'harness');
  const names = fs.existsSync(at) ? fs.readdirSync(at).sort() : [];
  const harness = names.find((n) => !n.endsWith('.companion') && !n.endsWith('.zip'));
  const zip = names.find((n) => n.endsWith('.zip'));
  return {
    archive: zip === undefined ? null : fs.readFileSync(path.join(at, zip)),
    companion: tree(path.join(at, `${harness}.companion`)),
    harness: harness === undefined ? {} : tree(path.join(at, harness)),
    names,
  };
}

test('AGSC-07-29: compose --from <architecture> --brief writes the blueprint beside the Harness, never in it', () => {
  const dir = scratch();
  const { exit } = run(dir, 'compose', '--from', 'agent-team', '--brief', '--zip');
  assert.strictEqual(exit, 0);
  const out = written(dir);
  const companion = Object.keys(out.companion);
  assert.deepStrictEqual(companion.filter((f) => f.startsWith('blueprint/')), BLUEPRINT);
  assert.ok(companion.includes('brief.json'), 'the brief is written with the blueprint');
  // AGSC-07-12: the Harness directory holds its own files only; AGSC-07-13a: the archive
  // carries none of the blueprint's names, and its bytes are those of a run without --brief.
  assert.ok(Object.keys(out.harness).every((f) => !f.startsWith('blueprint/') && !f.startsWith('build-plan')), Object.keys(out.harness).join(' '));
  assert.ok(!out.archive.includes(Buffer.from('blueprint/')), 'the archive carries a blueprint file');
  const plain = scratch();
  assert.strictEqual(run(plain, 'compose', '--from', 'agent-team', '--zip').exit, 0);
  const without = written(plain);
  assert.deepStrictEqual(out.harness, without.harness);
  assert.ok(out.archive.equals(without.archive), 'the Harness archive moved with the blueprint');
  // The decision record is the decision a member's own `decided-by` names.
  assert.match(out.companion['blueprint/decisions/0001-use-a-supervisor.md'], /^# Use a supervisor$/mu);
  assert.match(out.companion['blueprint/build-plan.md'], /^### Step 1 — adopt `run-handoff`$/mu);
});

test('AGSC-07-29: two runs write the same blueprint bytes, also with compose.brief set in the configuration', () => {
  const first = scratch();
  const second = scratch();
  assert.strictEqual(run(first, 'compose', '--from', 'agent-team', '--brief').exit, 0);
  assert.strictEqual(run(second, 'compose', '--from', 'agent-team', '--brief').exit, 0);
  assert.deepStrictEqual(written(first).companion, written(second).companion);
  const config = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8'));
  const byConfig = scratch({ 'agsc.config.json': `${JSON.stringify({ ...config, compose: { brief: true } }, null, 2)}\n` });
  assert.strictEqual(run(byConfig, 'compose', '--from', 'agent-team').exit, 0);
  assert.deepStrictEqual(written(byConfig).companion, written(first).companion);
});

test('AGSC-07-29: no other invocation writes the blueprint', () => {
  for (const argv of [['--from', 'agent-team'], ['supervisor', 'run-handoff', '--brief'], ['--from', 'plain-note', '--brief']]) {
    const dir = scratch();
    assert.strictEqual(run(dir, 'compose', ...argv).exit, 0, argv.join(' '));
    const files = Object.keys(written(dir).companion);
    assert.deepStrictEqual(files.filter((f) => f.startsWith('blueprint/')), [], argv.join(' '));
  }
});
