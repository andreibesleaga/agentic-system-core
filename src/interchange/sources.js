'use strict';
// src/interchange/sources.js — CONTEXT Interchange.
//
// The old site's `references.<n>.{label,url,org,year,verified}` become the one
// citation array of AGSC-02-10, `sources[]`, whose only REQUIRED member is
// `resource` (M3-T18).
//
//   label -> title     url -> resource     org -> author
//   year  -> year (a 4-digit STRING, per $defs/source)
//   verified -> verified (an AGSC-02-06 date)
//   grade: the FIRST entry is `primary`, the rest `secondary` — AGSC-02-10 gives
//          the array an order and `grade` is what makes that order a claim.
//
// AGSC-11-12 is why this array matters beyond bibliography: a `sources[].resource`
// beginning with a declared peer's base becomes `rdfs:seeAlso` plus
// `asc:peerOrigin` in the graph exports. Cross-node reference is by citation, and
// by nothing else.
//
// PURE: no fs, no process, no clock, no network.
//
// Codes: AGSC-E204 (a `resource`, `year` or `verified` value outside its
// pattern — reported, and the member dropped rather than emitted invalid),
// AGSC-E202 (an entry with no `resource` at all).

const { finding } = require('../knowledge/validate.js');

/** `$defs/source.resource` of `schema/item.schema.json`, AGSC-02-10. */
const RESOURCE = /^(?:https?:\/\/[^\u0000-\u0020]+|urn:agsc:channel:[a-z0-9-]+:[^\u0000-\u0020]+)$/u;
/** `$defs/source.year`. */
const YEAR = /^[0-9]{4}$/u;
/** `$defs/date`, AGSC-02-06. */
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;

/** The member order of `$defs/source`, which is the AGSC-04-19 emission order. */
const MEMBER_ORDER = Object.freeze(['id', 'resource', 'title', 'author', 'year', 'verified', 'grade']);

/** An entry in `$defs/source` member order, with absent members omitted. */
function ordered(entry) {
  const out = {};
  for (const key of MEMBER_ORDER) if (entry[key] !== undefined) out[key] = entry[key];
  return out;
}

/**
 * Map one old `references[]` entry.
 *
 * @param {object} reference `{label, url, org, year, verified}`.
 * @param {{file?:string, slug?:string, grade?:string, index?:number}} [options]
 * @returns {{source:(object|null), findings:Array<object>}}
 */
function one(reference, options = {}) {
  const at = { file: options.file, slug: options.slug, line: 1 };
  const findings = [];
  const raw = reference && typeof reference === 'object' ? reference : {};
  const resource = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (resource === '') {
    findings.push(finding('AGSC-E202',
      `sources[${options.index}] carries no resource and was dropped (AGSC-02-10)`, at));
    return { source: null, findings };
  }
  if (!RESOURCE.test(resource)) {
    findings.push(finding('AGSC-E204',
      `sources[${options.index}].resource "${resource}" is outside the AGSC-02-10 grammar`, at));
    return { source: null, findings };
  }

  const entry = { resource };
  if (typeof raw.label === 'string' && raw.label !== '') entry.title = raw.label;
  if (typeof raw.org === 'string' && raw.org !== '') entry.author = raw.org;
  const year = raw.year === undefined ? '' : String(raw.year);
  if (year !== '') {
    if (YEAR.test(year)) entry.year = year;
    else {
      findings.push(finding('AGSC-E204',
        `sources[${options.index}].year "${year}" is not four digits; dropped (AGSC-02-10)`,
        { ...at, severity: 'warn' }));
    }
  }
  const verified = raw.verified === undefined ? '' : String(raw.verified);
  if (verified !== '') {
    if (DATE.test(verified)) entry.verified = verified;
    else {
      findings.push(finding('AGSC-E204',
        `sources[${options.index}].verified "${verified}" is not an AGSC-02-06 date; dropped`,
        { ...at, severity: 'warn' }));
    }
  }
  entry.grade = options.grade === undefined ? 'secondary' : options.grade;
  return { source: ordered(entry), findings };
}

/**
 * Map a whole `references[]` array to `sources[]`.
 *
 * @param {Array<object>} references in the old card's order.
 * @param {{file?:string, slug?:string, promote?:string[], add?:Array<object>}} [options]
 *   `promote` lists resource URLs to move to the FRONT, in the order given —
 *   how the two source-integrity defects of the selection record are corrected
 *   without a card list inside the engine; `add` appends further entries.
 * @returns {{sources:Array<object>, findings:Array<object>}}
 */
function map(references, options = {}) {
  const list = Array.isArray(references) ? references : [];
  const findings = [];
  const mapped = [];
  for (let i = 0; i < list.length; i += 1) {
    const result = one(list[i], { ...options, index: i, grade: 'secondary' });
    findings.push(...result.findings);
    if (result.source !== null) mapped.push(result.source);
  }
  for (const extra of options.add || []) {
    const result = one(extra, { ...options, index: mapped.length, grade: 'secondary' });
    findings.push(...result.findings);
    if (result.source !== null) mapped.push(result.source);
  }

  // `promote` reorders; it never invents and never drops.
  const promote = options.promote || [];
  const front = [];
  for (const url of promote) {
    const index = mapped.findIndex((s) => s.resource === url);
    if (index < 0) continue;
    front.push(mapped.splice(index, 1)[0]);
  }
  const sources = [...front, ...mapped];

  // AGSC-02-10 gives the array an order; `grade` states what that order means.
  return {
    sources: sources.map((s, i) => ordered({ ...s, grade: i === 0 ? 'primary' : 'secondary' })),
    findings,
  };
}

/** The old card's `references` object as an ARRAY, holes dropped. */
function referenceList(record) {
  const raw = record && record.references;
  if (Array.isArray(raw)) return raw.filter((r) => r !== undefined && r !== null);
  if (raw && typeof raw === 'object') {
    return Object.keys(raw)
      .filter((k) => /^[0-9]+$/u.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => raw[k]);
  }
  return [];
}

module.exports = { DATE, RESOURCE, YEAR, map, one, ordered, referenceList };
