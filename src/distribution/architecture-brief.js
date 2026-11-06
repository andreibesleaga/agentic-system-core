'use strict';
/**
 * CONTEXT Distribution (Emission) — the brief on the page of a saved architecture.
 *
 * The item page of a `kind: architecture` item (AGSC-02-97) shows, written by the build, the
 * brief of the composition it saves (AGSC-07-25): the summary sentence, the members in
 * dependency order (AGSC-07-26), the gaps and the checklist (AGSC-07-27), and the link to the
 * same composition on `/compose/?from=<slug>` that AGSC-07-24 asks the item page to expose,
 * where the page computes the four files of the brief and the blueprint outputs of AGSC-07-29
 * and offers them for download. Only an architecture's page carries it; no other page changes.
 *
 * WHAT IT NAMES. The brief is computed by `composition/brief.js#briefOf` over the listed items
 * the build publishes (AGSC-00-05), so the section names, counts and links no draft, no retired
 * item and no item the `releases` switchboard holds back — exactly what the command line's brief
 * names. Every list stops at `SHOWN` entries, so a large selection keeps the page under the
 * budget of AGSC-06-21; the page then says how many there are and where the whole brief is. A
 * brief above the engine's bound on `derived` (`composition/brief.js#derivedBound`) is not
 * computed: the section then says why, and the build goes on.
 *
 * Pure function of its input: no file is written, no clock is read (the build instant arrives).
 */

const architecture = require('../composition/architecture.js');
const brief = require('../composition/brief.js');
const { escapeHtml } = require('./html.js');

/** The most entries one list of the section shows (AGSC-06-21 page budget). */
const SHOWN = 50;

/** A text of the brief as markup: escaped, each backtick span a `<code>` element. */
function withCode(text) {
  return escapeHtml(text).replace(/`([^`]*)`/gu, '<code>$1</code>');
}

/** One list of the section: its heading, then up to `SHOWN` entries, `None.` when empty. */
function listBlock(id, heading, tag, lines, more) {
  const out = [`<h3 id="${id}">${heading}</h3>`];
  if (lines.length === 0) return [...out, '<p>None.</p>'];
  out.push(`<${tag}>${lines.slice(0, SHOWN).map((line) => `<li>${line}</li>`).join('')}</${tag}>`);
  if (lines.length > SHOWN) out.push(`<p>The first ${SHOWN} of ${lines.length} are listed; ${more}.</p>`);
  return out;
}

/**
 * The brief section of an item page, or `''` when the item is not a saved architecture or its
 * selection block cannot be read (`agsc lint` reports that, AGSC-02-97).
 *
 * @param {object} item the flat item record of the page.
 * @param {{instant: string, items: Array<object>, route: function(object): string}} options the
 *   build instant, the listed items of the build, and the route of an item.
 * @returns {string}
 */
function section(item, options) {
  if (!architecture.isArchitecture(item)) return '';
  const saved = architecture.composeFrom(options.items, item.slug);
  if (saved.result === null || saved.findings.some((f) => f.severity === 'error')) return '';
  let record;
  try {
    record = brief.briefOf(saved.result, {
      instant: options.instant, items: options.items, listed: options.items.map((i) => i.slug),
    });
  } catch (e) {
    // A brief above the engine's bound (`brief.js#derivedBound`) is refused: the page says so and
    // the build goes on, since the item itself is valid.
    if (e.code !== 'AGSC-E904') throw e;
    return ['<section class="brief" aria-labelledby="composition-brief">',
      '<h2 id="composition-brief">Brief of this architecture</h2>',
      `<p>No brief: ${escapeHtml(e.message)} (${e.code}).</p>`, '</section>'].join('\n');
  }
  const bySlug = new Map(options.items.map((i) => [i.slug, i]));
  const compose = `/compose/?from=${encodeURIComponent(item.slug)}`;
  const more = `the whole brief is on <a href="${escapeHtml(compose)}">${escapeHtml(compose)}</a>`;
  const member = (slug) => {
    const target = bySlug.get(slug);
    const title = target.title == null ? slug : String(target.title);
    return `<a href="${escapeHtml(options.route(target))}">${escapeHtml(title)}</a> (<code>${escapeHtml(slug)}</code>)`;
  };
  return ['<section class="brief" aria-labelledby="composition-brief">',
    '<h2 id="composition-brief">Brief of this architecture</h2>',
    `<p>${escapeHtml(record.summary)}</p>`,
    ...listBlock('brief-order', 'Dependency order', 'ol', record.order.map(member), more),
    ...listBlock('brief-gaps', 'Gaps', 'ul', record.gaps.map((g) => withCode(g.text)), more),
    ...listBlock('brief-checklist', 'Checklist', 'ul', record.checklist.map((c) => withCode(c.text)), more),
    `<p class="views">The same composition in this browser, with the brief and the blueprint of the architecture to download: <a href="${escapeHtml(compose)}">${escapeHtml(compose)}</a>. `
      + `On the command line: <code>agsc compose --from ${escapeHtml(item.slug)} --brief</code>.</p>`,
    '</section>'].join('\n');
}

module.exports = { SHOWN, section };
