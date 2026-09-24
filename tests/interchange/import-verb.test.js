'use strict';
// `agsc import --from old-site --selection <tsv> <dir>` end to end, through the
// REAL shell, over a real copy of `tests/fixtures/old-site-10` in a temporary
// directory — never the repository, so a test leaves nothing behind.
//
// The four claims the verb makes, and nowhere else does:
//
//   1. the invocation errors are AGSC-09-08's codes (AGSC-E003 for a missing
//      argument, AGSC-E002 for a `--from` value outside the set), never a throw;
//   2. the source and the selection file are read through SEPARATE rooted ports,
//      so the Bundle's own port never has to reach outside its root (AGSC-E902);
//   3. AGSC-01-23's idempotence holds on the TREE: a second run writes nothing;
//   4. the Bundle it produces passes `lint`, `build`, `verify` and `ci`.
//
// Deterministic: one fixed `SOURCE_DATE_EPOCH`, no network, no wall clock.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { main } = require('../../src/application/cli/main.js');
const verb = require('../../src/application/cli/verbs/import.js');
const { captureStream } = require('../conformance/areas/_shared.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'old-site-10');
const SELECTION = path.join(FIXTURE, 'selection.tsv');
/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true });
});

/** An empty Bundle whose `agsc.config.json` states only its identity. */
function workspace(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-import-'));
  temporaries.push(dir);
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify({
    bundle: { id: 'fixture-node', operator: 'human:tester' },
    // AGSC-06-18 as amended at rc.6: a node that publishes a TDM
    // reservation — which every 1.x node does — names at least one crawler token,
    // or its build is AGSC-E202. The list is the publisher's own; these are the six
    // whose operators' own documentation says they collect content for training.
    site: {
      base: 'https://example.org/',
      tdm_crawlers: ['Applebot-Extended', 'CCBot', 'ClaudeBot', 'GPTBot', 'Google-Extended', 'meta-externalagent'],
      title: 'Fixture Node',
    },
    spec_version: '1.0.0-rc.4',
    ...extra,
  }, null, 2)}\n`);
  // RFC 9116 §2.5.3: a Bundle that publishes a site states a security contact, and
  // since the public-statements package the build refuses to emit an invalid
  // `security.txt` rather than one with no `Contact:` field.
  fs.mkdirSync(path.join(dir, '.well-known'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.well-known', 'security.txt'),
    'Contact: https://security.example.net/report\nPreferred-Languages: en\n');
  return dir;
}

function run(argv, dir) {
  const stdout = captureStream();
  const stderr = captureStream();
  // eslint-disable-next-line global-require
  const { createFileSystem } = require('../../src/adapters/node-fs.js');
  const exit = main(argv, {
    env: { SOURCE_DATE_EPOCH: EPOCH },
    ports: { fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0-rc.4',
    stderr,
    stdout,
    version: '0.0.0',
  });
  const text = stdout.text();
  return { envelope: argv.includes('--json') && text !== '' ? JSON.parse(text) : null, exit, stderr: stderr.text() };
}

const IMPORT = ['import', '--from', 'old-site', '--selection', SELECTION, FIXTURE, '--json', '--quiet'];

/** Every file of a tree, path -> bytes, so two runs can be compared exactly. */
function tree(dir) {
  const out = new Map();
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else out.set(child, fs.readFileSync(path.join(dir, child)).toString('utf8'));
    }
  };
  walk('');
  return out;
}

test('AGSC-09-08: a missing --from, --selection or directory is AGSC-E003, exit 2', () => {
  const dir = workspace();
  const bare = run(['import', '--json', '--quiet'], dir);
  // AGSC-09-08: a missing argument is the usage class, exit 2, even as a finding.
  assert.strictEqual(bare.exit, 2);
  // Two, not three, since: `--selection` belongs to the `old-site` ADAPTER
  // (AGSC-01-26a) and is required only when that adapter is the one named, so a bare
  // `import` is missing `--from` and the source directory and nothing else.
  assert.deepStrictEqual(bare.envelope.findings.map((f) => f.code),
    ['AGSC-E003', 'AGSC-E003']);
  for (const f of bare.envelope.findings) assert.match(f.message, /AGSC-01-22/u);
  assert.strictEqual(tree(dir).size, 2, 'a refused invocation writes nothing');
});

test('AGSC-01-26a: a --from value outside the set is AGSC-E203, exit 1, and names the set', () => {
  const result = run(['import', '--from', 'notion', FIXTURE, '--json', '--quiet'], workspace());
  assert.strictEqual(result.exit, 1);
  assert.deepStrictEqual(result.envelope.findings.map((f) => f.code), ['AGSC-E203']);
  assert.match(result.envelope.findings[0].message, /old-site/u);
  assert.match(result.envelope.findings[0].message, /okf/u);
  // The `okf` reader of AGSC-01-22 was added later; `--selection` stays the `old-site`
  // adapter's own flag and is required for that adapter alone.
  assert.deepStrictEqual([...verb.FORMATS], ['okf', 'old-site', 'cogx', 'gabbe', 'skills', 'board']);
  assert.deepStrictEqual([...verb.SELECTION_REQUIRED], ['old-site']);
});

test('AGSC-09-09: an adapter\'s own flags are ADAPTER-SCOPED', () => {
  // "a memory adapter selected by `export --to` / `import --from` MAY define further
  // flags of its own … an engine that does not ship the adapter rejects them with
  // AGSC-E002." So `--selection` is legal under `old-site` and a usage error under
  // any other adapter or none at all — never a global allow-list on the verb.
  // eslint-disable-next-line global-require
  const main = require('../../src/application/cli/main.js');
  assert.deepStrictEqual([...main.VERB_FLAGS.import.keys()], ['--from', '--dry-run']);
  // added `--replace` to both adapters: the documented, explicit way to let
  // a foreign bundle replace an item this node already holds.
  assert.deepStrictEqual([...main.adapterFlagsFor('import', ['--from', 'old-site']).keys()],
    ['--selection', '--corrections', '--attach-diagrams', '--replace']);
  // rc.6: `--allow-newer` is the OKF adapter's own flag for AGSC-01-22's
  // tolerance limit, and is a usage error under any other adapter or none.
  assert.deepStrictEqual([...main.adapterFlagsFor('import', ['--from', 'okf']).keys()],
    ['--replace', '--allow-newer']);
  assert.deepStrictEqual([...main.adapterFlagsFor('import', ['--from', 'notion']).keys()], []);
  assert.deepStrictEqual([...main.adapterFlagsFor('import', []).keys()], []);
  assert.deepStrictEqual([...main.adapterFlagsFor('lint', ['--from', 'old-site']).keys()], []);
  assert.deepStrictEqual([...main.flagsFor('import', ['--from', 'old-site']).keys()],
    ['--from', '--dry-run', '--selection', '--corrections', '--attach-diagrams', '--replace']);

  for (const argv of [['import', '--selection', SELECTION, FIXTURE, '--quiet'],
    ['import', '--from', 'notion', '--selection', SELECTION, FIXTURE, '--quiet']]) {
    const refused = run(argv, workspace());
    assert.strictEqual(refused.exit, 2, JSON.stringify(argv));
    assert.match(refused.stderr, /AGSC-E002/u, refused.stderr);
    assert.match(refused.stderr, /--selection/u, refused.stderr);
  }
});

test('an unreadable selection file, and an unreadable corrections file, are AGSC-E003', () => {
  const missing = run(['import', '--from', 'old-site', '--selection', path.join(FIXTURE, 'nosuch.tsv'),
    FIXTURE, '--json', '--quiet'], workspace());
  assert.deepStrictEqual(missing.envelope.findings.map((f) => f.code), ['AGSC-E003']);
  assert.match(missing.envelope.findings[0].message, /could not be read/u);
  const badJson = run([...IMPORT.slice(0, 5), '--corrections', SELECTION, FIXTURE, '--json', '--quiet'],
    workspace());
  assert.deepStrictEqual(badJson.envelope.findings.map((f) => f.code), ['AGSC-E003']);
  assert.match(badJson.envelope.findings[0].message, /could not be read as JSON/u);
});

test('a source directory holding no record of the format is AGSC-E901, and nothing is written', () => {
  const dir = workspace();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-empty-'));
  temporaries.push(empty);
  const result = run(['import', '--from', 'old-site', '--selection', SELECTION, empty, '--json', '--quiet'], dir);
  assert.strictEqual(result.exit, 1);
  assert.ok(result.envelope.findings.some((f) => f.code === 'AGSC-E901'
    && /holds no "content\/patterns\/\*\.md" record/u.test(f.message)));
  // The two files `workspace()` authors: the configuration and the security contact.
  assert.strictEqual(tree(dir).size, 2);
});

test('AGSC-01-17: a Bundle whose configuration lacks an identity is AGSC-E003, not a guess', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-noconfig-'));
  temporaries.push(dir);
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), '{"spec_version":"1.0.0-rc.4"}\n');
  const result = run(IMPORT, dir);
  // AGSC-09-08: AGSC-E003 is the usage class, exit 2.
  assert.strictEqual(result.exit, 2);
  const messages = result.envelope.findings.filter((f) => f.code === 'AGSC-E003').map((f) => f.message);
  assert.ok(messages.some((m) => /`bundle\.operator`/u.test(m)), messages.join('; '));
  assert.ok(messages.some((m) => /`site\.title`/u.test(m)), messages.join('; '));
});

test('--dry-run reports the plan and writes not one file', () => {
  const dir = workspace();
  const result = run([...IMPORT, '--dry-run'], dir);
  // The two files `workspace()` authors: the configuration and the security contact.
  assert.strictEqual(tree(dir).size, 2);
  assert.ok(result.envelope.findings.length > 0, 'the plan\'s findings are still reported');
});

test('the import writes the Bundle, and a SECOND run changes not one byte (AGSC-01-23)', () => {
  const dir = workspace();
  const first = run(IMPORT, dir);
  assert.strictEqual(first.exit, 1, 'the fixture carries deliberate defects, so the verb fails honestly');
  const after = tree(dir);
  assert.ok(after.size > 20, `only ${after.size} files`);
  assert.ok(after.has('content/index.md'));
  assert.ok(after.has('content/concepts/alpha-one.md'));
  assert.ok(after.has('content/clusters/alpha.md'));
  assert.ok(after.has('content/diagrams/alpha-one.diagram'));

  const second = run(IMPORT, dir);
  assert.deepStrictEqual(tree(dir), after, 'the second run changed the tree');
  assert.deepStrictEqual(second.envelope.findings, first.envelope.findings);
  // Without `--quiet` the note says so in words, so an operator sees it too.
  const loud = run(IMPORT.filter((a) => a !== '--quiet'), dir);
  assert.match(loud.stderr, /import: 0 written, 0 replaced, \d+ unchanged/u);
  assert.match(loud.stderr, /import: items: 10/u);
});

test('AGSC-04-09: the import date is the injected clock, never a wall clock', () => {
  const dir = workspace();
  run(IMPORT, dir);
  const cluster = fs.readFileSync(path.join(dir, 'content', 'clusters', 'alpha.md'), 'utf8');
  assert.match(cluster, /^date: 2026-01-01$/mu);
  assert.strictEqual(verb.isoDate(0), '1970-01-01');
  assert.strictEqual(verb.isoDate(Number('1767225600')), '2026-01-01');
  assert.strictEqual(verb.isoDate(undefined), '1970-01-01');
});

test('--attach-diagrams adds the SVG and its source; without it neither is committed', () => {
  const plain = workspace();
  run(IMPORT, plain);
  assert.ok(![...tree(plain).keys()].some((p) => p.startsWith('content/attachments/')));
  const attached = workspace();
  run([...IMPORT, '--attach-diagrams'], attached);
  const files = [...tree(attached).keys()].filter((p) => p.startsWith('content/attachments/'));
  assert.ok(files.includes('content/attachments/alpha-one/alpha-one.svg'));
  assert.ok(files.includes('content/attachments/alpha-one/alpha-one.diagram'));
});

test('the imported Bundle passes lint, build, verify and ci with no error', () => {
  const dir = workspace();
  run(IMPORT, dir);
  for (const argv of [['lint'], ['build'], ['verify'], ['ci']]) {
    const result = run([...argv, '--json', '--quiet'], dir);
    assert.strictEqual(result.envelope.counts.error, 0,
      `${argv[0]}: ${result.envelope.findings.filter((f) => f.severity === 'error').map((f) => `${f.code} ${f.message}`).join('; ')}`);
    assert.strictEqual(result.envelope.status, 'pass', argv[0]);
    assert.strictEqual(result.exit, 0, argv[0]);
  }
});

test('AGSC-06-30: no held-back record reaches a published surface', () => {
  const dir = workspace();
  run(IMPORT, dir);
  run(['build', '--json', '--quiet'], dir);
  const drafts = ['beta-one', 'foreign-keys', 'odd-status'];
  const surfaces = ['www/llms.txt', 'www/llms-full.txt', 'www/search.json', 'www/chunks.jsonl',
    'www/graph.nq', 'www/graph.jsonld'];
  for (const surface of surfaces) {
    const file = path.join(dir, surface);
    assert.ok(fs.existsSync(file), `${surface} was not emitted`);
    const text = fs.readFileSync(file, 'utf8');
    for (const slug of drafts) {
      assert.ok(!text.includes(`/${slug}/`), `${surface} carries the draft ${slug}`);
    }
  }
  assert.ok(!fs.existsSync(path.join(dir, 'www', 'concepts', 'beta-one', 'index.html')),
    'a draft has a page');
  assert.ok(fs.existsSync(path.join(dir, 'www', 'concepts', 'alpha-one', 'index.html')),
    'a published record has no page');
});

test('AGSC-04-02: building the imported Bundle twice is byte-identical', () => {
  const dir = workspace();
  run(IMPORT, dir);
  run(['build', '--json', '--quiet'], dir);
  const first = tree(path.join(dir, 'www'));
  fs.rmSync(path.join(dir, 'www'), { force: true, recursive: true });
  run(['build', '--json', '--quiet'], dir);
  assert.deepStrictEqual(tree(path.join(dir, 'www')), first);
});

test('a declared peer reaches the emitted discovery document (AGSC-10-12/AGSC-11-06)', () => {
  const dir = workspace({ peers: ['https://b.example/.well-known/knowledge-linkset'] });
  run(IMPORT, dir);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  assert.deepStrictEqual(config.peers, ['https://b.example/.well-known/knowledge-linkset']);
  run(['build', '--json', '--quiet'], dir);
  const linkset = JSON.parse(fs.readFileSync(path.join(dir, 'www', '.well-known', 'knowledge-linkset'), 'utf8'));
  const text = JSON.stringify(linkset);
  assert.ok(text.includes('https://b.example/.well-known/knowledge-linkset'), 'the peer is not published');
  assert.ok(text.includes('rel#peer'), 'the peer link carries no peer relation');
});

test('readOldSite(): a corpus read through an injected port, tolerating what it must', () => {
  const files = {
    'content/patterns/a.md': '---\nid: a\n---\nbody\n',
    'content/patterns/not-markdown.txt': 'ignored',
    'content/decks.json': '[{"id":"d"}]',
    'diagrams/src/a.diagram': 'canvas 10 10\n',
    'diagrams/preview/a.html': 'ignored',
  };
  const port = {
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFile: (p) => files[p],
    walk: (t) => Object.keys(files).filter((f) => f.startsWith(`${t}/`)).sort(),
  };
  const read = verb.readOldSite(port);
  assert.deepStrictEqual(read.cards.map((c) => c.path), ['content/patterns/a.md']);
  assert.deepStrictEqual(Object.keys(read.diagramSources), ['a']);
  assert.deepStrictEqual(read.decks, [{ id: 'd' }]);
  assert.deepStrictEqual(read.findings, []);
  assert.strictEqual(read.paths.length, 5);
});

test('readOldSite(): an unreadable file and a malformed decks.json are warnings, not refusals', () => {
  const port = {
    exists: () => true,
    readFile: (p) => {
      if (p === 'content/decks.json') return 'not json';
      throw new Error('undecodable');
    },
    walk: (t) => (t === 'content' ? ['content/patterns/a.md'] : ['diagrams/src/a.diagram']),
  };
  const read = verb.readOldSite(port);
  assert.deepStrictEqual(read.findings.map((f) => [f.code, f.severity]),
    [['AGSC-E901', 'warn'], ['AGSC-E901', 'warn'], ['AGSC-E901', 'warn'], ['AGSC-E901', 'error']]);
  assert.deepStrictEqual(read.decks, []);
  // A port with no `walk` and no `exists` is simply an empty corpus.
  assert.deepStrictEqual(verb.readOldSite({}).cards, []);
});

test('apply(): a byte-identical file is left alone, so `git status` stays honest', () => {
  const written = [];
  const port = {
    exists: (p) => p === 'same.md',
    readFile: () => 'identical\n',
    writeFile: (p) => written.push(p),
  };
  const applied = verb.apply(port, [{ path: 'same.md', text: 'identical\n' }, { path: 'new.md', text: 'x\n' }]);
  assert.deepStrictEqual(applied.unchanged, ['same.md']);
  assert.deepStrictEqual(applied.written, ['new.md']);
  assert.deepStrictEqual(written, ['new.md']);
  // a file that exists and cannot be read back is NOT a free overwrite
  // the import cannot prove it would destroy nothing, so an authored item under
  // `content/` is a collision and nothing is written until `--replace` says so.
  const throwing = { exists: () => true, readFile: () => { throw new Error('x'); }, writeFile: (p) => written.push(p) };
  const refused = verb.apply(throwing, [{ path: 'content/concepts/a.md', text: 'x' }]);
  assert.deepStrictEqual(refused.written, []);
  assert.deepStrictEqual(refused.collisions, ['content/concepts/a.md']);
  assert.strictEqual(refused.refused, true);
  assert.deepStrictEqual(
    verb.apply(throwing, [{ path: 'content/concepts/a.md', text: 'x' }], { replace: true }).replaced,
    ['content/concepts/a.md']);
  // The Bundle's own scaffolding is the adapter's to seed, and is rewritten as before.
  assert.deepStrictEqual(verb.apply(throwing, [{ path: 'agsc.config.json', text: 'x' }]).overwritten,
    ['agsc.config.json']);
});

test('identity(): every member the plan needs is named, one finding per absence', () => {
  assert.deepStrictEqual(verb.identity({}).findings.map((f) => f.code),
    ['AGSC-E003', 'AGSC-E003', 'AGSC-E003', 'AGSC-E003']);
  const full = verb.identity({
    bundle: { id: 'b', license_prose: 'LicenseRef-X', license_schema: 'CC0-1.0', operator: 'human:a' },
    peers: ['https://b.example/.well-known/knowledge-linkset'],
    site: { base: 'https://a.example/', tagline: 'T', title: 'A' },
  });
  assert.deepStrictEqual(full.findings, []);
  assert.deepStrictEqual(full.options, {
    base: 'https://a.example/',
    bundleId: 'b',
    licenseProse: 'LicenseRef-X',
    licenseSchema: 'CC0-1.0',
    operator: 'human:a',
    peers: ['https://b.example/.well-known/knowledge-linkset'],
    tagline: 'T',
    title: 'A',
  });
  assert.strictEqual(verb.identity(undefined).findings.length, 4);
});

test('openRoot(): the injected seam is used when a caller supplies one', () => {
  const marker = { readFile: () => 'x' };
  assert.strictEqual(verb.openRoot({ openRoot: () => marker }, 'anywhere'), marker);
  assert.strictEqual(verb.readOutside({ openRoot: () => ({ readFile: () => 'bytes' }) }, 'a/b.tsv'), 'bytes');
});

test('totalsLines(): one line per total, in key order', () => {
  assert.deepStrictEqual(verb.totalsLines({ items: 2, clusters: 1 }),
    ['import: clusters: 1', 'import: items: 2']);
});

test('the corrections file is DATA, and `_`-prefixed members are comments', () => {
  // eslint-disable-next-line global-require
  const parse = require('../../src/application/cli/verbs/import.js').parseCorrections;
  const parsed = parse(JSON.stringify({
    _note: 'why each entry exists — never read by the engine',
    records: {
      _comment: 'ignored',
      'alpha-one': { _why: 'P1-04, the source that defines the term', promote: ['https://e.org/a'] },
    },
    status_by_class: { _why: 'W/O/X are imported published', W: 'stable' },
  }));
  assert.deepStrictEqual(Object.keys(parsed.records), ['alpha-one']);
  assert.deepStrictEqual(Object.keys(parsed.records['alpha-one']), ['promote']);
  assert.deepStrictEqual(parsed.statusByClass, Object.assign(Object.create(null), { W: 'stable' }));
  // Both maps are null-prototype, so a member called __proto__ is inert.
  assert.strictEqual(Object.getPrototypeOf(parsed.records), null);
  // An empty file is an empty correction set, not a fault.
  assert.deepStrictEqual(Object.keys(parse('{}').records), []);
  // A JSON value that is not an object is refused before it can mean anything.
  for (const text of ['[]', 'null', '"x"', '3']) {
    assert.throws(() => parse(text), /must be a JSON object/u, text);
  }
});

test('a re-import keeps the Bundle\'s own configuration members (contribute, author)', () => {
  const dir = workspace({
    contribute: [{ mode: 'pr', target: 'https://github.com/example/node' }],
    site: { author: 'A Person', base: 'https://example.org/', title: 'Fixture Node' },
  });
  // The fixture corpus carries deliberate defects, so the run's own exit code is 1;
  // what this test is about is the file it wrote.
  run(['import', '--from', 'old-site', '--selection', SELECTION, FIXTURE], dir);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  assert.deepStrictEqual(config.contribute, [{ mode: 'pr', target: 'https://github.com/example/node' }]);
  assert.strictEqual(config.site.author, 'A Person');
  // …and a second run over unchanged input still writes nothing (AGSC-01-23).
  const second = run(['import', '--from', 'old-site', '--selection', SELECTION, FIXTURE], dir);
  assert.match(second.stderr, /import: 0 written/u);
});

test('the Bundle configuration is read from the FILE, and an unreadable one is {}', () => {
  // the import used to rebuild `agsc.config.json` from a template and
  // silently delete every member it cannot derive. It now starts from the file on
  // disk — the FILE, not `ctx.config`, whose AGSC-09-09 precedence may carry values
  // a user file or the environment supplied, which writing back would put settings
  // into the repository that the operator never put there.
  const ctx = (file) => ({ ports: { fs: { readFile: () => {
    if (file === null) throw new Error('no such file');
    return file;
  } } } });
  assert.deepStrictEqual(verb.bundleConfig(ctx('{"site":{"author":"A Person"}}')),
    { site: { author: 'A Person' } });
  // Nothing readable, nothing parseable and nothing that is an object each give an
  // empty configuration rather than a throw: the import then adds what it computes
  // and takes nothing away that was never there.
  assert.deepStrictEqual(verb.bundleConfig(ctx(null)), {});
  assert.deepStrictEqual(verb.bundleConfig(ctx('{ not json')), {});
  assert.deepStrictEqual(verb.bundleConfig(ctx('[1,2]')), {});
  assert.deepStrictEqual(verb.bundleConfig(ctx('null')), {});
});

