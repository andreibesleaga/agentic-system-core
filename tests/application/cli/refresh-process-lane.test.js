'use strict';
// verifies AGSC-08-01, AGSC-08-28
// AGSC-08-01: an item whose origin is `ai-*` names its `agent` and its `model`, and
// `lint` reports a missing one as `AGSC-E202`. The Episode that `refresh --dry-run`
// writes for a run carries `prov.origin: ai-generated`. A `process` lane has no
// `model` key (AGSC-01-36: "absent otherwise"), so its Episode names the lane's kind,
// `process`, as the model: the run called no model, and the Episode stays an item
// that `lint` accepts once its Proposal is applied. An `llm` lane names its own model.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { agsc, scratch, writeConfig } = require('./_bundle-run.js');

const LANES = {
  llm: { author: 'lane-bot', budget_usd_month: 1, channel: 'lane', enabled: true, kind: 'llm', model: 'example-model-1',
    name: 'tidy', operator: 'human:alice', tasks: ['refresh'], types: ['episode'] },
  process: { author: 'lane-bot', channel: 'lane', enabled: true, kind: 'process', name: 'tidy',
    operator: 'human:alice', tasks: ['refresh'], types: ['episode'] },
};

/** The new file a Proposal's patch adds, as its text. */
function addedFile(patch) {
  const lines = patch.split('\n');
  const start = lines.findIndex((l) => l.startsWith('@@ '));
  return `${lines.slice(start + 1).filter((l) => l.startsWith('+')).map((l) => l.slice(1)).join('\n')}\n`;
}

for (const [kind, lane] of Object.entries(LANES)) {
  test(`the Episode of a ${kind} lane's dry run names a model and passes lint (AGSC-08-01)`, async (t) => {
    const dir = scratch(t, 'agsc-refresh-lane-');
    writeConfig(dir, (c) => ({
      ...c,
      agents: [lane],
      ...(kind === 'llm' ? { budget: { usd_month: 1 } } : {}),
      channels: [{ adapter: 'stub', author: 'lane-bot', name: 'lane', owner: 'human:alice', publish: 'hitl' }],
    }));
    const run = await agsc(dir, ['refresh', '--agent', 'tidy', '--dry-run']);
    assert.strictEqual(run.exit, 0, run.stdout + run.stderr);
    const episode = addedFile(fs.readFileSync(path.join(dir, 'dist', 'proposal', '1.patch'), 'utf8'));
    assert.match(episode, /^ {2}origin: ai-generated$/mu);
    assert.match(episode, /^ {2}agent: tidy$/mu);
    assert.match(episode, new RegExp(`^ {2}model: ${kind === 'llm' ? 'example-model-1' : 'process'}$`, 'mu'));
    fs.mkdirSync(path.join(dir, 'content', 'episodes'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'content', 'episodes', 'tidy-dry-run-1.md'), episode);
    fs.rmSync(path.join(dir, 'dist'), { force: true, recursive: true });
    const lint = await agsc(dir, ['lint', '--json']);
    assert.deepStrictEqual(lint.findings.filter((f) => f.code === 'AGSC-E202'), []);
    assert.strictEqual(lint.exit, 0, lint.stdout + lint.stderr);
  });
}
