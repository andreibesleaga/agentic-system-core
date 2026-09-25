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
const { singleLine } = require('../knowledge/unicode.js');
const { ASSISTANCE } = require('../knowledge/provenance-header.js');
const diagrams = require('../knowledge/diagrams.js');
const lint = require('../governance/lint.js');
const { WELLKNOWN_PATH, MEDIA_TYPE } = require('./discovery.js');
const theme = require('./theme.js');

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
 * The footer's one-line AI-assistance statement (AGSC-06-15's fact, in the words a
 * reader of a page needs) and the owner's one-sentence disclaimer.
 *
 * neither is stamped on every node any more. This engine is a
 * general tool, and a constant sentence can be false for somebody else's node. The
 * AI sentence is emitted only when a published item records `prov.origin`
 * `ai-assisted` or `ai-generated` (`termsLine`'s `aiAssisted`, derived by the build);
 * the disclaimer is the publisher's own `DISCLAIMER.md` (`termsLine`'s `disclaimer`).
 * `NO_CLAIM_SENTENCE` stays exported as the text this project's own nodes put in
 * their `DISCLAIMER.md`; no writer emits it on its own.
 */
const ASSISTANCE_SENTENCE = 'Written with AI assistance, reviewed and published by a person.';
/** The footer's short form of the same fact (owner, 2026-09-23). */
const FOOTER_AI_NOTE = 'AI-assisted, human-reviewed.';
const NO_CLAIM_SENTENCE = 'Independent work, published as it is, with no warranty and no'
  + ' liability; not advice; no organisation named here is connected with it; other names'
  + ' are their owners\' marks.';

/**
 * AGSC-06-18: the licence line, on every prose-carrying page. The Content Use Terms
 * identifier is named where the publisher adopts the terms (`bundle.license_prose`
 * is that identifier or absent); any other prose licence is named alone.
 */
/**
 * Did the publisher adopt the Content Use Terms as the licence of the prose? An
 * absent `bundle.license_prose` defaults to them (AGSC-01-18).
 */
function adoptsTerms(licenseProse) {
  return licenseProse == null || String(licenseProse) === TERMS;
}

function termsLine(licenseProse, options = {}) {
  const license = licenseProse == null ? TERMS : licenseProse;
  // The LINK to `/legal/` is emitted only when the route exists, so no build ships a
  // dangling internal link; the identifier is always named (AGSC-06-18).
  const legal = options.legal === undefined ? true : Boolean(options.legal);
  const adopted = adoptsTerms(licenseProse);
  // The human name is shown; the identifier stays machine-readable in the same element
  // (`data-spdx`), so every page still carries it (AGSC-06-18). It closes the footer,
  // beside the legal link (owner, 2026-09-24), instead of opening the sentence.
  const termsName = 'Content Use Terms';
  const terms = legal
    ? `<a href="/legal/#terms" rel="license" data-spdx="${escapeHtml(TERMS)}">${escapeHtml(termsName)}</a>`
    : `<span data-spdx="${escapeHtml(TERMS)}">${escapeHtml(termsName)}</span>`;
  const author = options.author == null ? '' : String(options.author).trim();
  const year = options.year == null ? '' : String(options.year).trim();
  // NEITHER THE NAME NOR THE YEAR IS HARD-CODED: `site.author` and the build-instant
  // year (AGSC-04-09); no author → no copyright sentence. "All rights reserved" only
  // under the Content Use Terms; another licence is named instead.
  const copyright = author !== '' && year !== '' ? `&#169; ${escapeHtml(year)} ${escapeHtml(author)}. ` : '';
  const rights = adopted
    ? 'All rights reserved, citing and linking allowed.'
    // AGSC-06-18 (rc.6, 2026-09-24): the Content Use Terms accompany the prose only
    // where the publisher adopts them; another licence is named alone.
    : `Prose: <span>${escapeHtml(license)}</span>.`;
  const text = [
    `${copyright}${rights}`,
    options.aiAssisted === true ? escapeHtml(FOOTER_AI_NOTE) : '',
    options.disclaimer == null ? '' : escapeHtml(singleLine(String(options.disclaimer)).trim()),
  ].filter((part) => part !== '').join(' ');
  // One paragraph, no break (owner, 2026-09-23): the links continue the text.
  // The declared peers close the footer: a person can follow them, as an agent follows
  // the `rel#peer` links of the discovery document (AGSC-10-12).
  const peers = (Array.isArray(options.peers) ? options.peers : [])
    .map((p) => `<a href="${escapeHtml(p.href)}">${escapeHtml(p.label)}</a>`);
  const links = [legal ? '<a href="/legal/">Legal &amp; privacy</a>' : '', adopted ? terms : '', ...peers]
    .filter((part) => part !== '').join(' · ');
  return `<p class="terms">${text}${links === '' ? '' : ` ${links}`}</p>`;
}

/**
 * The page shell. `lang`, the landmark roles and the single `<h1>` are the WCAG 2.2
 * AA obligations of AGSC-06-20; the `describedby` link is AGSC-06-25; nothing is
 * loaded from another origin (AGSC-06-05).
 *
 * @param {object} page `{url, title, description, lang, body, jsonld, licenseProse, nav,
 *   author, year}` — `author` and `year` are the footer's copyright line (rc.6).
 * @returns {string}
 */
/**
 * AGSC-06-20: one `<h1>` per page. The shell writes the title as the `<h1>`; a body
 * whose rendered Markdown opens with its own `# Title` equal to that title would add
 * a second, so that one heading is dropped. Any other body heading is kept.
 */
function withoutRepeatedTitle(body, title) {
  const text = String(body == null ? '' : body);
  const match = /^\s*<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>\s*/u.exec(text);
  if (match === null || match[1].trim() !== escapeHtml(title).trim()) return text;
  return text.slice(match[0].length);
}

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
  // AGSC-09-16: the page tools of an item page. `defer` keeps the parse
  // uninterrupted; the scripts are same-origin files of this node (AGSC-06-17's
  // `script-src 'self'`), never inline and never third-party (AGSC-06-05).
  for (const src of (page.pageToolScripts || [])) {
    head.push(`<script src="${escapeHtml(src)}" defer></script>`);
  }
  // The default theme (theme.js) — one same-origin stylesheet and one small
  // same-origin script that applies the visitor's stored theme before first paint.
  head.push(`<link rel="stylesheet" href="${theme.STYLESHEET_ROUTE}">`);
  head.push(`<script src="${theme.SCRIPT_ROUTE}"></script>`);
  head.push('</head>', '<body>');
  // The header of AgenticSystemCore.com: skip link, brand linking home, the navigation
  // list, and the theme switcher (shown by the script; without it the system theme rules).
  const entries = (page.nav || []).filter(([href]) => !(page.siteTitle != null && href === '/'));
  const brand = page.siteTitle == null ? '' : `<a class="brand" href="/">${escapeHtml(page.siteTitle)}</a>`;
  const list = entries.length === 0 ? ''
    : `<ul>\n${entries.map(([href, label]) => `<li><a href="${escapeHtml(href)}"${page.route === href ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a></li>`).join('\n')}\n</ul>`;
  const header = brand === '' && list === '' ? ''
    : ['<header class="site">', '<nav aria-label="Site">', brand, list, theme.SWITCHER, '</nav>', '</header>']
      .filter((l) => l !== '').join('\n');
  return [
    ...head,
    '<a class="skip" href="#main">Skip to content</a>',
    header,
    '<main id="main">',
    `<h1>${escapeHtml(page.title)}</h1>`,
    // The Summary block of AgenticSystemCore.com: the page's own description, if any.
    page.description == null || String(page.description).trim() === '' ? ''
      : `<p class="summary"><strong>Summary</strong>${escapeHtml(page.description)}</p>`,
    withoutRepeatedTitle(page.body, page.title),
    '</main>',
    `<footer class="site">${termsLine(page.licenseProse, {
      aiAssisted: page.aiAssisted, author: page.author, disclaimer: page.disclaimer, legal: page.legal,
      peers: page.peers, year: page.year,
    })}</footer>`,
    '</body>',
    '</html>',
    // AGSC-04-07: exactly one trailing LF, added after the filter below (which
    // drops empty lines, so an empty last line here would be lost).
  ].filter((l) => l !== '').join('\n').concat('\n');
}

/**
 * AGSC-02-13: the compiled diagram, INLINE in the item's
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
 * own. It is also the only way to exercise this guard, because proved as a
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
/** How each `prov.origin` reads to a person (the metadata list's Provenance row). */
const ORIGIN_TEXT = Object.freeze({
  human: 'Written by a person',
  'ai-assisted': 'Written with AI assistance and reviewed by the operator',
  'ai-generated': 'Generated by a model and published by the operator',
  imported: 'Imported from another source',
});

/**
 * The metadata list of an item page, as AgenticSystemCore.com shows it: type (and
 * kind), the clusters it names (linked when published), its IRI, its provenance.
 * A row whose input is absent is omitted.
 */
function itemMeta(item, options) {
  const rows = [`<dt>Type</dt><dd>${escapeHtml(item.type)}${item.kind ? ` · kind <code>${escapeHtml(item.kind)}</code>` : ''}</dd>`];
  const clusters = Array.isArray(options.clusters) ? options.clusters : [];
  if (clusters.length > 0) {
    rows.push(`<dt>Cluster</dt><dd>${clusters.map((c) => (c.href
      ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.title)}</a>` : escapeHtml(c.title))).join(', ')}</dd>`);
  }
  // AGSC-02-99: a task shows its state (UNSPECIFIED when none is authored).
  if (item.type === 'concept' && item.kind === 'task') {
    rows.push(`<dt>Task state</dt><dd><code>${escapeHtml(item.task_state == null ? 'TASK_STATE_UNSPECIFIED' : item.task_state)}</code></dd>`);
  }
  // AGSC-08-09: a gate shows its level and the checks it compiles to.
  if (item.type === 'gate' && item.level != null) rows.push(`<dt>Level</dt><dd><code>${escapeHtml(item.level)}</code></dd>`);
  if (item.type === 'gate' && Array.isArray(item.checks) && item.checks.length > 0) {
    rows.push(`<dt>Checks</dt><dd>${item.checks.map((c) => `<code>${escapeHtml(c)}</code>`).join(', ')}</dd>`);
  }
  if (options.canonical != null) rows.push(`<dt>IRI</dt><dd><code>${escapeHtml(options.canonical)}</code></dd>`);
  const prov = item.prov || {};
  if (prov.origin != null && ORIGIN_TEXT[prov.origin]) {
    rows.push(`<dt>Provenance</dt><dd>${escapeHtml(ORIGIN_TEXT[prov.origin])} (origin <code>${escapeHtml(prov.origin)}</code>`
      + `${prov.operator ? `, operator <code>${escapeHtml(prov.operator)}</code>` : ''})</dd>`);
  }
  return `<dl class="meta">\n${rows.join('\n')}\n</dl>`;
}

function itemPage(item, options = {}) {
  const rendered = options.render(item.body == null ? '' : item.body);
  const parts = [itemMeta(item, options)];
  if (item.status === 'retired') {
    parts.push('<p class="retired" role="note">This item is retired. Its address stays valid and its identifier never changes (AGSC-11-22).</p>');
  }
  if (item.status === 'deprecated') {
    parts.push('<p class="deprecated" role="note">This item is deprecated.</p>');
  }
  parts.push(withoutRepeatedTitle(rendered.html, item.title == null ? item.slug : item.title));
  // AGSC-03-01: the typed Links the item authors, each target linked — the caller
  // passes published targets only, so a held-back item is never named here.
  const typed = (Array.isArray(options.links) ? options.links : []).filter((l) => l.targets.length > 0);
  if (typed.length > 0) {
    parts.push('<h2 id="links">Links</h2>');
    parts.push(`<ul class="links">${typed.map((l) => `<li><code>${escapeHtml(l.key)}</code>: ${l.targets
      .map((t) => (t.href ? `<a href="${escapeHtml(t.href)}">${escapeHtml(t.title)}</a>` : escapeHtml(t.title)))
      .join(', ')}</li>`).join('')}</ul>`);
  }
  // A cluster page lists its published members (the caller passes only published
  // items, so a draft never appears), each linked, with its description.
  if (Array.isArray(options.members)) {
    parts.push('<h2 id="members">Members</h2>');
    parts.push(options.members.length === 0
      ? '<p>No published item names this cluster yet.</p>'
      : `<ul class="members">${options.members.map((e) => `<li><a href="${escapeHtml(e.href)}">${escapeHtml(e.title)}</a>${e.description ? `: ${escapeHtml(e.description)}` : ''}</li>`).join('')}</ul>`);
    // The list stops at the caller's bound (an item page is never paginated and
    // stays under the 100 KB budget of AGSC-06-21); the page says so, and where the
    // complete membership is: every member carries this cluster in `/search.json`
    // and in the graph.
    if (Number.isInteger(options.membersTotal) && options.membersTotal > options.members.length) {
      parts.push(`<p class="members-more">The first ${options.members.length} of ${options.membersTotal} members are listed, in the published order; every member names this cluster in <a href="/search.json">the search index</a> and in <a href="/graph.jsonld">the graph</a>.</p>`);
    }
  }
  // AGSC-02-13: the compiled diagram, inline, before the attachments.
  if (typeof options.diagramSource === 'string') {
    const figure = diagramFigure(item, options.diagramSource, options);
    if (figure.html !== '') parts.push(figure.html);
  }
  for (const attachment of (Array.isArray(item.attachments) ? item.attachments : [])) {
    parts.push(`<figure><img src="/attachments/${escapeHtml(item.slug)}/${escapeHtml(attachment.file)}" alt="${escapeHtml(attachment.alt)}"><figcaption>${escapeHtml(attachment.alt)}</figcaption></figure>`);
  }
  // AGSC-02-10: the item's authored sources, shown to the reader as its references —
  // title linked to the source, then the author and year the item records. Only an
  // http(s) address becomes a link; anything else is shown as text.
  const sources = (Array.isArray(item.sources) ? item.sources : [])
    .filter((src) => src && typeof src.resource === 'string' && src.resource !== '');
  if (sources.length > 0) {
    parts.push('<h2 id="references">References</h2>');
    parts.push(`<ol class="sources">${sources.map((src, k) => {
      const label = escapeHtml(src.title == null || String(src.title).trim() === '' ? src.resource : src.title);
      const link = /^https?:\/\//u.test(src.resource) ? `<a href="${escapeHtml(src.resource)}">${label}</a>` : label;
      const by = [src.author, src.year].filter((v) => v != null && String(v).trim() !== '').map((v) => escapeHtml(v)).join(', ');
      return `<li id="source-${k + 1}">${link}${by === '' ? '' : ` — ${by}`}</li>`;
    }).join('')}</ol>`);
  }
  parts.push(`<p class="views">Machine views: <a href="/pages/${escapeHtml(item.slug)}.md">Markdown</a> · <a href="/pages/${escapeHtml(item.slug)}.jsonld">JSON-LD</a></p>`);
  // AGSC-11-14 / AGSC-08-04: a PLAIN anchor to the forge's edit view of this item's
  // source file. It is not a form (AGSC-06-17 sets `form-action 'none'`), it carries
  // no script, and it saves nothing: what it opens is the forge's own editor, and
  // what that produces is a Proposal a human merges (AGSC-08-03, AGSC-08-08). The
  // accessible name says which item, because "Propose an edit" alone is ambiguous in
  // a list of links.
  if (typeof options.editUrl === 'string' && options.editUrl !== '') {
    const name = item.title == null ? item.slug : item.title;
    parts.push(`<p class="contribute"><a href="${escapeHtml(options.editUrl)}" rel="noopener"`
      + ` aria-label="Propose an edit to ${escapeHtml(name)}">Propose an edit</a>`
      + ' — your change is proposed, and a person reviews and merges it.</p>');
  }
  return shell({
    ...options,
    url: options.url,
    title: item.title == null ? item.slug : item.title,
    description: item.description == null ? '' : item.description,
    lang: item.lang,
    body: parts.join('\n'),
  });
}

/** The entry list every index page carries: title, count where given, description. */
function entryList(entries) {
  return entries.length === 0
    ? '<p>Nothing here yet.</p>'
    : `<ul>${entries.map((e) => `<li><a href="${escapeHtml(e.href)}">${escapeHtml(e.title)}</a>${Number.isInteger(e.count) ? ` (${e.count} ${e.count === 1 ? 'item' : 'items'})` : ''}${e.description ? `: ${escapeHtml(e.description)}` : ''}</li>`).join('')}</ul>`;
}

/** An index page — a type folder, a cluster list or a tag list (AGSC-06-01). */
function indexPage({ title, description, entries }, options = {}) {
  return shell({ ...options, title, description, body: entryList(entries) });
}

/**
 * `/search/` — "the page whose data is `/search.json`" (AGSC-06-01): a search box
 * over the node's own index, and beneath it the list of every published item, which
 * is the whole page for a reader without script. The form starts `hidden` and the
 * page's one same-origin script (`search-page.js`) shows it, because a control that
 * cannot work is not offered: AGSC-06-17's `form-action 'none'` lets no form submit
 * leave the page, so without script the list is the search. Accessible by
 * construction: a `<label>` on the box, the result count in a live region, a
 * landmark on the form, and everything reachable by keyboard. No inline script and
 * no inline style (AGSC-06-17); the stylesheet already styles `form.search`.
 *
 * @param {object} page `{title, description, entries, script}` — `script` the
 *   absolute route of the page's script, so a paginated `/search/page-<n>/` (AGSC-06-21)
 *   loads the same file.
 */
function searchPage({ title, description, entries, script }, options = {}) {
  const body = [
    '<div class="search" role="search"><form class="search" id="search-form" hidden>',
    '<label for="q">Search this node</label>',
    '<input id="q" name="q" type="search" autocomplete="off" spellcheck="false">',
    '<button type="submit">Search</button></form></div>',
    '<p id="search-status" role="status" aria-live="polite"></p>',
    '<ol id="results" aria-label="Results"></ol>',
    '<section id="site-index" aria-labelledby="index-heading">',
    '<h2 id="index-heading">Every published item</h2>',
    entryList(entries),
    '</section>',
    `<script src="${escapeHtml(script)}"></script>`,
  ].join('\n');
  return shell({ ...options, title, description, body });
}

/**
 * `/` — the node's front page: the Bundle's own introduction (the body of
 * `content/index.md`), then a short "Browse" block that links the index pages with
 * their counts. It never lists every item: the index pages do that.
 *
 * @param {{title:string, description:string, introHtml:string, sections:Array<{href:string,title:string,count:number}>}} page
 */
function homePage({ title, description, introHtml, sections }, options = {}) {
  const browse = sections.length === 0 ? '' : `<h2 id="browse">Browse</h2>\n<ul class="browse">${sections
    .map((s) => `<li><a href="${escapeHtml(s.href)}">${escapeHtml(s.title)}</a>${Number.isInteger(s.count) ? ` (${s.count})` : ''}</li>`)
    .join('')}</ul>`;
  const body = [introHtml || '', browse].filter((part) => part !== '').join('\n');
  return shell({ ...options, title, description, body: body === '' ? '<p>Nothing here yet.</p>' : body });
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
      '<p>Tick the items you want. The composition rules of the specification (AGSC-07) run <em>in this page</em>:',
      'no request leaves this origin, no key is needed and nothing is uploaded. The seven',
      'Harness files are offered one download per file, or all together as one .zip.</p>',
      '<h2>Items</h2>',
      '<ul id="items"><li>Loading the published graph…</li></ul>',
      '<h2>Verdict</h2>',
      '<p id="validity">Nothing selected.</p>',
      // Focusable: the stylesheet lets a long verdict scroll sideways, and a scrollable
      // region must be reachable by keyboard (WCAG 2.1.1, AGSC-06-20).
      '<pre id="verdict" tabindex="0"></pre>',
      // Both lists start hidden: without a selection (or without script) a reader
      // would otherwise meet two empty headings. The controller reveals each one
      // when it has something to say.
      '<h3 id="explanations-heading" hidden>Why an item was added</h3>',
      '<ul id="explanations" hidden></ul>',
      '<h3 id="conflicts-heading" hidden>Conflicts</h3>',
      '<ul id="conflicts" hidden></ul>',
      '<h2>Harness</h2>',
      '<p><button id="download" type="button" disabled>Build the Harness</button></p>',
      '<ul id="files"></ul>',
      '<p id="archive" aria-live="polite"></p>',
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
  parts.push(`<p>Work-in-progress limit: ${wip == null ? 'none — this node declares no agent lane (AGSC-10-17)'
    : `${escapeHtml(String(wip))} task${wip === 1 ? '' : 's'} in <code>TASK_STATE_WORKING</code> per agent lane (AGSC-10-17)`}. `
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
/**
 * `/legal/` (AGSC-06-18, PRD-019). Four things belong on this page: the content-use
 * terms, a privacy notice, the identification of the operator and a retention
 * statement. The terms are the distribution's `LICENSE-CONTENT`, the privacy notice
 * (which carries the retention statement) is the Bundle's authored `PRIVACY.md` and
 * the operator comes from the configuration — so every word on this page is the
 * publisher's own. A section whose input is absent is OMITTED, never invented, and
 * the build warns (`site.js`).
 */
function legalPage({ terms, licenseProse, rendered, privacy, operator, disclaimer }, options = {}) {
  // The opening sentence is for the reader, not for the rule's author: one plain
  // sentence when the prose licence IS the Content Use Terms, two when they differ.
  const opening = terms === licenseProse
    ? `<p>The prose of this node is published under the Content Use Terms 1.0 (<code>${escapeHtml(terms)}</code>).</p>`
    : `<p>The prose of this node is licensed <code>${escapeHtml(licenseProse)}</code>, and every export of it `
      + `carries the Content Use Terms <code>${escapeHtml(terms)}</code>. `
      + 'The two are different facts and may differ (AGSC-06-18).</p>';
  const sections = [
    opening,
    '<h2 id="terms">The terms</h2>',
    rendered,
    '<p>The text above is this distribution\'s <code>LICENSE-CONTENT</code> file, '
      + 'rendered unchanged (AGSC-01-26, AGSC-06-18).</p>',
  ];
  // the publisher's own disclaimer, from `DISCLAIMER.md`, as its own
  // section between the terms and the privacy notice — never a constant.
  if (disclaimer != null && String(disclaimer.html) !== '') {
    sections.push(`<h2 id="disclaimer">${escapeHtml(disclaimer.heading)}</h2>`, String(disclaimer.html));
  }
  if (privacy != null && String(privacy) !== '') {
    sections.push('<h2 id="privacy">Privacy</h2>', String(privacy));
  }
  if (operator != null && String(operator) !== '') {
    sections.push(`<h2 id="operator">Operator</h2>\n<p>This node is published by ${escapeHtml(String(operator))}.</p>`);
  }
  // AGSC-06-18: `/legal/` carries "the AI-assistance statement of
  // AGSC-06-15, IN THE SAME WORDS the provenance header of every agent-facing export
  // carries". So the section quotes that constant rather than restating it — the two
  // cannot drift — and adds only what a person reading a page needs in order to
  // understand what the constant means.
  // the practice paragraph describes how AI-ASSISTED text is made
  // here, so it is stated only where a published item records AI assistance.
  sections.push('<h2 id="ai-assistance">How this text was written</h2>');
  if (options.aiAssisted === true) {
    sections.push(`<p>${escapeHtml(ASSISTANCE_SENTENCE)} A person decides what is written and why, an`
      + ' assistant drafts and checks it under their direction, and a person reads, edits and'
      + ' approves every sentence before it is published and answers for it.</p>');
  }
  sections.push('<p>Every item on this node records how its text was made — written by a person, written'
    + ' with AI assistance, generated by a model, or imported from elsewhere — and names the'
    + ' person accountable for it. You can read that record on the item\'s own page and in the'
    + ' machine-readable views. Each accepted contribution carries the same record in its'
    + ' sign-off.</p>',
  '<p>This is the statement every agent-facing export of this node carries, in its own'
    + ` words: <code>${escapeHtml(ASSISTANCE)}</code></p>`);
  return shell({
    ...options,
    title: 'Legal and privacy',
    description: 'The terms every export of this node carries, the licence of its prose, the privacy notice and who operates this node.',
    body: sections.join('\n'),
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

/**
 * AGSC-04-25: `/changelog/`'s versions list — one row per element of the git-log
 * file that carries a usable `tag`, oldest first, with the tag, that element's
 * `committed_at` date and its `sha`. The list is what the rule pins; the rest of
 * the page stays implementation-defined (AGSC-06-01).
 *
 * @param {Array<{tag:string, date:string, sha:string}>} rows from
 *   `knowledge/content-version.js#versionRows`.
 */
function changelogPage(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const body = list.length === 0
    ? '<p>This node has published no tagged version yet.</p>'
    : `<table><thead><tr><th>version</th><th>date</th><th>commit</th></tr></thead><tbody>${
      list.map((row) => `<tr><td><code>${escapeHtml(row.tag)}</code></td>`
        + `<td>${escapeHtml(row.date)}</td>`
        + `<td><code>${escapeHtml(row.sha)}</code></td></tr>`).join('')
    }</tbody></table>`;
  return shell({
    ...options,
    title: 'Changelog',
    description: 'Every content version this node has published, oldest first.',
    body: `<h2>Versions</h2>\n${body}`,
  });
}

module.exports = {
  homePage,
  shell, itemPage, indexPage, nowPage, notFoundPage, aboutPage, changelogPage, diagramFigure,
  boardPage, composePage, legalPage, searchPage,
  adoptsTerms, escapeHtml, termsLine, NO_CLAIM_SENTENCE, HONEST_LIMIT,
};
