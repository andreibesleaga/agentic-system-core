'use strict';
// verifies AGSC-05-39
// AGSC-05-39 as amended 2026-11-10 (the CR6 erratum): an item's `domain_role` and
// `domain_context` add their triples whenever the configuration has a `domain` object, with
// or without a site vocabulary; `domain_type` and `domain_links` need the vocabulary, which
// defines what they name.
// The build runs on a copy of the minimal fixture with a fixed SOURCE_DATE_EPOCH; no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const ENV = { HOME: os.tmpdir(), PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600' };
const ROLE = '<https://minimal.example/concepts/handoff/> <https://schema.org/additionalType> "entity"';
const CONTEXT = '<https://minimal.example/concepts/handoff/> <http://purl.org/dc/terms/isPartOf> <https://minimal.example/clusters/agent-patterns/>';

/** graph.nq of the fixture with `domain` in the configuration and the two keys on `handoff`. */
function graphOf(t, domain) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-domain-object-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const configFile = path.join(dir, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.domain = domain;
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  const item = path.join(dir, 'content', 'concepts', 'handoff.md');
  fs.writeFileSync(item, fs.readFileSync(item, 'utf8').replace('\nkind: pattern\n', '\nkind: pattern\ndomain_role: entity\ndomain_context: agent-patterns\n'));
  const run = spawnSync(process.execPath, [AGSC, 'build'], { cwd: dir, encoding: 'utf8', env: ENV });
  assert.equal(run.status, 0, run.stderr);
  return fs.readFileSync(path.join(dir, 'www', 'graph.nq'), 'utf8');
}

test('with a domain object and no vocabulary file, a role and a context add their triples (AGSC-05-39)', (t) => {
  const nq = graphOf(t, { contexts: [{ cluster: 'agent-patterns', namespace: 'https://minimal.example/ns/patterns#' }] });
  assert.ok(nq.includes(ROLE), 'the role triple');
  assert.ok(nq.includes(CONTEXT), 'the context triple');
});
