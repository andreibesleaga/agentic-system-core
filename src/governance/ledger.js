'use strict';
// CONTEXT Governance & Provenance — aggregate: Ledger.
// Implements AGSC-08-20 (the ledger is DERIVED, never stored), AGSC-08-20a (the
// byte-reproducible derivation from the git-log file), AGSC-08-20b (the production
// of that file, so two ports derive one ledger from one history), AGSC-08-21 (the
// members of an entry), AGSC-08-22 (the hash chain) and AGSC-08-23 (`verify
// --ledger`, including the truncated-tail check against the published head).
//
// PURE: no fs, no process, no clock, no network. The git log arrives as data
// through the ProcessRunner port, read by the application layer; the build instant
// arrives as an integer through the Clock port. `node:crypto` is a deterministic
// function of its input, not host state (AGSC-04-03).
//
// Vectors: ledger-0001, ledger-0002, ledger-0003, ledger-0004.

const { createHash } = require('node:crypto');
const { canonicalize } = require('../knowledge/jcs.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const { finding } = require('../knowledge/validate.js');
const { operatorFor } = require('../knowledge/adopt.js');

/** AGSC-08-22: the genesis `prev`, the all-zero SHA-256 in lowercase hex. */
const GENESIS = '0'.repeat(64);
/** AGSC-08-21: `kind` at 1.0; `proposal`, `review` and `refresh` are reserved. */
const KINDS = Object.freeze(['build', 'commit', 'merge', 'release']);

const SECONDS_PER_DAY = 86400;

/**
 * AGSC-04-10 from whole UTC seconds, without a clock and without `Date`: the civil
 * date from the days since 1970-01-01 (the shift-to-March algorithm), so the render
 * is a total function of an integer and the pure-context rule holds.
 * @param {number} epochSeconds
 * @returns {string} `YYYY-MM-DDTHH:MM:SSZ`
 */
function instantFromEpoch(epochSeconds) {
  const seconds = Math.trunc(Number(epochSeconds));
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  let rem = seconds - days * SECONDS_PER_DAY;
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  const hh = Math.floor(rem / 3600);
  rem -= hh * 3600;
  const mm = Math.floor(rem / 60);
  const ss = rem - mm * 60;
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}Z`;
}

/** The inverse, for `committed_at` values already rendered as AGSC-04-10 instants. */
function epochFromInstant(instant) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/u.exec(String(instant));
  if (m === null) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const yy = mo <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (mo > 2 ? mo - 3 : mo + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  return days * SECONDS_PER_DAY + h * 3600 + mi * 60 + s;
}

/**
 * AGSC-08-20a: `actor` is the `Signed-off-by` local part normalized to `human:<id>`
 * per AGSC-02-90(2), else `human:unknown`. The normalization is A's, imported
 * rather than restated, so one rule has one implementation.
 * @param {string|undefined} signedOffBy
 * @returns {string}
 */
function actorOf(signedOffBy) {
  const m = /<([^>]+)>/u.exec(String(signedOffBy == null ? '' : signedOffBy));
  const email = m === null ? String(signedOffBy == null ? '' : signedOffBy).trim() : m[1];
  if (!email.includes('@')) return 'human:unknown';
  return operatorFor({}, email).operator;
}

/** Case-insensitive trailer lookup, reported in its authored spelling (AGSC-08-20b). */
function trailer(trailers, key) {
  const found = Object.keys(trailers || {}).find((k) => k.toLowerCase() === key.toLowerCase());
  return found === undefined ? undefined : trailers[found];
}

/** AGSC-08-22: the hash over the 64 ASCII bytes of `prev` plus the JCS of the entry. */
function hashEntry(prev, entry) {
  const without = {};
  for (const k of Object.keys(entry)) if (k !== 'hash') without[k] = entry[k];
  return createHash('sha256')
    .update(Buffer.from(prev, 'ascii'))
    .update(Buffer.from(canonicalize(without), 'utf8'))
    .digest('hex');
}

/**
 * AGSC-08-20a: derive the whole ledger from the git-log file, the content tree hash
 * and `SOURCE_DATE_EPOCH`. One entry per commit in first-parent order, oldest
 * first, then exactly one trailing `build` entry and nothing else. An empty history
 * yields the trailing entry alone, so `agsc-ledger-head` is never undefined.
 *
 * @param {Array<object>} gitLog `[{sha, committed_at, parents[], tag?, trailers{}}]`.
 * @param {string} contentTree the git tree hash of `content/`.
 * @param {string} version the engine version, for `process:agsc/<version>`.
 * @param {{epoch:number}} options `SOURCE_DATE_EPOCH` in whole seconds.
 * @returns {{ledger:string, head:string, entries:Array<object>}}
 */
function derive(gitLog, contentTree, version, options = {}) {
  const entries = [];
  let prev = GENESIS;
  for (const commit of (gitLog || [])) {
    const trailers = commit.trailers || {};
    const isRelease = commit.tag != null && String(commit.tag) !== '';
    const isMerge = (Array.isArray(commit.parents) ? commit.parents.length : 0) >= 2
      || trailer(trailers, 'Proposal') !== undefined;
    const entry = {
      actor: actorOf(trailer(trailers, 'Signed-off-by')),
      kind: isRelease ? 'release' : (isMerge ? 'merge' : 'commit'),
      prev,
      ref: String(commit.sha),
      ts: String(commit.committed_at),
    };
    // AGSC-08-20a / AGSC-08-21: `mode` comes from the commit's own trailer, never
    // from forge metadata, and only the auto lane writes that trailer.
    if (trailer(trailers, 'Channel-Auto') !== undefined) entry.mode = 'auto';
    entry.hash = hashEntry(prev, entry);
    prev = entry.hash;
    entries.push(entry);
  }
  const build = {
    actor: `process:agsc/${version}`,
    kind: 'build',
    prev,
    ref: String(contentTree),
    ts: instantFromEpoch(options.epoch),
  };
  build.hash = hashEntry(prev, build);
  entries.push(build);

  return {
    entries,
    ledger: entries.map((e) => `${canonicalize(e)}\n`).join(''),
    head: build.hash,
  };
}

/** The `agsc-ledger-head` a discovery document publishes (AGSC-06-11, AGSC-08-24). */
function publishedHead(wellknown) {
  const context = ((wellknown || {}).linkset || [])[0] || {};
  const links = context['https://w3id.org/agentic-system-core/rel#ledger'] || [];
  for (const one of links) {
    const value = one['agsc-ledger-head'];
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    if (typeof value === 'string') return value;
  }
  return null;
}

/**
 * AGSC-08-23: recompute the chain offline over a published ledger file and compare
 * it with the head the local well-known file publishes. A chain whose every line
 * links correctly is still `AGSC-E701` when the recomputed head differs from the
 * published one — that, and nothing else, is what detects a truncated tail.
 *
 * @param {string} ledger the `/ledger.jsonl` bytes.
 * @param {object} wellknown the discovery document.
 * @returns {Array<object>} Findings; empty means the ledger verifies.
 */
function verify(ledger, wellknown) {
  const out = [];
  const file = '/ledger.jsonl';
  const lines = String(ledger).split('\n').filter((l) => l !== '');
  let prev = GENESIS;
  let head = null;
  for (let i = 0; i < lines.length; i += 1) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch (e) {
      out.push(finding('AGSC-E702', `ledger line ${i + 1} is not JSON: ${e.message}`, { file, line: i + 1 }));
      return out;
    }
    if (entry.prev !== prev) {
      out.push(finding('AGSC-E701',
        `ledger chain broken at line ${i + 1}: prev is "${entry.prev}", the previous hash is "${prev}" (AGSC-08-23)`,
        { file, line: i + 1 }));
      return out;
    }
    const recomputed = hashEntry(prev, entry);
    if (recomputed !== entry.hash) {
      out.push(finding('AGSC-E701',
        `ledger chain broken at line ${i + 1}: hash is "${entry.hash}", recomputed "${recomputed}" (AGSC-08-22)`,
        { file, line: i + 1 }));
      return out;
    }
    // AGSC-08-21: `kind` is NOT checked against `KINDS` here. A 1.x reader must
    // tolerate a reserved kind, and the members a future MINOR adds, because
    // AGSC-08-22 hashes whatever the entry carries — the chain still verifies.
    prev = entry.hash;
    head = entry.hash;
  }
  const published = publishedHead(wellknown);
  if (published !== null && published !== head) {
    out.push(finding('AGSC-E701',
      `the published agsc-ledger-head "${published}" is not the recomputed head "${head}" — the tail has been truncated (AGSC-08-23)`,
      { file }));
  }
  return out;
}

// ------------------------------------------------------- AGSC-08-20b: production

/**
 * The trailer block of a commit message as `git interpret-trailers` defines it: the
 * LAST contiguous run of `Key: value` lines at the end of the message, continuation
 * lines unfolded into one value, keys compared ASCII-case-insensitively and the LAST
 * occurrence of a key winning, reported in its authored spelling.
 *
 * @param {string} message
 * @returns {object} a null-prototype map (no prototype pollution from a commit).
 */
function parseTrailers(message) {
  const lines = String(message).split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  let start = lines.length;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;
  const block = lines.slice(start);
  if (block.length === 0) return Object.create(null);
  const isKey = (l) => /^[A-Za-z0-9][A-Za-z0-9-]*:[ \t]/u.test(l);
  const isContinuation = (l) => /^[ \t]/u.test(l);
  if (!block.every((l, i) => (i === 0 ? isKey(l) : isKey(l) || isContinuation(l)))) {
    return Object.create(null);
  }
  const order = [];
  const values = Object.create(null);
  for (const line of block) {
    if (isContinuation(line)) {
      const last = order[order.length - 1];
      values[last] = `${values[last]} ${line.trim()}`;
      continue;
    }
    const at = line.indexOf(':');
    const key = line.slice(0, at);
    const value = line.slice(at + 1).trim();
    const existing = order.find((k) => k.toLowerCase() === key.toLowerCase());
    if (existing !== undefined) {
      order.splice(order.indexOf(existing), 1);
      delete values[existing];
    }
    order.push(key);
    values[key] = value;
  }
  const out = Object.create(null);
  for (const key of order) out[key] = values[key];
  return out;
}

/**
 * AGSC-08-20b: produce the git-log file from the first-parent chain of the content
 * branch, oldest first. `committed_at` is the COMMITTER timestamp in whole UTC
 * seconds; `tag` is the lexicographically greatest `v*` tag pointing at the commit,
 * by code point; `parents[]` is git's own order. A side branch never appears.
 *
 * @param {Array<object>} commits `{sha, parents[], committer_timestamp, message, tags[]}`
 *   in first-parent order, oldest first.
 * @returns {Array<object>} the JCS array AGSC-08-20a consumes.
 */
function produce(commits) {
  return (commits || []).map((commit) => {
    const seconds = epochFromInstant(commit.committer_timestamp);
    const entry = {
      committed_at: seconds === null ? String(commit.committer_timestamp) : instantFromEpoch(seconds),
      parents: Array.isArray(commit.parents) ? commit.parents.map(String) : [],
      sha: String(commit.sha),
      trailers: { ...parseTrailers(commit.message) },
    };
    const tags = (Array.isArray(commit.tags) ? commit.tags : [])
      .map(String).filter((t) => t.startsWith('v')).sort(compareCodePoint);
    if (tags.length > 0) entry.tag = tags[tags.length - 1];
    return entry;
  });
}

module.exports = {
  derive,
  verify,
  produce,
  parseTrailers,
  publishedHead,
  hashEntry,
  actorOf,
  instantFromEpoch,
  epochFromInstant,
  GENESIS,
  KINDS,
};
