'use strict';
// CONTEXT Distribution (Emission) — Surface: the generated HTML pages.
// Implements AGSC-06-02 (an item page links its own `.md` and `.jsonld` views),
// AGSC-06-03 (software plus registry — no reading order, no chapter framing),
// AGSC-06-05 (no third-party origin, no font, script or image from another host, no
// cookie, no `localStorage`, no beacon), AGSC-06-19 (the Schema.org JSON-LD),
// AGSC-06-20 (WCAG 2.2 AA semantics and the `alt` text of a diagram), AGSC-06-24
// (the `/about/` Quickstart, generated from the verb set so it cannot drift),
// AGSC-06-25 (the `describedby` link in every `<head>`) and AGSC-06-18 (the Content
// Use Terms line every prose-carrying export embeds).
//
// The Markdown renderer is C's `knowledge/markdown.js` (AGSC-06's CommonMark
// subset); it is INJECTED, never imported, so that this module stays a template and
// the renderer stays one implementation of one rule.
//
// Pure function of its input.

const { TERMS } = require('../knowledge/chunks.js');
const diagrams = require('../knowledge/diagrams.js');
const lint = require('../governance/lint.js');
const { WELLKNOWN_PATH, MEDIA_TYPE } = require('./discovery.js');

/** The five characters that must never reach markup unescaped. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

/**
 * AGSC-06-18: the Content Use Terms line, on every prose-carrying page. The
 * identifier is a constant, independent of `bundle.license_prose`, which names the
 * licence of the prose itself and may differ.
 */
function termsLine(licenseProse, options = {}) {
  const license = licenseProse == null ? TERMS : licenseProse;
  // V9D-A6: every page used to link `/legal/` whether or not the build produced
  // it. The identifier is always named; the LINK is emitted only when the route
  // exists, so no build ships a dangling internal link (AGSC-06-18).
  const legal = options.legal === undefined ? true : Boolean(options.legal);
  const terms = legal
    ? `<a href="/legal/">${escapeHtml(TERMS)}</a>`
    : `<span>${escapeHtml(TERMS)}</span>`;
  return `<p class="terms">Prose licence: <span>${escapeHtml(license)}</span>. `
    + `Content Use Terms: ${terms}.</p>`;
}

/**
 * The page shell. `lang`, the landmark roles and the single `<h1>` are the WCAG 2.2
 * AA obligations of AGSC-06-20; the `describedby` link is AGSC-06-25; nothing is
 * loaded from another origin (AGSC-06-05).
 *
 * @param {object} page `{url, title, description, lang, body, jsonld, licenseProse, nav}`.
 * @returns {string}
 */
function shell(page) {
  const head = [
    '<!doctype html>',
    `<html lang="${escapeHtml(page.lang == null ? 'en' : page.lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<link rel="describedby" href="${WELLKNOWN_PATH}" type="${MEDIA_TYPE}">`,
  ];
  if (page.canonical != null) head.push(`<link rel="canonical" href="${escapeHtml(page.canonical)}">`);
  if (page.alternates !== undefined) {
    for (const alt of page.alternates) {
      head.push(`<link rel="alternate" href="${escapeHtml(alt.href)}" type="${escapeHtml(alt.type)}">`);
    }
  }
  if (page.jsonld !== undefined) {
    // Serialised by the caller with JCS so the bytes are reproducible (AGSC-04-04).
    head.push(`<script type="application/ld+json">${page.jsonld}</script>`);
  }
  head.push('</head>', '<body>');
  const nav = (page.nav || []).map(([href, label]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join(' ');
  return [
    ...head,
    nav === '' ? '' : `<nav aria-label="Main">${nav}</nav>`,
    '<main>',
    `<h1>${escapeHtml(page.title)}</h1>`,
    page.body,
    '</main>',
    `<footer>${termsLine(page.licenseProse, { legal: page.legal })}</footer>`,
    '</body>',
    '</html>',
    '',
  ].filter((l) => l !== '').join('\n');
}

/**
 * AGSC-02-13 as amended at rc.5 (ENG1-02): the compiled diagram, INLINE in the item's
 * page and at no route of its own.
 *
 * The `.diagram` source is passed in rather than read here — this module is a
 * template and owns no port; `site.js` reads `content/diagrams/<slug>.diagram`
 * through the FileSystem port (AGSC-01-07) and hands the bytes over.
 *
 * Four obligations, in order:
 *   - the accessible name is `diagram.alt` (AGSC-06-20), passed through to the
 *     compiler rather than re-derived, so a `label` statement in the source cannot
 *     silently replace the authored alt text;
 *   - `diagram.caption`, where present, is the visible `<figcaption>` and never a
 *     substitute for `alt`;
 *   - the compiled bytes go through AGSC-02-98's allow-list before they are inlined,
 *     and a violation is `AGSC-E412` with NO element emitted — the page never carries
 *     markup the allow-list refused;
 *   - no `.svg` route is produced, so AGSC-06-01's route set is unchanged, and the
 *     bytes count towards the 100 KB page budget because `budgets()` measures the
 *     emitted HTML.
 *
 * The allow-list is INJECTABLE for the same reason the Markdown renderer is: it is
 * one implementation of one rule, and a port in another language substitutes its
 * own. It is also the only way to exercise this guard, because ENG-1 proved as a
 * property over 300 generated sources that the compiler's output is always inside
 * the list — the guard is defence in depth against a future compiler change, and a
 * defence nothing can reach is a defence nobody can trust.
 *
 * @param {object} item a flat item carrying `diagram: {file, alt, caption?}`.
 * @param {string} source the `.diagram` bytes.
 * @param {{svgViolations?:Function}} [options]
 * @returns {{html:string, findings:Array<object>}}
 */
function diagramFigure(item, source, options = {}) {
  const diagram = item && item.diagram;
  if (diagram == null || typeof diagram !== 'object' || typeof source !== 'string') {
    return { html: '', findings: [] };
  }
  const slug = String(item.slug);
  const file = `content/diagrams/${slug}.diagram`;
  const compiled = diagrams.compile(source, { accessibleName: diagram.alt, file, slug });
  if (compiled.svg === null) return { html: '', findings: compiled.findings };

  const check = options.svgViolations === undefined ? lint.svgViolations : options.svgViolations;
  const reasons = check(compiled.svg);
  if (reasons.length > 0) {
    return {
      html: '',
      findings: [{
        code: 'AGSC-E412',
        col: 1,
        file,
        line: 1,
        message: `the compiled diagram is outside the AGSC-02-98 allow-list: ${reasons.join(', ')} (AGSC-02-13)`,
        severity: 'error',
        slug,
      }],
    };
  }
  const caption = diagram.caption == null || diagram.caption === ''
    ? '' : `<figcaption>${escapeHtml(diagram.caption)}</figcaption>`;
  return { findings: compiled.findings, html: `<figure>${compiled.svg.replace(/\n$/u, '')}${caption}</figure>` };
}

/**
 * An item page. AGSC-06-02: it links its own `/pages/<slug>.md` and `.jsonld`.
 * AGSC-11-22: a retired item keeps its page, which carries a visible notice.
 *
 * @param {object} item
 * @param {object} options `{render, licenseProse, jsonld, canonical, diagramSource}`.
 * @returns {string}
 */
function itemPage(item, options = {}) {
  const rendered = options.render(item.body == null ? '' : item.body);
  const parts = [];
  if (item.status === 'retired') {
    parts.push('<p class="retired" role="note">This item is retired. Its address stays valid and its identifier never changes (AGSC-11-22).</p>');
  }
  if (item.status === 'deprecated') {
    parts.push('<p class="deprecated" role="note">This item is deprecated.</p>');
  }
  parts.push(rendered.html);
  // AGSC-02-13: the compiled diagram, inline, before the attachments.
  if (typeof options.diagramSource === 'string') {
    const figure = diagramFigure(item, options.diagramSource, options);
    if (figure.html !== '') parts.push(figure.html);
  }
  for (const attachment of (Array.isArray(item.attachments) ? item.attachments : [])) {
    parts.push(`<figure><img src="/attachments/${escapeHtml(item.slug)}/${escapeHtml(attachment.file)}" alt="${escapeHtml(attachment.alt)}"><figcaption>${escapeHtml(attachment.alt)}</figcaption></figure>`);
  }
  parts.push(`<p class="views">Machine views: <a href="/pages/${escapeHtml(item.slug)}.md">Markdown</a> · <a href="/pages/${escapeHtml(item.slug)}.jsonld">JSON-LD</a></p>`);
  return shell({
    ...options,
    url: options.url,
    title: item.title == null ? item.slug : item.title,
    description: item.description == null ? '' : item.description,
    lang: item.lang,
    body: parts.join('\n'),
  });
}

/** An index page — a type folder, a cluster list or a tag list (AGSC-06-01). */
function indexPage({ title, description, entries }, options = {}) {
  const list = entries.length === 0
    ? '<p>Nothing here yet.</p>'
    : `<ul>${entries.map((e) => `<li><a href="${escapeHtml(e.href)}">${escapeHtml(e.title)}</a>${e.description ? `: ${escapeHtml(e.description)}` : ''}</li>`).join('')}</ul>`;
  return shell({ ...options, title, description, body: list });
}

/** `/now/` — rendered from the NOW state of `now.js`, never hand-edited (AGSC-06-22). */
function nowPage(markdown, options = {}) {
  const rendered = options.render(markdown);
  return shell({ ...options, title: 'Now', description: 'The current state of this node, derived at build.', body: rendered.html });
}

/** `/404.html` — generated, never hand-maintained (AGSC-06-04). */
function notFoundPage(options = {}) {
  return shell({
    ...options,
    title: 'Page not found',
    description: 'There is no page at this address on this node.',
    body: '<p>There is no page at this address. Try the <a href="/">home page</a> or the <a href="/search/">search</a>.</p>',
  });
}

/**
 * AGSC-06-24: the `/about/` Quickstart, generated FROM THE VERB SET so it cannot
 * drift from it, with P0 first — the three commands of PRD-053 — and the AGSC-08-19
 * honest-limit statement verbatim.
 */
const HONEST_LIMIT = 'These lints prove neither safety nor the absence of novel injection; '
  + 'hashes and attestations prove only that an artefact is what was published. '
  + 'An implementation MUST NOT claim more.';

/**
 * `/compose/` — the combiner, in the browser (AGSC-06-01, AGSC-07-01). The page
 * carries the FORM and nothing else: the algebra, the controller and the WebMCP
 * registration are three same-origin scripts, because AGSC-06-17's own
 * `script-src 'self'` policy admits no inline script.
 *
 * @param {object} page `{assets}` — the script file names, in load order.
 * @param {object} options the shared page options.
 */
function composePage({ assets }, options = {}) {
  const scripts = assets.map((name) => `<script src="${escapeHtml(name)}"></script>`).join('\n');
  return shell({
    ...options,
    title: 'Compose',
    description: 'Select items and compute a Harness in this page — no server, no key, no upload.',
    body: [
      '<p>Tick the items you want. The closure algebra of AGSC-07 runs <em>in this page</em>:',
      'no request leaves this origin, no key is needed and nothing is uploaded. The seven',
      'Harness files are offered one download per file.</p>',
      '<h2>Items</h2>',
      '<ul id="items"><li>Loading the published graph…</li></ul>',
      '<h2>Verdict</h2>',
      '<p id="validity">Nothing selected.</p>',
      '<pre id="verdict"></pre>',
      '<h3>Why an item was added</h3>',
      '<ul id="explanations"></ul>',
      '<h3>Conflicts</h3>',
      '<ul id="conflicts"></ul>',
      '<h2>Harness</h2>',
      '<p><button id="download" type="button" disabled>Build the Harness</button></p>',
      '<ul id="files"></ul>',
      scripts,
    ].join('\n'),
  });
}

/**
 * `/boards/<cluster>/` — the HUMAN board beside the JSON export of AGSC-10-13.
 * Columns are the task states of AGSC-02-99, the work-in-progress limit of
 * AGSC-10-17 is shown, and each card names its `claimed_by` where the git history
 * supplied one. It derives nothing the JSON export does not already carry.
 *
 * @param {object} page `{board, columns, wip}`.
 */
function boardPage({ board, columns, wip }, options = {}) {
  const parts = [`<p>${escapeHtml(board.done ? 'This board is done: every task is in a terminal state (AGSC-10-13).' : 'This board is open.')}</p>`];
  parts.push(`<p>Work-in-progress limit: ${wip == null ? 'none declared' : escapeHtml(String(wip))} `
    + `task${wip === 1 ? '' : 's'} in <code>TASK_STATE_WORKING</code> per agent lane (AGSC-10-17). `
    + `Machine view: <a href="/boards/${escapeHtml(board.slug)}.json">JSON</a>.</p>`);
  for (const column of columns) {
    parts.push(`<section><h2>${escapeHtml(column.state)} <span>(${column.tasks.length})</span></h2>`);
    parts.push(column.tasks.length === 0
      ? '<p>No task in this state.</p>'
      : `<ul>${column.tasks.map((task) => `<li><a href="${escapeHtml(task.iri)}">${escapeHtml(task.title)}</a>`
        + `${task.claimed_by === undefined ? '' : ` — claimed by <span>${escapeHtml(task.claimed_by)}</span>`}`
        + `${task.blocked_by.length === 0 ? '' : ` — blocked by ${task.blocked_by.map((s) => `<code>${escapeHtml(s)}</code>`).join(', ')}`}`
        + '</li>').join('')}</ul>`);
    parts.push('</section>');
  }
  return shell({
    ...options,
    title: `Board: ${board.board}`,
    description: `Every task of the ${board.board} cluster, by state.`,
    body: parts.join('\n'),
  });
}

/**
 * `/legal/` — the Content Use Terms TEXT (AGSC-06-18: "The Content Use Terms text
 * is published at `/legal/` … and a distribution without it is incomplete"). The
 * bytes come from the Bundle's `LICENSE-CONTENT` file and from nowhere else: this
 * page renders them and adds no term of its own, because the wording is an owner
 * decision outside the specification.
 */
function legalPage({ terms, licenseProse, rendered }, options = {}) {
  return shell({
    ...options,
    title: 'Content Use Terms',
    description: 'The terms every export of this node carries, and the licence of its prose.',
    body: [
      `<p>The Content Use Terms identifier is <code>${escapeHtml(terms)}</code>. `
        + `The licence of the prose itself is <code>${escapeHtml(licenseProse)}</code>; `
        + 'the two are different facts and may differ (AGSC-06-18).</p>',
      '<h2>The terms</h2>',
      rendered,
      '<p>The text above is this distribution\'s <code>LICENSE-CONTENT</code> file, '
        + 'rendered unchanged (AGSC-01-26, AGSC-06-18).</p>',
    ].join('\n'),
  });
}

function aboutPage({ verbs, personas }, options = {}) {
  const quickstart = personas.map((p) => `<section><h2>${escapeHtml(p.id)} — ${escapeHtml(p.title)}</h2><ol>${p.steps.slice(0, 10).map((s) => `<li><code>${escapeHtml(s)}</code></li>`).join('')}</ol></section>`).join('\n');
  const verbList = `<p>Verbs: ${verbs.map((v) => `<code>${escapeHtml(v)}</code>`).join(', ')}.</p>`;
  return shell({
    ...options,
    title: 'About',
    description: 'What this node is, the quickstart for every persona, and the honest limit of what it proves.',
    body: `<h2>Quickstart</h2>\n${quickstart}\n${verbList}\n<h2>Honest limit</h2>\n<p>${escapeHtml(HONEST_LIMIT)}</p>`,
  });
}

module.exports = {
  shell, itemPage, indexPage, nowPage, notFoundPage, aboutPage, diagramFigure,
  boardPage, composePage, legalPage,
  escapeHtml, termsLine, HONEST_LIMIT,
};
