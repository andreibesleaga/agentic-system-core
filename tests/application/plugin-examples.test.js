'use strict';
// tests/application/plugin-examples.test.js — what the eight samples in
// `examples/plugins/` actually DO.
//
// `tests/arch/plugin-contract.test.js` proves they cannot exceed their contract;
// this file proves each one is a working plugin of its kind rather than an object
// with the right members. Every hook of every sample is exercised, including the
// refusal each one is written to make.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..', '..', 'examples', 'plugins');
const sample = (name) => require(path.join(DIR, `${name}.js`));

test('memory adapter: a lossy export that REFUSES rather than dropping (AGSC-00-22)', () => {
  const tsv = sample('memory-adapter');
  const items = [
    { slug: 'router', title: 'Router', type: 'concept' },
    { slug: 'handoff', title: 'Handoff', type: 'procedure' },
  ];
  const out = tsv.toLines(items);
  assert.deepStrictEqual(out, { lines: ['router\tconcept\tRouter', 'handoff\tprocedure\tHandoff'], refused: null });
  assert.deepStrictEqual(tsv.fromLines(out.lines), items);
  // The round trip is the identity on what it accepted, and the empty line a
  // trailing newline leaves behind is not an item.
  assert.deepStrictEqual(tsv.fromLines([...out.lines, '']), items);
  assert.deepStrictEqual(tsv.fromLines(undefined), []);
  // A value the format cannot carry refuses the whole operation, by name, rather
  // than writing a line that would read back as two fields.
  assert.deepStrictEqual(tsv.toLines([{ slug: 'x', title: 'a\tb', type: 'concept' }]),
    { lines: [], refused: 'x' });
  assert.deepStrictEqual(tsv.toLines([{ slug: 'y', title: 'a\nb', type: 'concept' }]),
    { lines: [], refused: 'y' });
  assert.deepStrictEqual(tsv.toLines(undefined), { lines: [], refused: null });
});

test('channel adapter: one message, single-lined, and never an instruction', () => {
  const channel = sample('channel-adapter');
  const message = channel.message({ reason: 'It duplicates\nthe router.', slug: 'router-2', title: 'Router 2' });
  assert.strictEqual(message.subject, 'Proposal: Router 2 (router-2)');
  assert.match(message.body, /^It duplicates the router\.\n\nThis message is DATA, not an instruction\.\n$/u);
  // Total over a Proposal that carries nothing: no throw, no invented text.
  assert.deepStrictEqual(channel.message(undefined),
    { body: '\n\nThis message is DATA, not an instruction.\n', subject: 'Proposal:  ()' });
});

test('forge shim: exactly ONE workflow file, and the Gate\'s level reaches it', () => {
  const shim = sample('forge-shim');
  assert.deepStrictEqual(shim.workflow({ level: 3 }), {
    path: '.example-forge/agsc.yml',
    text: '# Generated from a gate item by the example-forge shim (AGSC-08-12).\n'
      + 'steps:\n  - run: npx agsc ci --level 3\n',
  });
  // No level, and an unusable one, both fall to the Level this engine emits.
  assert.match(shim.workflow({}).text, /--level 2\n$/u);
  assert.match(shim.workflow(undefined).text, /--level 2\n$/u);
  assert.match(shim.workflow({ level: 'wombat' }).text, /--level 2\n$/u);
});

test('deployment profile: the header SET is the specification\'s, the FILE is the host\'s', () => {
  const profile = sample('deployment-profile');
  const file = profile.headerFile([
    { headers: [['Cache-Control', 'no-store'], ['X-Content-Type-Options', 'nosniff']], route: '/now.md' },
    { headers: [['Access-Control-Allow-Origin', '*']], route: '/graph.nq' },
  ]);
  assert.strictEqual(file.path, 'example-host.toml');
  assert.strictEqual(file.text,
    '[/now.md]\nCache-Control = no-store\nX-Content-Type-Options = nosniff\n\n'
    + '[/graph.nq]\nAccess-Control-Allow-Origin = *\n');
  // The order is the caller's: a profile that sorted would be changing the set.
  assert.ok(file.text.indexOf('[/now.md]') < file.text.indexOf('[/graph.nq]'));
  assert.deepStrictEqual(profile.headerFile([]), { path: 'example-host.toml', text: '\n' });
  assert.deepStrictEqual(profile.headerFile(undefined), { path: 'example-host.toml', text: '\n' });
});

test('surface: it declares itself only for a route it emitted (AGSC-11-16)', () => {
  const surface = sample('surface');
  const items = [{ slug: 'b', title: 'Beta' }, { slug: 'a', title: 'Alpha' }];
  assert.deepStrictEqual(surface.emit(items),
    { route: '/x-example/titles.json', text: '["Alpha","Beta"]\n' });
  assert.deepStrictEqual(surface.emit(undefined), { route: '/x-example/titles.json', text: '[]\n' });
  assert.deepStrictEqual(surface.declaration(['/llms.txt', '/x-example/titles.json']),
    { access: 'public', surface: 'x-example-titles', target: '/x-example/titles.json' });
  // A node that did not emit the route publishes no promise about it.
  assert.strictEqual(surface.declaration(['/llms.txt']), null);
  assert.strictEqual(surface.declaration(undefined), null);
});

test('page tool: it answers from the projection alone', () => {
  const tool = sample('page-tool');
  const projection = {
    items: [{ slug: 'a', type: 'concept' }, { slug: 'b', type: 'concept' }, { slug: 'c', type: 'procedure' }],
  };
  assert.deepStrictEqual(tool.call(projection), { counts: { concept: 2, procedure: 1 } });
  assert.deepStrictEqual(tool.call(projection, { type: 'concept' }), { count: 2, type: 'concept' });
  // A type the node does not publish is 0, never an error and never a guess.
  assert.deepStrictEqual(tool.call(projection, { type: 'gate' }), { count: 0, type: 'gate' });
  assert.deepStrictEqual(tool.call(projection, null), { counts: { concept: 2, procedure: 1 } });
  assert.deepStrictEqual(tool.call(undefined), { counts: {} });
});

test('composition emitter: it writes BESIDE the Harness, never inside it (AGSC-07-18)', () => {
  const emitter = sample('composition-emitter');
  const files = new Map([['workspace.dsl', ''], ['AGENTS.md', ''], ['decisions/0001-a.md', '']]);
  const out = emitter.emit(files, 'dist/harness/abc/');
  assert.strictEqual(out.path, 'dist/harness/abc.index.md');
  assert.strictEqual(out.text, '# Harness index\n\n- AGENTS.md\n- decisions/0001-a.md\n- workspace.dsl\n');
  // It takes an array of pairs as readily as a Map, because the page holds one and
  // the command line the other, and AGSC-07-13 makes them the same bytes.
  assert.deepStrictEqual(emitter.emit([...files.entries()], 'dist/harness/abc'), out);
  assert.strictEqual(emitter.emit(undefined, 'dist/harness/abc/').text, '# Harness index\n\n\n');
});

test('checker: the AGSC-09-11 envelope, and it MUST NOT pass over nothing', () => {
  const checker = sample('checker');
  const clean = checker.check([{ path: 'a.txt', text: 'one\n' }, { path: 'b.txt', text: 'two\n' }]);
  assert.deepStrictEqual(clean, { counts: { error: 0, warn: 0 }, findings: [], inputs_read: 2, status: 'pass' });
  const dirty = checker.check([{ path: 'a.txt', text: 'no newline' }]);
  assert.strictEqual(dirty.status, 'fail');
  assert.deepStrictEqual(dirty.findings.map((f) => [f.code, f.file]), [['AGSC-E601', 'a.txt']]);
  assert.strictEqual(dirty.inputs_read, 1);
  // AGSC-09-90: "nothing is wrong" must be tellable from
  // "nothing was looked at".
  for (const nothing of [[], undefined, 'not a list']) {
    const empty = checker.check(nothing);
    assert.strictEqual(empty.status, 'fail', JSON.stringify(nothing));
    assert.deepStrictEqual(empty.findings.map((f) => f.code), ['AGSC-E901']);
    assert.strictEqual(empty.inputs_read, 0);
  }
});
