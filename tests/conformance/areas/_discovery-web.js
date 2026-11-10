'use strict';
// The `discovery` cases of the web connection (AGSC-06-34, AGSC-06-40, AGSC-06-41, AGSC-06-42):
//
//   disc-0026  the FAIR Signposting links in the `Link` header of `/`, read from the `_headers`
//              block of `/` with an independent RFC 8288 parser (`http-link-header`) and compared
//              as a set of {href, rel, type}; and `validate-wellknown`'s check that the header of
//              `/` carries the `describedby` link to the discovery document (a warning, AGSC-E202);
//   disc-0027  the Dataset block of the home page, compared as a JSON value;
//   disc-0028  `/.well-known/ai-catalog.json` and disc-0029 `/.well-known/ard.json`, opt-in, as bytes;
//   disc-0030  the A2A agent card of a node with a responder, as bytes;
//   disc-0031  no card without both declarations, and AGSC-E210 for a card without an endpoint;
//   disc-0035  no card for a responder that is not an A2A one, and no declaration of it;
//   disc-0036  the checker's verdict on a webmcp surface whose version is not a date;
//   disc-0038  the security members of the card, and the warning for a credential responder without them;
//   disc-0032  the PROV-O terms appear in the home page's Dataset block and in no other file of a
//              real build of the minimal fixture;
//   disc-0033  (AGSC-06-44, AGSC-09-93 (b)) `validate-wellknown --level 2` over a document and the
//              files it names, written to a scratch build output and read by the checker from disk:
//              the digest, count and set commitment of the chunks surface link are recomputed, and
//              required only of a document of 1.1.0 or later.
//
// Each case calls the module the build calls, so the bytes a case proves are the bytes a node
// publishes.

const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const LinkHeader = require('http-link-header');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const headers = require('../../../src/distribution/headers.js');
const { catalogBlock, datasetBlock } = require('../../../src/distribution/front-page.js');
const aiCatalog = require('../../../src/distribution/ai-catalog.js');
const a2aCard = require('../../../src/distribution/a2a-card.js');
const wellKnown = require('../../../src/distribution/well-known.js');
const wellknownTool = require('../../../tools/validate-wellknown');
const { checks, deepEqual, findingsMatch } = require('./_assert.js');
const { onBuild } = require('./_build-surfaces.js');

/** The expected entries of a case list, by name. */
const byName = (list) => new Map((list || []).map((c) => [c.name, c]));

/** One link as the case states it: href, rel and, when it has one, type. */
function asCaseLink(ref) {
  const one = { href: ref.uri, rel: ref.rel };
  if (ref.type !== undefined) one.type = ref.type;
  return one;
}

const linkOrder = (a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);

/** The `Link` values of the `_headers` block of `/`, parsed as RFC 8288 links. */
function homeLinks(config, routes) {
  const home = headers.headerSets(config, routes).find((set) => set.route === '/');
  const values = (home ? home.headers : []).filter(([name]) => name === 'Link').map(([, value]) => value);
  return values.flatMap((value) => LinkHeader.parse(value).refs.map(asCaseLink)).sort(linkOrder);
}

/** disc-0026 (AGSC-06-40): the Signposting links of `/`, and the checker's describedby warning. */
function signpostingCase(vector) {
  const list = [];
  const wanted = byName(vector.expected.cases);
  for (const input of vector.input.cases) {
    const config = {
      bundle: input.license_url === undefined ? {} : { license_url: input.license_url },
      related: input.related,
      site: { base: input.base },
      visibility: input.visibility,
    };
    const routes = ['/index.html', '/.well-known/knowledge-linkset', '/graph.jsonld', '/graph.nq', '/graph.ttl',
      ...(input.chunks_served ? ['/chunks.jsonl'] : []), ...(input.legal_emitted ? ['/legal/index.html'] : [])];
    const got = homeLinks(config, routes);
    const want = [...(wanted.get(input.name) || { links_as_set: null }).links_as_set || []].sort(linkOrder);
    list.push([`${input.name} links`, deepEqual(got, want), JSON.stringify(got)]);
  }
  const validators = byName(vector.expected.validator_cases);
  for (const input of vector.input.validator_cases) {
    const want = validators.get(input.name);
    // The checker's own reading of the header of `/` (it fetches `/` when given a URL); the Level does not change it.
    const found = wellknownTool.homeLinkFindings(input.home_link_header, { anchor: 'https://a.example/', level: input.level });
    const matched = want === undefined ? { ok: false, detail: 'no expected case' } : findingsMatch(want.findings, found);
    list.push([`${input.name} findings`, matched.ok && want.findings.length === found.length, matched.detail || JSON.stringify(found)]);
  }
  return checks(list);
}

/** disc-0027 (AGSC-06-41): the Dataset block of the home page. */
function datasetCase(vector) {
  const wanted = byName(vector.expected.cases);
  const list = [];
  for (const input of vector.input.cases) {
    const facts = {
      config: { bundle: input.bundle, discovery: input.discovery, site: input.site, visibility: input.visibility },
      description: input.description,
      instant: input.instant,
      name: input.site.title,
      served: input.files_served,
    };
    const want = wanted.get(input.name) || {};
    const block = datasetBlock(facts);
    list.push([`${input.name} block`, deepEqual(block, want.block), JSON.stringify(block)]);
    // disc-0037: the DCAT 3 catalogue block of the `discovery.dcat` switch, or null.
    if (want.catalog !== undefined) {
      const catalog = catalogBlock(facts);
      list.push([`${input.name} catalog`, deepEqual(catalog, want.catalog), JSON.stringify(catalog)]);
    }
  }
  return checks(list);
}

/** disc-0028 / disc-0029 (AGSC-06-42): one of the two catalogue files, opt-in. */
function catalogueCase(route) {
  return (vector) => {
    const list = [];
    const wanted = byName(vector.expected.cases);
    for (const input of vector.input.cases) {
      const want = wanted.get(input.name) || {};
      const result = aiCatalog.catalogueFiles({
        cardBytes: input.card_bytes,
        config: { bundle: { id: input.bundle_id }, discovery: { ai_catalog: input.ai_catalog }, site: input.site },
        description: input.description,
        discoveryBytes: input.discovery_document_bytes,
      });
      const file = result.files.has(route) ? result.files.get(route) : null;
      list.push([`${input.name} file`, file === want.file, JSON.stringify(file)]);
      const wantFindings = want.findings || [];
      const matched = findingsMatch(wantFindings, result.findings);
      list.push([`${input.name} findings`, matched.ok && result.findings.length === wantFindings.length,
        matched.detail || JSON.stringify(result.findings)]);
    }
    return checks(list);
  };
}

/** The card input of a disc-0030/0031 case. */
const cardInput = (input) => ({
  bundleVersion: input.bundle_version,
  description: input.description,
  packs: input.packs,
  specVersion: input.spec_version,
  surfaces: input.surfaces,
  title: input.site.title,
  visibility: input.visibility,
});

/**
 * disc-0030 / disc-0031 / disc-0035 (AGSC-06-34 with AGSC-06-07 and AGSC-11-16): the card, or
 * none and why; with `declares_a2a_card`, whether the discovery document declares it.
 */
function cardCase(vector) {
  const list = [];
  const wanted = byName(vector.expected.cases);
  for (const input of vector.input.cases) {
    const want = wanted.get(input.name) || {};
    const file = a2aCard.cardBytes(cardInput(input));
    if (want.file !== undefined) list.push([`${input.name} file`, file === want.file, JSON.stringify(file)]);
    if (want.findings !== undefined) {
      const found = a2aCard.cardFindings(input.surfaces);
      const matched = findingsMatch(want.findings, found);
      list.push([`${input.name} findings`, matched.ok && found.length === want.findings.length, matched.detail || JSON.stringify(found)]);
    }
    if (want.declares_a2a_card !== undefined) {
      const declared = wellKnown.declaredSurfaces({ base: input.site.base, config: { surfaces: input.surfaces }, emitted: [] })
        .some((entry) => entry.surface === 'a2a-card');
      list.push([`${input.name} declares a2a-card`, declared === want.declares_a2a_card, String(declared)]);
    }
  }
  return checks(list);
}

/** The PROV-O terms of AGSC-06-41, as a prefixed name or as a full IRI. */
const PROV_TERM = /prov:(?:generatedAtTime|wasAttributedTo)|http:\/\/www\.w3\.org\/ns\/prov#(?:generatedAtTime|wasAttributedTo)/u;

/** disc-0032 (AGSC-06-41): the files of a real build that contain a PROV-O term. */
function provConfinedCase(vector, ctx) {
  return onBuild(vector, ctx, null, (run) => {
    const found = [...run.files.keys()].filter((route) => PROV_TERM.test(run.files.get(route).toString('utf8'))).sort();
    return checks([
      ['the build passes', run.exit === 0, JSON.stringify(run.findings)],
      ['files containing a PROV-O term', deepEqual(found, vector.expected.files_containing_a_prov_term), JSON.stringify(found)],
    ]);
  });
}

/**
 * One run of the checker, as a child process (a handler is synchronous and the checker's `run` is
 * not), over a scratch build output holding the document and the files of the case.
 */
function checkerRun(input, root) {
  const out = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-disc-checker-'));
  try {
    const document = path.join(out, '.well-known', 'knowledge-linkset');
    nodeFs.mkdirSync(path.dirname(document), { recursive: true });
    nodeFs.writeFileSync(document, `${canonicalize(input.document)}\n`);
    for (const [route, text] of Object.entries(input.files)) {
      nodeFs.mkdirSync(path.dirname(path.join(out, route)), { recursive: true });
      nodeFs.writeFileSync(path.join(out, route), text);
    }
    const tool = path.join(root, 'tools', 'validate-wellknown');
    const run = spawnSync(process.execPath, [tool, document, '--level', String(input.level), '--json'], { encoding: 'utf8' });
    return JSON.parse(run.stdout);
  } finally {
    nodeFs.rmSync(out, { force: true, recursive: true });
  }
}

/** disc-0033 (AGSC-06-44 with AGSC-09-93 (b)): the chunks surface link, recomputed by the checker. */
function chunkSurfaceCase(vector, ctx) {
  const wanted = byName(vector.expected.cases);
  const list = [];
  for (const input of vector.input.cases) {
    const want = wanted.get(input.name) || {};
    const envelope = checkerRun(input, (ctx && ctx.root) || '.');
    const codes = [...new Set(envelope.findings.map((f) => f.code))].sort();
    list.push([`${input.name} valid`, (envelope.status === 'pass') === want.valid, JSON.stringify(envelope.findings)]);
    list.push([`${input.name} codes`, deepEqual(codes, want.codes_reported), JSON.stringify(codes)]);
  }
  return checks(list);
}

module.exports = {
  HANDLERS: {
    'disc-0033': chunkSurfaceCase,
    'disc-0036': chunkSurfaceCase,
    'disc-0026': signpostingCase,
    'disc-0027': datasetCase,
    'disc-0037': datasetCase,
    'disc-0028': catalogueCase('/.well-known/ai-catalog.json'),
    'disc-0029': catalogueCase('/.well-known/ard.json'),
    'disc-0030': cardCase,
    'disc-0031': cardCase,
    'disc-0035': cardCase,
    'disc-0038': cardCase,
    'disc-0032': provConfinedCase,
  },
};
