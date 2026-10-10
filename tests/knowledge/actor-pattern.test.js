'use strict';
// AGSC-02-09: the actor grammar admits the actor the ledger's trailing `build`
// entry carries (AGSC-08-20a), `process:agsc/<version>`. The specification emitted
// that form while its own grammar, and the item schema's `actor` definition,
// refused a `/` after `process:`. This test builds the minimal fixture with a
// git-log file, reads the last line of `/ledger.jsonl` and checks its actor
// against the schema's pattern; it also validates an Episode whose `actor` is that
// form through the engine's own frontmatter reader. Deterministic: fixed instant,
// no network, nothing written.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const frontmatter = require('../../src/knowledge/frontmatter.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'item.schema.json'), 'utf8'));
const ACTOR = new RegExp(SCHEMA.$defs.actor.pattern, 'u');
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const SCHEMAS = validate.schemas(readSchemas(ROOT));

/** The trailing `build` entry of the ledger a build of the fixture publishes. */
function lastLedgerEntry(version) {
  const port = createFileSystem(FIXTURE);
  const bundle = loadBundle(port, { schemas: SCHEMAS });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const gitLog = [{ sha: 'a'.repeat(40), committed_at: '2026-01-01T00:00:00Z', parents: [], trailers: {} }];
  const { files } = site.build(bundle, { fs: port, clock }, {
    specVersion: '1.0.0-rc.7', version, gitLog, contentTree: 'b'.repeat(40),
  });
  const lines = files.get('/ledger.jsonl').split('\n').filter((line) => line !== '');
  return JSON.parse(lines[lines.length - 1]);
}

test('AGSC-02-09: the ledger\'s trailing build actor matches the item schema\'s actor pattern', () => {
  for (const version of [PACKAGE_VERSION, '1.0.0', '1.0.0-rc.7', '2.3.4+build.5']) {
    const entry = lastLedgerEntry(version);
    assert.strictEqual(entry.kind, 'build');
    assert.strictEqual(entry.actor, `process:agsc/${version}`);
    assert.ok(ACTOR.test(entry.actor), `${entry.actor} is refused by the actor pattern of AGSC-02-09`);
  }
});

test('AGSC-02-09: the four actor forms are admitted, and nothing else is', () => {
  for (const good of ['human:ada', 'process:ci', 'process:agsc/1.0.0', 'process:agsc/1.0.0-rc.7',
    'claude-code/1.0', 'Tool/2.0+x']) {
    assert.ok(ACTOR.test(good), `${good} should be an actor string`);
  }
  for (const bad of ['agent:x', 'ada', 'human:Ada', 'human:', '/1.0', 'process:', 'process:/1.0',
    'process:agsc/', 'process:agsc/1.0/2', 'process:Agsc/1.0', 'human:ada/1.0', 'process:agsc/-1']) {
    assert.ok(!ACTOR.test(bad), `${bad} should not be an actor string`);
  }
});

test('AGSC-02-09: an Episode whose actor is process:agsc/<version> validates with no finding', () => {
  const text = ['---', 'type: episode', 'title: A build run', 'started: "2026-01-01T00:00:00Z"',
    'actor: process:agsc/1.0.0', 'outcome: success', 'prov:', '  origin: human',
    '  operator: human:ada', '---', '', 'What happened.', ''].join('\n');
  const item = frontmatter.parseItem(text, { path: 'content/episodes/a-build-run.md', schemas: SCHEMAS });
  assert.deepStrictEqual(item.findings, []);
});

test('AGSC-02-09: the rule text names the versioned process form the ledger carries', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', '02-item.md'), 'utf8');
  const at = spec.indexOf('**AGSC-02-09**');
  const rule = spec.slice(at, spec.indexOf('\n- **AGSC-', at + 1));
  assert.ok(rule.includes('process:<id>/<version>'), 'AGSC-02-09 does not name process:<id>/<version>');
  assert.ok(rule.includes('AGSC-08-20a'), 'AGSC-02-09 does not point to the ledger entry that carries the form');
});
