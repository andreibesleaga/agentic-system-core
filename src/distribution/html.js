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
function termsLine(licenseProse) {
  const license = licenseProse == null ? TERMS : licenseProse;
  return `<p class="terms">Prose licence: <span>${escapeHtml(license)}</span>. `
    + `Content Use Terms: <a href="/legal/">${escapeHtml(TERMS)}</a>.</p>`;
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
    `<footer>${termsLine(page.licenseProse)}</footer>`,
    '</body>',
    '</html>',
    '',
  ].filter((l) => l !== '').join('\n');
}

/**
 * An item page. AGSC-06-02: it links its own `/pages/<slug>.md` and `.jsonld`.
 * AGSC-11-22: a retired item keeps its page, which carries a visible notice.
 *
 * @param {object} item
 * @param {object} options `{render, licenseProse, jsonld, canonical}`.
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
  shell, itemPage, indexPage, nowPage, notFoundPage, aboutPage,
  escapeHtml, termsLine, HONEST_LIMIT,
};
