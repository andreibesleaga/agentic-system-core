'use strict';
// tests/application/cli/eng2-verbs.test.js — the verb paths the ENG-2 package added:
// `compose` writing the seven Harness files of AGSC-07-12, `lint --fix` (AGSC-03-12,
// AGSC-04-14, AGSC-04-19, AGSC-04-20, the flag AGSC-09-09 names at rc.5), and
// `export --jsonld|--jsonl|--to <adapter>` (AGSC-01-26a, AGSC-01-27, D98).
//
// Each verb is driven through its own module with a real port bag over a real copy of
// `tests/fixtures/minimal` in a temporary directory and a fixed clock — an integration
// test over the real filesystem, but independent of `cli/main.js`'s argv parsing and of
// `config/load.js`, both of which belong to another package and are being changed in
// parallel. `verbs-wired.test.js` covers the shell; this covers the verbs.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { createClock } = require('../../../src/adapters/node-clock.js');
const composeVerb = require('../../../src/application/cli/verbs/compose.js');
const lintVerb = require('../../../src/application/cli/verbs/lint.js');
const exportVerb = require('../../../src/application/cli/verbs/export.js');
const harness = require('../../../src/composition/harness.js');
const adapter = require('../../../src/interchange/adapters/llm-context.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const INSTANT = '2026-01-01T00:00:00Z';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function workspace(extra = {}) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-eng2-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(extra)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

/** The verb context `cli/main.js` builds, with the pieces a verb actually reads. */
function ctxFor(dir, options = {}) {
  const lines = [];
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false, ...(options.flags || {}) },
    notes: lines,
    ports: {
      clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }),
      fs: createFileSystem(dir),
      proc: options.proc,
    },
    root: dir,
    specVersion: '1.0.0-rc.5',
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

const read = (dir, at) => nodeFs.readFileSync(path.join(dir, at), 'utf8');
const exists = (dir, at) => nodeFs.existsSync(path.join(dir, at));

// ---------------------------------------------------------------- compose

/** A workspace whose Bundle also holds a Procedure, so all seven file kinds appear. */
function withProcedure() {
  return workspace({
    'content/procedures/run-it.md': ['---', 'type: procedure', 'title: Run it',
      'description: A procedure with a body, so the skill file of AGSC-07-12 has prose to fence.',
      'prov:', '  origin: human', '  operator: human:x', '---', '',
      '## When', '', 'Whenever the supervisor hands off.', '',
      '## Steps', '', '1. Read the handoff record.', '',
      '## Checks', '', 'The record names a receiver.', ''].join('\n'),
  });
}

/** The harness directory the verb reported, `dist/harness/<name>/`. */
function harnessDirOf(ctx) {
  const at = /harness: (dist\/harness\/[0-9a-f]{16}\/)/u.exec(ctx.notes.join(''));
  assert.ok(at !== null, `no harness directory was reported: ${ctx.notes.join('')}`);
  return at[1];
}

test('AGSC-07-12: compose writes exactly the seven file kinds into dist/harness/<name>/', () => {
  const dir = withProcedure();
  const ctx = ctxFor(dir, { argv: ['supervisor', 'run-it'] });
  const result = composeVerb.run(ctx);
  assert.match(ctx.notes.join(''), /harness_emitted: true/u);
  const out = harnessDirOf(ctx);
  for (const name of harness.fixedFiles()) {
    assert.ok(exists(dir, `${out}${name}`), `${name} is missing`);
  }
  // One MADR record per selected Concept, numbered in input order (AGSC-07-12), and one
  // skill file per selected Procedure.
  assert.deepStrictEqual(nodeFs.readdirSync(path.join(dir, out, 'decisions')), ['0001-supervisor.md']);
  assert.deepStrictEqual(nodeFs.readdirSync(path.join(dir, out, 'skills')), ['run-it']);
  assert.ok(exists(dir, `${out}skills/run-it/SKILL.md`));
  // AGSC-07-12: "exactly these seven file kinds, and no others".
  assert.deepStrictEqual(nodeFs.readdirSync(path.join(dir, out)).sort(),
    [...harness.fixedFiles(), 'decisions', 'skills'].sort());
  // The skill file quotes the Procedure's own prose (AGSC-01-29), which is only
  // possible because the verb hands the body to the Composition context.
  assert.match(read(dir, `${out}skills/run-it/SKILL.md`), /Whenever the supervisor hands off\./u);
  // AGSC-01-08: nothing was written into `content/` or into `build.out`.
  assert.ok(!exists(dir, 'www'));
  assert.deepStrictEqual(result.findings.filter((f) => f.severity !== 'warn'), []);
});

test('AGSC-07-12: the directory is keyed by the selection, and the bytes are not', () => {
  const dirA = workspace();
  const dirB = workspace();
  const ctxA = ctxFor(dirA, { argv: ['supervisor'] });
  const ctxB = ctxFor(dirB, { argv: ['handoff'] });
  composeVerb.run(ctxA);
  composeVerb.run(ctxB);
  const nameOf = (ctx) => /harness: dist\/harness\/([0-9a-f]{16})\//u.exec(ctx.notes.join(''))[1];
  assert.notStrictEqual(nameOf(ctxA), nameOf(ctxB), 'two selections shared a directory');
  // The same selection, in a different order, is the same member set and the same key.
  const dirC = workspace();
  const ctxC = ctxFor(dirC, { argv: ['handoff', 'supervisor'] });
  composeVerb.run(ctxC);
  const dirD = workspace();
  const ctxD = ctxFor(dirD, { argv: ['supervisor', 'handoff'] });
  composeVerb.run(ctxD);
  assert.strictEqual(nameOf(ctxC), nameOf(ctxD));
  const key = nameOf(ctxC);
  for (const file of ['AGENTS.md', 'harness.jsonld', 'workspace.dsl', 'diagram.mmd', 'arc42.md']) {
    assert.strictEqual(read(dirC, `dist/harness/${key}/${file}`), read(dirD, `dist/harness/${key}/${file}`),
      `${file} depends on the input order`);
  }
});

test('AGSC-07-13: the same invocation twice writes byte-identical files', () => {
  const dir = workspace();
  const first = ctxFor(dir, { argv: ['supervisor'] });
  composeVerb.run(first);
  const out = /harness: (dist\/harness\/[0-9a-f]{16}\/)/u.exec(first.notes.join(''))[1];
  const before = nodeFs.readdirSync(path.join(dir, out))
    .filter((f) => nodeFs.statSync(path.join(dir, out, f)).isFile())
    .map((f) => [f, read(dir, `${out}${f}`)]);
  assert.ok(before.length >= 5);
  composeVerb.run(ctxFor(dir, { argv: ['supervisor'] }));
  for (const [file, text] of before) {
    assert.strictEqual(read(dir, `${out}${file}`), text, `${file} changed on a second run`);
  }
});

test('AGSC-07-12: every emitted file carries the terms line and the selection digest', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { argv: ['supervisor'] });
  composeVerb.run(ctx);
  const out = harnessDirOf(ctx);
  const digest = out.slice('dist/harness/'.length, -1);
  const files = [...nodeFs.readdirSync(path.join(dir, out))
    .filter((f) => nodeFs.statSync(path.join(dir, out, f)).isFile()).map((f) => `${out}${f}`),
  ...nodeFs.readdirSync(path.join(dir, out, 'decisions')).map((f) => `${out}decisions/${f}`)];
  assert.ok(files.length >= 6, `only ${files.length} files were written`);
  for (const at of files) {
    const text = read(dir, at);
    assert.ok(text.includes('LicenseRef-AgenticSystemCore-Content-Use-1.0'),
      `${at} does not name the Content Use Terms (AGSC-07-16)`);
    assert.ok(text.includes('CC0-1.0'), `${at} does not state the structure licence (AGSC-07-16)`);
    assert.ok(text.includes(digest), `${at} does not carry the selection digest`);
    assert.ok(!text.startsWith('#!'), `${at} carries a shebang (AGSC-07-15)`);
  }
  // The digest is the SHA-256 of the canonical member set and of nothing else.
  const jsonld = JSON.parse(read(dir, `${out}harness.jsonld`));
  assert.strictEqual(createHash('sha256')
    .update(harness.canonicalJson(jsonld.selection), 'utf8').digest('hex').slice(0, 16), digest);
  assert.strictEqual(jsonld.generated_at, INSTANT);
});

test('AGSC-07-17: an invalid composition writes nothing at all', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { argv: ['no-such-slug'] });
  const result = composeVerb.run(ctx);
  assert.match(ctx.notes.join(''), /harness_emitted: false/u);
  assert.match(ctx.notes.join(''), /harness missing: every file: the composition is invalid/u);
  assert.ok(!exists(dir, 'dist'), 'a directory was created for an invalid composition');
  assert.ok(result.findings.some((f) => /AGSC-07-03/u.test(f.message)));
});

test('--out writes the same bytes to a directory the operator names', () => {
  const dir = workspace();
  const withFlag = ctxFor(dir, { argv: ['supervisor'], verbFlags: { out: 'somewhere/else/' } });
  composeVerb.run(withFlag);
  assert.ok(exists(dir, 'somewhere/else/AGENTS.md'));
  const plain = workspace();
  const ctx = ctxFor(plain, { argv: ['supervisor'] });
  composeVerb.run(ctx);
  const out = /harness: (dist\/harness\/[0-9a-f]{16}\/)/u.exec(ctx.notes.join(''))[1];
  assert.strictEqual(read(dir, 'somewhere/else/AGENTS.md'), read(plain, `${out}AGENTS.md`),
    'the emitted bytes depend on where they were written');
  // An empty `--out` falls back to the rule's own location rather than writing to `/`.
  const empty = workspace();
  const emptyCtx = ctxFor(empty, { argv: ['supervisor'], verbFlags: { out: '' } });
  composeVerb.run(emptyCtx);
  assert.match(emptyCtx.notes.join(''), /harness: dist\/harness\/[0-9a-f]{16}\//u);
});

test('AGSC-07-24: compose --from reads the selection from a saved architecture item', () => {
  const dir = workspace({
    'content/concepts/saved.md': ['---', 'type: concept', 'title: Saved composition',
      'description: An architecture item whose selection block names two concepts.',
      'prov:', '  origin: human', '  operator: human:x', 'kind: architecture', '---', '',
      '```yaml agsc-selection', '- supervisor', '```', ''].join('\n'),
  });
  const ctx = ctxFor(dir, { verbFlags: { from: 'saved' } });
  composeVerb.run(ctx);
  const notes = ctx.notes.join('');
  assert.match(notes, /"selection":\["supervisor"\]/u);
  assert.match(notes, /harness_emitted: true/u);
});

test('AGSC-07-18: --emit still reports that no target rendering is shipped', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { argv: ['supervisor'], verbFlags: { emit: 'gabbe' } });
  const result = composeVerb.run(ctx);
  const own = result.findings.filter((f) => /AGSC-07-18/u.test(f.message));
  assert.strictEqual(own.length, 1);
  assert.strictEqual(own[0].severity, 'error');
  // The seven files are written all the same: the rendering is what is missing.
  assert.match(ctx.notes.join(''), /harness_emitted: true/u);
});

// ---------------------------------------------------------------- lint --fix

test('AGSC-09-09: lint --fix rewrites the files, and lint without it changes nothing', () => {
  const unfixed = ['---', 'kind: pattern', 'title: Needs a fix', 'type: concept',
    'description: An item whose keys are out of schema order and whose body has a wikilink.',
    'prov:', '  operator: human:x', '  origin: human', '---', '',
    'See [[supervisor]].', ''].join('\r\n');
  const dir = workspace({ 'content/concepts/needs-a-fix.md': unfixed });
  // Without the flag: not one byte moves.
  lintVerb.run(ctxFor(dir));
  assert.strictEqual(read(dir, 'content/concepts/needs-a-fix.md'), unfixed);
  // With it: the file is normalised and named on stderr.
  const ctx = ctxFor(dir, { verbFlags: { fix: true } });
  const result = lintVerb.run(ctx);
  const after = read(dir, 'content/concepts/needs-a-fix.md');
  assert.ok(!after.includes('\r'), 'a CR survived');
  assert.match(after, /^---\ntype: concept\ntitle: Needs a fix\n/u);
  assert.match(after, /See \[supervisor\]\(\.\.\/concepts\/supervisor\.md\)\./u);
  assert.match(ctx.notes.join(''), /fixed: content\/concepts\/needs-a-fix\.md/u);
  assert.match(ctx.notes.join(''), /lane: fix \(1 file written\)/u);
  // AGSC-04-19 as amended at rc.5 (ENG2-03) assigns a code PER NORMALISATION, so a
  // file that needed CRLF→LF, a key reorder AND a wikilink rewrite is three findings:
  // the encoding one under AGSC-E108 (AGSC-01-14) and the other two under AGSC-E506.
  const own = result.findings.filter((f) => /lint --fix normalised/u.test(f.message));
  assert.strictEqual(own.length, 3);
  assert.ok(own.every((f) => f.severity === 'warn'), '--fix changed an exit code by itself');
  assert.deepStrictEqual(own.map((f) => f.code), ['AGSC-E108', 'AGSC-E506', 'AGSC-E506']);
  assert.match(own[0].message, /line endings, NFC and the trailing newline/u);
  assert.match(own[1].message, /frontmatter key order/u);
  assert.match(own[2].message, /wikilink/u);
  // AGSC-04-19: a second run is a no-op, on disk and in the report.
  const second = ctxFor(dir, { verbFlags: { fix: true } });
  lintVerb.run(second);
  assert.strictEqual(read(dir, 'content/concepts/needs-a-fix.md'), after);
  assert.match(second.notes.join(''), /lane: fix \(0 files written\)/u);
});

test('lint --fix under --json is a DRY RUN: it reports and writes nothing', () => {
  const unfixed = ['---', 'title: Dry', 'type: concept',
    'description: An item out of schema order, used to prove the dry run writes nothing.',
    'prov:', '  origin: human', '  operator: human:x', 'kind: explainer', '---', '', 'Body.', ''].join('\n');
  const dir = workspace({ 'content/concepts/dry.md': unfixed });
  const ctx = ctxFor(dir, { flags: { json: true }, verbFlags: { fix: true } });
  const result = lintVerb.run(ctx);
  assert.strictEqual(read(dir, 'content/concepts/dry.md'), unfixed, 'the dry run wrote to disk');
  assert.match(ctx.notes.join(''), /lane: fix \(dry run under --json; 1 file would change\)/u);
  const own = result.findings.filter((f) => /lint --fix would normalise/u.test(f.message));
  assert.strictEqual(own.length, 1);
  assert.match(own[0].message, /frontmatter key order/u);
  assert.match(own[0].message, /AGSC-04-19/u);
});

test('AGSC-E108: an encoding-only change is reported under the encoding code', () => {
  const dir = workspace({
    'content/concepts/crlf.md': ['---', 'type: concept', 'title: Crlf',
      'description: An item whose only fault is its line endings and trailing blank lines.',
      'prov:', '  origin: human', '  operator: human:x', 'kind: explainer', '---', '',
      'Body.', '', '', ''].join('\r\n'),
  });
  const ctx = ctxFor(dir, { flags: { json: true }, verbFlags: { fix: true } });
  const codes = lintVerb.run(ctx).findings
    .filter((f) => /lint --fix would normalise/u.test(f.message)).map((f) => f.code);
  assert.deepStrictEqual(codes, ['AGSC-E108']);
});

test('lint --fix over an already-normalised Bundle reports nothing and touches nothing', () => {
  const dir = workspace();
  const before = nodeFs.readdirSync(path.join(dir, 'content', 'concepts'))
    .map((f) => [f, read(dir, `content/concepts/${f}`)]);
  const ctx = ctxFor(dir, { verbFlags: { fix: true } });
  const result = lintVerb.run(ctx);
  for (const [file, text] of before) {
    assert.strictEqual(read(dir, `content/concepts/${file}`), text, `${file} was rewritten`);
  }
  assert.deepStrictEqual(result.findings.filter((f) => /lint --fix/u.test(f.message)), []);
  assert.match(ctx.notes.join(''), /lane: fix \(0 files written\)/u);
});

test('lint --fix copes with a file the port cannot re-read', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { fix: true } });
  ctx.ports.fs = {
    ...ctx.ports.fs,
    readFile: (at, encoding) => {
      if (String(at).endsWith('supervisor.md')) throw new Error('vanished');
      return createFileSystem(dir).readFile(at, encoding);
    },
  };
  // The loader already read the Bundle, so the verb still runs; the file it cannot
  // re-read is simply not normalised, and nothing throws.
  assert.doesNotThrow(() => lintVerb.fix(ctx, { config: {}, items: [{ path: 'content/concepts/supervisor.md', slug: 'supervisor', type: 'concept' }] }));
});

// ---------------------------------------------------------------- export

test('AGSC-09-09: export with no flag asks for one and writes nothing', () => {
  const dir = workspace();
  const result = exportVerb.run(ctxFor(dir));
  assert.strictEqual(result.status, 'fail');
  assert.strictEqual(result.findings[0].code, 'AGSC-E003');
  assert.ok(!exists(dir, 'dist'));
});

test('AGSC-01-27: export --jsonld is byte-identical to the graph.jsonld of the same build', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { jsonld: true } });
  exportVerb.run(ctx);
  assert.ok(exists(dir, 'dist/export/graph.jsonld'));
  // The reference bytes: the same build, taken through `build`'s own port path.
  const buildVerb = require('../../../src/application/cli/verbs/build.js');
  const buildCtx = ctxFor(dir);
  buildVerb.run(buildCtx);
  assert.strictEqual(read(dir, 'dist/export/graph.jsonld'), read(dir, 'www/graph.jsonld'));
  assert.match(ctx.notes.join(''), /wrote: dist\/export\/graph\.jsonld sha256:[0-9a-f]{64}/u);
});

test('AGSC-01-27: export --jsonl is one JCS line per item, in slug order', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { jsonl: true } });
  exportVerb.run(ctx);
  const text = read(dir, 'dist/export/items.jsonl');
  const lines = text.split('\n');
  assert.strictEqual(lines[lines.length - 1], '', 'the file does not end in exactly one LF');
  const records = lines.slice(0, -1).map((l) => JSON.parse(l));
  assert.strictEqual(records.length, 3);
  for (let i = 0; i < records.length; i += 1) {
    assert.strictEqual(lines[i], canonicalize(records[i]), `line ${i + 1} is not JCS-canonical`);
  }
  // Each line is exactly the per-item JSON-LD node the build emits.
  const buildVerb = require('../../../src/application/cli/verbs/build.js');
  buildVerb.run(ctxFor(dir));
  const slugs = nodeFs.readdirSync(path.join(dir, 'www', 'pages'))
    .filter((f) => f.endsWith('.jsonld')).map((f) => f.replace(/\.jsonld$/u, '')).sort();
  assert.strictEqual(slugs.length, records.length);
  for (let i = 0; i < slugs.length; i += 1) {
    assert.strictEqual(`${lines[i]}\n`, read(dir, `www/pages/${slugs[i]}.jsonld`),
      `line ${i + 1} is not the per-item node of ${slugs[i]}`);
  }
});

test('the three unimplemented export flags each answer for themselves, and none writes', () => {
  for (const flag of ['markdown', 'okf', 'steer']) {
    const dir = workspace();
    const result = exportVerb.run(ctxFor(dir, { verbFlags: { [flag]: true } }));
    const own = result.findings.filter((f) => f.message.includes(`export --${flag}`));
    assert.strictEqual(own.length, 1, flag);
    assert.match(own[0].message, /not implemented at this milestone/u, flag);
    assert.ok(!exists(dir, 'dist'), `${flag} wrote something`);
  }
});

test('D98 / AGSC-01-26a: export --to llm-context writes the two files outside build.out', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { to: 'llm-context' } });
  const result = exportVerb.run(ctx);
  assert.deepStrictEqual(result.findings.filter((f) => f.severity !== 'warn'), []);
  for (const file of adapter.FILES) {
    assert.ok(exists(dir, `dist/export/llm-context/${file}`), `${file} was not written`);
  }
  // Outside `build.out`: the route set AGSC-06-01 closes is untouched.
  assert.ok(!exists(dir, 'www'), 'the adapter wrote into build.out');
  const notes = ctx.notes.join('');
  assert.match(notes, /wrote: dist\/export\/llm-context\/chunks-index\.toon sha256:[0-9a-f]{64}/u);
  assert.match(notes, /wrote: dist\/export\/llm-context\/llms-ctx\.txt sha256:[0-9a-f]{64}/u);
  // The printed digest is the digest of the bytes on disk.
  for (const file of adapter.FILES) {
    const digest = new RegExp(`${file.replace(/[.]/gu, '\\.')} sha256:([0-9a-f]{64})`, 'u').exec(notes)[1];
    assert.strictEqual(createHash('sha256').update(read(dir, `dist/export/llm-context/${file}`), 'utf8').digest('hex'), digest);
  }
  // AGSC-06-35: the note tells the operator how to declare them.
  assert.match(notes, /related\[\] link, rel "alternate" \(AGSC-06-35\)/u);
});

test('AGSC-04-01: the adapter output is identical on a second run', () => {
  const dir = workspace();
  exportVerb.run(ctxFor(dir, { verbFlags: { to: 'llm-context' } }));
  const first = adapter.FILES.map((f) => read(dir, `dist/export/llm-context/${f}`));
  exportVerb.run(ctxFor(dir, { verbFlags: { to: 'llm-context' } }));
  assert.deepStrictEqual(adapter.FILES.map((f) => read(dir, `dist/export/llm-context/${f}`)), first);
});

test('AGSC-01-26a: an adapter name is checked against the slug grammar before it is loaded', () => {
  for (const name of ['../../../package', '/etc/passwd', 'a/b', 'A', 'a..b', '', 'a_b', 'a--b.js']) {
    const found = exportVerb.adapterOf(name);
    assert.strictEqual(found.module, null, name);
    assert.match(found.reason, /AGSC-01-26a/u, name);
  }
  assert.strictEqual(exportVerb.adapterOf('llm-context').module, require('../../../src/interchange/adapters/llm-context.js'));
  assert.strictEqual(exportVerb.adapterOf('no-such-adapter').module, null);
  assert.match(exportVerb.adapterOf('no-such-adapter').reason, /no adapter named/u);
});

test('an unknown adapter is one honest finding, not a crash and not a silent success', () => {
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { to: 'nope' } });
  const result = exportVerb.run(ctx);
  assert.strictEqual(result.findings.length, 1);
  assert.strictEqual(result.findings[0].code, 'AGSC-E001');
  assert.match(result.findings[0].message, /no adapter named "nope"/u);
  assert.ok(!exists(dir, 'dist'));
});

test('instantOf reads the Clock port and never a wall clock', () => {
  const dir = workspace();
  assert.strictEqual(exportVerb.instantOf(ctxFor(dir)), INSTANT);
  // A clock with no `iso()` is rendered from its epoch seconds; no port at all is 0.
  assert.strictEqual(exportVerb.instantOf({ ports: { clock: { now: () => 0 } } }), '1970-01-01T00:00:00Z');
  assert.strictEqual(exportVerb.instantOf({ ports: {} }), '1970-01-01T00:00:00Z');
});

test('AGSC-01-27: a build with no graph view, and one with no per-item view, each say so', () => {
  // The two guards `graphFiles` carries, driven as data rather than by disabling a
  // collaborator through a flag that does not exist: a caller asking for a view the
  // build did not produce gets one honest finding and no file.
  const empty = exportVerb.graphFiles(new Map(), { jsonld: true, jsonl: true });
  assert.deepStrictEqual(empty.writes, []);
  assert.deepStrictEqual(empty.findings.map((f) => f.code), ['AGSC-E001', 'AGSC-E001']);
  assert.match(empty.findings[0].message, /no \/graph\.jsonld/u);
  assert.match(empty.findings[1].message, /no per-item JSON-LD view/u);
  // A Level-0 emission is exactly that case for `--jsonl`: `/graph.jsonld` is a
  // Level-0 artefact, the per-item views are not (AGSC-10-02, AGSC-06-02).
  const dir = workspace();
  const ctx = ctxFor(dir, { verbFlags: { jsonl: true, jsonld: true, level: '0' } });
  const result = exportVerb.run(ctx);
  assert.ok(exists(dir, 'dist/export/graph.jsonld'));
  assert.ok(!exists(dir, 'dist/export/items.jsonl'));
  assert.ok(result.findings.some((f) => /no per-item JSON-LD view/u.test(f.message)));
});

test('a composition conflict of an unexpected kind still reads as a sentence', () => {
  // The four kinds AGSC-07-09 raises are covered through the real verb; this is the
  // fallback, which exists so that a kind added to the algebra later can never print
  // as `undefined` on a person's terminal (R64).
  assert.strictEqual(composeVerb.conflictMessage({ code: 'AGSC-E809', key: 'ports', pair: ['a', 'b'] }),
    'composition conflict on ports: a / b (AGSC-07-09)');
  assert.strictEqual(composeVerb.conflictMessage({ code: 'AGSC-E809', key: 'ports' }),
    'composition conflict on ports:  (AGSC-07-09)');
});

test('R64: a composition warning prints a sentence, never a blank diagnostic line', () => {
  // `agsc compose supervisor` printed `warn: AGSC-E803 ` — the commonest outcome there
  // is, with an empty message, because a verdict warning is a domain record and the
  // application layer never gave it one (F27-11 in the Composition lane).
  assert.match(composeVerb.warningMessage({ code: 'AGSC-E803', key: 'uses', source: 'a', target: 'b' }),
    /`a` names `b` under `uses`.*AGSC-07-05, AGSC-07-07/u);
  assert.match(composeVerb.warningMessage({ code: 'AGSC-E804', key: 'consumes', source: 'a', target: 'p' }),
    /consumes the port `p`.*AGSC-07-23/u);
  assert.strictEqual(composeVerb.warningMessage({ code: 'AGSC-E899', key: 'other' }),
    'composition warning on other:  →  (AGSC-E899)');
  const dir = workspace();
  const ctx = ctxFor(dir, { argv: ['supervisor'] });
  const warnings = composeVerb.run(ctx).findings.filter((f) => f.severity === 'warn');
  assert.ok(warnings.length > 0, 'the fixture raised no composition warning');
  for (const warning of warnings) {
    assert.ok(typeof warning.message === 'string' && warning.message !== '',
      `${warning.code} carries no message`);
  }
});
