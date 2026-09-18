// tests/governance/agents.test.js — AGSC-01-36/37/38, 08-25, 08-28. Owner: B.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAgents, checkProposal, capMeter, findAgentEntry } = require('../../src/governance/agents.js');

function baseConfig(agents) {
  return {
    bundle: { id: 'example', operator: 'human:alice' },
    site: { base: 'https://example.org/', title: 'Example' },
    spec_version: '1.0.0-rc.4',
    channels: [{ adapter: 'stub', author: 'lane-bot', name: 'lane', owner: 'human:alice', publish: 'auto' }],
    agents
  };
}

test('bundle-0003: a valid agent lane is accepted with no findings', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'example-model-1', name: 'editor', operator: 'human:alice',
    tasks: ['edit', 'update', 'review'], types: ['concept', 'lesson']
  }]);
  assert.deepEqual(checkAgents(config), []);
});

test('bundle-0004: a procedure in types[] is AGSC-E203 at agents[0].types[1]', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'example-model-1', name: 'editor', operator: 'human:alice',
    tasks: ['edit', 'update', 'review'], types: ['concept', 'procedure']
  }]);
  const findings = checkAgents(config);
  assert.equal(findings.length, 1);
  // F27-11 (R64): a Finding names the fault, never an empty message.
  assert.deepEqual(findings[0], {
    code: 'AGSC-E203', severity: 'error', path: 'agents[0].types[1]',
    message: 'agents[0].types[1] is "procedure"; AGSC-01-36 allows concept, episode, lesson',
  });
});

test('bundle-0005: enabled budgets summing above the node cap is AGSC-E212', () => {
  const config = baseConfig([
    { author: 'lane-bot', budget_usd_month: 6, channel: 'lane', enabled: true, kind: 'llm', model: 'm', name: 'editor', operator: 'human:alice', tasks: ['edit'], types: ['concept'] },
    { author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm', model: 'm', name: 'planner', operator: 'human:alice', tasks: ['plan'], types: ['concept'] },
    { author: 'lane-bot', budget_usd_month: 9, channel: 'lane', enabled: false, kind: 'llm', model: 'm', name: 'idle', operator: 'human:alice', tasks: ['edit'], types: ['concept'] }
  ]);
  const findings = checkAgents(config);
  assert.deepEqual(findings, [{
    code: 'AGSC-E212', severity: 'error', path: 'agents', sum_usd_month: 11, cap_usd_month: 10,
    message: 'the enabled agents sum to 11 USD a month, above the node cap of 10 (AGSC-01-38)',
  }]);
});

test('prov-0001: a Proposal touching a type outside types[] is AGSC-E509', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'm', name: 'editor', operator: 'human:alice', tasks: ['edit'], types: ['concept', 'lesson']
  }]);
  const proposal = {
    agent: 'editor', author: 'lane-bot',
    changes: [
      { path: 'content/concepts/supervisor.md', type: 'concept' },
      { path: 'content/procedures/deploy.md', type: 'procedure' }
    ]
  };
  const result = checkProposal(config, proposal);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.findings, [{
    code: 'AGSC-E509', severity: 'error', agent: 'editor', path: 'content/procedures/deploy.md',
    message: 'the lane "editor" does not declare the item type "procedure" (AGSC-08-28)',
  }]);
});

test('prov-0002: a Proposal creating more than max_new_items is AGSC-E511', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'm', name: 'planner', operator: 'human:alice', tasks: ['plan', 'claim', 'work'], types: ['concept', 'episode', 'lesson']
  }]);
  const changes = [];
  for (let i = 1; i <= 21; i++) changes.push({ op: 'create', path: `content/concepts/task-${String(i).padStart(2, '0')}.md`, type: 'concept' });
  const result = checkProposal(config, { agent: 'planner', author: 'lane-bot', changes });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.findings, [{
    code: 'AGSC-E511', severity: 'error', agent: 'planner', created: 21, max_new_items: 20,
    message: 'the Proposal creates 21 items, above the lane cap of 20 (AGSC-08-28)',
  }]);
});

test('AGSC-08-28(c) tasks[]: a Proposal declaring a task outside tasks[] is AGSC-E509', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'm', name: 'editor', operator: 'human:alice', tasks: ['edit', 'update'], types: ['concept']
  }]);
  const result = checkProposal(config, {
    agent: 'editor', author: 'lane-bot', task: 'translate',
    changes: [{ path: 'content/concepts/a.md', type: 'concept' }]
  });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.findings, [{
    code: 'AGSC-E509', severity: 'error', agent: 'editor', path: 'content/concepts/a.md', task: 'translate',
    message: 'the lane "editor" does not declare the task "translate" (AGSC-08-28)',
  }]);
});

test('AGSC-08-28(c) tasks[]: a declared task inside tasks[] is accepted', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'm', name: 'editor', operator: 'human:alice', tasks: ['edit', 'update'], types: ['concept']
  }]);
  const result = checkProposal(config, {
    agent: 'editor', author: 'lane-bot', task: 'edit',
    changes: [{ path: 'content/concepts/a.md', type: 'concept' }]
  });
  assert.equal(result.accepted, true);
});

test('AGSC-08-28(c) tasks[]: a per-change `task` overrides the Proposal-level one', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'm', name: 'editor', operator: 'human:alice', tasks: ['edit'], types: ['concept']
  }]);
  const result = checkProposal(config, {
    agent: 'editor', author: 'lane-bot', task: 'edit',
    changes: [{ path: 'content/concepts/a.md', type: 'concept', task: 'translate' }]
  });
  assert.equal(result.accepted, false);
  assert.equal(result.findings[0].task, 'translate');
});

test('AGSC-08-28(c) tasks[]: no `task` declared anywhere is not checked (prov-0001/0002 stay green)', () => {
  const config = baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'm', name: 'planner', operator: 'human:alice', tasks: ['plan', 'claim', 'work'], types: ['concept']
  }]);
  const result = checkProposal(config, {
    agent: 'planner', author: 'lane-bot',
    changes: [{ op: 'create', path: 'content/concepts/a.md', type: 'concept' }]
  });
  assert.equal(result.accepted, true);
});

test('checkProposal rejects an undeclared or disabled agent with AGSC-E509', () => {
  const config = baseConfig([]);
  const result = checkProposal(config, { agent: 'ghost', author: 'x', changes: [] });
  assert.equal(result.accepted, false);
  assert.equal(result.findings[0].code, 'AGSC-E509');
});

test('findAgentEntry looks an entry up by name', () => {
  const config = baseConfig([{ name: 'editor', kind: 'process', author: 'a', operator: 'human:x', tasks: ['edit'], channel: 'lane' }]);
  assert.equal(findAgentEntry(config, 'editor').name, 'editor');
  assert.equal(findAgentEntry(config, 'nope'), null);
});

test('capMeter sums usage.cost_usd against the node cap', () => {
  const config = { budget: { usd_month: 10 } };
  const usage = [{ cost_usd: 2.5 }, { cost_usd: 1.5 }, {}];
  const meter = capMeter(usage, config);
  assert.deepEqual(meter, { spent_usd: 4, cap_usd: 10, ratio: 0.4 });
});

// F27-11 (AGSC-09-11, R64): the remaining AGSC-01-36 branches, each with the message
// a reader acts on. These four branches carried no test, which is how they carried
// no message for so long.
test('AGSC-01-36: every enum and required-field fault names itself', () => {
  const kind = checkAgents(baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'oracle',
    model: 'm', name: 'editor', operator: 'human:alice', tasks: ['edit'], types: ['concept']
  }]));
  assert.deepEqual(kind.map((f) => f.code), ['AGSC-E203']);
  assert.equal(kind[0].path, 'agents[0].kind');
  assert.match(kind[0].message, /agents\[0\]\.kind is "oracle"/u);

  const task = checkAgents(baseConfig([{
    author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm',
    model: 'm', name: 'editor', operator: 'human:alice', tasks: ['edit', 'juggle'], types: ['concept']
  }]));
  assert.deepEqual(task.map((f) => f.path), ['agents[0].tasks[1]']);
  assert.match(task[0].message, /agents\[0\]\.tasks\[1\] is "juggle"/u);

  const llm = checkAgents(baseConfig([{
    author: 'lane-bot', channel: 'lane', enabled: true, kind: 'llm',
    name: 'editor', operator: 'human:alice', tasks: ['edit'], types: ['concept']
  }]));
  assert.deepEqual(llm.map((f) => f.path).sort(),
    ['agents[0].budget_usd_month', 'agents[0].model']);
  for (const f of llm) {
    assert.equal(f.code, 'AGSC-E202');
    assert.match(f.message, /kind "llm"/u);
  }

  // An entry that is not an object at all is left to the schema, and nothing throws.
  assert.deepEqual(checkAgents(baseConfig([null, 'x'])), []);
});
