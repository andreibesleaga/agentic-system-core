'use strict';
// AGSC-06-02, AGSC-06-05, AGSC-06-18, AGSC-06-19, AGSC-06-20, AGSC-06-24 and
// AGSC-06-25: the page templates. Generated HTML is byte-identical within this
// implementation and is deliberately NOT part of the cross-implementation vector
// set (AGSC-04-24), so these are the obligations that ARE rules.

const test = require('node:test');
const assert = require('node:assert');
const DIAGRAM_SOURCE = require('node:fs')
  .readFileSync(require('node:path').join(__dirname, '..', 'fixtures', 'diagrams', 'a2a.diagram'), 'utf8');
const html = require('../../src/distribution/html.js');
const { WELLKNOWN_PATH } = require('../../src/distribution/discovery.js');

const RENDER = (body) => ({ html: `<p>${body.trim()}</p>`, headings: [], anchors: [] });
const OPTIONS = { render: RENDER, licenseProse: 'CC-BY-4.0', nav: [['/', 'Home']] };

test('every page carries the describedby link in its head (AGSC-06-25)', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', description: 'D', body: 'Body' }, OPTIONS);
  assert.ok(page.includes(`<link rel="describedby" href="${WELLKNOWN_PATH}" type="application/linkset+json">`));
});

test('every page carries the licence line; the Content Use Terms only where adopted (AGSC-06-18)', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', body: '' }, OPTIONS);
  assert.ok(page.includes('CC-BY-4.0'), 'the prose licence is named');
  assert.ok(!page.includes('LicenseRef-AgenticSystemCore-Content-Use-1.0'), 'a CC BY page is not presented under the terms');
  const adopted = html.itemPage({ slug: 'a', title: 'A', body: '' }, { ...OPTIONS, licenseProse: undefined });
  assert.ok(adopted.includes('LicenseRef-AgenticSystemCore-Content-Use-1.0'));
});

test('an item page links its own .md and .jsonld views (AGSC-06-02)', () => {
  const page = html.itemPage({ slug: 'a', title: 'A', body: '' }, OPTIONS);
  assert.ok(page.includes('href="/pages/a.md"'));
  assert.ok(page.includes('href="/pages/a.jsonld"'));
});

test('a retired item keeps its page and carries a visible notice (AGSC-11-22)', () => {
  const retired = html.itemPage({ slug: 'a', title: 'A', body: '', status: 'retired' }, OPTIONS);
  assert.ok(retired.includes('role="note"') && retired.includes('retired'));
  const deprecated = html.itemPage({ slug: 'a', title: 'A', body: '', status: 'deprecated' }, OPTIONS);
  assert.ok(deprecated.includes('deprecated'));
});

test('an attachment renders with its alt text (AGSC-06-20, AGSC-02-98)', () => {
  const page = html.itemPage({
    slug: 'a', title: 'A', body: '',
    attachments: [{ file: 'd.svg', media_type: 'image/svg+xml', alt: 'A flow diagram' }],
  }, OPTIONS);
  assert.ok(page.includes('src="/attachments/a/d.svg"'));
  assert.ok(page.includes('alt="A flow diagram"'));
});

test('the canonical link, the alternates and the JSON-LD head are emitted (AGSC-06-19)', () => {
  const page = html.shell({
    ...OPTIONS,
    title: 'T', description: 'D', body: '<p>x</p>',
    canonical: 'https://a.example/concepts/a/',
    alternates: [{ href: '/pages/a.md', type: 'text/markdown' }],
    jsonld: '{"@type":"TechArticle"}',
  });
  assert.ok(page.includes('<link rel="canonical" href="https://a.example/concepts/a/">'));
  assert.ok(page.includes('<link rel="alternate" href="/pages/a.md" type="text/markdown">'));
  assert.ok(page.includes('<script type="application/ld+json">{"@type":"TechArticle"}</script>'));
});

test('no third-party origin is referenced anywhere in a page (AGSC-06-05)', () => {
  const pages = [
    html.itemPage({ slug: 'a', title: 'A', body: '' }, OPTIONS),
    html.indexPage({ title: 'concepts', description: 'D', entries: [] }, OPTIONS),
    html.indexPage({ title: 'concepts', description: 'D', entries: [{ href: '/a/', title: 'A', description: 'D' }] }, OPTIONS),
    html.nowPage('# Now\n', OPTIONS),
    html.notFoundPage(OPTIONS),
  ];
  for (const page of pages) {
    assert.ok(!/(?:src|href)="https?:\/\//u.test(page.replace(/href="https:\/\/a\.example[^"]*"/gu, '')),
      'a page referenced another origin');
    assert.ok(!page.includes('localStorage') && !page.includes('document.cookie'));
  }
});

test('/about/ is generated from the verb set and carries the honest limit verbatim (AGSC-06-24)', () => {
  const page = html.aboutPage({
    verbs: ['init', 'lint', 'ci'],
    personas: [{ id: 'P0', title: 'Drop-in', steps: ['agsc init', 'agsc ci', 'agsc build'] }],
  }, OPTIONS);
  assert.ok(page.includes('<code>agsc init</code>'));
  assert.ok(page.includes(html.HONEST_LIMIT.slice(0, 40)));
  assert.strictEqual(html.HONEST_LIMIT.includes('MUST NOT claim more'), true);
});

test('every interpolated value is escaped', () => {
  const page = html.itemPage({ slug: 'a', title: '<script>x</script>', body: '' }, OPTIONS);
  assert.ok(!page.includes('<script>x</script>'));
  assert.ok(page.includes('&lt;script&gt;'));
  assert.strictEqual(html.escapeHtml(null), '');
});

// ------------------------------------------------- AGSC-02-13 the inline diagram

// A real `.diagram` fixture, so the producer is exercised against the grammar the
// compiler's own golden suite pins and not against a source invented here.
const SOURCE_LABEL = 'Agent-to-agent protocol diagram';

const WITH_DIAGRAM = {
  body: 'Body',
  description: 'D',
  diagram: {
    alt: 'Alpha on the left, an arrow labelled uses, Beta on the right.',
    caption: 'The one edge that matters.',
    file: 'router.svg',
  },
  slug: 'router',
  title: 'Router',
};

test('AGSC-02-13: the compiled diagram is inline in the page, in a figure, at no route', () => {
  const { html: figure, findings } = html.diagramFigure(WITH_DIAGRAM, DIAGRAM_SOURCE);
  assert.deepStrictEqual(findings, []);
  assert.ok(figure.startsWith('<figure><svg '), figure);
  assert.ok(figure.endsWith('</figure>'), figure);
  assert.ok(!figure.includes('.svg'), 'the compiled picture is never named as a route');
  assert.ok(!figure.includes('<img'), 'an inline <svg>, never an <img> at a route');

  const page = html.itemPage(WITH_DIAGRAM, { ...OPTIONS, diagramSource: DIAGRAM_SOURCE });
  assert.ok(page.includes(figure), 'the figure reaches the page');
  // Without a source the page keeps its prose and carries no figure.
  assert.ok(!html.itemPage(WITH_DIAGRAM, OPTIONS).includes('<figure>'));
});

test('AGSC-06-20: the accessible name is diagram.alt, not the source label', () => {
  const { html: figure } = html.diagramFigure(WITH_DIAGRAM, DIAGRAM_SOURCE);
  assert.ok(figure.includes(`<title id="router-title">${WITH_DIAGRAM.diagram.alt}</title>`), figure);
  assert.ok(!figure.includes(SOURCE_LABEL), 'the source label replaced the authored alt');
  assert.ok(figure.includes('role="img"') && figure.includes('aria-labelledby="router-title router-desc"'), figure);
  // The caption is the VISIBLE caption and never a substitute for the alt text.
  assert.ok(figure.includes('<figcaption>The one edge that matters.</figcaption>'), figure);
  const { diagram, ...rest } = WITH_DIAGRAM;
  const noCaption = html.diagramFigure({ ...rest, diagram: { alt: diagram.alt, file: diagram.file } }, DIAGRAM_SOURCE);
  assert.ok(!noCaption.html.includes('<figcaption>'), noCaption.html);
  assert.ok(noCaption.html.includes(diagram.alt), 'alt is required even with no caption');
});

test('AGSC-02-98/AGSC-E412: a source that will not compile emits no element', () => {
  const broken = html.diagramFigure(WITH_DIAGRAM, 'box\narrow nowhere nothing\n');
  assert.strictEqual(broken.html, '');
  assert.ok(broken.findings.length > 0);
  assert.ok(broken.findings.every((f) => f.code === 'AGSC-E412'), JSON.stringify(broken.findings));
  assert.ok(broken.findings.every((f) => f.file === 'content/diagrams/router.diagram'), JSON.stringify(broken.findings));
  assert.ok(!html.itemPage(WITH_DIAGRAM, { ...OPTIONS, diagramSource: 'box\n' }).includes('<figure>'));
  // An item with no `diagram` facet, and a non-string source, are both silent.
  assert.deepStrictEqual(html.diagramFigure({ slug: 'a' }, DIAGRAM_SOURCE), { html: '', findings: [] });
  assert.deepStrictEqual(html.diagramFigure(WITH_DIAGRAM, null), { html: '', findings: [] });
});

test('AGSC-02-98: the compiled bytes pass the allow-list before they are inlined', () => {
  const { svgViolations } = require('../../src/governance/lint.js');
  const { html: figure } = html.diagramFigure(WITH_DIAGRAM, DIAGRAM_SOURCE);
  const svg = figure.slice('<figure>'.length, figure.indexOf('<figcaption>'));
  assert.deepStrictEqual(svgViolations(svg), []);
  for (const forbidden of ['<script', 'onload=', 'style=', '<!DOCTYPE', '<!ENTITY', 'data:', '<?xml']) {
    assert.ok(!figure.includes(forbidden), forbidden);
  }
});

test('AGSC-02-13: a compiled diagram the allow-list refuses is AGSC-E412 and no element', () => {
  // The compiler's output is always inside AGSC-02-98's list (a test proved it as a
  // property over 300 generated sources), so the guard is reached only by injecting
  // a refusing allow-list — which is what makes it a defence that has been tested.
  const refuse = () => ['a <script> element', 'an on* attribute'];
  const refused = html.diagramFigure(WITH_DIAGRAM, DIAGRAM_SOURCE, { svgViolations: refuse });
  assert.strictEqual(refused.html, '', 'markup the allow-list refused reached the page');
  assert.deepStrictEqual(refused.findings.map((f) => f.code), ['AGSC-E412']);
  assert.strictEqual(refused.findings[0].severity, 'error');
  assert.strictEqual(refused.findings[0].file, 'content/diagrams/router.diagram');
  assert.match(refused.findings[0].message, /a <script> element, an on\* attribute/u);
  assert.match(refused.findings[0].message, /AGSC-02-98/u);
  const page = html.itemPage(WITH_DIAGRAM, { ...OPTIONS, diagramSource: DIAGRAM_SOURCE, svgViolations: refuse });
  assert.ok(!page.includes('<figure>'), page);
});

// A person reads the item page, not the graph: the typed Links an item authors, a
// task's state and dependencies and a gate's level and checks are shown there, so a
// `contradicts` pair or a blocked task is visible without an agent (AGSC-03-01,
// AGSC-02-99, AGSC-08-09).
test('an item page shows its typed Links, a task its state, a gate its level and checks', () => {
  const links = [
    { key: 'contradicts', targets: [{ href: '/concepts/b/', title: 'B' }] },
    { key: 'blocked-by', targets: [{ href: '/concepts/c/', title: 'C <x>' }] },
  ];
  const task = html.itemPage({ slug: 'a', title: 'A', body: '', type: 'concept', kind: 'task', task_state: 'TASK_STATE_WORKING' },
    { ...OPTIONS, links });
  assert.match(task, /<dt>Task state<\/dt><dd><code>TASK_STATE_WORKING<\/code><\/dd>/u);
  assert.match(task, /<h2 id="links">Links<\/h2>/u);
  assert.match(task, /contradicts[^\n]*<a href="\/concepts\/b\/">B<\/a>/u);
  assert.match(task, /blocked-by[^\n]*<a href="\/concepts\/c\/">C &lt;x&gt;<\/a>/u);
  const unset = html.itemPage({ slug: 'a', title: 'A', body: '', type: 'concept', kind: 'task' }, OPTIONS);
  assert.match(unset, /<dt>Task state<\/dt><dd><code>TASK_STATE_UNSPECIFIED<\/code><\/dd>/u);
  assert.ok(!unset.includes('id="links"'), 'no Links section without a link');
  const gate = html.itemPage({ slug: 'g', title: 'G', body: '', type: 'gate', level: 'L2', checks: ['schema', 'review'] }, OPTIONS);
  assert.match(gate, /<dt>Level<\/dt><dd><code>L2<\/code><\/dd>/u);
  assert.match(gate, /<dt>Checks<\/dt><dd><code>schema<\/code>, <code>review<\/code><\/dd>/u);
});

test('a board with no agent lane says so in a plain sentence (AGSC-10-17)', () => {
  const board = { board: 'B', done: false, slug: 'b', tasks: [] };
  const none = html.boardPage({ board, columns: [], wip: null }, OPTIONS);
  assert.match(none, /Work-in-progress limit: none — this node declares no agent lane/u);
  assert.ok(!none.includes('none declared tasks'));
  const one = html.boardPage({ board, columns: [], wip: 1 }, OPTIONS);
  assert.match(one, /Work-in-progress limit: 1 task in <code>TASK_STATE_WORKING<\/code> per agent lane/u);
});
