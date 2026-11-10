'use strict';
// verifies AGSC-07-29
// The blueprint outputs (`src/composition/blueprint.js`) beyond the bytes of compose-0028 to
// compose-0030: properties over generated graphs (the files do not depend on the order of the
// selection, two runs give the same bytes, no file names an item that is not listed), the cases
// the vectors do not reach (a member blocked by a listed item, a member of another type that no
// Concept joins, a member joined to two Concepts, two decisions, an architecture that is not
// listed), and the list of what is not a blueprint output at 1.1. Seeded, fixed instant.

const test = require('node:test');
const assert = require('node:assert');
const { createHash } = require('node:crypto');
const fc = require('fast-check');

const blueprint = require('../../src/composition/blueprint.js');
const { compose } = require('../../src/composition/compose.js');
const harness = require('../../src/composition/harness.js');

const INSTANT = '2026-09-16T12:34:56Z';
const SLUGS = ['a', 'b', 'c-d', 'e', 'f', 'g-h'];
const KEYS = ['requires', 'broader', 'derived-from', 'uses', 'related', 'verifies', 'blocked-by',
  'decided-by', 'implements', 'excludes', 'supersedes'];
const RUNS = { numRuns: 150, seed: 20261106 };

function optionsFor(result, items, listed, architecture = 'plan') {
  return {
    architecture,
    base: 'https://blueprint.example/',
    bundleVersion: '2.0.0',
    instant: INSTANT,
    items,
    licenseProse: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    listed,
    selectionDigest: createHash('sha256').update(harness.selectionDigestInput(result), 'utf8').digest('hex'),
    specVersion: '1.1.0',
  };
}

/** The architecture item that saves `selection`. */
function plan(selection, extra = {}) {
  return {
    body: `The plan.\n\n\`\`\`yaml agsc-selection\n${selection.map((s) => `- ${s}`).join('\n')}\n\`\`\`\n`,
    kind: 'architecture', slug: 'plan', title: 'The plan', type: 'concept', ...extra,
  };
}

const item = (slug, type, extra = {}) => ({ description: `About ${slug}.`, slug, title: `Item ${slug}`, type, ...extra });
const listedOf = (items) => items.filter((i) => i.status !== 'draft').map((i) => i.slug);

function filesOf(items, selection, listed = listedOf(items)) {
  const result = compose(items, selection);
  return new Map(blueprint.blueprintFiles(result, optionsFor(result, items, listed)));
}

/** A generated Bundle: items over SLUGS with random Links, types and statuses, and the plan. */
const itemsArbitrary = fc.tuple(...SLUGS.map((slug) => fc.record({
  links: fc.dictionary(fc.constantFrom(...KEYS), fc.subarray(SLUGS.filter((s) => s !== slug), { maxLength: 2 }), { maxKeys: 3 }),
  produces: fc.subarray(['p', 'q']),
  consumes: fc.subarray(['p', 'q']),
  status: fc.constantFrom('stable', 'stable', 'draft'),
  type: fc.constantFrom('concept', 'concept', 'procedure', 'lesson'),
}).map((r) => item(slug, r.type, {
  ...r.links,
  ...(r.produces.length > 0 ? { produces: r.produces } : {}),
  ...(r.consumes.length > 0 ? { consumes: r.consumes } : {}),
  body: `The body of ${slug}.\n`,
  status: r.status,
}))));

test('AGSC-07-29: the blueprint does not depend on the order of the selection, and two runs give the same bytes', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const all = [...items, plan(selection)];
    const once = JSON.stringify([...filesOf(all, selection)]);
    return once === JSON.stringify([...filesOf(all, [...selection].reverse())])
      && once === JSON.stringify([...filesOf(all, [...selection, ...selection])])
      && once === JSON.stringify([...filesOf(all, selection)]);
  }), RUNS);
});

test('AGSC-07-29, AGSC-00-05: no blueprint file names an item that is not listed', () => {
  fc.assert(fc.property(itemsArbitrary, fc.subarray(SLUGS, { minLength: 1 }), (items, selection) => {
    const all = [...items, plan(selection)];
    const hidden = all.filter((i) => i.status === 'draft').map((i) => i.slug);
    for (const text of filesOf(all, selection).values()) {
      for (const slug of hidden) {
        // A slug is named as a node `["<slug>"]`, between backticks, or in a decision file's name.
        if (text.includes(`["${slug}"]`) || text.includes(`\`${slug}\``)) return false;
      }
    }
    return [...filesOf(all, selection).keys()].every((path) => !hidden.some((slug) => path.endsWith(`-${slug}.md`)));
  }), RUNS);
});

test('AGSC-07-29: the files, their order, and one decision record per distinct target, numbered by slug', () => {
  const items = [
    plan(['web', 'job']),
    item('web', 'concept', { 'decided-by': ['adr-b', 'adr-a'], requires: ['db'] }),
    item('db', 'concept', { 'decided-by': ['adr-a'] }),
    item('job', 'procedure', { uses: ['web', 'db'], 'blocked-by': ['ticket'] }),
    item('ticket', 'concept', { kind: 'task' }),
    item('adr-a', 'concept', { body: 'Use one database.\n', kind: 'decision', title: 'One database' }),
    item('adr-b', 'concept', { body: '   \n', description: 'A web front.', kind: 'decision', title: 'A front' }),
  ];
  const files = filesOf(items, ['web', 'job']);
  assert.deepStrictEqual([...files.keys()], ['blueprint/build-plan.md', 'blueprint/c4-components.mmd',
    'blueprint/c4-containers.mmd', 'blueprint/c4-context.mmd', 'blueprint/decisions/0001-adr-a.md',
    'blueprint/decisions/0002-adr-b.md']);
  assert.match(files.get('blueprint/decisions/0001-adr-a.md'), /cite `adr-a` as the decision behind them: `db`, `web`\.\n\n```text agsc-content\nUse one database\.\n```/u);
  // An empty body: the description is quoted.
  assert.match(files.get('blueprint/decisions/0002-adr-b.md'), /^# A front$[\s\S]*```text agsc-content\nA web front\.\n```/mu);
  // `job` uses both Concepts: it sits in the subgraph of the code-point-least, `db`.
  assert.match(files.get('blueprint/c4-components.mmd'), /\n {2}subgraph s_db\["db"\]\n {4}n_job\["job"\]\n {2}end\n/u);
  // The build plan: dependency order, the members needed, the blocker.
  const steps = files.get('blueprint/build-plan.md').split('## Steps\n\n')[1];
  assert.strictEqual(steps, '### Step 1 — adopt `db`\n\n- Needs: nothing\n- Verified by: no check authored\n\n'
    + '### Step 2 — adopt `job`\n\n- Needs: nothing\n- Verified by: no check authored\n- Blocked by: `ticket`\n\n'
    + '### Step 3 — adopt `web`\n\n- Needs: `db`\n- Verified by: no check authored\n');
});

test('AGSC-07-29: a member of another type that no Concept joins is drawn outside every subgraph', () => {
  const items = [plan(['web', 'note']), item('web', 'concept'), item('note', 'lesson', { related: ['elsewhere'] }), item('elsewhere', 'concept')];
  const level3 = filesOf(items, ['web', 'note']).get('blueprint/c4-components.mmd');
  assert.ok(level3.endsWith('flowchart LR\n  n_note["note"]\n'), level3);
  const level1 = filesOf(items, ['web', 'note']).get('blueprint/c4-context.mmd');
  assert.ok(level1.endsWith('  system["The plan"]\n  n_elsewhere["elsewhere"]\n  system -->|related| n_elsewhere\n'), level1);
});

test('AGSC-07-29: a quote or a backslash in the architecture\'s title is written as Mermaid reads a label', () => {
  const items = [plan(['web'], { title: 'The "Agent Team" \\ architecture' }), item('web', 'concept', { related: ['out'] }), item('out', 'concept')];
  const files = filesOf(items, ['web']);
  assert.match(files.get('blueprint/c4-context.mmd'), /\n {2}system\["The #quot;Agent Team#quot; \\ architecture"\]\n/u);
  assert.match(files.get('blueprint/c4-containers.mmd'), /\n {2}subgraph system\["The #quot;Agent Team#quot; \\ architecture"\]\n/u);
  assert.strictEqual(blueprint.mermaidLabel('The plan'), '"The plan"', 'a title without either keeps its bytes');
});

test('AGSC-07-29, AGSC-00-05: an architecture that is not listed has no blueprint; a draft decision has no record', () => {
  const items = [plan(['web'], { status: 'draft' }), item('web', 'concept', { 'decided-by': ['adr'] }), item('adr', 'concept', { status: 'draft' })];
  assert.deepStrictEqual([...filesOf(items, ['web']).keys()], []);
  const listed = [plan(['web']), ...items.slice(1)];
  assert.deepStrictEqual([...filesOf(listed, ['web']).keys()].filter((p) => p.includes('/decisions/')), []);
});

test('AGSC-07-29: JSON Schema, OpenAPI and test scaffolds are not blueprint outputs at 1.1', () => {
  const items = [plan(['web']), item('web', 'concept')];
  for (const path of filesOf(items, ['web']).keys()) {
    assert.match(path, /^blueprint\/(?:c4-(?:context|containers|components)\.mmd|build-plan\.md|decisions\/\d{4}-[a-z0-9-]+\.md)$/u, path);
  }
});
