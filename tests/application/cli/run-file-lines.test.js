'use strict';
// verifies AGSC-09-11, AGSC-09-94
// AGSC-09-11: a finding's `line` is a line of the file. `agsc run` reports a run
// block of a Procedure (AGSC-09-94: a command outside `run.allow[]`, a shell operator)
// on the line of the Procedure's FILE, not on the line counted from the start of its
// body: the verb hands the parsed item's `lineOffset` to the run-block reader.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { agsc, scratch, writeConfig } = require('./_bundle-run.js');

test('`run --dry-run` names a run block by the line of the Procedure file', async (t) => {
  const dir = scratch(t, 'agsc-runlines-');
  writeConfig(dir, (c) => ({ ...c, run: { allow: ['node'], enabled: true } }));
  fs.mkdirSync(path.join(dir, 'content', 'procedures'), { recursive: true });
  const lines = [
    '---', // 1
    'type: procedure', // 2
    'title: Lines', // 3
    'description: A Procedure whose run block sits below its front matter.', // 4
    'date: "2026-01-01"', // 5
    'prov:', // 6
    '  origin: human', // 7
    '  operator: human:andreibesleaga', // 8
    '---', // 9
    '', // 10
    '## Steps', // 11
    '', // 12
    '```run', // 13
    'node -v | cat', // 14
    '```', // 15
    '',
  ];
  fs.writeFileSync(path.join(dir, 'content', 'procedures', 'lines.md'), lines.join('\n'));
  const run = await agsc(dir, ['run', 'lines', '--dry-run', '--json']);
  const own = run.findings.filter((f) => f.file === 'content/procedures/lines.md');
  assert.ok(own.length > 0, run.stdout + run.stderr);
  for (const f of own) assert.strictEqual(f.line, 13, JSON.stringify(f));
});
