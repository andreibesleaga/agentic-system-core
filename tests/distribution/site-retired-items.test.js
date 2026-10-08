'use strict';
// AGSC-11-22 with AGSC-00-05: a retired item is PUBLISHED and not LISTED. It "keeps its
// page, which MUST carry a visible retirement notice and MUST keep its canonical IRI",
// keeps its per-item copies and "MUST remain in the graph exports with `asc:retiredAt`";
// it leaves `search.json`, `/llms.txt`, `/chunks.jsonl`, the skill packs, `agsc-counts`
// and every composition selection. Until 2026-10-06 the build dropped the retired item
// from every surface — page, copies and graph included — and a Bundle in which another
// page linked the retired one failed its build with `AGSC-E901` ("links supervisor, and
// this build emits no route for it"). Found while package S5 checked AGSC-00-05.
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; scratch copies of the minimal fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const IRI = 'https://minimal.example/concepts/supervisor/';
const RETIRED_AT = '<https://w3id.org/agentic-system-core/ns#retiredAt>';

/** The minimal fixture, its `supervisor` retired; `handoff`'s body links it. */
function retiredBundle(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-retired-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const file = path.join(dir, 'content', 'concepts', 'supervisor.md');
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace('kind: pattern\n', 'kind: pattern\nstatus: retired\n'));
  return dir;
}

function build(dir) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
  const r = spawnSync(process.execPath, [CLI, 'build', '--json'],
    { cwd: dir, encoding: 'utf8', env: { ...env, NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' } });
  return { exit: r.status, envelope: JSON.parse(r.stdout) };
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, 'www', rel), 'utf8');

test('AGSC-11-22: a retired item linked from another page builds, and keeps its page with the notice', (t) => {
  const dir = retiredBundle(t);
  const r = build(dir);
  assert.equal(r.exit, 0, JSON.stringify(r.envelope.findings));
  assert.ok(!r.envelope.findings.some((f) => f.code === 'AGSC-E901'), JSON.stringify(r.envelope.findings));
  const page = read(dir, 'concepts/supervisor/index.html');
  assert.match(page, /This item is retired/u);
  assert.ok(page.includes(`<link rel="canonical" href="${IRI}">`), 'the page keeps its canonical IRI');
  assert.ok(read(dir, 'concepts/handoff/index.html').includes('href="/concepts/supervisor/"'),
    'the linking page links the kept page');
});

test('AGSC-11-22 / AGSC-00-05: the retired item keeps its per-item copies and its place in the graph exports', (t) => {
  const dir = retiredBundle(t);
  assert.equal(build(dir).exit, 0);
  assert.match(read(dir, 'pages/supervisor.md'), /^status: retired$/mu);
  assert.ok(read(dir, 'pages/supervisor.jsonld').includes(IRI));
  const nq = read(dir, 'graph.nq');
  assert.ok(nq.split('\n').some((l) => l.startsWith(`<${IRI}> ${RETIRED_AT} "2026-01-01T00:00:00Z"`)), 'no asc:retiredAt in graph.nq');
  assert.ok(read(dir, 'graph.ttl').includes('retiredAt'), 'no asc:retiredAt in graph.ttl');
  assert.ok(read(dir, 'graph.jsonld').includes(IRI), 'the item left graph.jsonld');
});

test('AGSC-11-22 / AGSC-00-05: the retired item is not listed', (t) => {
  const dir = retiredBundle(t);
  assert.equal(build(dir).exit, 0);
  // (`supervisor` is a token of the handoff body; the document list names no such route.)
  assert.ok(!read(dir, 'search.json').includes('/concepts/supervisor/'), 'search.json lists it');
  assert.ok(!read(dir, 'llms.txt').includes('/concepts/supervisor/'), 'llms.txt lists it');
  assert.ok(!read(dir, 'chunks.jsonl').split('\n').some((l) => l.includes('"item":"supervisor"')), 'chunks.jsonl carries it');
  const counts = JSON.parse(read(dir, '.well-known/knowledge-linkset')).linkset[0]
    .describedby.flatMap((l) => l['agsc-counts'] || []);
  assert.ok(counts.includes('concepts=1'), JSON.stringify(counts));
  for (const pack of fs.readdirSync(path.join(dir, 'www', 'skills')).filter((n) => !n.includes('.'))) {
    // (Handoff's body names Supervisor in prose; the pack carries no section of its own for it.)
    assert.doesNotMatch(read(dir, `skills/${pack}/SKILL.md`), /^#+ Supervisor$/mu, `the ${pack} pack carries it`);
  }
  assert.ok(!read(dir, 'concepts/index.html').includes('href="/concepts/supervisor/"'), 'the concepts index lists it');
  // The page is a published route, so the sitemap names it (AGSC-06-19).
  assert.ok(read(dir, 'sitemap.xml').includes(IRI));
});
