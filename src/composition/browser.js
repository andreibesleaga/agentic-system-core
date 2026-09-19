'use strict';
/**
 * CONTEXT Composition — the browser host of AGSC-07-13.
 *
 * "The algorithm MUST be identical in every host: Harness output computed in a
 * browser MUST be byte-identical to the equivalent CLI invocation" (AGSC-07-13).
 * The only way to hold that without a proof that decays is to run ONE
 * implementation in both hosts, so this module emits, as the page's script, the
 * OWN SOURCE TEXT of the functions Node executes — `Function.prototype.toString()`
 * returns a function's source text, so nothing is transcribed, nothing is
 * transpiled, and there is no bundler and no build step (D49/M8-T19).
 *
 * That is why `composition/compose.js` and `composition/harness.js` declare their
 * algebra as self-contained top-level functions whose constants are functions:
 * a function that closed over a module-scope `const` would be emitted with a free
 * variable that is undefined in the page. `tests/arch/composition-portable.test.js`
 * enforces the contract; `tests/composition/browser.test.js` runs the emitted
 * bundle under `node:vm` and compares its bytes with this process's.
 *
 * The bundle is a CLASSIC script that installs `globalThis.AGSC_CORE`, not an ES
 * module: a classic script is what `script-src 'self'` (AGSC-06-17) admits with no
 * module graph, no CORS preflight and no `import` resolution, and it is what can be
 * evaluated under `node:vm` without `--experimental-vm-modules` — which is the
 * gate that proves AGSC-07-13 on every run of the suite.
 *
 * PURE: no fs, no clock, no network. The emitted script itself performs no network
 * call, holds no key and needs no server (AGSC-07-01, AGSC-09-16).
 */

const compose = require('./compose.js');
const harness = require('./harness.js');

/**
 * AGSC-05-16 and the §3.1 table, read backwards: the RDF property a Link key is
 * exported as, so that a page can recover the authored keys from the published
 * `graph.jsonld` and needs no second surface. Every entry is a row of that table;
 * the two port keys are AGSC-05-30's datatype properties.
 */
function graphPredicates() {
  return {
    'asc:blockedBy': 'blocked-by',
    'asc:contradicts': 'contradicts',
    'asc:covers': 'covers',
    'asc:decidedBy': 'decided-by',
    'asc:excludes': 'excludes',
    'asc:implements': 'implements',
    'asc:uses': 'uses',
    'asc:verifies': 'verifies',
    'dcterms:replaces': 'supersedes',
    'dcterms:requires': 'requires',
    'prov:wasDerivedFrom': 'derived-from',
    'skos:broader': 'broader',
    'skos:narrower': 'narrower',
    'skos:related': 'related',
  };
}

/** AGSC-05-12/05-13: the `asc:` class of a node, read back as the item `type`. */
function graphTypes() {
  return {
    'asc:Cluster': 'cluster',
    'asc:Concept': 'concept',
    'asc:Episode': 'episode',
    'asc:Gate': 'gate',
    'asc:Lesson': 'lesson',
    'asc:Procedure': 'procedure',
  };
}

/** The slug of an item IRI: the last non-empty path segment of `…/<plural>/<slug>/`. */
function slugOfIri(iri) {
  const parts = String(iri == null ? '' : iri).split('#')[0].split('?')[0].split('/');
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.length === 0 ? '' : parts[parts.length - 1];
}

/** Every value of a JSON-LD property, as a flat array of plain values. */
function graphValues(node, name) {
  const raw = node[name];
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const entry of list) {
    if (entry === null) continue;
    if (typeof entry === 'object') {
      if (typeof entry['@id'] === 'string') out.push(entry['@id']);
      else if (entry['@value'] !== undefined) out.push(entry['@value']);
      continue;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Recover the item records the algebra reads from a published `graph.jsonld`
 * (AGSC-05, a route of AGSC-06-01), so that the page needs exactly one fetch and
 * no route the closed route set does not already carry. A node whose `@type` is
 * not one of the six item classes — the Bundle, a Source, a Review, an Attachment
 * — contributes nothing.
 *
 * `body` is deliberately absent: `graph.jsonld` carries no item body, and the page
 * fetches `/pages/<slug>.md` (AGSC-06-02) for the members that need one.
 */
function itemsFromGraph(graph) {
  const predicates = graphPredicates();
  const types = graphTypes();
  const nodes = (graph && (graph['@graph'] || graph.graph)) || [];
  const out = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node === null || typeof node !== 'object') continue;
    const classes = graphValues(node, '@type');
    let type = '';
    for (const name of classes) if (types[name] !== undefined) type = types[name];
    if (type === '') continue;
    const item = {
      description: graphValues(node, 'skos:definition')[0],
      iri: node['@id'],
      slug: slugOfIri(node['@id']),
      title: graphValues(node, 'skos:prefLabel')[0],
      type,
    };
    if (item.slug === '') continue;
    for (const property of Object.keys(predicates)) {
      const targets = graphValues(node, property).map(slugOfIri).filter((s) => s !== '');
      if (targets.length > 0) item[predicates[property]] = targets;
    }
    for (const port of ['consumes', 'produces']) {
      const names = graphValues(node, `asc:${port}`).filter((v) => typeof v === 'string');
      if (names.length > 0) item[port] = names;
    }
    // A cluster's members are `skos:member` on the CLUSTER, so the facet the page
    // filters by is recovered from the cluster node, not from the item.
    const memberSlugs = graphValues(node, 'skos:member').map(slugOfIri).filter((s) => s !== '');
    if (memberSlugs.length > 0) item.members = memberSlugs;
    out.push(item);
  }
  return out.sort((a, b) => compose.compareCodePoint(a.slug, b.slug));
}

/** The page-support functions the bundle carries beside the algebra. */
const PAGE_SUPPORT = Object.freeze(['graphPredicates', 'graphTypes', 'slugOfIri',
  'graphValues', 'itemsFromGraph']);

const SUPPORT = Object.freeze({
  graphPredicates, graphTypes, slugOfIri, graphValues, itemsFromGraph,
});

/** Every name the bundle installs on `globalThis.AGSC_CORE`, in emission order. */
function exportedNames() {
  return [...compose.PORTABLE, ...harness.PORTABLE, ...PAGE_SUPPORT];
}

/**
 * The bundle text.
 *
 * @param {object} [options]
 * @param {string} [options.specVersion] recorded in the banner comment only.
 * @returns {string} a classic script, LF-terminated, ending in exactly one LF.
 */
function bundle(options) {
  const opts = options || {};
  const parts = ['\'use strict\';',
    '// AgenticSystemCore composition algebra (AGSC-07-01, AGSC-07-13). GENERATED —',
    '// every function below is the SOURCE TEXT of the function the CLI runs, so the',
    '// two hosts cannot drift. No network, no key, no server.',
    `// spec_version: ${opts.specVersion === undefined ? 'unset' : opts.specVersion}`,
    '(function () {'];
  for (const name of compose.PORTABLE) parts.push(String(compose[name]));
  for (const name of harness.PORTABLE) parts.push(String(harness[name]));
  for (const name of PAGE_SUPPORT) parts.push(String(SUPPORT[name]));
  const map = exportedNames().map((name) => `    ${name}: ${name}`).join(',\n');
  parts.push('  globalThis.AGSC_CORE = {', `${map}`, '  };', '}());');
  return `${parts.join('\n')}\n`;
}

module.exports = {
  PAGE_SUPPORT,
  bundle,
  exportedNames,
  graphPredicates,
  graphTypes,
  graphValues,
  itemsFromGraph,
  slugOfIri,
};
