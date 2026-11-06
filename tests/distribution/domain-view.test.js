'use strict';
// verifies AGSC-06-38
// The domain parts of item pages (`src/distribution/domain-view.js`) beyond build-0031: each
// label (the vocabulary's class label, else the local name; the context cluster's title, linked
// when it is published, else its slug; the role in words; the warrant's kind and source, linked
// only when it is an address), the two columns only where a row's item has a type or a context,
// the definition list on a page with no relation, escaping, a node without the layer unchanged,
// and which page scripts carry the domain parts. Pure: no build, no file, no network.

const test = require('node:test');
const assert = require('node:assert/strict');

const domainView = require('../../src/distribution/domain-view.js');
const graphView = require('../../src/distribution/graph-view.js');
const domain = require('../../src/knowledge/domain.js');

const NS = 'https://n.example/ns/domain#';
const VOCABULARY = ['@prefix asc: <https://w3id.org/agentic-system-core/ns#> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
  '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', '',
  '<https://n.example/ns/domain> a owl:Ontology ; rdfs:label "Domain" .', 'asc:Concept a owl:Class .',
  `<${NS}Engine> a owl:Class ; rdfs:subClassOf asc:Concept ; rdfs:label "Aircraft <engine>" .`, ''].join('\n');
const CONFIG = { domain: { contexts: [{ cluster: 'propulsion', namespace: 'https://n.example/ns/propulsion#' }], vocabulary: 'v.ttl' } };
const routeOf = (item) => `/${item.type === 'cluster' ? 'clusters' : 'concepts'}/${item.slug}/`;

/** The relations section of `slug`'s page on a node with `items`, with or without the layer. */
function sectionOf(items, slug, used = true) {
  const bundle = used ? { domain: { vocabulary: VOCABULARY } } : {};
  const model = used ? domain.load(VOCABULARY, { contexts: CONFIG.domain.contexts }) : null;
  const view = domainView.pages({ bundle, config: used ? CONFIG : {}, items, model, routeOf });
  return view.itemSection(items.find((i) => i.slug === slug)).html;
}

const ENGINE = { domain_role: 'aggregate-root', domain_type: 'Engine', slug: 'engine', title: 'Engine', type: 'concept',
  warrant: { source: 'https://example.org/handbook?a=1&b=2', type: 'literary' } };

test('the definition list labels each part, links what has a page, and escapes every text', () => {
  const items = [ENGINE, { domain_context: 'unpublished', domain_type: 'Pump', slug: 'pump', title: 'Pump', type: 'concept' }];
  const html = sectionOf(items, 'engine');
  assert.match(html, /<dl class="meta domain">\n<dt>Domain type<\/dt><dd>Aircraft &lt;engine&gt;<\/dd>\n<dt>Domain role<\/dt><dd>aggregate root<\/dd>\n/u);
  assert.match(html, /<dt>Warrant<\/dt><dd>literary: <a href="https:\/\/example\.org\/handbook\?a=1&amp;b=2">https:\/\/example\.org\/handbook\?a=1&amp;b=2<\/a><\/dd>/u);
  // The engine has no relation, so the list stands where the relations section would be.
  assert.ok(html.startsWith('<dl class="meta domain">'));
  // A type the vocabulary does not define is shown as written; an unpublished context by its slug.
  const pump = sectionOf(items, 'pump');
  assert.match(pump, /<dt>Domain type<\/dt><dd>Pump<\/dd>\n<dt>Domain context<\/dt><dd>unpublished<\/dd>/u);
});

test('the two columns appear only where a row\'s item has a domain type or a context, with that item\'s labels', () => {
  const cluster = { slug: 'propulsion', title: 'Propulsion & Co', type: 'cluster' };
  const typed = [{ ...ENGINE, requires: ['pump'] }, { clusters: ['propulsion'], domain_role: 'entity', slug: 'pump', title: 'Pump', type: 'concept' }, cluster];
  const html = sectionOf(typed, 'engine');
  assert.match(html, /<th scope="col">Domain type<\/th><th scope="col">Domain context<\/th>/u);
  assert.match(html, /<td>requires<\/td><td>outgoing<\/td><td><a href="\/concepts\/pump\/">Pump<\/a><\/td><td>[^<]*<\/td><td><\/td><td><a href="\/clusters\/propulsion\/">Propulsion &amp; Co<\/a><\/td>/u);
  // The list goes right under the table.
  assert.ok(html.indexOf('</table></div>\n<dl class="meta domain">') > 0);
  const plain = [{ ...ENGINE, requires: ['note'] }, { slug: 'note', title: 'Note', type: 'concept' }];
  assert.doesNotMatch(sectionOf(plain, 'engine'), /Domain type<\/th>/u);
  assert.doesNotMatch(sectionOf(plain, 'note'), /<dl class="meta domain">/u);
});

test('a node without a site vocabulary shows no domain part, whatever its items state', () => {
  const items = [{ ...ENGINE, requires: ['pump'] }, { domain_type: 'Engine', slug: 'pump', title: 'Pump', type: 'concept' }];
  const views = graphView.index(items, routeOf);
  assert.equal(sectionOf(items, 'engine', false), graphView.itemSection(items[0], views).html);
  assert.equal(sectionOf(items, 'engine', false).includes('Domain'), false);
});

test('the role words are the five roles of AGSC-02-25', () => {
  assert.deepEqual(Object.keys(domainView.ROLE_WORDS).sort(), ['aggregate-root', 'domain-event', 'entity', 'policy', 'value-object']);
  const html = sectionOf([{ domain_role: 'saga', slug: 'a', title: 'A', type: 'concept' }], 'a');
  assert.match(html, /<dt>Domain role<\/dt><dd>saga<\/dd>/u);
});

test('the page scripts carry the domain parts only when a listed item states a domain key', () => {
  assert.equal(domainView.scripts([{ slug: 'a' }], CONFIG), undefined);
  assert.deepEqual(domainView.scripts([{ slug: 'a' }, { slug: 'b', warrant: { source: 's', type: 'user' } }], CONFIG), { contexts: ['propulsion'] });
  assert.deepEqual(domainView.scripts([{ domain_role: 'policy', slug: 'a' }], {}), { contexts: [] });
});
