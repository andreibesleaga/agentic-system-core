'use strict';
// CONTEXT Distribution (Emission) — Surface: the well-known files of a build, in the order each
// one needs the one before it.
// Implements AGSC-06-34 (the A2A agent card, only for a node that declares both the `a2a-card`
// and a `responder` surface; AGSC-06-07: a card without an endpoint is AGSC-E210), AGSC-06-07 /
// AGSC-06-08 with AGSC-11-16 (the one discovery document and the surfaces it declares, derived
// from what the writer emits; the declaration-only surfaces from `surfaces[]`) and AGSC-06-42
// (the two opt-in catalogue files, whose entries carry the SHA-256 of the card's and the
// document's bytes); the facts of AGSC-06-44 that the document states about the chunk lines and
// the ledger are handed to `discovery.linkset` from here.
//
// Why one module: the catalogue entries digest the exact bytes of the card and of the discovery
// document, and the document declares the card's route, so the three are written here in that
// order and `site.js` puts what this returns. The card module loads the official A2A SDK, so it
// is required only by a node that declares a card.
//
// Pure function of its input; `site.js` writes the bytes.

const { canonicalize } = require('../knowledge/jcs.js');
const surfaces = require('../boundary/surfaces.js');
const { withoutTrailingSlashes } = require('../shared/trailing.js');
const aiCatalog = require('./ai-catalog.js');
const discovery = require('./discovery.js');

/**
 * AGSC-11-16 / AGSC-11-19: the surfaces this build DECLARES, derived from what the
 * writer actually emits, through the Boundary context's `declare()` and through no
 * second list.
 *
 * `boundary/surfaces.js` is the module that knows every built-in surface, its route,
 * its access class and its version. A declaration assembled by hand from a few
 * emitted files plus `config.surfaces[]` could EMIT a surface (the page-tool surface
 * at `/compose/`, for instance) and never DECLARE it, which is exactly the condition
 * AGSC-11-19 tells the validator to warn about (AGSC-E211). One path, so a surface
 * cannot be served and forgotten.
 *
 * `webmcpVersion` is an OPTION, not a configuration key: `config.schema.json` closes
 * `surfaces[]` against the built-in surfaces, so a node states the WebMCP Draft
 * Community Group Report date it targets in code. The default is
 * `surfaces.WEBMCP_SURFACE_VERSION`; AGSC-11-16 conforms any
 * `YYYY-MM-DD` date and pins none.
 *
 * @param {{base:string, config:object, emitted:Array<string>, mcpServed?:boolean,
 *   webmcpVersion?:string}} options
 * @returns {Array<object>} `{surface, target, version, access}`, discovery's shape.
 */
function declaredSurfaces(options) {
  const config = options.config || {};
  const declared = surfaces.declare({
    base: `${withoutTrailingSlashes(String(options.base))}/`,
    emitted: options.emitted || [],
    mcpServed: options.mcpServed === true,
    surfaces: Array.isArray(config.surfaces) ? config.surfaces : [],
    visibility: config.visibility,
    webmcpVersion: options.webmcpVersion,
  });
  return declared.map((link) => {
    const entry = { surface: link['agsc-surface'][0], target: link.href };
    if (link['agsc-surface-version'] !== undefined) [entry.version] = link['agsc-surface-version'];
    if (link['agsc-access'] !== undefined) [entry.access] = link['agsc-access'];
    return entry;
  });
}

/**
 * AGSC-06-34: the agent card's bytes and its findings. The card module, and with it the A2A SDK,
 * is loaded only when `surfaces[]` declares an `a2a-card`.
 */
function agentCard(input) {
  const config = input.config || {};
  const configured = Array.isArray(config.surfaces) ? config.surfaces : [];
  if (!configured.some((entry) => entry !== null && typeof entry === 'object' && entry.surface === 'a2a-card')) {
    return { findings: [], text: null };
  }
  const card = require('./a2a-card.js');
  const site = config.site || {};
  return {
    findings: card.cardFindings(configured),
    text: card.cardBytes({
      bundleVersion: String(input.bundleVersion), description: input.description, packs: input.packs || [],
      specVersion: String(input.specVersion), surfaces: configured, tagline: site.tagline, title: String(site.title || ''),
      visibility: config.visibility,
    }),
  };
}

/**
 * The well-known files: the agent card (AGSC-06-34), the discovery document (AGSC-06-07,
 * AGSC-06-08) and the catalogue files (AGSC-06-42).
 *
 * @param {{config:object, emitted:Map<string,string>, level?:number, ledgerHead?:string|null,
 *   bundleVersion:string, generatedAt:string, specVersion:string, items:Array<object>,
 *   description?:string, packs?:Array<object>, legal?:boolean, pages?:boolean,
 *   chunkSet?:{count:string, set:string}}} input
 *   `emitted`: what the build wrote so far, route → bytes; `legal`: it writes `/legal/` later;
 *   `pages`: it writes the HTML pages, `/compose/` among them; `chunkSet`: the count and the set
 *   commitment of the chunk lines (AGSC-06-44).
 * @returns {{files: Map<string,string>, findings: Array<object>, skipped: Array<string>}}
 */
function files(input) {
  const config = input.config || {};
  const level = input.level == null ? 2 : Number(input.level);
  const out = new Map();
  const card = agentCard(input);
  const findings = [...card.findings];
  if (card.text !== null) out.set(surfaces.A2A_CARD_ROUTE, card.text);
  const digests = {};
  for (const [route, text] of input.emitted) digests[route] = discovery.digestOf(text);
  const routes = [...input.emitted.keys(), ...out.keys()];
  const ledger = input.emitted.get('/ledger.jsonl');
  const wellknown = discovery.linkset(config, {
    level,
    ledgerHead: input.ledgerHead,
    // AGSC-06-44: the number of entries of the derived ledger, one per line (AGSC-08-20a).
    ledgerLength: ledger === undefined ? undefined : String(ledger).split('\n').length - 1,
    chunkSet: input.chunkSet,
    bundleVersion: input.bundleVersion,
    digests,
    counts: discovery.countsOf(input.items || []),
    generatedAt: input.generatedAt,
    specVersion: input.specVersion,
    // AGSC-06-08 / AGSC-04-15: the bundle hash is the SHA-256 of `graph.nq`.
    bundleHash: digests['/graph.nq'],
    // AGSC-11-16: the declaration is DERIVED from what the writer actually emits;
    // only the declaration-only surfaces come from configuration.
    routes: [...routes, ...(input.legal === true ? ['/legal/index.html'] : [])],
    surfaces: declaredSurfaces({
      base: (config.site || {}).base,
      config,
      emitted: [...routes, ...(input.pages === true ? ['/compose/'] : [])],
    }),
  });
  // A build given no git-log file publishes no ledger (AGSC-06-01) and says so in
  // `skipped`; its own check does not fault what it could not derive.
  findings.push(...discovery.check(wellknown, { level, requireLedger: input.ledgerHead != null }));
  const document = `${canonicalize(wellknown)}\n`;
  out.set(discovery.WELLKNOWN_PATH, document);
  const catalogue = aiCatalog.catalogueFiles({ cardBytes: card.text, config, description: input.description, discoveryBytes: document });
  findings.push(...catalogue.findings);
  for (const [route, text] of catalogue.files) out.set(route, text);
  const skipped = ((config.discovery || {}).ai_catalog) === true ? [] : [`${aiCatalog.ARD_PATH}, ${aiCatalog.AI_CATALOG_PATH}`
    + ' (discovery.ai_catalog is not true: both catalogue formats are proposals, written only on that switch; AGSC-06-42)'];
  return { files: out, findings, skipped };
}

module.exports = { agentCard, declaredSurfaces, files };
