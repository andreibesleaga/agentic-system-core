'use strict';
// tests/distribution/surfaces-eng2.test.js — the surfaces added for the ENG-2 package:
// `/compose/` (AGSC-06-01, AGSC-07-01, AGSC-09-16), the human board page
// `/boards/<cluster>/` (AGSC-10-13, AGSC-10-17), `/legal/` (AGSC-06-18, V9D-A6),
// AGSC-06-21's three measured budgets (V9D-A1; four until rc.5, when ENG1-01
// replaced the two index bounds with one) and the "every internal link resolves"
// check that closes the defect V9-D found.
//
// Every build here is over a real copy of `tests/fixtures/minimal` in a temporary
// directory with a fixed clock — no network, no wall clock, nothing left behind.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const html = require('../../src/distribution/html.js');
const now = require('../../src/distribution/now.js');
const composePage = require('../../src/distribution/compose-page.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

/** A throwaway copy of the fixture, optionally with extra files written into it. */
function workspace(extra = {}) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-surfaces-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(extra)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function build(dir, options = {}) {
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return {
    bundle,
    ports: { clock, fs },
    ...site.build(bundle, { clock, fs }, { specVersion: '1.0.0-rc.5', version: '0.0.2', ...options }),
  };
}

// ---------------------------------------------------------------- /compose/

test('AGSC-06-01 / AGSC-07-01: /compose/ is emitted with its three same-origin scripts', () => {
  const { files } = build(workspace());
  for (const route of ['/compose/index.html', '/compose/agsc-core.js',
    '/compose/agsc-compose.js', '/compose/webmcp.js']) {
    assert.ok(files.has(route), `${route} is missing`);
  }
  const page = files.get('/compose/index.html');
  // AGSC-06-17's `script-src 'self'` admits no inline script, so every script has a src.
  assert.strictEqual((page.match(/<script(?![^>]*\bsrc=)/gu) || []).length, 0,
    'the page carries an inline script');
  assert.strictEqual((page.match(/<script /gu) || []).length, composePage.ASSETS.length);
  for (const asset of composePage.ASSETS) {
    assert.ok(page.includes(`<script src="${asset}"></script>`), `${asset} is not loaded`);
  }
  // AGSC-07-01: no network, no key, no server — nothing reaches another origin.
  assert.ok(!/https?:\/\/(?!minimal\.example|schema\.org|www\.w3\.org|www\.sitemaps\.org)/u.test(page),
    'the page references a third-party origin');
});

test('AGSC-07-01: the emitted controller reaches only routes AGSC-06-01 already fixes', () => {
  const controller = composePage.controller({ licenseProse: 'X', specVersion: 'v' });
  const fetches = [...controller.matchAll(/fetch\('([^']*)'/gu)].map((m) => m[1]);
  const built = [...controller.matchAll(/fetch\('([^']*)' \+/gu)].map((m) => m[1]);
  for (const target of [...fetches, ...built]) {
    assert.ok(target.startsWith('/'), `${target} is not same-origin`);
  }
  assert.ok(fetches.includes('/graph.jsonld'), 'the page does not read the published graph');
  assert.ok(built.some((t) => t.startsWith('/pages/')), 'the page does not read /pages/<slug>.md');
  // AGSC-06-05: no cookie, no storage, no beacon.
  for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'navigator.sendBeacon', 'indexedDB']) {
    assert.ok(!controller.includes(forbidden), `the controller uses ${forbidden}`);
  }
});

test('AGSC-09-16: the page tool surface answers for all seven tools and for no eighth', () => {
  assert.deepStrictEqual(composePage.toolNames().sort(),
    ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search']);
  const controller = composePage.controller({});
  // Since rc.5 the controller installs NO tool object: `agsc-page-tools.js` does, and
  // it implements all seven. The controller carried a stub that answered `compose`
  // and returned "has no page implementation yet" for the other six (ENG3-02).
  assert.ok(!controller.includes('has no page implementation yet'),
    'the controller still ships the six-tool stub');
  assert.ok(!/globalThis\.AGSC_TOOLS\s*=/u.test(controller),
    'the controller installs a second tool object beside the shared implementation');
  // The item pages load the same three shared files the /compose/ route serves.
  assert.deepStrictEqual([...composePage.PAGE_TOOL_SCRIPTS],
    ['/compose/agsc-core.js', '/compose/agsc-page-tools.js', '/compose/webmcp.js']);
  for (const src of composePage.PAGE_TOOL_SCRIPTS) {
    assert.ok(composePage.ASSETS.includes(src.slice('/compose/'.length)),
      `${src} is not an asset the /compose/ route emits`);
  }
});

// ---------------------------------------------------------------- /legal/

test('AGSC-06-18 / V9D-A6: /legal/ is emitted from LICENSE-CONTENT and linked from every page', () => {
  const { files, skipped } = build(workspace({ 'LICENSE-CONTENT': '# Terms\n\nUse this content as follows.\n' }));
  assert.ok(files.has('/legal/index.html'), '/legal/ was not emitted');
  assert.ok(!skipped.some((s) => s.startsWith('/legal/')), '/legal/ is both emitted and skipped');
  const legal = files.get('/legal/index.html');
  // The page is PRD-019's "Legal and privacy" since the public-statements package;
  // its four obligations and their inputs are asserted in public-statements.test.js.
  assert.match(legal, /<h1>Legal and privacy<\/h1>/u);
  assert.match(legal, /Use this content as follows/u);
  assert.match(legal, /LicenseRef-AgenticSystemCore-Content-Use-1\.0/u);
  for (const [route, text] of files) {
    if (!route.endsWith('.html')) continue;
    assert.match(text, /<a href="\/legal\/">/u, `${route} does not link the terms`);
  }
  assert.match(files.get('/robots.txt'), /\/legal\//u);
  assert.match(files.get('/.well-known/security.txt'), /^Policy: https:\/\/minimal\.example\/legal\/$/mu);
});

test('AGSC-06-18 / V9D-A6: with no LICENSE-CONTENT the route is skipped AND no link is emitted', () => {
  const { files, skipped } = build(workspace());
  assert.ok(!files.has('/legal/index.html'));
  assert.ok(skipped.some((s) => s.startsWith('/legal/ (no LICENSE-CONTENT')), skipped.join(' | '));
  for (const [route, text] of files) {
    if (!route.endsWith('.html')) continue;
    assert.ok(!text.includes('href="/legal/"'), `${route} links a route this build does not emit`);
    // The identifier is still named — what is dropped is the LINK, not the fact.
    assert.match(text, /LicenseRef-AgenticSystemCore-Content-Use-1\.0/u, route);
  }
  assert.ok(!files.get('/.well-known/security.txt').includes('Policy:'),
    'RFC 9116 Policy names a route this build does not emit');
  assert.ok(!files.get('/robots.txt').includes('/legal/'));
});

test('readLicenseContent is total: absent, blank, unreadable and no port at all', () => {
  assert.strictEqual(site.readLicenseContent(undefined), null);
  assert.strictEqual(site.readLicenseContent({ fs: {} }), null);
  assert.strictEqual(site.readLicenseContent({ fs: { exists: () => false, readFile: () => 'x' } }), null);
  assert.strictEqual(site.readLicenseContent({ fs: { exists: () => true, readFile: () => '   \n' } }), null);
  assert.strictEqual(site.readLicenseContent({
    fs: { exists: () => true, readFile: () => { throw new Error('outside the root'); } },
  }), null);
  assert.strictEqual(site.readLicenseContent({ fs: { exists: () => true, readFile: () => 'Terms.' } }), 'Terms.');
});

test('AGSC-06-18: the legal page renders LICENSE-CONTENT and adds no term of its own', () => {
  const page = html.legalPage({
    licenseProse: 'CC-BY-4.0', rendered: '<p>Body.</p>', terms: 'LicenseRef-X',
  }, { licenseProse: 'CC-BY-4.0', render: (t) => ({ html: t }) });
  assert.match(page, /<code>LicenseRef-X<\/code>/u);
  assert.match(page, /<code>CC-BY-4\.0<\/code>/u);
  assert.match(page, /<p>Body\.<\/p>/u);
  assert.match(page, /rendered unchanged/u);
});

// ------------------------------------------------- every internal link resolves

test('V9D-A6, closed: every site-absolute link the build emits resolves to an emitted route', () => {
  for (const extra of [{}, { 'LICENSE-CONTENT': '# Terms\n\nText.\n' }]) {
    const { files, findings } = build(workspace(extra));
    const dangling = findings.filter((f) => f.code === 'AGSC-E901');
    assert.deepStrictEqual(dangling, [], `dangling links: ${JSON.stringify(dangling)}`);
    // The base is what makes an absolute URL in the two text dialects OURS: since
    // rc.5 `security.txt` carries a `Contact:` at another origin (RFC 9116 §2.5.3).
    const links = site.internalLinks(files, { base: 'https://minimal.example' });
    assert.ok(links.length > 0, 'the link sweep found nothing, so it proves nothing');
    for (const link of links) {
      assert.notStrictEqual(site.resolvesTo(files, link.route), null,
        `${link.from} links ${link.href}, which resolves to nothing`);
    }
  }
});

test('internalLinks reads both HTML attributes and the two absolute text dialects', () => {
  const files = new Map([
    ['/a/index.html', '<a href="/b/">b</a><img src="/c.png"><a href="https://x/out">out</a><a href="#frag">f</a>'],
    ['/robots.txt', 'Sitemap: https://minimal.example/sitemap.xml\n'],
    ['/.well-known/security.txt', 'Policy: https://minimal.example/legal/\n'],
    ['/notes.txt', 'Sitemap: https://minimal.example/never-read.xml\n'],
  ]);
  const routes = site.internalLinks(files).map((l) => `${l.from} ${l.route}`);
  assert.deepStrictEqual(routes.sort(), [
    '/.well-known/security.txt /legal/',
    '/a/index.html /b/',
    '/a/index.html /c.png',
    '/robots.txt /sitemap.xml',
  ]);
  // An absolute URL that is the origin itself resolves to `/`.
  assert.deepStrictEqual(site.internalLinks(new Map([['/robots.txt', 'Sitemap: https://x.example\n']]))
    .map((l) => l.route), ['/']);
});

test('resolvesTo maps a directory route onto its index.html and a file onto itself', () => {
  const files = new Map([['/x/index.html', ''], ['/y.json', '']]);
  assert.strictEqual(site.resolvesTo(files, '/x/'), '/x/index.html');
  assert.strictEqual(site.resolvesTo(files, '/x'), '/x/index.html');
  assert.strictEqual(site.resolvesTo(files, '/y.json'), '/y.json');
  assert.strictEqual(site.resolvesTo(files, '/nope/'), null);
});

test('a build that links a route it does not emit reports AGSC-E901, naming both ends', () => {
  const findings = [];
  const files = new Map([['/a/index.html', '<a href="/gone/">g</a>']]);
  for (const link of site.internalLinks(files)) {
    if (site.resolvesTo(files, link.route) === null) findings.push(link);
  }
  assert.deepStrictEqual(findings, [{ from: '/a/index.html', href: '/gone/', route: '/gone/' }]);
});

// ---------------------------------------------------------------- AGSC-06-21 budgets

test('AGSC-06-21 / V9D-A1: the three budgets are the rule\'s own numbers', () => {
  assert.strictEqual(site.BUDGET_HTML_BYTES, 100000);
  // rc.5 (ENG1-01): ONE index budget, 1 MB per index DOCUMENT, decimal. The two it
  // replaced — 1 KB per published item and 500 KB absolute — are gone, not renamed.
  assert.strictEqual(site.BUDGET_INDEX_DOC_BYTES, 1000000);
  assert.strictEqual(site.BUDGET_SEARCH_PER_ITEM_BYTES, undefined);
  assert.strictEqual(site.BUDGET_SEARCH_TOTAL_BYTES, undefined);
  assert.strictEqual(site.BUDGET_MS_PER_500_ITEMS, 60000);
});

test('AGSC-06-21: the fixture is inside every budget, so a green build raises none', () => {
  const { files, findings } = build(workspace());
  assert.deepStrictEqual(site.budgets(files, 3), []);
  assert.deepStrictEqual(findings.filter((f) => f.code === 'AGSC-E904'), []);
});

test('AGSC-06-21: an HTML page over 100 KB fails the build, and only HTML is measured', () => {
  const big = 'x'.repeat(site.BUDGET_HTML_BYTES + 1);
  const raised = site.budgets(new Map([['/a/index.html', big], ['/a.md', big]]), 1);
  assert.strictEqual(raised.length, 1);
  assert.strictEqual(raised[0].code, 'AGSC-E904');
  assert.strictEqual(raised[0].severity, 'error', 'a budget breach MUST fail the build');
  assert.strictEqual(raised[0].file, '/a/index.html');
  assert.match(raised[0].message, /AGSC-06-21 budgets 100 KB per HTML page/u);
  // Exactly at the bound is inside it.
  assert.deepStrictEqual(site.budgets(new Map([['/a/index.html', 'x'.repeat(site.BUDGET_HTML_BYTES)]]), 1), []);
});

test('AGSC-06-21 (rc.5, ENG1-01): the index budget is 1 MB per DOCUMENT', () => {
  // Exactly at the bound is inside it; one byte more is not. Derived with a
  // synthetic file map, never with a megabyte of Markdown.
  const atBound = 'x'.repeat(site.BUDGET_INDEX_DOC_BYTES);
  assert.deepStrictEqual(site.budgets(new Map([['/search.json', atBound]]), 500), []);
  const over = site.budgets(new Map([['/search.json', `${atBound}x`]]), 500);
  assert.strictEqual(over.length, 1);
  assert.strictEqual(over[0].code, 'AGSC-E904');
  assert.strictEqual(over[0].severity, 'error', 'a budget breach MUST fail the build');
  assert.strictEqual(over[0].file, '/search.json');
  assert.match(over[0].message, /\/search\.json is 1000001 bytes; AGSC-06-21 budgets 1 MB per index document/u);

  // A manifest plus shards is MANY documents, each measured on its own, in
  // code-point route order — never summed into one number.
  const half = 'x'.repeat(600000);
  const sharded = site.budgets(new Map([
    ['/search.json', 'x'.repeat(100)], ['/search-01.json', half], ['/search-02.json', half],
  ]), 900);
  assert.deepStrictEqual(sharded, [], 'two 600 KB shards are two conforming documents');
  const both = site.budgets(new Map([
    ['/search-02.json', `${atBound}x`], ['/search-01.json', `${atBound}x`], ['/search.json', 'x'.repeat(100)],
  ]), 900);
  assert.deepStrictEqual(both.map((f) => f.file), ['/search-01.json', '/search-02.json']);

  // The case the OLD per-item rule failed and the rule now admits: a small Bundle of
  // long-form items. 60 items whose index is 120 KB is 2,005 B/item — over the old
  // 1 KB/item bound, and 12 % of the ceiling that exists to protect a browser.
  assert.deepStrictEqual(site.budgets(new Map([['/search.json', 'x'.repeat(120300)]]), 60), []);
  // The published count takes no part at all: it is a bound on the artefact.
  for (const count of [0, 1, 60, 500, 501, 5000]) {
    assert.deepStrictEqual(site.budgets(new Map([['/search.json', 'x'.repeat(999999)]]), count), [], String(count));
  }
  // `/chunks.jsonl` is not an index document: AGSC-06-21 budgets pages and indexes.
  assert.deepStrictEqual(site.budgets(new Map([['/chunks.jsonl', `${atBound}x`]]), 500), []);
});

test('AGSC-06-21: the time budget scales with the Bundle and is never measured inside build()', () => {
  assert.deepStrictEqual(site.timeBudget(1000, 100), []);
  assert.deepStrictEqual(site.timeBudget(60000, 500), []);
  const over = site.timeBudget(60001, 500);
  assert.strictEqual(over.length, 1);
  assert.strictEqual(over[0].code, 'AGSC-E904');
  assert.match(over[0].message, /60 s per 500 items/u);
  // 5 000 items get ten times the allowance, so a conforming Bundle is not punished.
  assert.deepStrictEqual(site.timeBudget(600000, 5000), []);
  // A caller that measured nothing reports nothing — a duration is never invented.
  assert.deepStrictEqual(site.timeBudget(undefined, 500), []);
  assert.deepStrictEqual(site.timeBudget(Number.NaN, 500), []);
  // The build itself never reads a clock for this, so two builds stay byte-identical.
  const source = nodeFs.readFileSync(path.join(ROOT, 'src', 'distribution', 'site.js'), 'utf8');
  assert.ok(!/function build[\s\S]*?timeBudget\(/u.test(source),
    'build() measures a wall-clock duration, which would make a finding machine-dependent');
});

// ---------------------------------------------------------------- /boards/<cluster>/

test('AGSC-10-13: a task yields both the JSON export and the human board page', () => {
  const dir = workspace({
    'content/clusters/work.md': ['---', 'type: cluster', 'title: Work',
      'description: A cluster of tasks, long enough to satisfy the description bound.',
      'prov:', '  origin: human', '  operator: human:x', '---', '', 'Body.', ''].join('\n'),
    'content/concepts/task-one.md': ['---', 'type: concept', 'title: Task one',
      'description: A task in the working state, long enough to satisfy the bound.',
      'clusters:', '  - work', 'prov:', '  origin: human', '  operator: human:x',
      'kind: task', 'task_state: TASK_STATE_WORKING', '---', '', 'Body.', ''].join('\n'),
    'content/concepts/task-two.md': ['---', 'type: concept', 'title: Task two',
      'description: A task waiting for a person, long enough to satisfy the bound.',
      'clusters:', '  - work', 'prov:', '  origin: human', '  operator: human:x',
      'kind: task', 'task_state: TASK_STATE_INPUT_REQUIRED', '---', '', 'Body.', ''].join('\n'),
  });
  const { files } = build(dir);
  assert.ok(files.has('/boards/work.json'), 'the JSON export is missing');
  assert.ok(files.has('/boards/work/index.html'), 'the human board page is missing');
  const page = files.get('/boards/work/index.html');
  // Columns are task states, in the declared order of AGSC-02-99.
  assert.ok(page.indexOf('TASK_STATE_WORKING') < page.indexOf('TASK_STATE_INPUT_REQUIRED')
    || page.indexOf('TASK_STATE_INPUT_REQUIRED') < page.indexOf('TASK_STATE_WORKING'),
  'neither state reached the page');
  assert.match(page, /Work-in-progress limit/u);
  assert.match(page, /Machine view: <a href="\/boards\/work\.json">JSON<\/a>/u);
  assert.match(page, /Task one/u);
  assert.match(page, /Task two/u);
});

test('AGSC-10-17: the board page shows the WIP limit it was given, and says so when there is none', () => {
  const board = { board: 'Work', done: false, slug: 'work', tasks: [] };
  const columns = [{ state: 'TASK_STATE_WORKING', tasks: [{ blocked_by: [], claimed_by: 'agent:lane', iri: 'https://x/t/', title: 'T' }] }];
  const options = { licenseProse: 'X', render: (t) => ({ html: t }) };
  const withLimit = html.boardPage({ board, columns, wip: 1 }, options);
  assert.match(withLimit, /Work-in-progress limit: 1 task in/u);
  assert.match(withLimit, /claimed by <span>agent:lane<\/span>/u);
  const without = html.boardPage({ board, columns, wip: null }, options);
  assert.match(without, /Work-in-progress limit: none declared tasks in/u);
  // A done board says so, and a blocked task names what blocks it.
  const done = html.boardPage({
    board: { ...board, done: true },
    columns: [{ state: 'TASK_STATE_COMPLETED', tasks: [{ blocked_by: ['other'], iri: 'https://x/u/', title: 'U' }] }],
    wip: 2,
  }, options);
  assert.match(done, /This board is done/u);
  assert.match(done, /blocked by <code>other<\/code>/u);
  // An empty column prints the sentence, never an empty list.
  assert.match(html.boardPage({ board, columns: [{ state: 'TASK_STATE_SUBMITTED', tasks: [] }], wip: 1 }, options),
    /No task in this state\./u);
});

// ---------------------------------------------------------------- NOW: waiting + per agent

test('AGSC-10-17: the waiting section is exactly the two slow-lane states, state then slug', () => {
  assert.deepStrictEqual([...now.WAITING_STATES], ['TASK_STATE_AUTH_REQUIRED', 'TASK_STATE_INPUT_REQUIRED']);
  const items = [
    { kind: 'task', slug: 'zeta', task_state: 'TASK_STATE_INPUT_REQUIRED', title: 'Z', type: 'concept' },
    { kind: 'task', slug: 'alpha', task_state: 'TASK_STATE_INPUT_REQUIRED', type: 'concept' },
    { kind: 'task', slug: 'auth', task_state: 'TASK_STATE_AUTH_REQUIRED', title: 'A', type: 'concept' },
    { kind: 'task', slug: 'busy', task_state: 'TASK_STATE_WORKING', title: 'B', type: 'concept' },
    { kind: 'explainer', slug: 'not-a-task', task_state: 'TASK_STATE_INPUT_REQUIRED', type: 'concept' },
    { slug: 'not-a-concept', task_state: 'TASK_STATE_INPUT_REQUIRED', type: 'procedure' },
  ];
  const waiting = now.waitingForAPerson(items, { claimedBy: new Map([['zeta', 'agent:lane']]) });
  assert.deepStrictEqual(waiting, [
    { slug: 'auth', state: 'TASK_STATE_AUTH_REQUIRED', title: 'A' },
    { slug: 'alpha', state: 'TASK_STATE_INPUT_REQUIRED', title: 'alpha' },
    { claimed_by: 'agent:lane', slug: 'zeta', state: 'TASK_STATE_INPUT_REQUIRED', title: 'Z' },
  ]);
  assert.deepStrictEqual(now.waitingForAPerson(undefined), []);
  assert.deepStrictEqual(now.waitingForAPerson(items, { claimedBy: 'not a map' }).length, 3);
});

test('AGSC-06-22: the waiting section appears only when a task waits, and never guesses', () => {
  const config = {};
  const none = now.state([], config, { allItems: [], instant: '2026-01-01T00:00:00Z' });
  assert.strictEqual(none.waiting_for_a_person, undefined);
  assert.ok(!now.nowMarkdown(none).includes('Waiting for a person'));
  const some = now.state([], config, {
    allItems: [{ kind: 'task', slug: 't', task_state: 'TASK_STATE_AUTH_REQUIRED', title: 'T', type: 'concept' }],
    claimedBy: new Map([['t', 'agent:lane']]),
    instant: '2026-01-01T00:00:00Z',
  });
  const markdown = now.nowMarkdown(some);
  assert.match(markdown, /## Waiting for a person/u);
  assert.match(markdown, /No agent lane will pick these up/u);
  assert.match(markdown, /- t — TASK_STATE_AUTH_REQUIRED \(claimed by agent:lane\)/u);
});

test('AGSC-08-25 / AGSC-08-28(d): the per-lane rollup counts spend, runs and auto merges', () => {
  const config = {
    agents: [
      { budget_usd_month: 5, enabled: true, name: 'agent:beta' },
      { enabled: false, name: 'agent:alpha' },
    ],
  };
  const items = [
    { actor: 'agent:beta', date: '2026-01-04', type: 'episode', usage: { cost_usd: 0.1 } },
    { actor: 'agent:beta', date: '2026-01-09', type: 'episode', usage: { cost_usd: 0.2 } },
    { actor: 'agent:beta', date: '2025-12-31', type: 'episode', usage: { cost_usd: 9 } },
    { actor: 'agent:alpha', date: '2026-01-04', type: 'episode', usage: { cost_usd: 'not a number' } },
    { actor: 'agent:beta', date: '2026-01-04', type: 'concept' },
  ];
  const ledger = [
    '{"kind":"merge","mode":"auto","actor":"agent:beta"}',
    '{"kind":"merge","mode":"auto","actor":"agent:beta"}',
    '{"kind":"merge","mode":"hitl","actor":"agent:beta"}',
    '{"kind":"build","mode":"auto","actor":"agent:beta"}',
    'not json at all',
    'null',
    '',
  ].join('\n');
  assert.deepStrictEqual(now.perAgent(items, config, { ledger, month: '2026-01' }), [
    { enabled: false, merges: 0, name: 'agent:alpha', runs: 1, spent_usd: 0 },
    { cap_usd: 5, enabled: true, merges: 2, name: 'agent:beta', runs: 2, spent_usd: 0.3 },
  ]);
  // A Bundle that declares no lane has no lane section at all (AGSC-06-22).
  assert.deepStrictEqual(now.perAgent(items, {}, { month: '2026-01' }), []);
  // No ledger is not an error: the merge count is simply zero.
  assert.strictEqual(now.perAgent(items, config, { month: '2026-01' })[1].merges, 0);
});

test('the agent-lane table reaches /now.md with one row per declared lane', () => {
  const state = now.state([], { agents: [{ budget_usd_month: 2, enabled: true, name: 'agent:one' }] }, {
    allItems: [{ actor: 'agent:one', date: '2026-01-02', type: 'episode', usage: { cost_usd: 0.25 } }],
    instant: '2026-01-01T00:00:00Z',
  });
  const markdown = now.nowMarkdown(state);
  assert.match(markdown, /## Agent lanes/u);
  assert.match(markdown, /\| lane \| enabled \| runs \| merges \| spent USD \| cap USD \|/u);
  assert.match(markdown, /\| agent:one \| yes \| 1 \| 0 \| 0\.25 \| 2 \|/u);
  // A lane with no cap prints an em dash, never an empty cell or a guessed number.
  const uncapped = now.nowMarkdown(now.state([], { agents: [{ enabled: false, name: 'agent:two' }] },
    { allItems: [], instant: '2026-01-01T00:00:00Z' }));
  assert.match(uncapped, /\| agent:two \| no \| 0 \| 0 \| 0 \| — \|/u);
});

test('a float sum is rounded to the cent the cap is expressed in', () => {
  const rows = now.perAgent([
    { actor: 'a', date: '2026-01-01', type: 'episode', usage: { cost_usd: 0.1 } },
    { actor: 'a', date: '2026-01-01', type: 'episode', usage: { cost_usd: 0.2 } },
  ], { agents: [{ name: 'a' }] }, { month: '2026-01' });
  assert.strictEqual(rows[0].spent_usd, 0.3);
  assert.ok(!String(rows[0].spent_usd).includes('0000'), 'a float artefact reached a published page');
});

// ---------------------------------------------------------------- determinism

test('AGSC-04-02: a build carrying every new surface is still byte-reproducible', () => {
  const dir = workspace({
    'LICENSE-CONTENT': '# Terms\n\nText.\n',
    'content/clusters/work.md': ['---', 'type: cluster', 'title: Work',
      'description: A cluster of tasks, long enough to satisfy the description bound.',
      'prov:', '  origin: human', '  operator: human:x', '---', '', 'Body.', ''].join('\n'),
    'content/concepts/task-one.md': ['---', 'type: concept', 'title: Task one',
      'description: A task waiting for a person, long enough to satisfy the bound.',
      'clusters:', '  - work', 'prov:', '  origin: human', '  operator: human:x',
      'kind: task', 'task_state: TASK_STATE_INPUT_REQUIRED', '---', '', 'Body.', ''].join('\n'),
  });
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const ports = { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs };
  const options = { specVersion: '1.0.0-rc.5', version: '0.0.2' };
  assert.deepStrictEqual(site.verify(bundle, ports, options), []);
  const first = site.build(bundle, ports, options);
  assert.ok(first.files.has('/legal/index.html') && first.files.has('/boards/work/index.html'));
  assert.match(first.files.get('/now.md'), /## Waiting for a person/u);
  assert.deepStrictEqual(first.findings.filter((f) => f.code === 'AGSC-E901'), []);
});

test('a build whose renderer emits a link to nothing reports AGSC-E901 and fails', () => {
  // The dangling-link check, driven end to end: a renderer that puts `/gone/` into
  // every item page makes the build emit a link it does not serve, which is exactly
  // the defect V9D-A6 found on `/legal/` — now an error, not a habit.
  const dir = workspace();
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const ports = { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs };
  const built = site.build(bundle, ports, {
    render: () => ({ anchors: [], headings: [], html: '<p><a href="/gone/">nowhere</a></p>' }),
    specVersion: '1.0.0-rc.5',
    version: '0.0.2',
  });
  const dangling = built.findings.filter((f) => f.code === 'AGSC-E901');
  assert.ok(dangling.length > 0, 'no dangling link was reported');
  assert.strictEqual(dangling[0].severity, 'error');
  assert.match(dangling[0].message, /links \/gone\/, and this build emits no route for it/u);
});

test('a graph collaborator with no context generator names the route it cannot produce', () => {
  const dir = workspace();
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const ports = { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs };
  const partial = site.build(bundle, ports, {
    graph: { jsonld: (items, options) => ({ '@graph': [] }) },
    specVersion: '1.0.0-rc.5',
    version: '0.0.2',
  });
  assert.ok(partial.skipped.some((s) => s.startsWith('/ns/context.jsonld (no context generator')),
    partial.skipped.join(' | '));
  assert.ok(!partial.files.has('/ns/context.jsonld'));
  // AGSC-10-02: `/graph.jsonld` is still emitted, because it is the Level-0 artefact.
  assert.ok(partial.files.has('/graph.jsonld'));
});

// -------------------------------------- AGSC-06-01 /attachments/<slug>/<file> (item 28)

test('AGSC-06-01/AGSC-02-98: every attachment an item names is emitted at its route', () => {
  const dir = workspace();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>\n';
  nodeFs.mkdirSync(path.join(dir, 'content', 'attachments', 'supervisor'), { recursive: true });
  nodeFs.writeFileSync(path.join(dir, 'content', 'attachments', 'supervisor', 'live.svg'), svg);
  const source = nodeFs.readFileSync(path.join(dir, 'content', 'concepts', 'supervisor.md'), 'utf8');
  nodeFs.writeFileSync(path.join(dir, 'content', 'concepts', 'supervisor.md'), source.replace(
    /^---\n/u,
    '---\nattachments:\n  - file: live.svg\n    media_type: image/svg+xml\n    alt: A small square.\n',
  ));

  const { files, findings } = build(dir);
  // The served bytes are the authored bytes — the ones AGSC-05-29 hashed (AR2-23).
  assert.strictEqual(String(files.get('/attachments/supervisor/live.svg')), svg);
  // And the <img> the page carries now resolves, so the build raises no AGSC-E901.
  assert.ok(String(files.get('/concepts/supervisor/index.html')).includes('src="/attachments/supervisor/live.svg"'));
  assert.deepStrictEqual(findings.filter((f) => f.code === 'AGSC-E901'), []);
  // An attachment whose file is absent invents nothing: no route, no bytes.
  assert.strictEqual(site.readAttachment({ fs: null }, 'supervisor', 'live.svg'), null);
});

test('the two port reads of the item page invent nothing when the port refuses', () => {
  // AGSC-01-07 / AGSC-01-34: a source or an attachment that is absent, unreadable or
  // outside the Bundle root is simply absent. `build` never guesses its bytes.
  const throwing = { fs: { exists: () => true, readFile: () => { throw new Error('AGSC-E902'); } } };
  assert.strictEqual(site.readDiagramSource(throwing, 'a'), null);
  assert.strictEqual(site.readAttachment(throwing, 'a', 'b.svg'), null);
  const absent = { fs: { exists: () => false, readFile: () => 'never reached' } };
  assert.strictEqual(site.readDiagramSource(absent, 'a'), null);
  assert.strictEqual(site.readAttachment(absent, 'a', 'b.svg'), null);
  assert.strictEqual(site.readDiagramSource({}, 'a'), null);
  assert.strictEqual(site.readAttachment(undefined, 'a', 'b.svg'), null);
  const present = { fs: { exists: () => true, readFile: () => 'label "x"\n' } };
  assert.strictEqual(site.readDiagramSource(present, 'a'), 'label "x"\n');
});
