'use strict';
// Requirement: PRD-075 (docs/PRD.md).
// verifies AGSC-01-39, AGSC-01-23, AGSC-01-26a, AGSC-09-09
// tests/interchange/skos-import-cli.test.js — `import <file.ttl> --from skos` through the
// real command line, over the real filesystem, with a fixed clock. The mapping itself is
// tested on the pure adapter in `skos.test.js`; the cases `imp-0006` to `imp-0008` pin it.
//
// The thesaurus is `tests/fixtures/skos-thesaurus/thesaurus.ttl`, written for these tests.
// Deterministic: fixed instant, no network, scratch directories only.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const main = require('../../src/application/cli/main.js');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const THESAURUS = path.join(ROOT, 'tests', 'fixtures', 'skos-thesaurus', 'thesaurus.ttl');
const ENV = {};
for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('AGSC_')) ENV[name] = value;
Object.assign(ENV, { NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' });

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

/** The minimal Bundle with its items removed, so the import has nothing to collide with. */
function emptyBundle() {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-skos-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const folder of ['clusters', 'concepts']) nodeFs.rmSync(path.join(dir, 'content', folder), { force: true, recursive: true });
  return dir;
}

function agsc(cwd, ...args) {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: ENV });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

const items = (dir) => ['clusters', 'concepts'].flatMap((folder) => (nodeFs.existsSync(path.join(dir, 'content', folder))
  ? nodeFs.readdirSync(path.join(dir, 'content', folder)).map((name) => `${folder}/${name}`) : [])).sort();

test('--from skos is an adapter with the one flag of its own, --replace (AGSC-09-09)', () => {
  assert.deepStrictEqual([...main.adapterFlagsFor('import', ['--from', 'skos']).keys()], ['--replace']);
  const refused = agsc(emptyBundle(), 'import', THESAURUS, '--from', 'skos', '--allow-newer');
  assert.strictEqual(refused.status, 2);
  assert.match(refused.stderr, /AGSC-E002/u);
});

test('a thesaurus is imported as drafts, a dry run writes nothing, and a second run changes nothing', () => {
  const dir = emptyBundle();
  const dry = agsc(dir, 'import', THESAURUS, '--from', 'skos', '--dry-run');
  assert.strictEqual(dry.status, 0, dry.stderr);
  assert.deepStrictEqual(items(dir), []);
  assert.match(dry.stderr, /--dry-run: 4 file\(s\) would be written/u);
  const first = agsc(dir, 'import', THESAURUS, '--from', 'skos');
  assert.strictEqual(first.status, 0, first.stderr);
  assert.deepStrictEqual(items(dir), ['clusters/instruments.md', 'clusters/strings.md', 'concepts/cello.md', 'concepts/violin.md']);
  assert.match(first.stderr, /import: 4 written, 0 replaced, 0 unchanged/u);
  const again = agsc(dir, 'import', THESAURUS, '--from', 'skos');
  assert.match(again.stderr, /import: 0 written, 0 replaced, 4 unchanged/u);
  const lint = agsc(dir, 'lint', '--json');
  assert.strictEqual(lint.status, 0, 'the imported items pass this node\'s own lint');
  assert.deepStrictEqual(JSON.parse(lint.stdout).findings.filter((f) => f.severity === 'error'), []);
});

test('an item already here with other bytes is a collision: nothing is written, unless --replace (AGSC-01-23)', () => {
  const dir = emptyBundle();
  agsc(dir, 'import', THESAURUS, '--from', 'skos');
  const file = path.join(dir, 'content', 'concepts', 'violin.md');
  nodeFs.appendFileSync(file, 'An edit made after the import.\n');
  const refused = agsc(dir, 'import', THESAURUS, '--from', 'skos');
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /AGSC-E206/u);
  assert.match(nodeFs.readFileSync(file, 'utf8'), /An edit made after the import\./u);
  const replaced = agsc(dir, 'import', THESAURUS, '--from', 'skos', '--replace');
  assert.strictEqual(replaced.status, 0, replaced.stderr);
  assert.match(replaced.stderr, /1 replaced/u);
  assert.doesNotMatch(nodeFs.readFileSync(file, 'utf8'), /An edit made after the import\./u);
});

test('a file that is missing, or is not Turtle, or holds nothing SKOS, is an error and writes nothing', () => {
  const dir = emptyBundle();
  const missing = agsc(dir, 'import', path.join(dir, 'nosuch.ttl'), '--from', 'skos');
  assert.strictEqual(missing.status, 1);
  assert.match(missing.stderr, /AGSC-E901.*could not be read/u);
  const broken = path.join(dir, 'broken.ttl');
  nodeFs.writeFileSync(broken, 'ex:a ex:b');
  const notTurtle = agsc(dir, 'import', broken, '--from', 'skos');
  assert.strictEqual(notTurtle.status, 2, 'an invalid argument is the usage class (AGSC-09-08)');
  assert.match(notTurtle.stderr, /AGSC-E003.*not RDF 1\.1 Turtle/u);
  const empty = path.join(dir, 'empty.ttl');
  nodeFs.writeFileSync(empty, '@prefix owl: <http://www.w3.org/2002/07/owl#> .\n<https://example.org/x> a owl:Class .\n');
  const nothing = agsc(dir, 'import', empty, '--from', 'skos');
  assert.strictEqual(nothing.status, 1);
  assert.match(nothing.stderr, /AGSC-E901.*no skos:Concept/u);
  assert.deepStrictEqual(items(dir), []);
});
