'use strict';
/**
 * CONTEXT Interchange — memory adapter `mermaid` (AGSC-01-26a), EXPORT ONLY.
 *
 * `export --to mermaid` draws the typed Link graph of the published items as
 * Mermaid flowcharts, for a reader who wants to see how the items connect in any
 * Markdown viewer that renders Mermaid:
 *
 *   `items/<slug>.mmd`     one per published item: the item and every published item
 *                          it shares a written Link with, in either direction, each
 *                          edge in the direction it was written and labelled with the
 *                          Link key (`n_a -->|uses| n_b`);
 *   `clusters/<slug>.mmd`  one per published cluster: its published members (the
 *                          items whose `clusters[]` names it) inside one subgraph,
 *                          and the written Links among them.
 *
 * WHAT IT CLAIMS. Nothing, for a round trip: there is no `import --from mermaid`,
 * so AGSC-01-26a's "lossless in both directions for every key it claims" binds an
 * empty set. The diagram READS the fourteen Link keys of AGSC-03-01 (the list is
 * `knowledge/links.js#LINK_KEYS`, never retyped here), `title`, `clusters`, and the
 * publication keys AGSC-06-30 filters on; it writes none of them back anywhere.
 *
 * WHAT IT CARRIES. Every file carries AGSC-01-29's provenance header and terms
 * (AGSC-06-15), each line of the block written as a Mermaid `%%` comment line so the
 * file still parses as a diagram. No item prose is quoted — the only authored text
 * is each item's title, as a node label — so nothing needs the ```text agsc-content
 * fence. No file is executable, no symlink is written and no `allowed-tools`
 * declaration exists in the format (AGSC-07-15).
 *
 * SAFE BY CONSTRUCTION. A node id is `n_` + the slug with `-` mapped to `_` (a slug
 * is `[a-z0-9-]` and carries no `_`, so the map is one-to-one); the prefix keeps every
 * id clear of Mermaid's reserved words (`end`, `graph`, `class`, `state`, …). A
 * cluster's subgraph id is `c_` + the same map, so it never collides with a node id.
 * A label is single-lined (AGSC-02-24), quoted, and its `#`, `"`, `<`, `>`, `&` and
 * backtick are written as Mermaid entity codes, so no title can close the label,
 * inject a statement or reach an HTML renderer as markup.
 *
 * DETERMINISM (AGSC-04-01). Nodes, edges and files are in code-point order
 * (AGSC-04-12), lines end in LF with exactly one trailing LF, and the only instant is
 * the caller's. Drafts, retired and release-gated items never leave (AGSC-06-30), and
 * neither does a Link to one.
 *
 * PURE: no fs, no clock, no network. The caller supplies the items, the instant and
 * the hasher (AGSC-05-29).
 */

const chunks = require('../../knowledge/chunks.js');
const { LINK_KEYS } = require('../../knowledge/links.js');
const { compareCodePoint, singleLine } = require('../../knowledge/unicode.js');
const { provenanceLines } = require('../../knowledge/provenance-header.js');

/** The name this adapter answers to on `export --to`. */
const FORMAT = 'mermaid';

/** AGSC-01-26a: the keys claimed for a round trip — none, since the adapter is export-only. */
const CLAIMED_KEYS = Object.freeze([]);

/** The authored keys the diagrams are drawn from (read, never written back). */
const READS = Object.freeze([...LINK_KEYS, 'clusters', 'release', 'status', 'title'].sort(compareCodePoint));

/** Mermaid entity codes for the characters a quoted label may not carry verbatim. */
const ENTITY = Object.freeze({
  '"': '#quot;',
  '#': '#35;',
  '&': '#amp;',
  '<': '#lt;',
  '>': '#gt;',
  '`': '#96;',
});

/** A Mermaid node id from a slug: `n_` + the slug with `-` mapped to `_`. */
function nodeId(slug) {
  return `n_${String(slug).replace(/-/gu, '_')}`;
}

/** A cluster's subgraph id: `c_` + the same map, so it never equals a node id. */
function subgraphId(slug) {
  return `c_${String(slug).replace(/-/gu, '_')}`;
}

/** A quoted, escaped Mermaid label: `["…"]`. */
function label(text) {
  return `["${singleLine(text).replace(/["#&<>`]/gu, (c) => ENTITY[c])}"]`;
}

/** The title an item is drawn with; the slug when it has none. */
function titleOf(item) {
  return item.title == null || String(item.title) === '' ? String(item.slug) : String(item.title);
}

/**
 * Every written Link between two published items, once each, in code-point order of
 * (source, key, target). A Link value's `#anchor` is dropped: the diagram draws items.
 *
 * @param {Array<object>} items flat published items.
 * @param {Map<string,object>} published by slug.
 * @returns {Array<{source:string, key:string, target:string}>}
 */
function edgesOf(items, published) {
  const seen = new Set();
  const edges = [];
  for (const item of items) {
    for (const key of LINK_KEYS) {
      const values = Array.isArray(item[key]) ? item[key] : [];
      for (const value of values) {
        const target = String(value).split('#')[0];
        if (!published.has(target)) continue;
        const id = `${item.slug}\u0000${key}\u0000${target}`;
        if (seen.has(id)) continue;
        seen.add(id);
        edges.push({ key, source: String(item.slug), target });
      }
    }
  }
  return edges.sort((a, b) => compareCodePoint(a.source, b.source)
    || compareCodePoint(a.key, b.key)
    || compareCodePoint(a.target, b.target));
}

/** One edge line. */
function edgeLine(edge, indent) {
  return `${indent}${nodeId(edge.source)} -->|${edge.key}| ${nodeId(edge.target)}`;
}

/** One node line. */
function nodeLine(item, indent) {
  return `${indent}${nodeId(item.slug)}${label(titleOf(item))}`;
}

/** The provenance block as Mermaid comment lines. */
function headerOf(header) {
  return header.map((line) => `%% ${line}`);
}

/** Join lines with LF and end with exactly one LF. */
function text(lines) {
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

/**
 * `items/<slug>.mmd`: the item and its direct typed links, both directions.
 *
 * @returns {string}
 */
function itemDiagram(item, edges, published, header) {
  const slug = String(item.slug);
  const touching = edges.filter((e) => e.source === slug || e.target === slug);
  const slugs = new Set([slug]);
  for (const e of touching) { slugs.add(e.source); slugs.add(e.target); }
  const nodes = [...slugs].sort(compareCodePoint).map((s) => published.get(s));
  return text([...headerOf(header), `%% item: ${slug}`, 'flowchart LR',
    ...nodes.map((n) => nodeLine(n, '  ')),
    ...touching.map((e) => edgeLine(e, '  '))]);
}

/**
 * `clusters/<slug>.mmd`: the cluster's published members and the Links among them.
 *
 * @returns {string}
 */
function clusterDiagram(cluster, items, edges, header) {
  const slug = String(cluster.slug);
  const members = items.filter((i) => i.type !== 'cluster'
    && Array.isArray(i.clusters) && i.clusters.map(String).includes(slug));
  const inside = new Set(members.map((m) => String(m.slug)));
  return text([...headerOf(header), `%% cluster: ${slug}`, 'flowchart LR',
    `  subgraph ${subgraphId(slug)} ${label(titleOf(cluster))}`,
    ...members.map((m) => nodeLine(m, '    ')),
    '  end',
    ...edges.filter((e) => inside.has(e.source) && inside.has(e.target)).map((e) => edgeLine(e, '  '))]);
}

/**
 * The adapter entry point every `export --to <adapter>` module exposes.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(text:string)=>string, specVersion:string,
 *   bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const config = (bundle && bundle.config) || {};
  const site = config.site || {};
  const base = `${String(site.base || '').replace(/\/+$/u, '')}/`;
  const license = (config.bundle && config.bundle.license_prose) || chunks.TERMS;
  const header = provenanceLines({
    bundle: base,
    bundleVersion: options.bundleVersion,
    generatedAt: options.instant,
    license,
    specVersion: options.specVersion,
    terms: chunks.termsFor(license),
  });
  const items = ((bundle && bundle.items) || [])
    .filter((item) => item && item.frontmatter)
    .map((item) => ({ ...item.frontmatter, path: item.path, slug: item.slug, type: item.type }))
    .filter((item) => chunks.isPublished(item, config.releases))
    .sort((a, b) => compareCodePoint(String(a.slug), String(b.slug)));
  const published = new Map(items.map((item) => [String(item.slug), item]));
  const edges = edgesOf(items, published);
  const texts = [
    ...items.filter((i) => i.type === 'cluster')
      .map((c) => [`clusters/${c.slug}.mmd`, clusterDiagram(c, items, edges, header)]),
    ...items.map((i) => [`items/${i.slug}.mmd`, itemDiagram(i, edges, published, header)]),
  ].sort((a, b) => compareCodePoint(a[0], b[0]));
  return {
    files: texts.map(([path, body]) => ({ path, sha256: options.sha256(body), text: body })),
    findings: [],
  };
}

module.exports = {
  CLAIMED_KEYS, ENTITY, FORMAT, READS,
  clusterDiagram, edgesOf, itemDiagram, label, nodeId, run, subgraphId,
};
