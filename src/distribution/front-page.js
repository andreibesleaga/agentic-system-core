'use strict';
/**
 * CONTEXT Distribution (Emission) — the front page `/`, its Dataset block and the footer's peer
 * links.
 *
 * Implements AGSC-06-19 (the Schema.org `Dataset` of the home page) and AGSC-06-41 (from 1.1 the
 * block also carries `license`, `creator`, `isAccessibleForFree` and one `DataDownload` per
 * machine file the node serves, and names the PROV-O vocabulary for `prov:generatedAtTime` and
 * `prov:wasAttributedTo`, which appear in this block and nowhere else; decision D-4). The block
 * is plain data written by the engine's one JCS writer (`schemaOrg`); the test of this module
 * expands it with the pinned `jsonld` library against the official schema.org context and finds
 * no member lost. A description shorter than 50 characters, which Google's dataset search
 * ignores, is the warning AGSC-E202.
 *
 * Pure: no fs, no clock, no network. `schemaOrg` and `textBytes` are the writer's own
 * helpers, passed in so that there is one implementation of each.
 */

const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const discovery = require('./discovery.js');
const html = require('./html.js');
const { TYPE_PLURAL, licenseUrl } = require('../knowledge/chunks.js');
const { peerUrl } = require('../knowledge/contexts.js');

/** AGSC-06-41: the PROV-O namespace (W3C Recommendation, 30 April 2013), prefix `prov`. */
const PROV = 'http://www.w3.org/ns/prov#';
const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime';
/** AGSC-06-41: the machine files a `DataDownload` names, in order, with the type each is served with. */
const DOWNLOADS = Object.freeze([
  ['/graph.jsonld', 'application/ld+json'],
  ['/graph.ttl', 'text/turtle'],
  ['/graph.nq', 'application/n-quads'],
  ['/chunks.jsonl', 'application/jsonl'],
  [discovery.WELLKNOWN_PATH, discovery.MEDIA_TYPE],
]);
/** AGSC-06-41: Google's dataset guide ignores a shorter description. */
const MIN_DESCRIPTION = 50;

/**
 * AGSC-06-41: the creator, a `Person` with a `name` and, where an ORCID iD is configured, a
 * `sameAs` naming it — from `bundle.creator` (name, OPTIONAL orcid), else from `site.author` with
 * `site.author_orcid` (AGSC-01-18); null when neither is configured.
 */
function creatorOf(config) {
  const bundle = (config && config.bundle) || {};
  const site = (config && config.site) || {};
  const named = bundle.creator && typeof bundle.creator.name === 'string'
    ? { name: bundle.creator.name, orcid: bundle.creator.orcid }
    : (typeof site.author === 'string' && site.author !== '' ? { name: site.author, orcid: site.author_orcid } : null);
  if (named === null) return null;
  const person = { '@type': 'Person', name: named.name };
  if (typeof named.orcid === 'string' && named.orcid !== '') person.sameAs = `https://orcid.org/${named.orcid}`;
  return person;
}

/**
 * AGSC-06-19 with AGSC-06-41: the `Dataset` block of the home page, as data.
 *
 * @param {{config:object, description?:string, hasLegal?:boolean, instant:string, name?:string,
 *   served: Iterable<string>|{has(route:string):boolean}}} input `served`: the routes the build
 *   emits; `hasLegal`: it emits `/legal/` (AGSC-06-44).
 * @returns {object}
 */
function datasetBlock(input) {
  const config = input.config || {};
  const base = ((config.site || {}).base) || '';
  const served = typeof (input.served && input.served.has) === 'function' ? input.served : new Set(input.served || []);
  const restricted = config.visibility === 'restricted';
  const block = {
    '@context': ['https://schema.org', { prov: PROV }], '@type': 'Dataset',
    description: input.description == null ? '' : input.description, name: input.name == null ? '' : input.name,
    'prov:generatedAtTime': { '@type': XSD_DATE_TIME, '@value': String(input.instant) },
    url: discovery.href(base, '/'),
  };
  const license = licenseUrl(config, { legal: input.hasLegal === true });
  if (license !== null) block.license = license;
  const creator = creatorOf(config);
  if (creator !== null) Object.assign(block, { creator, 'prov:wasAttributedTo': { ...creator } });
  // AGSC-06-41: the files of a `restricted` node are gated, so it names none and claims no free access.
  if (!restricted) {
    block.isAccessibleForFree = true;
    const downloads = DOWNLOADS.filter(([route]) => served.has(route))
      .map(([route, type]) => ({ '@type': 'DataDownload', contentUrl: discovery.href(base, route), encodingFormat: type }));
    if (downloads.length > 0) block.distribution = downloads;
  }
  return block;
}

/** AGSC-06-41: the warning for a description Google's dataset search ignores. */
function datasetFindings(description) {
  const length = [...String(description == null ? '' : description)].length;
  if (length >= MIN_DESCRIPTION) return [];
  return [finding('AGSC-E202', `the description of content/index.md has ${length} characters; dataset search ignores one`
    + ` shorter than ${MIN_DESCRIPTION}, so the Dataset block of / is written but not shown (AGSC-06-41)`,
  { file: 'content/index.md', severity: 'warn' })];
}

/**
 * `/`: the Bundle's own introduction (the body of `content/index.md`) and a short
 * Browse block linking each non-empty type index with its count, then Search and Now.
 * It lists no item: the index pages do.
 */
function frontPage({ bundle, hasLegal, indexFrontmatter, instant, items, pageOptions, render, schemaOrg, served, site, textBytes }) {
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
  const jsonld = schemaOrg(datasetBlock({
    config: bundle.config || {}, description: indexFrontmatter.description, hasLegal, instant, name: title, served,
  }));
  return {
    // With no root document the build already fails on it (AGSC-E901); a warning about the
    // length of its description would be about a file that is not there.
    findings: bundle.index ? datasetFindings(indexFrontmatter.description) : [],
    html: html.homePage({ description: indexFrontmatter.description, introHtml, sections, title },
      { ...pageOptions, jsonld, route: '/' }),
  };
}

/**
 * The declared peers as `{href, label}`: the root of each peer's origin, named by its
 * host. A value that is not an https URL is skipped (the schema already requires it). A
 * typed peer (AGSC-11-24) is named by its `url`, as the plain form is.
 *
 * @param {Array<string|object>} [peers] `config.peers`, discovery-document URLs or typed peers.
 * @returns {Array<{href:string,label:string}>}
 */
function peerSites(peers) {
  const out = [];
  for (const value of Array.isArray(peers) ? peers : []) {
    let url;
    try { url = new URL(peerUrl(value)); } catch { continue; }
    if (url.protocol !== 'https:') continue;
    out.push({ href: `${url.origin}/`, label: url.host });
  }
  return out;
}

module.exports = { creatorOf, datasetBlock, datasetFindings, frontPage, peerSites };
