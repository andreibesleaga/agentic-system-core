'use strict';
// CONTEXT Distribution (Emission) — Surface: the graph view of item and cluster pages.
//
// Implements AGSC-06-38. An item page shows the neighbourhood of the item as an inline
// SVG figure and, beside it, the RELATIONS TABLE that is the figure's text equivalent
// (AGSC-06-20): one row for each Link key (AGSC-03-01) that joins the item and another
// published item, in either direction, with the key, the direction, the other item
// linked to its page, and the plain meaning of the key (the `Meaning` column, read from
// `knowledge/relations.js`). The incoming rows are the item's BACKLINKS. A cluster page
// also shows a MAP of its members and the Links among them, with the same kind of table.
//
// How it is built, in three steps, each a pure function:
//   1. `index(items, hrefOf)` reads the published items once (AGSC-06-30: the caller
//      passes the listed set, so a draft, a retired item and an item held back by the
//      `releases` switchboard are never drawn, named, a row or a backlink);
//   2. `relationRows` / the cluster's links select and order the rows;
//   3. the figure is written as a source in the diagram language (AGSC-01-42) and
//      compiled by `knowledge/diagrams.js` through `html.js#inlineDiagram`, the path the
//      author's own diagram takes, so the figure meets the SVG rules of AGSC-02-13 and
//      AGSC-01-07 (the allow-list of AGSC-02-98) by the same check.
//
// Bounds (AGSC-06-21 keeps every page under 100 KB). The figure draws at most 24
// neighbours, the first 24 rows in the table's order, and the table lists the same rows,
// so the figure draws exactly what the table lists; a sentence says how many more exist
// and where all of them are (the graph). A cluster map draws at most 24 links among the
// members and at most 24 members, those the links join first, and says what it left out.
//
// Ids. The SVG ids of a figure are derived from its name (`diagrams.js#markerId`): the
// neighbourhood figure is `links_<slug>` and the cluster map `members_<slug>`. An
// underscore never occurs in a slug or in a heading anchor (AGSC-03-13), so neither
// figure repeats an id of the author's diagram (`<slug>-…`) or of the page.
//
// Text in a figure. The diagram language has no escape: a `"` ends a quoted argument,
// `#` starts a comment and `|` breaks a box label. Those three are drawn as `”`, `＃` and
// `¦`, a label equal to a flag name (`acc`, `dashed`) or empty gets a no-break space so it
// sets no flag, and a label too wide for its box is cut with `…` by the compiler's own
// measure of text width. The table carries every title in full, escaped.
//
// Extension. The table's columns are a list (`ITEM_COLUMNS`, `CLUSTER_COLUMNS`), so the
// domain layer adds the other item's domain type and context as further columns on a
// node that uses it (AGSC-06-38, last sentences) without changing this writer.
//
// Requirements: PRD-002 (the fourteen Links and their inverses, shown to a reader) and
// PRD-013 (the figure is compiled like a diagram, inline, with its accessible name).
//
// Pure: no fs, no clock, no network.

const diagrams = require('../knowledge/diagrams.js');
const { RELATIONS, LINK_KEYS } = require('../knowledge/relations.js');
const { linksOf, membersOf, titleOf } = require('../knowledge/link-graph.js');
const { compareCodePoint, singleLine } = require('../knowledge/unicode.js');
const { escapeHtml, inlineDiagram } = require('./html.js');

/** AGSC-06-38: the figure draws at most 24 neighbours. */
const NEIGHBOURS_DRAWN = 24;
/** A cluster map draws at most this many members, and this many links among them. */
const MEMBERS_DRAWN = 24;
const MEMBER_LINKS_DRAWN = 24;

/** The meaning of each key, from the table of AGSC-03-01. */
const MEANING = Object.freeze(Object.fromEntries(RELATIONS.map((r) => [r.key, r.meaning])));
/** The place of each key in that table: rows are ordered by it. */
const KEY_ORDER = Object.freeze(Object.fromEntries(LINK_KEYS.map((key, n) => [key, n])));

/** The page that lists every relation, named when a view is cut. */
const GRAPH_LINK = '<a href="/graph.jsonld">the graph</a>';

// ------------------------------------------------------------------ the index

/**
 * The published items, read once: by slug (the first of a slug wins, as everywhere in
 * the build) and the Links that reach each slug from a published item.
 *
 * @param {Array<object>} items the flat published items, in the published order.
 * @param {function(object):string} hrefOf the route of an item's page.
 * @returns {{bySlug:Map<string,object>, incoming:Map<string,Array<object>>, hrefOf:Function}}
 */
function index(items, hrefOf) {
  const bySlug = new Map();
  for (const item of items) if (!bySlug.has(String(item.slug))) bySlug.set(String(item.slug), item);
  const incoming = new Map();
  for (const item of bySlug.values()) {
    for (const link of linksOf(item)) {
      if (link.target === link.source) continue;
      if (!incoming.has(link.target)) incoming.set(link.target, []);
      incoming.get(link.target).push(link);
    }
  }
  return { bySlug, hrefOf, incoming };
}

/** Rows in the order of the keys in AGSC-03-01, then of the other item's slug. */
function byKeyThenOther(a, b) {
  return KEY_ORDER[a.key] - KEY_ORDER[b.key] || compareCodePoint(String(a.other.slug), String(b.other.slug));
}

/**
 * The relations of one item: the Links it states to published items (outgoing), then
 * the Links published items state to it (incoming, the backlinks), each group in key
 * order. A self-link is not a relation with another item and is left out.
 *
 * @param {object} item the flat item whose page is written (it may be retired).
 * @param {ReturnType<typeof index>} views
 * @returns {Array<{key:string, direction:string, other:object}>}
 */
function relationRows(item, views) {
  const slug = String(item.slug);
  const outgoing = linksOf(item)
    .filter((l) => l.target !== slug && views.bySlug.has(l.target))
    .map((l) => ({ direction: 'outgoing', key: l.key, other: views.bySlug.get(l.target) }));
  const incoming = (views.incoming.get(slug) || [])
    .map((l) => ({ direction: 'incoming', key: l.key, other: views.bySlug.get(l.source) }));
  return [...outgoing.sort(byKeyThenOther), ...incoming.sort(byKeyThenOther)];
}

/** The published members of a cluster, in the published order. */
function membersOfCluster(cluster, views) {
  return membersOf(cluster, [...views.bySlug.values()]);
}

// ------------------------------------------------------------------ text in a figure

/** The two box flags of AGSC-01-42 a label could set by equalling them. */
const BOX_FLAGS = Object.freeze(['acc', 'dashed']);
/** The font size of a label in a box (AGSC-01-42: 12, or 11 for a long one-line label). */
const LABEL_SIZE = 12;
/** Room left free inside a box, on the two sides together, px. */
const LABEL_PADDING = 12;

/** A text as one quoted argument of the diagram language (see the header). */
function dslText(text) {
  const plain = singleLine(String(text)).trim()
    .replace(/"/gu, '\u201D').replace(/#/gu, '\uFF03').replace(/\|/gu, '\u00A6');
  // An empty label would let the next token (a flag) stand in its place.
  return plain === '' || BOX_FLAGS.includes(plain) ? `${plain}\u00A0` : plain;
}

/** A label no wider than `width` px at the label size, cut with `…` when it is wider. */
function fit(text, width) {
  const chars = [...dslText(text)];
  if (diagrams.textWidth(chars.join(''), LABEL_SIZE) <= width) return chars.join('');
  while (chars.length > 0 && diagrams.textWidth(`${chars.join('')}\u2026`, LABEL_SIZE) > width) chars.pop();
  return `${chars.join('').trimEnd()}\u2026`;
}

/** A number as the compiler writes it (AGSC-01-42), so the source reads as the SVG. */
const n = (value) => diagrams.fixed(value);

// ------------------------------------------------------------------ the item figure

/** Layout of the item figure, px: incoming rows on the left, outgoing on the right. */
const ITEM = Object.freeze({ pad: 10, side: 190, centre: 170, gap: 70, box: 36, pitch: 44, lead: 16 });

/**
 * The diagram source of an item's neighbourhood: the item in the middle, highlighted;
 * each row a box holding its key and the other item's title, on the left for an
 * incoming row and on the right for an outgoing one; one arrow per row, from the item
 * that states the relation to its target.
 *
 * @param {object} item
 * @param {Array<object>} rows the rows drawn (at most NEIGHBOURS_DRAWN).
 * @returns {string}
 */
function itemFigureSource(item, rows) {
  const left = rows.filter((r) => r.direction === 'incoming').length;
  const right = rows.length - left;
  const tallest = Math.max(left, right, 1);
  const width = 2 * ITEM.pad + 2 * ITEM.side + ITEM.centre + 2 * ITEM.gap;
  const height = 2 * ITEM.pad + tallest * ITEM.pitch - (ITEM.pitch - ITEM.box);
  const top = (count) => ITEM.pad + ((tallest - count) * ITEM.pitch) / 2;
  const x = { incoming: ITEM.pad, outgoing: ITEM.pad + ITEM.side + 2 * ITEM.gap + ITEM.centre };
  const lines = [`canvas ${n(width)} ${n(height)}`,
    `box item ${n(ITEM.pad + ITEM.side + ITEM.gap)} ${n((height - ITEM.box) / 2)} ${ITEM.centre} ${ITEM.box} "${fit(titleOf(item), ITEM.centre - LABEL_PADDING)}" acc`];
  const placed = { incoming: 0, outgoing: 0 };
  rows.forEach((row, k) => {
    const id = `r${k + 1}`;
    const y = top(row.direction === 'incoming' ? left : right) + placed[row.direction] * ITEM.pitch;
    placed[row.direction] += 1;
    lines.push(`box ${id} ${n(x[row.direction])} ${n(y)} ${ITEM.side} ${ITEM.box} "${row.key}|${fit(titleOf(row.other), ITEM.side - LABEL_PADDING)}"`);
    // The arrow leaves or enters the row's box level with its middle, through a waypoint
    // in the gap, so that no arrow crosses another row's box.
    const middle = n(y + ITEM.box / 2);
    lines.push(row.direction === 'outgoing'
      ? `arrow item ${id} via=${n(x.outgoing - ITEM.lead)},${middle}`
      : `arrow ${id} item via=${n(ITEM.pad + ITEM.side + ITEM.lead)},${middle}`);
  });
  return `${lines.join('\n')}\n`;
}

// ------------------------------------------------------------------ the tables

/**
 * The columns of an item's relations table: heading and cell writer. A key is plain
 * text, not a code span: the theme lets a code span in a cell break anywhere, which
 * split `requires` in a narrow column.
 */
const ITEM_COLUMNS = Object.freeze([
  { heading: 'Relation', cell: (row) => escapeHtml(row.key) },
  { heading: 'Direction', cell: (row) => row.direction },
  { heading: 'Item', cell: (row, views) => itemLink(row.other, views) },
  { heading: 'Meaning', cell: (row) => escapeHtml(MEANING[row.key]) },
]);

/** The columns of a cluster's table of the links among its members. */
const CLUSTER_COLUMNS = Object.freeze([
  { heading: 'From', cell: (row, views) => itemLink(row.source, views) },
  { heading: 'Relation', cell: (row) => escapeHtml(row.key) },
  { heading: 'To', cell: (row, views) => itemLink(row.target, views) },
  { heading: 'Meaning', cell: (row) => escapeHtml(MEANING[row.key]) },
]);

/** An item's title as a link to its page. */
function itemLink(item, views) {
  return `<a href="${escapeHtml(views.hrefOf(item))}">${escapeHtml(titleOf(item))}</a>`;
}

/**
 * A relations table: one header row, then one row per relation, each cell written by
 * its column. No script, no inline style (AGSC-06-17); the theme styles `table`.
 *
 * @param {Array<object>} rows
 * @param {ReadonlyArray<{heading:string, cell:Function}>} columns
 * @param {ReturnType<typeof index>} views
 * @returns {string}
 */
function relationsTable(rows, columns, views) {
  const head = columns.map((c) => `<th scope="col">${escapeHtml(c.heading)}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${c.cell(row, views)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="table-wrap"><table class="relations">\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`;
}

/** "1 more relation is" / "6 more relations are". */
function more(count, singular, plural) {
  return count === 1 ? `1 more ${singular} is` : `${count} more ${plural} are`;
}

// ------------------------------------------------------------------ the item section

/**
 * The relations section of an item page: heading, figure, table and, when rows were
 * cut, how many. Empty when the item has no relation (the page then has no section),
 * and on the page of a retired item, which AGSC-06-38 neither draws nor names; its page
 * stays (AGSC-11-22) with its notice, and its Links stay in the graph exports.
 *
 * @param {object} item the flat item whose page is written.
 * @param {ReturnType<typeof index>} views
 * @param {{svgViolations?:Function, columns?:Array<object>}} [options]
 * @returns {{html:string, findings:Array<object>}}
 */
function itemSection(item, views, options = {}) {
  const rows = views.bySlug.has(String(item.slug)) ? relationRows(item, views) : [];
  if (rows.length === 0) return { findings: [], html: '' };
  const shown = rows.slice(0, NEIGHBOURS_DRAWN);
  const slug = String(item.slug);
  const figure = inlineDiagram(itemFigureSource(item, shown), {
    accessibleName: `Relations of ${titleOf(item)}`,
    caption: 'The highlighted box is this item. Each arrow runs from the item that states a relation to its target; the table lists the same relations.',
    file: item.path == null ? slug : String(item.path),
    item: slug,
    slug: `links_${slug}`,
  }, options);
  const parts = ['<h2 id="links">Relations</h2>',
    '<p>An outgoing relation is stated by this item; an incoming one is a backlink, stated by the other item. Each meaning reads from the item that states the relation towards its target.</p>',
    figure.html, relationsTable(shown, options.columns || ITEM_COLUMNS, views)];
  if (rows.length > shown.length) {
    parts.push(`<p class="relations-more">${more(rows.length - shown.length, 'relation of this item', 'relations of this item')} not drawn or listed here; every relation is in ${GRAPH_LINK}.</p>`);
  }
  return { findings: figure.findings, html: parts.filter((p) => p !== '').join('\n') };
}

// ------------------------------------------------------------------ the cluster map

/** Layout of the cluster map, px: the cluster on top, the members below, arcs on the right. */
const MAP = Object.freeze({ pad: 10, width: 260, head: 30, box: 26, pitch: 34, first: 50, label: 10 });

/**
 * What a cluster map draws. Every link among the members, in the order of the members,
 * then of the keys, then of the target member; the first links are kept while they
 * number at most MEMBER_LINKS_DRAWN and their ends at most MEMBERS_DRAWN members. The
 * drawn members are the ends of the kept links, then other members in the published
 * order up to MEMBERS_DRAWN, all of them drawn in the published order — so a large
 * cluster shows its links rather than its first members.
 *
 * @returns {{all:Array<object>, shown:Array<object>, members:Array<object>, place:Map<string,number>}}
 */
function memberLinks(everyMember, views) {
  const order = new Map(everyMember.map((m, k) => [String(m.slug), k]));
  const all = everyMember.flatMap((m) => linksOf(m)
    .filter((l) => l.target !== l.source && order.has(l.target))
    .sort((a, b) => KEY_ORDER[a.key] - KEY_ORDER[b.key] || order.get(a.target) - order.get(b.target))
    .map((l) => ({ key: l.key, source: m, target: views.bySlug.get(l.target) })));
  const ends = new Set();
  const shown = [];
  for (const row of all) {
    if (shown.length === MEMBER_LINKS_DRAWN) break;
    const added = [String(row.source.slug), String(row.target.slug)].filter((s) => !ends.has(s));
    if (ends.size + added.length > MEMBERS_DRAWN) continue;
    for (const s of added) ends.add(s);
    shown.push(row);
  }
  for (const m of everyMember) if (ends.size < MEMBERS_DRAWN) ends.add(String(m.slug));
  const members = everyMember.filter((m) => ends.has(String(m.slug)));
  return { all, members, place: new Map(members.map((m, k) => [String(m.slug), k])), shown };
}

/**
 * The arcs of the map: one per ordered pair of members, naming every key from the first
 * to the second. A pair linked both ways gets two arcs, the second wider and labelled
 * one line lower, so the two never coincide.
 */
function arcsOf(rows, place) {
  const arcs = new Map();
  for (const row of rows) {
    const from = place.get(String(row.source.slug));
    const to = place.get(String(row.target.slug));
    const id = `${from}>${to}`;
    if (!arcs.has(id)) arcs.set(id, { from, keys: [], reverse: arcs.has(`${to}>${from}`), to });
    arcs.get(id).keys.push(row.key);
  }
  return [...arcs.values()];
}

/**
 * The diagram source of a cluster map: the cluster on top, highlighted; each drawn
 * member a box below it; each arc a curve on the right from the member that states the
 * Links to their target, labelled with the keys.
 */
function clusterFigureSource(cluster, members, rows, place) {
  const right = MAP.pad + MAP.width;
  const middle = (k) => MAP.first + k * MAP.pitch + MAP.box / 2;
  let width = right + MAP.pad;
  const arcLines = arcsOf(rows, place).flatMap((arc) => {
    const bulge = 24 + 16 * (Math.abs(arc.from - arc.to) - 1) + (arc.reverse ? 12 : 0);
    const label = arc.keys.join(', ');
    const apex = right + 0.75 * bulge + 4;
    width = Math.max(width, apex + diagrams.textWidth(label, MAP.label) + diagrams.TEXT_MARGIN + 2);
    const y1 = middle(arc.from);
    const y2 = middle(arc.to);
    return [`path "M${n(right)} ${n(y1)} C${n(right + bulge)} ${n(y1)} ${n(right + bulge)} ${n(y2)} ${n(right)} ${n(y2)}" arrow`,
      `text ${n(apex)} ${n((y1 + y2) / 2 + 3.5 + (arc.reverse ? 11 : 0))} "${label}" left size=${MAP.label}`];
  });
  const height = MAP.first + members.length * MAP.pitch - (MAP.pitch - MAP.box) + MAP.pad;
  return [`canvas ${n(Math.ceil(width))} ${n(height)}`,
    `box cluster ${MAP.pad} ${MAP.pad} ${MAP.width} ${MAP.head} "${fit(titleOf(cluster), MAP.width - LABEL_PADDING)}" acc`,
    ...members.map((m, k) => `box m${k + 1} ${MAP.pad} ${n(MAP.first + k * MAP.pitch)} ${MAP.width} ${MAP.box} "${fit(titleOf(m), MAP.width - LABEL_PADDING)}"`),
    ...arcLines].join('\n').concat('\n');
}

/**
 * The map section of a cluster page: the members drawn and the links among them, then
 * their table and what was left out. Empty when no drawn member links to another.
 *
 * @param {object} cluster the flat cluster item.
 * @param {ReturnType<typeof index>} views
 * @param {{svgViolations?:Function, columns?:Array<object>}} [options]
 * @returns {{html:string, findings:Array<object>}}
 */
function clusterSection(cluster, views, options = {}) {
  const everyMember = membersOfCluster(cluster, views);
  const { all, members, place, shown } = memberLinks(everyMember, views);
  if (all.length === 0) return { findings: [], html: '' };
  const slug = String(cluster.slug);
  const figure = inlineDiagram(clusterFigureSource(cluster, members, shown, place), {
    accessibleName: `Links among the members of ${titleOf(cluster)}`,
    caption: 'The highlighted box is the cluster and its members are below it. Each arc runs from the member that states a link to its target and names the relation; the table lists the same links.',
    file: cluster.path == null ? slug : String(cluster.path),
    item: slug,
    slug: `members_${slug}`,
  }, options);
  const parts = ['<h3 id="member-links">Links among the members</h3>', figure.html,
    relationsTable(shown, options.columns || CLUSTER_COLUMNS, views)];
  const notes = [];
  if (everyMember.length > members.length) notes.push(`The map draws ${members.length} of the ${everyMember.length} members.`);
  if (all.length > shown.length) {
    notes.push(`${more(all.length - shown.length, 'link among the members', 'links among the members')} not drawn or listed here; every link is in ${GRAPH_LINK}.`);
  }
  if (notes.length > 0) parts.push(`<p class="relations-more">${notes.join(' ')}</p>`);
  return { findings: figure.findings, html: parts.filter((p) => p !== '').join('\n') };
}

module.exports = {
  CLUSTER_COLUMNS, ITEM_COLUMNS, MEMBERS_DRAWN, MEMBER_LINKS_DRAWN, NEIGHBOURS_DRAWN,
  clusterFigureSource, clusterSection, index, itemFigureSource, itemSection, membersOfCluster,
  relationRows, relationsTable,
};
