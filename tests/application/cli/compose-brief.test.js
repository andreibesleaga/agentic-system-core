'use strict';
// verifies AGSC-07-25, AGSC-07-28, AGSC-09-09, AGSC-01-18
// The brief through the command line, on scratch copies of `tests/fixtures/minimal` with a draft
// item, an item that excludes `handoff` and a Procedure added. `compose --brief`, or
// `compose.brief: true` in the configuration, writes the four files of the brief in
// `<harness dir>.companion/` — beside the Harness, never in it and never in the `--zip` archive —
// and the seven Harness files keep the bytes of the same composition without the brief. An
// invalid composition gets its brief and no Harness, exit 1. `--narrate <agent>` needs `--brief`
// (AGSC-E003, exit 2); with it, this distribution, which ships no model adapter, answers
// AGSC-E001 at exit 1, writes no `narration.md` and still writes the brief (AGSC-07-28).
// Fixed clock, no network.

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
const CONTEXT_NODE = require(path.join(ROOT, 'tests', 'vectors', 'lint', 'lint-0060-titles-are-unique-inside-one-context.json')).input.add_files;
const BRIEF_FILES = ['BRIEF.md', 'brief.json', 'brief.mmd', 'context.md'];

/** One item file. */
function item(type, slug, title, extra = []) {
  return [`---`, `type: ${type}`, `title: ${title}`,
    `description: ${title}, an item the brief test adds to the minimal fixture.`,
    'clusters:', '  - agent-patterns', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
    ...extra, '---', '', `# ${title}`, '', 'Body text.', ''].join('\n');
}

const ADDED = {
  'content/concepts/draft-note.md': item('concept', 'draft-note', 'Draft note', ['status: draft', 'related:', '  - supervisor']),
  'content/concepts/rival.md': item('concept', 'rival', 'Rival', ['excludes:', '  - handoff']),
  'content/procedures/check-handoff.md': item('procedure', 'check-handoff', 'Check the handoff', ['verifies:', '  - supervisor']),
};

/** A scratch copy of the fixture with `files` added (each `{path: text}`). */
function scratch(...fileSets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-compose-brief-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  fs.rmSync(path.join(dir, 'www'), { force: true, recursive: true });
  for (const [file, text] of Object.entries(Object.assign({}, ...fileSets))) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  return dir;
}

/** The fixture's configuration with `fields` set. */
function config(fields) {
  const base = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8'));
  return { 'agsc.config.json': `${JSON.stringify({ ...base, ...fields }, null, 2)}\n` };
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

/** The entries of `dist/harness/`: the Harness directories and the companion directories. */
function harnessEntries(dir) {
  const at = path.join(dir, 'dist', 'harness');
  const names = fs.existsSync(at) ? fs.readdirSync(at).sort() : [];
  return { companions: names.filter((n) => n.endsWith('.companion')), harnesses: names.filter((n) => !n.endsWith('.companion') && !n.endsWith('.zip')) };
}

const errors = (findings) => findings.filter((f) => f.severity === 'error').map((f) => f.code);

test('AGSC-07-25: compose --brief writes the four files beside the Harness, and the Harness keeps its bytes', () => {
  const plain = scratch(ADDED);
  assert.strictEqual(run(plain, 'compose', 'supervisor').exit, 0);
  assert.deepStrictEqual(harnessEntries(plain).companions, [], 'no brief was asked for, so no companion directory');

  const dir = scratch(ADDED);
  assert.strictEqual(run(dir, 'compose', 'supervisor', '--brief').exit, 0);
  const { companions, harnesses } = harnessEntries(dir);
  assert.deepStrictEqual(companions, [`${harnesses[0]}.companion`]);
  const brief = tree(path.join(dir, 'dist', 'harness', companions[0]));
  assert.deepStrictEqual(Object.keys(brief).sort(), BRIEF_FILES);
  const harness = tree(path.join(dir, 'dist', 'harness', harnesses[0]));
  assert.ok(!Object.keys(harness).some((name) => BRIEF_FILES.includes(name)), 'a brief file is inside the Harness directory');
  assert.deepStrictEqual(harness, tree(path.join(plain, 'dist', 'harness', harnesses[0])), 'the seven file kinds moved');

  const record = JSON.parse(brief['brief.json']);
  assert.strictEqual(record.selection_digest.slice(0, 16), harnesses[0]);
  assert.deepStrictEqual(record.selection, ['supervisor']);
  assert.match(record.summary, /^Items in the selection: 1\. .* The composition is valid\.$/u);
  assert.deepStrictEqual(record.checklist.map((c) => c.text), ['adopt `supervisor`', 'run `check-handoff`, which verifies `supervisor`']);
  assert.deepStrictEqual(record.gaps.map((g) => g.kind), ['uses-not-selected', 'no-sources']);
  for (const [name, text] of Object.entries(brief)) {
    assert.ok(!text.includes('draft-note'), `${name} names the draft (AGSC-00-05)`);
    assert.ok(!text.includes('undefined') && !text.includes('[object Object]'), `${name} carries a placeholder`);
  }
});

test('AGSC-01-18: compose.brief true in the configuration writes the same brief as the flag', () => {
  const byFlag = scratch(ADDED);
  const byConfig = scratch(ADDED, config({ compose: { brief: true } }));
  assert.strictEqual(run(byFlag, 'compose', 'supervisor', 'handoff', '--brief').exit, 0);
  assert.strictEqual(run(byConfig, 'compose', 'supervisor', 'handoff').exit, 0);
  assert.deepStrictEqual(tree(path.join(byConfig, 'dist')), tree(path.join(byFlag, 'dist')));
  const off = scratch(ADDED, config({ compose: { brief: false } }));
  assert.strictEqual(run(off, 'compose', 'supervisor', 'handoff').exit, 0);
  assert.deepStrictEqual(harnessEntries(off).companions, []);
});

test('AGSC-07-25: with --out <dir> the brief is in <dir>.companion/, and --zip packages the Harness alone', () => {
  const dir = scratch(ADDED);
  assert.strictEqual(run(dir, 'compose', 'supervisor', '--out', 'out/h', '--brief', '--zip').exit, 0);
  assert.deepStrictEqual(Object.keys(tree(path.join(dir, 'out', 'h.companion'))).sort(), BRIEF_FILES);
  const archives = fs.readdirSync(path.join(dir, 'out')).filter((name) => name.endsWith('.zip'));
  assert.strictEqual(archives.length, 1);
  const bytes = fs.readFileSync(path.join(dir, 'out', archives[0])).toString('latin1');
  for (const name of BRIEF_FILES) assert.ok(!bytes.includes(name), `${name} entered the archive (AGSC-07-13a)`);
  assert.ok(bytes.includes('harness.jsonld'));
});

test('AGSC-07-25: an invalid composition gets its brief and no Harness, exit 1', () => {
  const dir = scratch(ADDED);
  const r = run(dir, 'compose', 'rival', 'handoff', '--brief');
  assert.strictEqual(r.exit, 1);
  assert.deepStrictEqual(errors(r.findings), ['AGSC-E801']);
  const { companions, harnesses } = harnessEntries(dir);
  assert.deepStrictEqual(harnesses, [], 'an invalid composition emits no Harness (AGSC-07-17)');
  assert.strictEqual(companions.length, 1);
  const record = JSON.parse(tree(path.join(dir, 'dist', 'harness', companions[0]))['brief.json']);
  assert.strictEqual(record.valid, false);
  assert.match(record.summary, /The composition is not valid \(AGSC-E801\)\.$/u);
  assert.deepStrictEqual(record.checklist.filter((c) => c.kind === 'resolve').map((c) => c.text),
    ['resolve AGSC-E801 between `handoff` and `rival`']);
});

test('AGSC-07-25: a run stopped by another error writes no brief either', () => {
  const dir = scratch(ADDED);
  const r = run(dir, 'compose', 'supervisor', '--brief', '--emit', 'crewai');
  assert.strictEqual(r.exit, 1);
  assert.deepStrictEqual(errors(r.findings), ['AGSC-E203']);
  assert.ok(!fs.existsSync(path.join(dir, 'dist')));
});

test('AGSC-09-09: --narrate without --brief is AGSC-E003, exit 2, and nothing is written', () => {
  const dir = scratch(ADDED);
  const r = run(dir, 'compose', 'supervisor', '--narrate', 'writer');
  assert.strictEqual(r.exit, 2);
  assert.deepStrictEqual(errors(r.findings), ['AGSC-E003']);
  assert.ok(!fs.existsSync(path.join(dir, 'dist')));
});

test('AGSC-07-28: --brief --narrate is AGSC-E001 at exit 1 in a distribution with no model adapter; no narration.md, the brief is written', () => {
  const dir = scratch(ADDED, config({ agents: [{ enabled: true, model: 'some-model', name: 'writer', tasks: ['summarize'] }] }));
  const r = run(dir, 'compose', 'supervisor', '--brief', '--narrate', 'writer');
  assert.strictEqual(r.exit, 1);
  assert.deepStrictEqual(errors(r.findings), ['AGSC-E001']);
  const { companions, harnesses } = harnessEntries(dir);
  assert.strictEqual(harnesses.length, 1, 'the Harness of a valid composition is still written');
  const files = Object.keys(tree(path.join(dir, 'dist', 'harness', companions[0]))).sort();
  assert.deepStrictEqual(files, BRIEF_FILES, 'narration.md was written, or the brief was not');
});

test('AGSC-07-25 with AGSC-07-30: a node that declares contexts gets the context map and the brief in one companion directory', () => {
  const dir = scratch(CONTEXT_NODE);
  assert.strictEqual(run(dir, 'compose', 'account-a', 'handoff', '--brief').exit, 0);
  const { companions } = harnessEntries(dir);
  assert.deepStrictEqual(Object.keys(tree(path.join(dir, 'dist', 'harness', companions[0]))).sort(),
    [...BRIEF_FILES.slice(0, 3), 'context-map.json', 'context.md']);
});
