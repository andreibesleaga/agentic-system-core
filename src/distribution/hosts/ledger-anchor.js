'use strict';
// CONTEXT Distribution (Emission) — the `ledger-anchor` deployment profile: a record
// of one build that a ledger can carry, and the check that reads it back.
//
// A ledger does not serve web pages; what it can do is hold a small record for good,
// so that anyone can later show which content a node published and when. The record
// is `server/anchor.json`: the facts the discovery document already publishes about
// the build — the Bundle IRI, the bundle hash and the content version (AGSC-06-08,
// AGSC-04-25), the ledger head (AGSC-06-11), the specification version and the
// build instant — plus the digest of the discovery document itself, in the RFC 9530
// syntax the document uses for every artefact. It is JCS-canonical (AGSC-04-04), so
// the same build always gives the same bytes and the same SHA-256, which is the value
// a ledger transaction or an OpenTimestamps proof carries ("A timestamp proves that
// some data existed prior to some point in time", https://opentimestamps.org/, read
// 2026-09-24; `ots stamp anchor.json` sends only the file's digest). `anchor.sha256`
// holds that digest in the `sha256sum` line format.
//
// This module never reaches a chain: writing the record to a ledger, and serving the
// discovery document from a web interface in front of that ledger, are the
// operator's. `verify(anchorText, input)` answers whether a build is the one an
// anchor names.

const { createHash } = require('node:crypto');

const { WELLKNOWN_PATH, digestOf } = require('../discovery.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { finding } = require('../../knowledge/validate.js');
const { define } = require('./profile.js');

const LEDGER_REL = 'https://w3id.org/agentic-system-core/rel#ledger';

/** The version of the anchor record's own shape. */
const ANCHOR_VERSION = '1';

const where = (file) => ({ file });

function first(link, name) {
  const value = link && Array.isArray(link[name]) ? link[name][0] : undefined;
  return value === undefined ? undefined : String(value);
}

/**
 * The anchor record of one build, or findings.
 * @param {{discoveryText:(string|null)}} input
 * @returns {{record:(object|null), findings:Array<object>}}
 */
function recordOf(input) {
  if (typeof input.discoveryText !== 'string') {
    return { findings: [finding('AGSC-E901', `the build has no ${WELLKNOWN_PATH}; there is nothing to anchor`, where(WELLKNOWN_PATH))], record: null };
  }
  let context;
  try {
    context = JSON.parse(input.discoveryText).linkset[0];
  } catch (e) {
    context = undefined;
  }
  const graph = context && Array.isArray(context.describedby)
    ? context.describedby.find((l) => l && /\/graph\.jsonld$/u.test(String(l.href)))
    : undefined;
  if (graph === undefined || typeof context.anchor !== 'string') {
    return { findings: [finding('AGSC-E201', 'the discovery document carries no Bundle IRI and no describedby link to /graph.jsonld (AGSC-06-08)', where(WELLKNOWN_PATH))], record: null };
  }
  const record = {
    agsc_anchor: ANCHOR_VERSION,
    anchor: context.anchor,
    bundle_hash: first(graph, 'agsc-bundle-hash'),
    bundle_version: first(graph, 'agsc-bundle-version'),
    discovery_digest: digestOf(input.discoveryText),
    generated_at: first(graph, 'agsc-generated-at'),
    ledger_head: first((context[LEDGER_REL] || [])[0], 'agsc-ledger-head'),
    spec_version: first(graph, 'agsc-spec-version'),
  };
  const findings = [];
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      findings.push(finding('AGSC-E202', `the discovery document publishes no ${key.replace('_', ' ')}; the anchor omits it`
        + ' (a restricted node or a build with no git history publishes none, AGSC-11-20, AGSC-10-04)',
      { file: WELLKNOWN_PATH, severity: 'warn' }));
      delete record[key];
    }
  }
  return { findings, record };
}

function emit(input) {
  const { record, findings } = recordOf(input);
  if (record === null) return { findings, server: [], site: [] };
  const text = `${canonicalize(record)}\n`;
  const hex = createHash('sha256').update(text, 'utf8').digest('hex');
  return {
    findings,
    server: [
      { path: 'anchor.json', text },
      { path: 'anchor.sha256', text: `${hex}  anchor.json\n` },
    ],
    site: [],
  };
}

/**
 * Does this build match the anchor? Every differing member is one finding: the
 * ledger head `AGSC-E701` (as for `verify --ledger`, AGSC-08-23), every other fact
 * `AGSC-E210` (bytes that disagree with what was declared of them).
 *
 * @param {string} anchorText the anchor file's text.
 * @param {{discoveryText:(string|null)}} input the build.
 * @returns {Array<object>} findings; empty means the build is the anchored one.
 */
function verify(anchorText, input) {
  let anchored;
  try {
    anchored = JSON.parse(String(anchorText));
  } catch (e) {
    anchored = null;
  }
  if (anchored === null || typeof anchored !== 'object' || Array.isArray(anchored)
    || anchored.agsc_anchor !== ANCHOR_VERSION) {
    return [finding('AGSC-E201', `not an anchor record of version ${ANCHOR_VERSION}`, where('anchor.json'))];
  }
  const { record, findings } = recordOf(input);
  if (record === null) return findings;
  const out = [];
  const keys = [...new Set([...Object.keys(anchored), ...Object.keys(record)])].sort();
  for (const key of keys) {
    if (anchored[key] === record[key]) continue;
    out.push(finding(key === 'ledger_head' ? 'AGSC-E701' : 'AGSC-E210',
      `${key}: the anchor records ${JSON.stringify(anchored[key])} and the build publishes ${JSON.stringify(record[key])}`,
      where('anchor.json')));
  }
  return out;
}

module.exports = define({
  claim: 'ledger-anchor (the build is served over HTTPS by a web interface, and its anchor record is kept in a ledger)',
  emit,
  limits: [
    'A ledger does not serve the node: the discovery document and the routes are still served over HTTPS by a web host or a web interface in front of the ledger, and the claim is made for that origin.',
    'The anchor proves which build was published and, once a ledger or a timestamp holds its digest, that it existed by then; it proves nothing about the content being true.',
    'Nothing here reaches a chain: recording anchor.json (or its digest) in a ledger, or running `ots stamp anchor.json`, is the operator\'s own step.',
  ],
  name: 'ledger-anchor',
  title: 'A ledger-anchored record of each build',
  with: { ANCHOR_VERSION, recordOf, verify },
});
