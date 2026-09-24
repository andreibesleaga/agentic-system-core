'use strict';
/**
 * CONTEXT Distribution (Emission) — the front page `/` and the footer's peer links.
 *
 * Pure: no fs, no clock, no network. `schemaOrg` and `textBytes` are the writer's own
 * helpers, passed in so that there is one implementation of each.
 */

const { compareCodePoint } = require('../knowledge/unicode.js');
const discovery = require('./discovery.js');
const html = require('./html.js');
const { TYPE_PLURAL } = require('../knowledge/chunks.js');

/**
 * `/`: the Bundle's own introduction (the body of `content/index.md`) and a short
 * Browse block linking each non-empty type index with its count, then Search and Now.
 * It lists no item: the index pages do (owner, 2026-09-24).
 */
function frontPage({ base, bundle, indexFrontmatter, items, pageOptions, render, schemaOrg, site, textBytes }) {
  const title = site.title == null ? indexFrontmatter.title : site.title;
  const introHtml = bundle.index && typeof bundle.index.body === 'string' && bundle.index.body.trim() !== ''
    ? render(textBytes(bundle.index.body)).html : '';
  const count = (type) => items.filter((i) => i.type === type).length;
  const sections = [
    ...Object.entries(TYPE_PLURAL).filter(([type]) => count(type) > 0)
      .sort((a, b) => compareCodePoint(a[1], b[1]))
      .map(([type, plural]) => ({ href: `/${plural}/`, title: plural.charAt(0).toUpperCase() + plural.slice(1), count: count(type) })),
    { href: '/search/', title: 'Search' },
    { href: '/now/', title: 'Now' },
  ];
  const jsonld = schemaOrg({
    '@context': 'https://schema.org', '@type': 'Dataset',
    description: indexFrontmatter.description == null ? '' : indexFrontmatter.description,
    name: title == null ? '' : title, url: discovery.href(base, '/'),
  });
  return html.homePage({ description: indexFrontmatter.description, introHtml, sections, title },
    { ...pageOptions, jsonld, route: '/' });
}

/**
 * The declared peers as `{href, label}`: the root of each peer's origin, named by its
 * host. A value that is not an https URL is skipped (the schema already requires it).
 *
 * @param {Array<string>} [peers] `config.peers`, discovery-document URLs.
 * @returns {Array<{href:string,label:string}>}
 */
function peerSites(peers) {
  const out = [];
  for (const value of Array.isArray(peers) ? peers : []) {
    let url;
    try { url = new URL(String(value)); } catch { continue; }
    if (url.protocol !== 'https:') continue;
    out.push({ href: `${url.origin}/`, label: url.host });
  }
  return out;
}

module.exports = { frontPage, peerSites };
