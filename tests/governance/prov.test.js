'use strict';
// AGSC-08-01…08-09 and AGSC-10-17.
// No clock, no network: a board, a Proposal and a commit message are records.

const test = require('node:test');
const assert = require('node:assert');
const prov = require('../../src/governance/prov.js');

const codes = (findings) => findings.map((f) => f.code);
const CONFIG = Object.freeze({
  budget: { usd_month: 10 },
  bundle: { operator: 'human:alice' },
  agents: [{
    name: 'worker',
    kind: 'llm',
    author: 'lane-bot',
    operator: 'human:alice',
    model: 'example-model-1',
    tasks: ['claim', 'work'],
    types: ['concept', 'episode', 'lesson'],
    channel: 'lane',
    budget_usd_month: 5,
    enabled: true,
  }],
});

test('AGSC-02-07: the four origins, two of which require agent and model', () => {
  assert.deepStrictEqual([...prov.ORIGINS], ['human', 'ai-assisted', 'ai-generated', 'imported']);
  assert.deepStrictEqual([...prov.AI_ORIGINS], ['ai-assisted', 'ai-generated']);
  for (const origin of prov.AI_ORIGINS) assert.ok(prov.ORIGINS.includes(origin));
});

test('AGSC-08-01: a missing prov is AGSC-E501 when nothing can be inherited', () => {
  const result = prov.deriveProv({ slug: 'a', type: 'concept' }, {});
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E501']);
  assert.strictEqual(result.prov, null);
});

test('AGSC-10-02: a Level-0 item inherits bundle.operator with the AGSC-E508 warning', () => {
  const result = prov.deriveProv({ slug: 'a', type: 'concept' }, CONFIG);
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E508']);
  assert.strictEqual(result.findings[0].severity, 'warn');
  assert.strictEqual(result.inherited, true);
  assert.deepStrictEqual(result.prov, { origin: 'human', operator: 'human:alice' });
});

test('AGSC-08-01: a prov without operator inherits, or is AGSC-E503', () => {
  const inherited = prov.deriveProv({ slug: 'a', type: 'concept', prov: { origin: 'human' } }, CONFIG);
  assert.deepStrictEqual(codes(inherited.findings), ['AGSC-E508']);
  assert.strictEqual(inherited.prov.operator, 'human:alice');
  const bare = prov.deriveProv({ slug: 'a', type: 'concept', prov: { origin: 'human' } }, {});
  assert.deepStrictEqual(codes(bare.findings), ['AGSC-E503']);
});

test('AGSC-08-01: an ai-* origin without agent or model is AGSC-E202, twice', () => {
  const result = prov.deriveProv({
    slug: 'a', type: 'concept', prov: { origin: 'ai-generated', operator: 'human:alice' },
  }, CONFIG);
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E202', 'AGSC-E202']);
  const complete = prov.deriveProv({
    slug: 'a',
    type: 'concept',
    prov: { origin: 'ai-generated', operator: 'human:alice', agent: 'w', model: 'm' },
  }, CONFIG);
  assert.deepStrictEqual(complete.findings, []);
});

test('AGSC-08-06: a well-formed DCO-Plus trailer block parses', () => {
  const message = 'feat: x\n\nbody\n\nSigned-off-by: Andrei N. Besleaga <a@example.org> (CA-v1)';
  const result = prov.checkTrailers(message);
  assert.deepStrictEqual(result.findings, []);
  assert.strictEqual(result.signoff.name, 'Andrei N. Besleaga');
  assert.strictEqual(result.signoff.email, 'a@example.org');
});

test('AGSC-08-06: the name is disambiguated greedily at the LAST " <"', () => {
  const parsed = prov.parseSignoff('Signed-off-by: A <B> C <a@example.org> (CA-v1)');
  assert.strictEqual(parsed, null, 'a "<" inside the name is outside the nchar set');
  const withDot = prov.parseSignoff('Signed-off-by: A. B. Jr <a@example.org> (CA-v1)');
  assert.strictEqual(withDot.name, 'A. B. Jr');
});

test('AGSC-08-06: a missing or malformed trailer is AGSC-E504', () => {
  assert.deepStrictEqual(codes(prov.checkTrailers('feat: x').findings), ['AGSC-E504']);
  assert.deepStrictEqual(codes(prov.checkTrailers('Signed-off-by: A <a@example.org> (CA-v2)').findings),
    ['AGSC-E504'], 'only CA-v1 is an agreement');
  assert.deepStrictEqual(codes(prov.checkTrailers('Signed-off-by: A <a@example.org>').findings),
    ['AGSC-E504']);
  assert.deepStrictEqual(codes(prov.checkTrailers('Signed-off-by: <a@example.org> (CA-v1)').findings),
    ['AGSC-E504'], 'the name may not be empty');
  assert.strictEqual(prov.parseSignoff('Reviewed-by: A <a@example.org> (CA-v1)'), null);
  assert.deepStrictEqual(codes(prov.checkTrailers(undefined).findings), ['AGSC-E504']);
});

test('AGSC-08-07: an ai-* change needs an Assisted-by naming prov.operator', () => {
  const block = 'Signed-off-by: A <a@example.org> (CA-v1)\n'
    + 'Assisted-by: agsc/1.0.0 (operator: human:alice)';
  const good = prov.checkTrailers(block, { prov: { origin: 'ai-generated', operator: 'human:alice' } });
  assert.deepStrictEqual(good.findings, []);
  assert.strictEqual(good.assisted.length, 1);
  const wrong = prov.checkTrailers(block, { prov: { origin: 'ai-generated', operator: 'human:bob' } });
  assert.deepStrictEqual(codes(wrong.findings), ['AGSC-E505']);
  const human = prov.checkTrailers('Signed-off-by: A <a@example.org> (CA-v1)',
    { prov: { origin: 'human', operator: 'human:bob' } });
  assert.deepStrictEqual(human.findings, []);
  assert.strictEqual(prov.parseAssisted('Assisted-by: agsc 1.0.0 (operator: human:alice)'), null);
});

test('AGSC-08-20b: the trailer block is the LAST contiguous run of Key: value lines', () => {
  const block = prov.trailerBlock('subject\n\nA: 1\n\nprose\n\nB: 2\nC: 3\n');
  assert.deepStrictEqual(block, ['B: 2', 'C: 3']);
});

test('AGSC-08-09 / AGSC-02-18: a gate compiles its level to checks, and disagreement is AGSC-E203', () => {
  assert.deepStrictEqual(prov.checkGate({ slug: 'g', type: 'gate', level: 'L1' }).checks,
    ['links', 'schema']);
  assert.deepStrictEqual(prov.checkGate({ slug: 'g', type: 'gate', level: 'L2' }).checks,
    ['determinism', 'links', 'provenance', 'review', 'schema']);
  const agreeing = prov.checkGate({ slug: 'g', type: 'gate', level: 'L1', checks: ['schema', 'links'] });
  assert.deepStrictEqual(agreeing.findings, []);
  const disagreeing = prov.checkGate({ slug: 'g', type: 'gate', level: 'L1', checks: ['schema'] });
  assert.deepStrictEqual(codes(disagreeing.findings), ['AGSC-E203']);
  const bad = prov.checkGate({ slug: 'g', type: 'gate', level: 'L3' });
  assert.deepStrictEqual(codes(bad.findings), ['AGSC-E203']);
});

test('AGSC-02-99 / AGSC-11-02: an unknown foreign task state reads as UNSPECIFIED', () => {
  assert.strictEqual(prov.TASK_STATES.length, 9);
  assert.strictEqual(prov.readForeignTaskState('TASK_STATE_WORKING'), 'TASK_STATE_WORKING');
  assert.strictEqual(prov.readForeignTaskState('TASK_STATE_FROZEN'), 'TASK_STATE_UNSPECIFIED');
  assert.strictEqual(prov.readForeignTaskState(undefined), 'TASK_STATE_UNSPECIFIED');
});

test('AGSC-10-13: the terminal states are the four that make a board done', () => {
  assert.strictEqual(prov.isTerminal('TASK_STATE_COMPLETED'), true);
  assert.strictEqual(prov.isTerminal('TASK_STATE_WORKING'), false);
  assert.strictEqual(prov.TERMINAL_TASK_STATES.length, 4);
});

const BOARD = Object.freeze({
  cluster: 'sprint-1',
  tasks: [
    { slug: 'task-a', state: 'TASK_STATE_WORKING', claimed_by: 'worker' },
    { slug: 'task-b', state: 'TASK_STATE_SUBMITTED' },
  ],
});

test('AGSC-10-17: a second concurrent claim is AGSC-E511 before any lint runs', () => {
  const result = prov.checkClaims(CONFIG, {
    agent: 'worker',
    changes: [{ op: 'edit', path: 'content/concepts/task-b.md', type: 'concept', task_state: 'TASK_STATE_WORKING' }],
  }, BOARD);
  assert.strictEqual(result.accepted, false);
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E511']);
  assert.strictEqual(result.findings[0].held, 1);
  assert.strictEqual(result.findings[0].max_claims, 1);
  assert.strictEqual(result.findings[0].agent, 'worker');
});

test('AGSC-10-17: finishing one task and claiming the next is accepted', () => {
  const result = prov.checkClaims(CONFIG, {
    agent: 'worker',
    changes: [
      { op: 'edit', path: 'content/concepts/task-a.md', type: 'concept', task_state: 'TASK_STATE_COMPLETED' },
      { op: 'edit', path: 'content/concepts/task-b.md', type: 'concept', task_state: 'TASK_STATE_WORKING' },
    ],
  }, BOARD);
  assert.strictEqual(result.accepted, true);
  assert.strictEqual(result.held_after, 1);
});

test('AGSC-10-17: re-proposing a task the lane already holds is not a new claim', () => {
  const result = prov.checkClaims(CONFIG, {
    agent: 'worker',
    changes: [{ op: 'edit', path: 'content/concepts/task-a.md', type: 'concept', task_state: 'TASK_STATE_WORKING' }],
  }, BOARD);
  assert.strictEqual(result.accepted, true);
  assert.strictEqual(result.held_after, 1);
});

test('AGSC-08-28: the E509 rejection of agents.js runs first and is not duplicated', () => {
  const result = prov.checkClaims(CONFIG, { agent: 'nobody', changes: [] }, BOARD);
  assert.strictEqual(result.accepted, false);
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E509']);
});

test('AGSC-10-17: a change that touches no task_state never moves the count', () => {
  const result = prov.checkClaims(CONFIG, {
    agent: 'worker',
    changes: [{ op: 'edit', path: 'content/concepts/other.md', type: 'concept' }],
  }, BOARD);
  assert.strictEqual(result.accepted, true);
  assert.strictEqual(result.held_after, 1);
  assert.deepStrictEqual(prov.heldBy(BOARD, 'worker'), ['task-a']);
  assert.deepStrictEqual(prov.heldBy(undefined, 'worker'), []);
});

test('AGSC-01-36: max_claims defaults to one when the entry omits it', () => {
  const twoClaims = prov.checkClaims(CONFIG, {
    agent: 'worker',
    changes: [
      { op: 'edit', path: 'content/concepts/x.md', type: 'concept', task_state: 'TASK_STATE_WORKING' },
      { op: 'edit', path: 'content/concepts/y.md', type: 'concept', task_state: 'TASK_STATE_WORKING' },
    ],
  }, { cluster: 'c', tasks: [] });
  assert.strictEqual(twoClaims.accepted, false);
  assert.deepStrictEqual(codes(twoClaims.findings), ['AGSC-E511']);
});
