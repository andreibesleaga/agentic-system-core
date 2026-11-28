'use strict';
// tests/interchange/okf-foreign-forms.test.js — AGSC-01-22 (a foreign OKF bundle is
// imported, not refused) for the shapes a real bundle has: a header with an inline map,
// a time spelled as UTC with an offset, and a header that no reader of this engine could
// read back. The written items must keep what the header says where they can, must pass
// this node's own lint and build, and no input may make the import throw or refuse.
// Hand-made fixtures; no network; no clock.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');
const okf = require('../../src/interchange/okf.js');
const yaml = require('../../src/knowledge/yaml.js');
const { compile } = require('../../src/knowledge/schema.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const ITEM_SCHEMA = readSchemas(ROOT).item;
const EPOCH = '1767225600';
const PLAN = { itemSchema: ITEM_SCHEMA, operator: 'human:x' };

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

/** The environment of a started command: this one without any AGSC_ name (AGSC-01-37), and a fixed instant. */
function childEnv() {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('AGSC_')) env[name] = value;
  return { ...env, SOURCE_DATE_EPOCH: EPOCH };
}

function temp(prefix) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

function ctxFor(dir, options = {}) {
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: [],
    openRoot: (at) => createFileSystem(path.resolve(dir, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: '1.0.0',
    stderr: { write: () => {} },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

const HEAD = 'type: concept\nkind: explainer\ndescription: A page of a foreign bundle, written for the importer tests.\n';
const page = (header, body = '# Page\n\nBody.\n') => ({ path: 'a.md', text: `---\n${HEAD}${header}---\n\n${body}` });
const written = (docs) => okf.plan(docs, { ...PLAN, existingPaths: new Set() });
const bare = (body) => textOf(written([{ path: 'a.md', text: `\n${body}` }]));
/** What 1.1.0 wrote for a page whose header it could not read: the synthesised header. */
const control = (body = '# Page\n\nBody.\n') => bare(body);
const textOf = (plan) => plan.writes[0].text;

/** A Bundle that holds `docs` as an import of an OKF folder, and the three checks a user runs on it. */
function importAndCheck(docs) {
  const target = temp('agsc-okf-forms-');
  nodeFs.cpSync(FIXTURE, target, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(target, 'LICENSE-CONTENT'));
  const source = temp('agsc-okf-forms-src-');
  for (const one of docs) {
    nodeFs.mkdirSync(path.dirname(path.join(source, one.path)), { recursive: true });
    nodeFs.writeFileSync(path.join(source, one.path), one.text);
  }
  const imported = importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
  const lint = lintVerb.run(ctxFor(target)).findings
    .filter((f) => /^content\/concepts\/[a-z]+\.md/u.test(String(f.file)));
  const build = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), 'build'],
    { cwd: target, env: childEnv(), encoding: 'utf8' });
  return { build, imported, lint, target };
}

const errorsOf = (findings) => findings.filter((f) => f.severity === 'error').map((f) => `${f.code} ${f.file} ${f.message}`);

test('the strict reader still refuses an inline map, and the importer does not read such a header (AGSC-02-02)', () => {
  assert.throws(() => yaml.parse('a: { b: c }\n'), { code: 'AGSC-E105' });
});

test('a header with an anchor and an inline map keeps nothing, and the reason is the strict reader\'s', () => {
  const plan = written([page('x: &a { b: c }\n')]);
  assert.strictEqual(plan.totals.unreadable_frontmatter, 1);
  assert.ok(plan.findings.some((f) => /outside the YAML subset/u.test(f.message)));
  assert.ok(!plan.findings.some((f) => /inline collections/u.test(f.message)));
  assert.strictEqual(textOf(plan), textOf(written([{ path: 'a.md', text: '\n# Page\n\nBody.\n' }])));
});

for (const [name, header] of [
  ['an empty inline map in an unknown key', 'x-extra: {}\n'],
  ['an empty inline map in generated', 'generated: {}\n'],
  ['an empty map inside a list', 'x-list: [{}, a]\n'],
]) {
  test(`${name} is not read, and the Bundle then lints and builds (AGSC-01-22)`, () => {
    const plan = written([page(header, '# Page\n\nBody.\n')]);
    assert.strictEqual(plan.totals.unreadable_frontmatter, 1, JSON.stringify(plan.findings.map((f) => f.message)));
    assert.strictEqual(textOf(plan), control());
    const result = importAndCheck([page(header)]);
    assert.deepStrictEqual(errorsOf(result.lint), []);
    assert.strictEqual(result.build.status, 0, result.build.stderr + result.build.stdout);
  });
}

for (const [name, header] of [
  ['an inline map whose value the item schema refuses (generated by: x)', 'generated: { by: x }\n'],
  ['a list inside a list (tags)', 'tags: [[a]]\n'],
  ['a list that holds a map where the schema wants text (tags)', 'tags: [{a: b}]\n'],
]) {
  test(`${name} never makes an item that lint or build refuses where the previous version's builds (AGSC-01-22)`, () => {
    const plan = written([page(header)]);
    assert.strictEqual(textOf(plan), control());
    const result = importAndCheck([page(header)]);
    assert.deepStrictEqual(errorsOf(result.lint), []);
    assert.strictEqual(result.build.status, 0, result.build.stderr + result.build.stdout);
  });
}

test('a page of 975 KB with a 90 KB inline header is written as 1.1.0 wrote it', () => {
  const siblings = Array.from({ length: 7600 }, (_, n) => `k${n}: v`).join(', ');
  const header = `x-big: ${'{a: '.repeat(60)}{${siblings}}${'}'.repeat(60)}\n`;
  const body = `${'Body text of an ordinary paragraph that goes on for a while.\n\n'.repeat(15000).slice(0, 900000)}`;
  const input = page(header, body);
  assert.ok(input.text.length < 1048576, `${input.text.length} bytes in`);
  const plan = written([input]);
  assert.strictEqual(textOf(plan), bare(body));
  assert.ok(!plan.findings.some((f) => /inline collections|not applied/u.test(f.message)));
  const result = importAndCheck([input]);
  assert.deepStrictEqual(errorsOf(result.lint), []);
  assert.strictEqual(result.build.status, 0, result.build.stderr + result.build.stdout);
});

const SCHEMAS = { item: compile(ITEM_SCHEMA) };
const FILE = (text, at = 'content/concepts/a.md') => ({ path: at, text });
const ITEM = (extra) => `---\ntype: concept\ntitle: Alpha\nkind: explainer\ndescription: An item written for the importer tests of the choice.\nstatus: draft\nprov:\n  origin: imported\n  operator: human:x\n${extra}---\nBody.\n`;

test('chooseResult: the improved result stands when it has no fault the base result lacks', () => {
  const base = FILE(ITEM(''));
  assert.strictEqual(okf.chooseResult(base, FILE(ITEM('')), SCHEMAS).applied, true);
  const better = FILE(ITEM('tags:\n  - agents\n  - patterns\n'));
  const chosen = okf.chooseResult(base, better, SCHEMAS);
  assert.strictEqual(chosen.applied, true);
  assert.strictEqual(chosen.result, better);
});

test('chooseResult: an item-schema error the base result lacks sends the base result back, with the reason', () => {
  const base = FILE(ITEM(''));
  const chosen = okf.chooseResult(base, FILE(ITEM('generated:\n  by: x\n')), SCHEMAS);
  assert.strictEqual(chosen.applied, false);
  assert.strictEqual(chosen.result, base);
  assert.match(chosen.why, /AGSC-E204 \/generated\/by/u);
});

test('chooseResult: a fault the base result has too is not a reason to refuse', () => {
  const base = FILE(ITEM('generated:\n  by: x\n'));
  const improved = FILE(ITEM('generated:\n  by: x\ntags:\n  - agents\n  - patterns\n'));
  assert.strictEqual(okf.chooseResult(base, improved, SCHEMAS).applied, true);
});

test('chooseResult: a header the strict reader refuses, or a file over the input cap, sends the base result back', () => {
  const base = FILE(ITEM(''));
  const flow = okf.chooseResult(base, FILE(ITEM('x-extra: {}\n')), SCHEMAS);
  assert.strictEqual(flow.applied, false);
  assert.match(flow.why, /AGSC-E105/u);
  const big = okf.chooseResult(base, FILE(`${ITEM('')}${'x'.repeat(1048576)}`), SCHEMAS);
  assert.strictEqual(big.applied, false);
  assert.match(big.why, /AGSC-E904/u);
  assert.strictEqual(okf.chooseResult(FILE(`${ITEM('')}${'x'.repeat(1048576)}`), FILE(`${ITEM('')}${'x'.repeat(1048577)}`), SCHEMAS).applied, true, 'a base that is too big does not refuse');
});

test('chooseResult: a header nested deeper than AGSC-02-02 bounds sends the base result back', () => {
  let nested = '';
  for (let level = 0; level < 70; level += 1) nested += `${'  '.repeat(level)}x-n:\n`;
  nested += `${'  '.repeat(70)}v\n`;
  const chosen = okf.chooseResult(FILE(ITEM('')), FILE(ITEM(nested)), SCHEMAS);
  assert.strictEqual(chosen.applied, false);
  assert.match(chosen.why, /nest its header deeper than 64/u);
});

test('a header with deep flow nesting is read for its four keys only, and costs nothing more', () => {
  for (const depth of [70, 700]) {
    const header = `deep: ${'{a: '.repeat(depth)}x${'}'.repeat(depth)}\n`;
    const plan = written([page(header)]);
    assert.strictEqual(plan.totals.unreadable_frontmatter, 1, `depth ${depth}`);
    assert.strictEqual(plan.writes.length, 1, `depth ${depth}`);
    assert.strictEqual(textOf(plan), control(), `depth ${depth}: what 1.1.0 wrote, with the description`);
  }
});

test('many keys nested deep write no more than an unreadable header does (no amplification)', () => {
  let header = '';
  for (let key = 0; key < 100; key += 1) header += `k${key}: ${'{a: '.repeat(400)}x${'}'.repeat(400)}\n`;
  const plan = written([page(header)]);
  assert.strictEqual(plan.totals.unreadable_frontmatter, 1);
  assert.strictEqual(textOf(plan), bare('# Page\n\nBody.\n'));
});

test('a hostile header costs what it cost in 1.1.0: it is read once, strictly', () => {
  const header = `x: ${'['.repeat(300000)}\n`;
  const input = page(header);
  const started = process.hrtime.bigint();
  assert.throws(() => yaml.parse(header.replace(/^/u, '')));
  const strictOnly = Number(process.hrtime.bigint() - started) / 1e9;
  const planStarted = process.hrtime.bigint();
  const plan = written([input]);
  const planned = Number(process.hrtime.bigint() - planStarted) / 1e9;
  assert.strictEqual(plan.totals.unreadable_frontmatter, 1);
  assert.ok(planned < strictOnly * 1.5 + 0.5, `strict read ${strictOnly.toFixed(2)} s, plan ${planned.toFixed(2)} s`);
});

test('no header makes the plan throw or refuse; the audit input of one key 680 deep imports', () => {
  const header = `x: ${'{a: '.repeat(680)}x${'}'.repeat(680)}\n`;
  const result = importAndCheck([page(header)]);
  assert.deepStrictEqual(errorsOf(result.imported.findings), []);
  assert.strictEqual(nodeFs.readdirSync(path.join(result.target, 'content', 'concepts')).includes('a.md'), true);
});

test('a time written as UTC with an offset or fractions is written in the form of AGSC-02-06, and reported', () => {
  const plan = written([
    page('generated:\n  by: human:ana\n  at: 2026-01-01T12:30:00.000+00:00\nstale_after: 2027-01-01T00:00:00-00:00\n'
      + 'verified:\n  - by: human:ana\n    at: 2026-01-01T12:30:00+0000\n  - by: human:bo\n    at: 2026-01-02T00:00:00-0000\n  - by: human:cy\n    at: 2026-01-03T00:00:00.5Z\n'),
  ]);
  const text = textOf(plan);
  assert.match(text, /^ {2}at: "2026-01-01T12:30:00Z"$/mu);
  assert.match(text, /^stale_after: "2027-01-01T00:00:00Z"$/mu);
  assert.match(text, /at: "2026-01-02T00:00:00Z"/u);
  assert.match(text, /at: "2026-01-03T00:00:00Z"/u);
  const warnings = plan.findings.filter((f) => /UTC form/u.test(f.message));
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0].message, /generated\.at, stale_after, verified\[\]\.at were written/u, 'each key once');
  assert.match(warnings[0].message, /fractions of a second dropped/u);
});

test('a time with a non-zero offset is converted to UTC, with the roll-over of day, month and year', () => {
  const cases = [
    ['2026-12-31T23:30:00-02:00', '2027-01-01T01:30:00Z'],
    ['2027-01-01T00:30:00+02:00', '2026-12-31T22:30:00Z'],
    ['2026-01-01T12:30:00+0530', '2026-01-01T07:00:00Z'],
    ['2026-01-01T12:00:00+14:00', '2025-12-31T22:00:00Z'],
    ['2026-01-01T12:00:00-12:00', '2026-01-02T00:00:00Z'],
    ['2026-01-01T12:00:00+05:45', '2026-01-01T06:15:00Z'],
    ['1900-02-28T23:00:00-02:00', '1900-03-01T01:00:00Z'],
    ['1900-03-01T01:00:00+02:00', '1900-02-28T23:00:00Z'],
    ['2000-02-28T23:00:00-02:00', '2000-02-29T01:00:00Z'],
    ['2000-03-01T01:00:00+02:00', '2000-02-29T23:00:00Z'],
    ['2024-02-28T23:00:00-02:00', '2024-02-29T01:00:00Z'],
    ['2024-03-01T01:00:00+02:00', '2024-02-29T23:00:00Z'],
    ['2100-02-28T23:00:00-02:00', '2100-03-01T01:00:00Z'],
    ['2100-03-01T01:00:00+02:00', '2100-02-28T23:00:00Z'],
    ['2026-03-01T00:00:00+00:01', '2026-02-28T23:59:00Z'],
    ['0001-01-01T00:30:00-01:00', '0001-01-01T01:30:00Z'],
    ['9999-12-31T23:30:00-01:00', null],
    ['0001-01-01T00:30:00+01:00', null],
    ['2026-01-01T12:00:00+14:01', null],
    ['2026-01-01T12:00:00+14:59', null],
    ['2026-01-01T12:00:00-14:30', null],
    ['2026-01-01T12:00:00+13:59', '2025-12-31T22:01:00Z'],
    ['2026-01-01T12:00:00+15:00', null],
    ['2026-01-01T12:00:00+01:60', null],
    ['2026-01-01T12:00:00+0160', null],
  ];
  for (const [input, expected] of cases) {
    const got = okf.toUtcInstant(input);
    assert.strictEqual(got === null ? null : got.text, expected, input);
  }
});

test('a time that is not a string is left alone, and a time with a fraction and an offset reports the drop', () => {
  assert.strictEqual(okf.toUtcInstant(['2026-01-02T03:04:05+00:00']), null);
  assert.strictEqual(okf.toUtcInstant({ at: '2026-01-02T03:04:05+00:00' }), null);
  assert.strictEqual(okf.toUtcInstant(null), null);
  assert.deepStrictEqual(okf.toUtcInstant('2026-01-02T03:04:05.999+00:00'), { dropped: true, text: '2026-01-02T03:04:05Z' });
  const plan = written([page('generated:\n  by: human:ana\n  at: [2026-01-02T03:04:05+00:00]\n')]);
  assert.match(textOf(plan), /^ {2}at:\n {4}- 2026-01-02T03:04:05\+00:00$/mu, 'a list stays a list');
});

test('property: 2000 fixed instants and offsets agree with what Date computes', () => {
  let seed = 20261128;
  const next = (n) => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
  const two = (n) => String(n).padStart(2, '0');
  for (let count = 0; count < 2000; count += 1) {
    const edge = [1, 2, 4, 1899, 1900, 1999, 2000, 2024, 2100, 9998, 9999][next(11)];
    const year = next(3) === 0 ? edge : 1 + next(9999);
    const month = 1 + next(12);
    const last = new Date(Date.UTC(2000, month, 0)).getUTCDate();
    const day = next(4) === 0 ? [1, last][next(2)] : 1 + next(last);
    const clock = [next(24), next(60), next(60)];
    const sign = next(2) === 0 ? '+' : '-';
    const offsetHours = next(15);
    const offsetMinutes = next(60);
    const colon = next(2) === 0 ? ':' : '';
    const fraction = next(3) === 0 ? `.${next(1000)}` : '';
    const stamp = (y) => `${String(y).padStart(4, '0')}-${two(month)}-${two(day)}T${clock.map(two).join(':')}`;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (month === 2 && date.getUTCMonth() !== 1) continue; // 29 February of a common year is not generated as valid
    date.setUTCHours(clock[0], clock[1], clock[2], 0);
    const moved = new Date(date.getTime() - (sign === '+' ? 1 : -1) * (offsetHours * 60 + offsetMinutes) * 60000);
    const y = moved.getUTCFullYear();
    const expected = y < 1 || y > 9999 || (offsetHours === 14 && offsetMinutes > 0) ? null
      : `${String(y).padStart(4, '0')}-${two(moved.getUTCMonth() + 1)}-${two(moved.getUTCDate())}T${two(moved.getUTCHours())}:${two(moved.getUTCMinutes())}:${two(moved.getUTCSeconds())}Z`;
    const input = `${stamp(year)}${fraction}${sign}${two(offsetHours)}${colon}${two(offsetMinutes)}`;
    const got = okf.toUtcInstant(input);
    assert.strictEqual(got === null ? null : got.text, expected === input ? null : expected, input);
  }
});

test('started and ended are times of an episode only; on another type they are unknown keys and stay as written', () => {
  const concept = written([page('started: 2026-01-01T12:30:00+00:00\nended: 2026-01-01T13:30:00+00:00\n')]);
  assert.match(textOf(concept), /^started: 2026-01-01T12:30:00\+00:00$/mu);
  assert.ok(!concept.findings.some((f) => /UTC form/u.test(f.message)));
  const episode = written([{ path: 'a.md', text: '---\ntype: episode\ntitle: Run\ndescription: An episode written for the importer tests.\nstarted: 2026-01-01T12:30:00+00:00\nended: 2026-01-01T13:30:00.000-00:00\n---\n\nBody.\n' }]);
  assert.match(textOf(episode), /^started: "2026-01-01T12:30:00Z"$/mu);
  assert.match(textOf(episode), /^ended: "2026-01-01T13:30:00Z"$/mu);
});

test('an instant that is not real is left as written (AGSC-02-06)', () => {
  const left = [
    '2026-13-01T10:00:00+00:00', '2026-00-10T10:00:00+00:00', '2026-02-30T10:00:00+00:00',
    '2026-02-29T10:00:00+00:00', '1900-02-29T10:00:00+00:00', '2100-02-29T10:00:00+00:00',
    '2026-04-31T10:00:00+00:00', '2026-01-00T10:00:00+00:00', '2026-01-01T24:00:00+00:00',
    '2026-01-01T23:59:60+00:00', '2026-01-01T23:60:00+00:00', '2026-01-01T25:00:00+00:00',
    '2026-01-01T12:30:00+02:00 ', '2026-01-01t12:30:00+00:00', '2026-01-01T12:30:00+00:00z',
  ];
  for (const value of left) assert.strictEqual(okf.toUtcInstant(value), null, value);
  for (const value of ['2028-02-29T10:00:00+00:00', '2000-02-29T10:00:00+00:00', '2026-12-31T23:59:59.9+00:00']) {
    assert.notStrictEqual(okf.toUtcInstant(value), null, value);
  }
});

test('an impossible time still fails lint after the import (AGSC-02-06)', () => {
  const result = importAndCheck([page('stale_after: 2026-13-45T99:99:99+00:00\n')]);
  assert.ok(errorsOf(result.lint).some((m) => m.startsWith('AGSC-E204')), errorsOf(result.lint).join('\n'));
});

test('a foreign type that names a member of Object.prototype is mapped like any unknown type (AGSC-01-22)', () => {
  for (const type of ['constructor', '__proto__', 'toString']) {
    const doc = { path: 'a.md', text: `---\ntype: ${type}\nkind: explainer\ntitle: Odd\ndescription: A page with an odd type, written for the importer tests.\n---\n\nBody.\n` };
    const plan = written([doc]);
    assert.deepStrictEqual(plan.writes.map((w) => w.path), ['content/concepts/a.md'], type);
    assert.match(textOf(plan), /^type: concept$/mu, type);
    assert.match(textOf(plan), new RegExp(`^x-okf-type: ${type}$`, 'mu'), type);
  }
});

test('the imported bundle passes lint, and builds, written through the real verbs', () => {
  const result = importAndCheck([
    page('title: Alpha page\ntags: [agents, patterns]\ngenerated: { by: human:ana, at: 2026-01-01T10:00:00+00:00 }\n'),
  ]);
  assert.deepStrictEqual(errorsOf(result.lint), []);
  assert.strictEqual(result.build.status, 0, result.build.stderr + result.build.stdout);
});

// ---------------------------------------------------------------- links, narrowly

const doc = (at, title, body, type = 'concept') => ({
  path: at,
  text: `---\ntype: ${type}\nkind: explainer\ndescription: A page of a foreign bundle, written for the importer tests.\ntitle: ${title}\n---\n\n${body}\n`,
});
const itemOf = (plan, at) => plan.writes.find((w) => w.path === at).text;

test('a link that names a document of the import from the source tree, and no file of the import from the new place, is rewritten', () => {
  const plan = written([
    doc('a.md', 'Alpha', '[one](sub/b.md#top) [two](sub/b.md#) [three](./sub/b.md) [four](sub/../sub/b.md) [five](sub/b.md)'),
    doc('sub/b.md', 'Beta', 'Back to [alpha](../a.md) and [self](b.md).'),
  ]);
  const alpha = itemOf(plan, 'content/concepts/a.md');
  assert.match(alpha, /\[one\]\(\.\.\/concepts\/b\.md#top\) \[two\]\(\.\.\/concepts\/b\.md#\) \[three\]\(\.\.\/concepts\/b\.md\)/u);
  assert.match(alpha, /\[four\]\(\.\.\/concepts\/b\.md\) \[five\]\(\.\.\/concepts\/b\.md\)/u);
  const beta = itemOf(plan, 'content/concepts/b.md');
  assert.match(beta, /\[alpha\]\(\.\.\/concepts\/a\.md\)/u);
  assert.match(beta, /\[self\]\(b\.md\)/u, 'sub/b.md names itself, and b.md resolves to the item at the new place');
  assert.ok(plan.findings.some((f) => /relative link/u.test(f.message) && f.file === 'a.md'));
});

test('a link that resolves at the new place is never touched, even when it names another item there', () => {
  const plan = written([
    doc('a.md', 'Alpha', '[b](b.md) [c](../concepts/c.md)'),
    doc('b.md', 'Beta', 'B'),
    doc('c.md', 'Gamma', 'C'),
  ]);
  assert.match(itemOf(plan, 'content/concepts/a.md'), /\[b\]\(b\.md\) \[c\]\(\.\.\/concepts\/c\.md\)/u);
  assert.ok(!plan.findings.some((f) => /relative link/u.test(f.message)));
});

test('a slug collision: a link to the item that took the -2 suffix is rewritten only when it is broken', () => {
  const plan = written([
    doc('a.md', 'Alpha', 'A'),
    doc('sub/a.md', 'Alpha two', 'A2'),
    doc('sub/x.md', 'Ex', '[up](../a.md) [near](a.md)'),
    doc('y.md', 'Why', '[down](sub/a.md) [same](a.md)'),
  ]);
  assert.ok(plan.writes.some((w) => w.path === 'content/concepts/a-2.md'));
  const ex = itemOf(plan, 'content/concepts/x.md');
  assert.match(ex, /\[up\]\(\.\.\/concepts\/a\.md\)/u, 'sub/x.md named the root a, which is not at content/a.md');
  assert.match(ex, /\[near\]\(a\.md\)/u, 'it names the item a at the new place, as written, though the author meant a-2');
  const why = itemOf(plan, 'content/concepts/y.md');
  assert.match(why, /\[down\]\(\.\.\/concepts\/a-2\.md\) \[same\]\(a\.md\)/u);
});

test('a link to a document of another type goes to that type\'s folder', () => {
  const plan = written([
    doc('a.md', 'Alpha', '[to](sub/g.md)'),
    doc('sub/g.md', 'Gate', 'G', 'cluster'),
  ]);
  assert.match(itemOf(plan, 'content/concepts/a.md'), /\[to\]\(\.\.\/clusters\/g\.md\)/u);
});

test('links in code, with a title, with an escape, absolute, with a scheme or as references are left as written', () => {
  const kept = [
    '`[c](sub/b.md)`',
    '``[c](sub/b.md)``',
    '[t](sub/b.md "title")',
    "[t](sub/b.md 'title')",
    '[p](sub/%62.md)',
    '[s](sub\\b.md)',
    '[r](/sub/b.md)',
    '[w](https://example.org/sub/b.md)',
    '[m](mailto:b.md)',
    '[a](<sub/b.md>)',
    '[ref][r]',
    '[r]: sub/b.md',
    '[none](sub/missing.md)',
    '[up](../../b.md)',
    '[case](SUB/B.MD)',
    '[txt](sub/b.txt)',
  ];
  const fenced = '```\n[f](sub/b.md)\n```\n\n~~~\n[g](sub/b.md)\n~~~';
  const indented = 'Text.\n\n    [i](sub/b.md)\n\n\t[j](sub/b.md)\n';
  const body = `${kept.join('\n')}\n\n${fenced}\n\n${indented}`;
  const plan = written([doc('a.md', 'Alpha', body), doc('sub/b.md', 'Beta', 'B')]);
  const alpha = itemOf(plan, 'content/concepts/a.md');
  assert.ok(alpha.endsWith(`${body.trimEnd()}\n`), 'the body is byte for byte what the source had');
  assert.ok(!plan.findings.some((f) => /relative link/u.test(f.message)));
});

test('a link in prose after a code span and a fence, on the same line or later, is still rewritten', () => {
  const plan = written([
    doc('a.md', 'Alpha', '`code` then [one](sub/b.md)\n\n```\nfence\n```\n\n[two](sub/b.md)'),
    doc('sub/b.md', 'Beta', 'B'),
  ]);
  const alpha = itemOf(plan, 'content/concepts/a.md');
  assert.match(alpha, /`code` then \[one\]\(\.\.\/concepts\/b\.md\)/u);
  assert.match(alpha, /\[two\]\(\.\.\/concepts\/b\.md\)/u);
});

test('a link whose rewrite would push the item over the input cap leaves the whole item as the previous version wrote it', () => {
  const links = '[x](sub/b.md) '.repeat(Math.floor(1040000 / 14));
  const body = `${links}`;
  const input = doc('a.md', 'Alpha', body);
  assert.ok(input.text.length < 1048576, `${input.text.length}`);
  const plan = written([input, doc('sub/b.md', 'Beta', 'B')]);
  const alpha = itemOf(plan, 'content/concepts/a.md');
  assert.ok(alpha.length < 1048576);
  assert.ok(alpha.endsWith(`${body}\n`), 'not rewritten');
  assert.ok(plan.findings.some((f) => /not applied: links rewritten/u.test(f.message) && /AGSC-E904/u.test(f.message)));
});

test('time: rewriting links costs linear time on bodies of one megabyte of the hostile shapes', () => {
  const shapes = {
    'code span and link alternating': '`a` [x](b.md) '.repeat(70000),
    'runs of ](': '](a'.repeat(340000),
    'runs of ](a/': '](a/'.repeat(250000),
    '20,000 links': '[x](sub/b.md) '.repeat(20000),
    'one backtick then links': `\`${'[x](sub/b.md) '.repeat(60000)}`,
  };
  for (const [name, body] of Object.entries(shapes)) {
    const input = doc('a.md', 'Alpha', body.slice(0, 1000000));
    const started = process.hrtime.bigint();
    written([input, doc('sub/b.md', 'Beta', 'B'), doc('b.md', 'Bee', 'B')]);
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    assert.ok(seconds < 2, `${name}: ${seconds.toFixed(2)} s`);
  }
});

test('the imported bundle with rewritten links and respelled times passes lint and builds, written through the real verbs', () => {
  const result = importAndCheck([
    { path: 'a.md', text: doc('a.md', 'Alpha', '[to](sub/b.md#beta-page)').text.replace('---\n\n', 'generated:\n  by: human:ana\n  at: 2026-01-01T12:30:00+02:00\n---\n\n') },
    doc('sub/b.md', 'Beta page', '# Beta page\n\nBack to [alpha](../a.md).'),
  ]);
  assert.deepStrictEqual(errorsOf(result.lint), []);
  assert.strictEqual(result.build.status, 0, result.build.stderr + result.build.stdout);
});

test('export then import reproduces the items byte for byte (nothing is rewritten when every link resolves)', () => {
  const source = temp('agsc-okf-rt-');
  nodeFs.cpSync(FIXTURE, source, { recursive: true });
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(source, 'LICENSE-CONTENT'));
  const exported = exportVerb.run(ctxFor(source, { verbFlags: { okf: true } }));
  assert.deepStrictEqual(exported.findings.filter((f) => f.severity === 'error'), []);
  const folder = path.join(source, 'dist', 'export', 'okf');
  const files = [];
  const walk = (dir, prefix) => {
    for (const entry of nodeFs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith('.md')) files.push({ path: `${prefix}${entry.name}`, text: nodeFs.readFileSync(path.join(dir, entry.name), 'utf8') });
    }
  };
  walk(folder, '');
  const plan = okf.plan(files, PLAN);
  assert.ok(plan.writes.length >= 3);
  assert.ok(!plan.findings.some((f) => /relative link|not applied/u.test(f.message)), plan.findings.map((f) => f.message).join('\n'));
});

test('a plan given no item schema still plans (the conformance handler gives none)', () => {
  const plan = okf.plan([page('x-extra: {}\ngenerated: { by: human:x }\n'), { path: 'b.md', text: page('title: Beta\ngenerated: { by: human:x }\n').text }], { operator: 'human:x' });
  assert.strictEqual(plan.writes.length, 2);
  assert.strictEqual(plan.totals.unreadable_frontmatter, 2, 'both headers hold inline collections, which are not read');
});

// ---------------------------------------------------------------- links and the files the Bundle already holds

const CLUSTER_SOURCE = [
  doc('sub/a.md', 'Alpha', 'See [b](b.md).'),
  doc('sub/b.md', 'Bee', 'B', 'cluster'),
];

test('a link that names a file already in the target Bundle from the new place keeps its bytes (plan)', () => {
  const kept = okf.plan(CLUSTER_SOURCE, { ...PLAN, existingPaths: new Set(['content/concepts/b.md']) });
  assert.match(itemOf(kept, 'content/concepts/a.md'), /See \[b\]\(b\.md\)\./u);
  assert.ok(!kept.findings.some((f) => /relative link/u.test(f.message)));
  const empty = okf.plan(CLUSTER_SOURCE, { ...PLAN, existingPaths: new Set() });
  assert.match(itemOf(empty, 'content/concepts/a.md'), /See \[b\]\(\.\.\/clusters\/b\.md\)\./u);
});

test('a caller that gives no existing paths (the conformance handler, the plugin lane) gets no link rewritten', () => {
  const none = okf.plan(CLUSTER_SOURCE, PLAN);
  assert.match(itemOf(none, 'content/concepts/a.md'), /See \[b\]\(b\.md\)\./u);
  assert.ok(!none.findings.some((f) => /relative link/u.test(f.message)));
  const handler = okf.plan(CLUSTER_SOURCE, { operator: 'human:x' });
  assert.match(itemOf(handler, 'content/concepts/a.md'), /See \[b\]\(b\.md\)\./u);
  const sources = nodeFs.readFileSync(path.join(ROOT, 'src', 'application', 'cli', 'verbs', 'import.js'), 'utf8');
  const calls = sources.match(/okf\.plan\(/gu) || [];
  const withPaths = sources.match(/existingPaths:/gu) || [];
  assert.strictEqual(calls.length, 2, 'the verb calls the plan twice: the OKF lane and the plugin lane');
  assert.strictEqual(withPaths.length, 1, 'only the OKF lane lists the Bundle');
});

test('the same through the verb: a Bundle that holds content/concepts/b.md keeps the link, an empty one repairs it', () => {
  for (const [label, hold] of [['holding', true], ['empty', false]]) {
    const target = temp(`agsc-okf-existing-${label}-`);
    nodeFs.copyFileSync(path.join(FIXTURE, 'agsc.config.json'), path.join(target, 'agsc.config.json'));
    if (hold) {
      nodeFs.mkdirSync(path.join(target, 'content', 'concepts'), { recursive: true });
      nodeFs.writeFileSync(path.join(target, 'content', 'concepts', 'b.md'), ITEM(''));
    }
    const source = temp('agsc-okf-existing-src-');
    for (const one of CLUSTER_SOURCE) {
      nodeFs.mkdirSync(path.dirname(path.join(source, one.path)), { recursive: true });
      nodeFs.writeFileSync(path.join(source, one.path), one.text);
    }
    importVerb.run(ctxFor(target, { argv: [source], verbFlags: { from: 'okf' } }));
    const written = nodeFs.readFileSync(path.join(target, 'content', 'concepts', 'a.md'), 'utf8');
    assert.match(written, hold ? /See \[b\]\(b\.md\)\./u : /See \[b\]\(\.\.\/clusters\/b\.md\)\./u, label);
  }
});

test('the target Bundle is listed only when a link would be rewritten, and once', () => {
  let calls = 0;
  const listing = () => { calls += 1; return new Set(); };
  okf.plan([doc('a.md', 'Alpha', 'No links here, and [one](https://example.org/x.md) outside.'), doc('b.md', 'Bee', '[same](a.md)')], { ...PLAN, existingPaths: listing });
  assert.strictEqual(calls, 0, 'no candidate link, no listing');
  okf.plan([doc('a.md', 'Alpha', '[x](sub/b.md) [y](sub/b.md)'), doc('sub/b.md', 'Bee', '[z](../a.md)')], { ...PLAN, existingPaths: listing });
  assert.strictEqual(calls, 1, 'listed once for the whole import');
});

test('time: listing a Bundle of 5,000 items takes well under a second', () => {
  const target = temp('agsc-okf-5000-');
  nodeFs.mkdirSync(path.join(target, 'content', 'concepts'), { recursive: true });
  for (let n = 0; n < 5000; n += 1) nodeFs.writeFileSync(path.join(target, 'content', 'concepts', `item-${n}.md`), 'x');
  const fs = createFileSystem(target);
  const started = process.hrtime.bigint();
  const found = fs.walk('content');
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  assert.strictEqual(found.length, 5000);
  assert.ok(seconds < 1, `${seconds.toFixed(3)} s`);
});

test('property: every change to a body is a link that 1.1.0\'s item would have had broken (so lint refused it)', () => {
  let seed = 7;
  const next = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed % n; };
  const folders = ['', 'sub/', 'sub/deep/', 'other/'];
  const names = ['a', 'b', 'c', 'd'];
  for (let round = 0; round < 40; round += 1) {
    const docs = [];
    const have = new Set();
    for (const folder of folders) {
      for (const name of names) {
        if (next(3) !== 0) { have.add(`${folder}${name}.md`); }
      }
    }
    const paths = [...have];
    const targets = ['a', 'b', 'c', 'd'].flatMap((n) => ['', '../', '../../', 'sub/', './', 'sub/deep/', '../other/'].map((d) => `${d}${n}.md`));
    for (const at of paths) {
      const links = Array.from({ length: 1 + next(4) }, () => `[l](${targets[next(targets.length)]})`).join(' ');
      docs.push(doc(at, `T ${at}`, links, next(5) === 0 ? 'cluster' : 'concept'));
    }
    const existing = new Set(Array.from({ length: next(4) }, () => `content/concepts/${names[next(4)]}.md`));
    const plan = okf.plan(docs, { ...PLAN, existingPaths: existing });
    const writtenPaths = new Set(plan.writes.map((w) => w.path));
    for (const [n, one] of docs.entries()) {
      const written = plan.writes.find((w) => w.text.includes(`title: T ${one.path}\n`));
      const before = one.text.split('\n---\n\n')[1].trimEnd().split(' ');
      const after = written.text.split('\n---\n')[1].trim().split(' ');
      assert.strictEqual(after.length, before.length, `round ${round} ${one.path}`);
      const home = written.path;
      before.forEach((link, k) => {
        if (link === after[k]) return;
        // it changed: from the new place the link as written must name nothing that exists
        const target = /\]\(([^)]*)\)/u.exec(link)[1];
        const parts = home.split('/').slice(0, -1);
        for (const part of target.split('/')) { if (part === '..') parts.pop(); else if (part !== '.' && part !== '') parts.push(part); }
        const there = parts.join('/');
        assert.ok(!writtenPaths.has(there) && !existing.has(there), `round ${round} ${one.path}: ${link} -> ${after[k]} though ${there} exists`);
      });
      assert.ok(n >= 0);
    }
  }
});
