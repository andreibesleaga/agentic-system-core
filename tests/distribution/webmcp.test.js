'use strict';
// Unit tests for the WebMCP transport. AGSC-09-16, AGSC-11-18.
// The emitted script is evaluated in an isolated `node:vm` context, with and
// without `document.modelContext`, and with every network global trapped.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { tools } = require('../../src/distribution/mcp-tools.js');
const webmcp = require('../../src/distribution/webmcp.js');

function toolset() {
  return tools(loadBundle(createFileSystem('tests/fixtures/minimal'),
    { schemas: validate.schemas(readSchemas('.')) }), {});
}

function evaluate(set, options) {
  const opts = options || {};
  const registered = [];
  let networkCalls = 0;
  const trap = () => { networkCalls += 1; throw new Error('no network call may be reachable'); };
  const sandbox = { AGSC_TOOLS: set, XMLHttpRequest: trap, fetch: trap };
  if (opts.withModelContext !== false) {
    sandbox.document = { modelContext: { registerTool: (t) => registered.push(t) } };
  }
  if (opts.brokenContext) sandbox.document = { modelContext: {} };
  if (opts.withoutTools) delete sandbox.AGSC_TOOLS;
  vm.runInContext(webmcp.script(opts.script), vm.createContext(sandbox), { filename: 'webmcp.js' });
  return { networkCalls, registered, state: sandbox.AGSC_WEBMCP };
}

test('AGSC-09-16: the seven tools register with identical names and argument names', () => {
  const set = toolset();
  const page = evaluate(set);
  assert.deepStrictEqual(page.registered.map((t) => t.name), set.manifest().tools.map((t) => t.name));
  for (const tool of page.registered) {
    const stdio = set.manifest().tools.find((t) => t.name === tool.name);
    assert.deepStrictEqual(Object.keys(tool.inputSchema.properties), Object.keys(stdio.inputSchema.properties));
    // The registered object crossed a JSON boundary, so compare values.
    assert.strictEqual(JSON.stringify(tool.annotations), JSON.stringify(stdio.annotations));
    assert.strictEqual(tool.description, stdio.description);
  }
  assert.strictEqual(page.state.registered, 7);
  assert.strictEqual(page.state.transport, 'webmcp');
});

test('AGSC-09-16: results are byte-identical to the stdio transport for the same input', () => {
  const set = toolset();
  const page = evaluate(set);
  for (const [name, args] of [['read', { slug: 'handoff' }], ['search', { query: 'supervisor' }],
    ['links', { slug: 'supervisor' }], ['compose', { selection: ['handoff'] }],
    ['ask', { question: 'handoff' }], ['propose', { slug: 'handoff' }],
    ['remember', { body: 'x', kind: 'concept', operator: 'human:tester', title: 'T' }], ['read', { slug: 'ghost' }]]) {
    const viaTool = page.registered.find((t) => t.name === name).execute(args);
    assert.strictEqual(JSON.stringify(viaTool), JSON.stringify(set.call(name, args)), name);
  }
  assert.strictEqual(page.networkCalls, 0);
});

test('AGSC-09-16: registration is feature-detected — no modelContext, no registration', () => {
  const bare = evaluate(toolset(), { withModelContext: false });
  assert.deepStrictEqual(bare.registered, []);
  assert.strictEqual(bare.state.registered, 0);
  // The page still works in plain JavaScript.
  assert.strictEqual(bare.state.invoke('read', { slug: 'handoff' }).type, 'item');
  // A `document.modelContext` without `registerTool` is also not a registration.
  assert.strictEqual(evaluate(toolset(), { brokenContext: true }).state.registered, 0);
});

test('AGSC-09-16: propose and remember are local-only and perform no network write', () => {
  const page = evaluate(toolset());
  assert.deepStrictEqual(webmcp.LOCAL_ONLY_TOOLS, ['propose', 'remember']);
  page.registered.find((t) => t.name === 'propose').execute({ slug: 'handoff' });
  page.registered.find((t) => t.name === 'remember').execute({ body: '', kind: 'concept', title: 'T' });
  assert.strictEqual(page.state.localOnlyCalls, 2);
  assert.strictEqual(page.networkCalls, 0);
  // A read tool does not count as a local-only write.
  page.registered.find((t) => t.name === 'read').execute({ slug: 'handoff' });
  assert.strictEqual(page.state.localOnlyCalls, 2);
});

test('the emitted script carries no third-party origin and no tool logic', () => {
  const text = webmcp.script();
  assert.ok(!/https?:\/\/(?!w3id\.org)/u.test(text.replace(/LicenseRef-[^"']*/gu, '')),
    'the script must reference no third-party origin (AGSC-06-05)');
  assert.ok(!text.includes('AGSC-E301'), 'tool logic belongs to mcp-tools.js alone');
  assert.ok(text.startsWith("'use strict';"));
});

test('with no implementation loaded the page answers an envelope, never a throw', () => {
  const page = evaluate(toolset(), { withoutTools: true });
  const result = page.state.invoke('read', { slug: 'handoff' });
  assert.strictEqual(result.type, 'error');
  assert.strictEqual(result.body.code, 'AGSC-E901');
  assert.strictEqual(result.trust, 'untrusted');
});
