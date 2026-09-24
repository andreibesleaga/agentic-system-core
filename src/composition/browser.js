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
 * transpiled, and there is no bundler and no build step.
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
const archive = require('./archive.js');

/**
 * Destructured deliberately. A page-support function may reference only names the
 * bundle itself emits, and `compareCodePoint` is one of `compose.PORTABLE`; writing
 * `compose.compareCodePoint(…)` instead would emit a function that reads a
 * `compose` object no page holds — the defect `tests/arch/composition-portable.test.js`
 * now checks for over PAGE_SUPPORT as well as over the two algebras.
 */
const { compareCodePoint } = compose;

/**
 * AGSC-05-16 and the §3.1 table, read backwards: the RDF property a Link key is
 * exported as, so that a page can recover the authored keys from the published
 * `graph.jsonld` and needs no second surface. Every entry is a row of that table;
 * the two port keys are AGSC-05-30's datatype properties.
 *
 * The keys are LOCAL NAMES, not compact IRIs, because one graph document may spell
 * the same property three ways and a reader has to answer to all three: a full IRI
 * (`https://w3id.org/agentic-system-core/ns#uses` — what `graph.jsonld` actually
 * carries for an `asc:` term, since its `@context` is the remote
 * `/ns/context.jsonld` and nothing local expands it), a compact IRI (`asc:uses`,
 * after a consumer has applied that context) and a bare term (`prefLabel`, which the
 * context maps directly). `localOf` reduces all three to one name.
 *
 * The INVERSE properties of AGSC-05-17 (`asc:usedBy` and its siblings) are
 * deliberately absent: they are derived, and an authored key is what the algebra
 * reads (AGSC-03-02).
 */
function graphPredicates() {
  return {
    blockedBy: 'blocked-by',
    broader: 'broader',
    contradicts: 'contradicts',
    covers: 'covers',
    decidedBy: 'decided-by',
    excludes: 'excludes',
    implements: 'implements',
    narrower: 'narrower',
    related: 'related',
    replaces: 'supersedes',
    requires: 'requires',
    uses: 'uses',
    verifies: 'verifies',
    wasDerivedFrom: 'derived-from',
  };
}

/** AGSC-05-12/05-13: the `asc:` class of a node, read back as the item `type`. */
function graphTypes() {
  return {
    Cluster: 'cluster',
    Concept: 'concept',
    Episode: 'episode',
    Gate: 'gate',
    Lesson: 'lesson',
    Procedure: 'procedure',
  };
}

/**
 * The local name of a JSON-LD term: what follows the last `#`, `/` or `:`. A JSON-LD
 * keyword (`@id`, `@type`) is returned unchanged, because a keyword is not a term.
 *
 * This is the one place the three spellings of a property meet, so a change of
 * `@context` — which AGSC-05-06 permits and AGSC-06-32 points at a served file —
 * cannot stop the page reading the graph.
 */
function localOf(name) {
  const raw = String(name == null ? '' : name);
  if (raw.charAt(0) === '@') return raw;
  let cut = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charAt(i);
    if (ch === '#' || ch === '/' || ch === ':') cut = i;
  }
  return cut === -1 ? raw : raw.slice(cut + 1);
}

/**
 * Every value a node carries under a property whose LOCAL NAME is `local`, whatever
 * that node spells the property as. Several spellings of one property in one node
 * contribute together, in the node's own key order, so nothing is silently dropped.
 */
function nodeValues(node, local) {
  const out = [];
  if (node === null || typeof node !== 'object') return out;
  for (const key of Object.keys(node)) {
    if (localOf(key) !== local) continue;
    for (const value of graphValues(node, key)) out.push(value);
  }
  return out;
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
    const classes = nodeValues(node, '@type');
    let type = '';
    for (const name of classes) {
      const local = types[localOf(name)];
      if (local !== undefined) type = local;
    }
    if (type === '') continue;
    const item = {
      description: nodeValues(node, 'definition')[0],
      iri: node['@id'],
      slug: slugOfIri(node['@id']),
      title: nodeValues(node, 'prefLabel')[0],
      type,
    };
    if (item.slug === '') continue;
    for (const local of Object.keys(predicates)) {
      const targets = nodeValues(node, local).map(slugOfIri).filter((s) => s !== '');
      if (targets.length > 0) item[predicates[local]] = targets;
    }
    for (const port of ['consumes', 'produces']) {
      const names = nodeValues(node, port).filter((v) => typeof v === 'string');
      if (names.length > 0) item[port] = names;
    }
    // A cluster's members are `skos:member` on the CLUSTER, so the facet the page
    // filters by is recovered from the cluster node, not from the item.
    const memberSlugs = nodeValues(node, 'member').map(slugOfIri).filter((s) => s !== '');
    if (memberSlugs.length > 0) item.members = memberSlugs;
    out.push(item);
  }
  return out.sort((a, b) => compareCodePoint(a.slug, b.slug));
}

/** The page-support functions the bundle carries beside the algebra. */
const PAGE_SUPPORT = Object.freeze(['graphPredicates', 'graphTypes', 'localOf', 'slugOfIri',
  'graphValues', 'nodeValues', 'itemsFromGraph']);

const SUPPORT = Object.freeze({
  graphPredicates, graphTypes, localOf, slugOfIri, graphValues, nodeValues, itemsFromGraph,
});

/**
 * Every name the bundle installs on `globalThis.AGSC_CORE`, in emission order.
 *
 * `composition/archive.js` joins the two algebras here for the same reason they are
 * here:'s "download all (.zip)" link must produce the bytes `agsc compose --zip`
 * produces, and the only way to hold that is to run one implementation in both hosts
 * (AGSC-07-13). The archive is emitted AFTER the Harness algebra because it packages
 * that algebra's result, and it reads `compareCodePoint`, which `compose.PORTABLE`
 * has already declared above it.
 */
function exportedNames() {
  return [...compose.PORTABLE, ...harness.PORTABLE, ...archive.PORTABLE, ...PAGE_SUPPORT];
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
    '// SPDX-License-Identifier: Apache-2.0 (the engine\'s code; the prose it carries keeps its own terms)',
    '// AgenticSystemCore composition algebra (AGSC-07-01, AGSC-07-13). GENERATED —',
    '// every function below is the SOURCE TEXT of the function the CLI runs, so the',
    '// two hosts cannot drift. No network, no key, no server.',
    `// spec_version: ${opts.specVersion === undefined ? 'unset' : opts.specVersion}`,
    '(function () {'];
  for (const name of compose.PORTABLE) parts.push(String(compose[name]));
  for (const name of harness.PORTABLE) parts.push(String(harness[name]));
  for (const name of archive.PORTABLE) parts.push(String(archive[name]));
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
  localOf,
  nodeValues,
  slugOfIri,
};
