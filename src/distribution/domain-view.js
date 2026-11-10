'use strict';
// CONTEXT Distribution (Emission) — Surface: the domain layer on item pages, and the page
// scripts that carry the domain parts.
//
// Implements the domain sentences of AGSC-06-38: on a node that uses the domain layer (a site
// vocabulary file is present, AGSC-01-41), the relations table of an item page also shows, in
// each row, the other item's domain type and context, and the page shows the item's own domain
// type, role, context and warrant in a definition list under the table, each with its label. A
// node that does not use the layer shows none of these, and its pages keep their bytes.
//
// WHAT EACH LABEL IS. The domain type: the `rdfs:label` the site vocabulary gives the class
// the item's `domain_type` names (`knowledge/domain.js#load` resolves it in the namespace of
// the item's context, AGSC-02-25), else the local name as written. The context: the title of
// the cluster that is the context (AGSC-08-32), linked to its page when it is published, else
// its slug; a context that is an item not listed (a draft, or a cluster held back) is no part,
// neither drawn nor named (AGSC-06-38, `composition/brief.js#domainWithheld`); the vocabulary
// defines no term for a context. The role: one of the five words of
// AGSC-02-25 as words. The warrant: its kind and its source (AGSC-05-40), the source linked
// when it is an `http(s)` address.
//
// WHEN. A page shows the definition list when its item is listed and has a domain part
// (`composition/brief.js#domainOf`, the one reader of the parts for the brief and the tools
// too); the page of a retired item gets none, as it gets no relations section
// (`graph-view.js#itemSection`). It shows the two columns when at least one row's other item
// has a domain type or a context, so that no table carries two empty columns; a row whose item
// has neither leaves both cells empty.
//
// THE PAGE SCRIPTS. `scripts` tells the build whether `/compose/agsc-core.js` and
// `/compose/agsc-page-tools.js` carry the domain parts of the brief and of the tool answers
// (AGSC-07-25, AGSC-09-13): only when a listed item states a key of AGSC-02-25, whatever the
// vocabulary, because those rules follow the keys an item states, or a domain link joins two
// listed items (AGSC-03-27: it appears in the brief's `relations`). The edges are read here,
// against the site vocabulary (`knowledge/links.js#domainEdges`), because a page cannot read
// the vocabulary. Every other node's scripts keep their bytes (AGSC-01-41).
//
// Requirements: PRD-002 (the relations shown to a reader), PRD-022 (the node's own vocabulary),
// PRD-076 (the domain layer and its display).
//
// Pure: no fs, no clock, no network.

const { domainKeys, domainOf, domainWithheld, domainWithin } = require('../composition/brief.js');
const bounded = require('../knowledge/contexts.js');
const { domainEdges } = require('../knowledge/links.js');
const { siteTerms } = require('./query-examples.js');
const { ITEM_COLUMNS, NEIGHBOURS_DRAWN, index, itemSection, relationRows } = require('./graph-view.js');
const { escapeHtml } = require('./html.js');

/** AGSC-02-25: the five roles, each as words. */
const ROLE_WORDS = Object.freeze({
  'aggregate-root': 'aggregate root',
  entity: 'entity',
  'value-object': 'value object',
  'domain-event': 'domain event',
  policy: 'policy',
});

/** The slugs of the clusters `domain.contexts` declares (AGSC-01-41, AGSC-08-32). */
function declaredClusters(config) {
  return bounded.declared(config).map((entry) => entry.cluster);
}

/** AGSC-02-25: whether a flat item states one of the four domain keys. */
function statesKey(item) {
  return domainKeys().some((key) => item[key] !== undefined);
}

/**
 * The domain option of the two page-script bundles (`composition/browser.js#bundle`,
 * `page-tools.js#bundle`) when a listed item states a domain key or a domain link joins two
 * listed items, else `undefined`, and the scripts keep their bytes: the declared contexts that
 * are listed, the domain links between listed items and the listed items whose context is an
 * item that is not listed (`composition/brief.js#domainWithheld`). A page names listed items
 * only (AGSC-09-16), so no slug of another item is written into a script.
 *
 * @param {Array<object>} items the listed items, flat.
 * @param {object} config the configuration.
 * @param {object|null} model the site vocabulary (`knowledge/domain.js#load`), or `null`.
 * @param {Array<object>} [all] every item of the Bundle; absent, the listed items.
 * @returns {{contexts: Array<string>, edges: Array<object>, withheld: Array<string>}|undefined}
 */
function scripts(items, config, model, all = items) {
  const edges = domainEdges(items, model);
  if (!items.some(statesKey) && edges.length === 0) return undefined;
  const listed = items.map((item) => item.slug);
  const contexts = declaredClusters(config);
  return { contexts: contexts.filter((slug) => listed.includes(slug)), edges, withheld: domainWithheld(all, listed, contexts) };
}

/** A link, or the escaped text when there is no route. */
function linked(text, href) {
  return href === null ? escapeHtml(text) : `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
}

/**
 * The labels of a node's domain parts (see the header).
 *
 * @param {object|null} model the site vocabulary (`knowledge/domain.js#load`), or `null`.
 * @param {ReturnType<typeof import('./graph-view.js').index>} views the published items.
 */
function labeller(model, views) {
  const classLabels = new Map(((siteTerms(model) || { classes: [] }).classes).map((c) => [c.iri, c.label]));
  return {
    context(slug) {
      const cluster = views.bySlug.get(slug);
      if (cluster === undefined) return escapeHtml(slug);
      return linked(cluster.title == null ? slug : String(cluster.title), views.hrefOf(cluster));
    },
    type(item, local) {
      const iri = model === null ? null : model.classFor(item);
      return escapeHtml(iri !== null && classLabels.has(iri) ? classLabels.get(iri) : local);
    },
  };
}

/** The definition list of an item's own domain parts, or `''` when it has none. */
function definitionList(item, domain, labels) {
  if (domain === null) return '';
  const rows = [];
  if (domain.type !== undefined) rows.push(['Domain type', labels.type(item, domain.type)]);
  if (domain.role !== undefined) rows.push(['Domain role', escapeHtml(ROLE_WORDS[domain.role] || domain.role)]);
  if (domain.context !== undefined) rows.push(['Domain context', labels.context(domain.context)]);
  if (domain.warrant !== undefined) {
    const { source, type } = domain.warrant;
    rows.push(['Warrant', `${escapeHtml(type)}: ${linked(source, /^https?:\/\//u.test(source) ? source : null)}`]);
  }
  return `<dl class="meta domain">\n${rows.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('\n')}\n</dl>`;
}

/**
 * The graph view of one build's item pages, with the domain parts on a node that uses the
 * layer, and the domain option of its page scripts.
 *
 * @param {{bundle: object, config: object, items: Array<object>, model: object|null, routeOf: Function}} input
 *   the loaded Bundle (whose `domain.vocabulary` text says whether the node uses the layer,
 *   AGSC-01-41, and whose `items` are every item), the configuration, the listed items (flat), the site vocabulary they load to
 *   (`knowledge/domain.js#load`, or `null`) and the route of an item's page.
 * @returns {{views: object, itemSection: function(object): {html: string, findings: Array<object>},
 *   scripts: ({contexts: Array<string>, edges: Array<object>, withheld: Array<string>}|undefined)}} the published items as the graph view reads
 *   them (`graph-view.js#index`), the relations section of an item page, and `scripts` above.
 */
function pages({ bundle, config, items, model, routeOf }) {
  const views = index(items, routeOf);
  const used = Boolean(bundle.domain && typeof bundle.domain.vocabulary === 'string');
  const all = bundle.items || items;
  const out = { scripts: scripts(items, config, model, all), views };
  if (!used) return { ...out, itemSection: (item) => itemSection(item, views) };
  const contexts = declaredClusters(config);
  const labels = labeller(model, views);
  const withheld = new Set(domainWithheld(all, items.map((item) => item.slug), contexts));
  const partsOf = (item) => domainWithin(domainOf(item, contexts), !withheld.has(item.slug));
  /** The part `name` of the other item of a row, or `undefined`. */
  const part = (row, name) => (partsOf(row.other) || {})[name];
  const columns = [...ITEM_COLUMNS,
    { heading: 'Domain type', cell: (row) => (part(row, 'type') === undefined ? '' : labels.type(row.other, part(row, 'type'))) },
    { heading: 'Domain context', cell: (row) => (part(row, 'context') === undefined ? '' : labels.context(part(row, 'context'))) }];
  return {
    ...out,
    itemSection(item) {
      // The page of a retired item: no section, and no domain part either.
      if (!views.bySlug.has(String(item.slug))) return itemSection(item, views);
      const list = definitionList(item, partsOf(item), labels);
      // The rows the table lists (graph-view.js: the first NEIGHBOURS_DRAWN).
      const rows = relationRows(item, views).slice(0, NEIGHBOURS_DRAWN);
      const typed = rows.some((row) => part(row, 'type') !== undefined || part(row, 'context') !== undefined);
      const section = itemSection(item, views, { after: list, ...(typed ? { columns } : {}) });
      return section.html === '' && list !== '' ? { findings: section.findings, html: list } : section;
    },
  };
}

module.exports = { ROLE_WORDS, pages, scripts };
