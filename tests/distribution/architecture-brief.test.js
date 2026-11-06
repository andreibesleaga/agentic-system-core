'use strict';
// verifies AGSC-07-25, AGSC-07-24, AGSC-06-21, AGSC-06-03, AGSC-08-17
// The brief on the page of a saved architecture (`src/distribution/architecture-brief.js`), on a
// build of `tests/fixtures/minimal` with an architecture, a draft it reaches and a Procedure:
// the section carries the summary, the dependency order, the gaps and the checklist of the brief
// the command line writes, links the same composition on /compose/?from=<slug>, names no item
// that is not listed, uses no refused phrase, keeps the page under 100 KB; no other page carries
// it. Fixed clock, no network.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const architectureBrief = require('../../src/distribution/architecture-brief.js');
const brief = require('../../src/composition/brief.js');
const { composeFrom } = require('../../src/composition/architecture.js');
const { REFUSED_PHRASES } = require('../../src/governance/cleanroom.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

function item(type, slug, title, extra = [], body = 'Body text.') {
  return ['---', `type: ${type}`, `title: ${title}`, `description: ${title}, an item this test adds to the minimal fixture.`,
    'clusters:', '  - agent-patterns', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
    ...extra, '---', '', `# ${title}`, '', body, ''].join('\n');
}

const ADDED = {
  'content/concepts/agent-team.md': item('concept', 'agent-team', 'Agent team', ['kind: architecture'],
    'The team.\n\n```yaml agsc-selection\n- supervisor\n- run-handoff\n```'),
  'content/concepts/secret-plan.md': item('concept', 'secret-plan', 'Secret plan', ['status: draft']),
  'content/procedures/run-handoff.md': item('procedure', 'run-handoff', 'Run the handoff', ['uses:', '  - handoff', '  - secret-plan']),
};

function built() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-architecture-brief-'));
  test.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [file, body] of Object.entries(ADDED)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  }
  const fsPort = createFileSystem(dir);
  const bundle = loadBundle(fsPort, { schemas: validate.schemas(readSchemas(ROOT)) });
  const ports = { clock: createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } }), fs: fsPort };
  return { bundle, ...site.build(bundle, ports, { specVersion: '1.0.0', version: '0.0.2' }) };
}

const text = (bytes) => (typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf8'));
const sectionOf = (page) => page.slice(page.indexOf('<section class="brief"'), page.indexOf('</section>', page.indexOf('<section class="brief"')));

test('AGSC-07-25, AGSC-07-24: an architecture page shows the brief of its composition and links /compose/?from=<slug>', () => {
  const { files } = built();
  const page = text(files.get('/concepts/agent-team/index.html'));
  const brief1 = sectionOf(page);
  assert.ok(brief1.includes('<h2 id="composition-brief">Brief of this architecture</h2>'), brief1);
  assert.match(brief1, /<p>Items in the selection: 2\. Added by closure: 0\. Hidden by supersession: 0\. Warnings: 2\. The composition is valid\.<\/p>/u);
  assert.match(brief1, /<ol><li><a href="\/procedures\/run-handoff\/">Run the handoff<\/a> \(<code>run-handoff<\/code>\)<\/li><li><a href="\/concepts\/supervisor\/">Supervisor<\/a>/u);
  assert.ok(brief1.includes('<li><code>run-handoff</code> uses <code>handoff</code>, which is not in the selection</li>'), brief1);
  assert.ok(brief1.includes('<li>adopt <code>supervisor</code></li>'), brief1);
  assert.ok(brief1.includes('<a href="/compose/?from=agent-team">/compose/?from=agent-team</a>'));
  assert.ok(Buffer.byteLength(page, 'utf8') <= 100000, 'the page is over the 100 KB budget of AGSC-06-21');
});

test('AGSC-00-05: the brief names no item that is not listed, and its texts are those of the command line', () => {
  const { bundle, files } = built();
  const page = text(files.get('/concepts/agent-team/index.html'));
  assert.ok(!sectionOf(page).includes('secret-plan'), 'the brief names the draft');
  assert.ok(!page.includes('secret-plan'), 'the page names the draft');
  const items = bundle.items.filter((i) => (i.frontmatter || {}).status !== 'draft')
    .map((i) => ({ body: i.body, slug: i.slug, type: i.type, ...i.frontmatter }));
  const record = brief.briefOf(composeFrom(items, 'agent-team').result, { instant: '2026-01-01T00:00:00Z', items, listed: items.map((i) => i.slug) });
  for (const entry of [...record.gaps, ...record.checklist]) {
    assert.ok(sectionOf(page).includes(entry.text.replace(/`([^`]*)`/gu, '<code>$1</code>')), entry.text);
  }
});

test('AGSC-06-03, AGSC-08-17: the brief uses no refused phrase', () => {
  const { files } = built();
  const section = sectionOf(text(files.get('/concepts/agent-team/index.html'))).toLowerCase();
  for (const phrase of REFUSED_PHRASES) assert.ok(!section.includes(phrase), phrase);
  const framing = new RegExp(`start here|reading order|${['chap', 'ter'].join('')} \\d|\\b${['compan', 'ion'].join('')}\\b`, 'iu');
  assert.ok(!framing.test(section), section);
});

test('only an architecture page carries the brief; a list longer than the bound says so', () => {
  const { files } = built();
  for (const [route, bytes] of files) {
    if (!route.endsWith('/index.html') || route === '/concepts/agent-team/index.html') continue;
    assert.ok(!text(bytes).includes('<section class="brief"'), route);
  }
  const many = Array.from({ length: architectureBrief.SHOWN + 2 }, (_, i) => ({ slug: `m-${String(i).padStart(2, '0')}`, title: `M ${i}`, type: 'concept' }));
  const plan = { body: `\`\`\`yaml agsc-selection\n${many.map((m) => `- ${m.slug}`).join('\n')}\n\`\`\`\n`, kind: 'architecture', slug: 'big', type: 'concept' };
  const html = architectureBrief.section(plan, { instant: '2026-01-01T00:00:00Z', items: [plan, ...many], route: (i) => `/concepts/${i.slug}/` });
  assert.match(html, /<p>The first 50 of 52 are listed; the whole brief is on <a href="\/compose\/\?from=big">/u);
  assert.strictEqual(architectureBrief.section({ ...plan, body: 'No block.' }, { instant: '', items: [], route: () => '/' }), '');
  // A block that names no item is AGSC-E301 (lint reports it): no section. A member with no title shows its slug.
  const ghost = { ...plan, body: '```yaml agsc-selection\n- ghost\n```\n' };
  assert.strictEqual(architectureBrief.section(ghost, { instant: '', items: [ghost], route: () => '/' }), '');
  const untitled = { slug: 'bare', type: 'concept' };
  const one = { ...plan, body: '```yaml agsc-selection\n- bare\n```\n' };
  assert.match(architectureBrief.section(one, { instant: '', items: [one, untitled], route: () => '/concepts/bare/' }),
    /<li><a href="\/concepts\/bare\/">bare<\/a> \(<code>bare<\/code>\)<\/li>/u);
});
