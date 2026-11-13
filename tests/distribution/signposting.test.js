'use strict';
// Requirement: PRD-079 (docs/PRD.md).
// tests/distribution/signposting.test.js — AGSC-06-40: the FAIR Signposting links of the home
// page, in the one `Link` field of the `_headers` block of `/` (AGSC-06-17).
//
//   * The field is read back with an independent RFC 8288 parser (`http-link-header` 1.1.4).
//   * A restricted node sends no `item`; a node without a home page (Level 0) keeps the one
//     `describedby` value of 1.0; `cite-as` is the first `related[]` cite-as in `href` order.
//   * A configured URL cannot end the value early.
//   * fast-check: the field does not depend on the order of `related[]` or of the routes.
//
// Deterministic: no clock, no network, fixed seed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const LinkHeader = require('http-link-header');

const headers = require('../../src/distribution/headers.js');
const visibility = require('../../src/boundary/visibility.js');

const ROUTES = ['/index.html', '/graph.jsonld', '/graph.nq', '/graph.ttl', '/chunks.jsonl'];
const base = { site: { base: 'https://a.example/' } };
const parsed = (config, routes = ROUTES) => LinkHeader.parse(headers.homeLinkField(config, routes)).refs
  .map((r) => `${r.rel} ${r.uri}`).sort();

test('AGSC-06-40: a restricted node sends cite-as, type, describedby, linkset and license, and no item', () => {
  const links = parsed({ ...base, bundle: { license_url: 'https://l.example/1.0/' }, visibility: 'restricted' });
  assert.ok(!links.some((l) => l.startsWith('item ')), links.join('\n'));
  assert.deepEqual(links.map((l) => l.split(' ')[0]).filter((v, i, a) => a.indexOf(v) === i),
    ['cite-as', 'describedby', 'license', 'linkset', 'type']);
});

test('AGSC-06-40: no home page, no Signposting: the field is the 1.0 describedby value alone', () => {
  assert.equal(headers.homeLinkField(base, ['/graph.jsonld', '/llms.txt']), visibility.DESCRIBEDBY_LINK_HEADER);
  assert.equal(headers.homeLinkField({}, []), visibility.DESCRIBEDBY_LINK_HEADER);
});

test('AGSC-06-40 with AGSC-06-35: cite-as is the first related cite-as by href, else the Bundle IRI', () => {
  const related = [
    { href: 'https://doi.org/10.5281/zenodo.9', rel: 'cite-as', type: 'text/html' },
    { href: 'https://doi.org/10.5281/zenodo.1', rel: 'cite-as', type: 'text/html' },
  ];
  assert.ok(parsed({ ...base, related }).includes('cite-as https://doi.org/10.5281/zenodo.1'));
  assert.ok(parsed(base).includes('cite-as https://a.example/'));
});

test('a configured URL holding <, > or " is percent-encoded and cannot end the link value', () => {
  const field = headers.homeLinkField({ ...base, bundle: { license_url: 'https://l.example/a>b"c<d' } }, ROUTES);
  assert.ok(field.includes('<https://l.example/a%3Eb%22c%3Cd>; rel="license"'), field);
  assert.equal(LinkHeader.parse(field).refs.length, 10);
});

test('property: the Link field does not depend on the order of related[] or of the routes', () => {
  const doi = fc.integer({ min: 1, max: 99 }).map((n) => ({ href: `https://doi.org/10.5281/zenodo.${n}`, rel: 'cite-as', type: 'text/html' }));
  fc.assert(fc.property(fc.uniqueArray(doi, { selector: (d) => d.href, maxLength: 4 }), fc.shuffledSubarray(ROUTES), (related, routes) => {
    const config = { ...base, related };
    const once = headers.homeLinkField(config, ['/index.html', ...routes]);
    assert.equal(headers.homeLinkField({ ...base, related: [...related].reverse() }, ['/index.html', ...[...routes].reverse()]), once);
  }), { numRuns: 60, seed: 20261107 });
});
