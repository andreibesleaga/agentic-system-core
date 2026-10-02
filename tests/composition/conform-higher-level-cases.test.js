'use strict';
// AGSC-10-15 (amended 2026-10-02 for 1.0.0): a case in an area a Level names belongs to that
// Level's set unless the rule's table names it; a named case belongs to the higher Level
// beside it and to every Level above. These tests hold the specification's table and the
// engine's selection to one list, check that every listed case exists in the area the table
// says, and run `agsc conform --level 0` to show that the cases of a higher Level are not run.
//
// Deterministic: no clock, no network; the run writes its report into a scratch directory.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const conform = require('../../src/composition/conform.js');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'agsc.js');

/** The table of AGSC-10-15 as the specification prints it: case id -> { area, level }. */
function specTable() {
  const text = fs.readFileSync(path.join(ROOT, 'spec', '10-implementation-profiles.md'), 'utf8');
  const rows = [...text.matchAll(/^\s*\| `([a-z]+-\d{4})` \| `([a-z]+)` \| (\d) \|/gmu)];
  return new Map(rows.map((m) => [m[1], { area: m[2], level: Number(m[3]) }]));
}

/** Every case on disk: id -> area. */
function casesOnDisk() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        const v = JSON.parse(fs.readFileSync(p, 'utf8'));
        out.set(v.id, v.area);
      }
    }
  };
  walk(path.join(ROOT, 'tests', 'vectors'));
  return out;
}

test('AGSC-10-15: the engine selects by exactly the table the specification prints', () => {
  const table = specTable();
  assert.ok(table.size > 0, 'the table of AGSC-10-15 was not found');
  const engine = conform.HIGHER_LEVEL_CASES;
  assert.deepEqual(Object.keys(engine).sort(), [...table.keys()].sort());
  for (const [id, row] of table) assert.equal(engine[id], row.level, id);
});

test('AGSC-10-15: every listed case exists, in the area the table names, and that area enters at a lower Level', () => {
  const disk = casesOnDisk();
  for (const [id, row] of specTable()) {
    assert.equal(disk.get(id), row.area, `${id} is not a case of area ${row.area}`);
    const lowest = [0, 1, 2, 3].find((l) => conform.areasForLevel(l).includes(row.area));
    assert.ok(lowest < row.level, `${id}: area ${row.area} already enters at Level ${lowest}, so the row moves nothing`);
  }
});

test('casesForLevel keeps a listed case out of the lower Levels and in its own and the ones above', () => {
  const list = [
    { area: 'bundle', id: 'bundle-0003' },
    { area: 'bundle', id: 'bundle-0001' },
    { area: 'frontmatter', id: 'fm-0001' },
    { area: 'graph', id: 'graph-0001' },
  ];
  const ids = (level) => conform.casesForLevel(list, level).map((v) => v.id);
  assert.deepEqual(ids(0), ['fm-0001']);
  assert.deepEqual(ids(1), ['bundle-0001', 'fm-0001']);
  assert.deepEqual(ids(2), ['bundle-0001', 'fm-0001', 'graph-0001']);
  assert.deepEqual(ids(3), ['bundle-0003', 'bundle-0001', 'fm-0001', 'graph-0001']);
});

test('agsc conform --level 0 runs no case of a higher Level', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-conform-level-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'minimal'), dir, { recursive: true });
  const r = spawnSync(process.execPath, [CLI, 'conform', '--level', '0', '--to', 'report.json'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, SOURCE_DATE_EPOCH: '1767225600' },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
  const ran = new Set(report.results.map((x) => x.id));
  for (const id of Object.keys(conform.HIGHER_LEVEL_CASES)) assert.ok(!ran.has(id), `${id} ran at Level 0`);
  assert.ok(ran.has('disc-0004'), 'the Level-0 discovery case must run');
});
