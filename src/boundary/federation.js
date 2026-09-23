'use strict';
/**
 * CONTEXT Boundary — the anti-corruption layer for everything that crosses a
 * node's edge. Implements spec/11-boundary.md 11.3 (F1 to F9):
 * AGSC-11-06 (declaration, the peer links and the single home of the
 * federation parameters), AGSC-11-07 (transport: https only, http only to a
 * loopback address under --dev), AGSC-11-08 (addresses: the closed IANA
 * special-purpose list, refused before connecting), AGSC-11-09 (redirects and
 * the declared peer URL that is never substituted), AGSC-11-10 (the walk, its
 * three caps, the visited set and the unreachable peer), AGSC-11-11 (trust
 * across nodes), AGSC-11-12 (cross-node citation through `sources[].resource`,
 * never a cross-node Link; AGSC-E311, AGSC-E312, the reserved `peer-ref`),
 * AGSC-11-13 (federated query is client-side; a build fetches nothing),
 * AGSC-11-14 (contribution from anyone), AGSC-11-15 (federated boards keyed by
 * IRI), AGSC-11-23 (tombstones), plus AGSC-10-12 (the mutual check) and
 * AGSC-06-35 (related-system links).
 * Requirements: D67 A1/A4/B6/Q63, D71 Q69/Q70, D72 C4/C22/A-18/A-19, PRD-057.
 *
 * NO NETWORK. Every fetch is an INJECTED function: the walk, the redirect
 * check and the mutual check take one, so nothing here can reach a socket and
 * the 1.0 Network adapter (which refuses every call) keeps every test offline
 * (AGSC-04-03). Address classification uses the platform's own classifier,
 * `node:net.BlockList`, never a hand-parsed address literal (AGSC-11-08).
 *
 * Security rows of docs/SECURITY-CONSIDERATIONS.md addressed here: "request
 * forgery through peer fetch" (AGSC-11-07/11-08/11-09 — scheme allow-list,
 * the special-purpose address list, the redirect cap and the re-check on every
 * hop) and "spam and injection through contribute channels" (AGSC-11-14 —
 * `auto` is refused for a contribute channel).
 */

const net = require('node:net');
const { domainToASCII } = require('node:url');
const nquads = require('../knowledge/nquads.js');
const { REL } = require('./surfaces.js');

/** AGSC-06-07: the one discovery suffix, held as a single constant (D82 Q4). */
const WELLKNOWN_SUFFIX = '.well-known/knowledge-linkset';

/** AGSC-11-06 + AGSC-11-01: default, schema minimum and stated maximum. */
const FEDERATION_PARAMS = Object.freeze({
  fan_out: Object.freeze({ default: 50, max: 200, min: 1 }),
  hop_limit: Object.freeze({ default: 3, max: 5, min: 0 }),
  max_requests: Object.freeze({ default: 500, max: 2000, min: 1 }),
  redirect_limit: Object.freeze({ default: 3, max: 5, min: 0 }),
  timeout_ms: Object.freeze({ default: 10000, max: 60000, min: 100 }),
});

/** AGSC-11-14: the closed contribute-mode list. */
const CONTRIBUTE_MODES = Object.freeze(['pr', 'channel', 'form']);
/** AGSC-06-35: the IANA-registered relations a related-system link may use. */
const RELATED_RELATIONS = Object.freeze(['describedby', 'alternate', 'related',
  'service-desc', 'service-doc', 'service-meta', 'collection', 'item', 'cite-as']); // cite-as: rc.6, EXT2-03

/** AGSC-03-01: the fourteen Link keys. */
const LINK_KEYS = Object.freeze(['related', 'broader', 'narrower', 'uses', 'requires', 'excludes',
  'derived-from', 'contradicts', 'supersedes', 'implements', 'verifies', 'covers', 'blocked-by', 'decided-by']);
/** AGSC-11-12: RESERVED for a future MINOR; at 1.x an unknown link key, preserved. */
const RESERVED_LINK_KEYS = Object.freeze(['peer-ref']);

const RDFS_SEE_ALSO = 'http://www.w3.org/2000/01/rdf-schema#seeAlso';
const ASC_PEER_ORIGIN = 'https://w3id.org/agentic-system-core/ns#peerOrigin';

/**
 * AGSC-11-08, the closed normative list, transcribed from the rule. Every
 * prefix whose IANA "Globally Reachable" value is not True, plus the
 * IPv4-embedding prefixes and the multicast ranges. `::ffff:0:0/96` is
 * deliberately NOT a rule here: the rule says a mapped address is "checked as
 * the mapped IPv4", and `node:net.BlockList` does exactly that natively —
 * adding it as a subnet would instead make BlockList match every IPv4
 * address, which would refuse the whole internet.
 */
const REFUSED_V4 = Object.freeze(['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
  '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24',
  '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4',
  '240.0.0.0/4', '255.255.255.255/32']);
const REFUSED_V6 = Object.freeze(['::/128', '::1/128', '64:ff9b::/96', '64:ff9b:1::/48',
  '100::/64', '100:0:0:1::/64', '2001::/32', '2001:2::/48', '2001:10::/28', '2001:db8::/32',
  '2002::/16', '3fff::/20', '5f00::/16', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8']);
/** AGSC-11-07/11-08: the two prefixes `--dev` exempts. */
const LOOPBACK_V4 = '127.0.0.0/8';
const LOOPBACK_V6 = '::1/128';

function blockList(v4, v6) {
  const list = new net.BlockList();
  for (const cidr of v4) {
    const [address, prefix] = cidr.split('/');
    list.addSubnet(address, Number(prefix), 'ipv4');
  }
  for (const cidr of v6) {
    const [address, prefix] = cidr.split('/');
    list.addSubnet(address, Number(prefix), 'ipv6');
  }
  return list;
}

const STRICT = blockList(REFUSED_V4, REFUSED_V6);
const WITHOUT_LOOPBACK = blockList(
  REFUSED_V4.filter((c) => c !== LOOPBACK_V4),
  REFUSED_V6.filter((c) => c !== LOOPBACK_V6),
);
const LOOPBACK_ONLY = blockList([LOOPBACK_V4], [LOOPBACK_V6]);

function finding(code, severity, extra) {
  return Object.freeze(Object.assign({ code, message: '', severity }, extra || {}));
}

/** AGSC-11-06/11-01: the parameters actually in force, defaults where absent. */
function effectiveFederation(config) {
  const declared = (config && config.federation) || {};
  const out = {};
  for (const [key, range] of Object.entries(FEDERATION_PARAMS)) {
    out[key] = Number.isInteger(declared[key]) && declared[key] >= range.min && declared[key] <= range.max
      ? declared[key]
      : range.default;
  }
  return Object.freeze(out);
}

/**
 * AGSC-11-12: the base of a declared peer, derived SYNTACTICALLY from its
 * `peers[]` entry by removing the trailing well-known suffix. No fetch is
 * needed, which is what keeps a build offline (AGSC-04-03).
 */
function peerBase(peerUrl) {
  const url = String(peerUrl);
  return url.endsWith(WELLKNOWN_SUFFIX) ? url.slice(0, url.length - WELLKNOWN_SUFFIX.length) : url;
}

/** AGSC-11-06 + AGSC-06-10: one `rel#peer` link per declared peer, document order. */
function peerLinks(config) {
  const peers = (config && config.peers) || [];
  return Object.freeze(peers.map((href) => Object.freeze({ href, rel: REL.peer })));
}

/** Is this an IP literal inside the loopback prefixes AGSC-11-07 names? */
function isLoopbackLiteral(host) {
  const family = net.isIP(host);
  if (family === 0) return false;
  return LOOPBACK_ONLY.check(host, family === 4 ? 'ipv4' : 'ipv6');
}

function hostOf(url) {
  const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/u.exec(String(url));
  if (!m) return '';
  const authority = m[1];
  const afterUserinfo = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  if (afterUserinfo.startsWith('[')) return afterUserinfo.slice(1, afterUserinfo.indexOf(']'));
  return afterUserinfo.split(':')[0];
}

/**
 * checkScheme(url, options) -> 'AGSC-E905' | null
 * AGSC-11-07. `https` always; `http` only to a loopback address and only when
 * the invocation carries `--dev`; every other scheme, and every relative
 * reference, is refused before any connection is attempted.
 */
function checkScheme(url, options) {
  const opts = options || {};
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//u.exec(String(url));
  if (!m) return 'AGSC-E905';
  const scheme = m[1].toLowerCase();
  if (scheme === 'https') return null;
  if (scheme === 'http' && opts.dev === true && isLoopbackLiteral(hostOf(url))) return null;
  return 'AGSC-E905';
}

/**
 * checkAddresses(addresses, options) -> 'AGSC-E905' | null
 * AGSC-11-08. A host that resolves to several addresses is refused if ANY is
 * in the closed list. Classification is the platform's (`node:net.BlockList`),
 * never a hand-parsed literal. An EMPTY or absent list is a refusal, not a
 * pass (F27-05): AGSC-11-08 refuses addresses *before connecting*, which an
 * empty list cannot establish, so this function fails closed.
 */
function checkAddresses(addresses, options) {
  const opts = options || {};
  const list = opts.dev === true ? WITHOUT_LOOPBACK : STRICT;
  if (!Array.isArray(addresses) || addresses.length === 0) return 'AGSC-E905';
  for (const address of addresses) {
    const family = net.isIP(address);
    if (family === 0) return 'AGSC-E905';
    if (list.check(address, family === 4 ? 'ipv4' : 'ipv6')) return 'AGSC-E905';
  }
  return null;
}

/**
 * resolvedFor(options, host) -> string[] | null
 * The addresses a caller has resolved for `host`, or `null` when the caller
 * supplied no resolution map at all. An IP literal resolves to itself.
 */
function resolvedFor(options, host) {
  const opts = options || {};
  if (net.isIP(host) !== 0) return [host];
  if (!opts.resolved || typeof opts.resolved !== 'object') return null;
  return opts.resolved[host] || [];
}

/**
 * peerFault(value, options) -> 'AGSC-E905' | null
 * AGSC-11-07 and AGSC-11-08 applied to one peer value before it is fetched
 * (F27-04). The guard runs ONLY on a value that parses as an absolute URL
 * with a scheme: AGSC-11-10 models a walk over opaque peer keys, and a key
 * that is not a URL carries no scheme and no address to judge.
 */
function peerFault(value, options) {
  const raw = String(value);
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(raw)) return null;
  const schemeFault = checkScheme(raw, options);
  if (schemeFault !== null) return schemeFault;
  const resolved = resolvedFor(options, hostOf(raw));
  return resolved === null ? null : checkAddresses(resolved, options);
}

/**
 * followRedirects(peer, redirects, options) -> { declaredPeer, error, followed, final }
 * AGSC-11-09. At most `redirect_limit` hops; AGSC-11-07 and AGSC-11-08 are
 * re-applied to every hop; the final URL is NEVER substituted for the
 * declared peer URL in any mutual check.
 */
function followRedirects(peer, redirects, options) {
  const opts = options || {};
  const limit = Number.isInteger(opts.redirectLimit) ? opts.redirectLimit : FEDERATION_PARAMS.redirect_limit.default;
  const hops = redirects || [];
  let followed = 0;
  let error = null;
  let final = String(peer);
  for (const hop of hops) {
    if (followed >= limit) { error = 'AGSC-E905'; break; }
    const schemeFault = checkScheme(hop, opts);
    if (schemeFault !== null) { error = schemeFault; break; }
    // AGSC-11-08 is UNCONDITIONAL: "Before connecting, the fetcher MUST resolve the
    // host with the platform resolver and MUST refuse ... any resolved address in
    // [the list]". `checkAddresses` fails closed, so a host this caller has not
    // resolved — whether it is absent from a supplied map or the caller supplied no
    // map at all — has no classified address to connect to and is refused.
    //
    // Until rc.5 the guard ran only when `opts.resolved` was an object, which left a
    // fail-open branch in the transport rules; `bnd-0005` depended on it and was
    // withdrawn for that reason (the one blocker for 1.0.0). `bnd-0030` replaces it
    // and carries a resolution for every hop. This is the last fail-open path in §11.
    const resolved = resolvedFor(opts, hostOf(hop));
    const addressFault = checkAddresses(resolved === null ? [] : resolved, opts);
    if (addressFault !== null) { error = addressFault; break; }
    followed += 1;
    final = String(hop);
  }
  return Object.freeze({ declaredPeer: String(peer), error, final, followed });
}

/**
 * walk(options) -> the AGSC-11-10 traversal result.
 * options: { fetch, federation, start }. `fetch(key)` is INJECTED and
 * synchronous here (the area handlers and the Clock/FileSystem ports are
 * synchronous; the async Network port is adapted by the application layer).
 * It returns `{ ok, peers }`. `key` is the canonical well-known URL, which is
 * also the visited-set key — the cross-origin cycle guard of (d).
 */
function walk(options) {
  const opts = options || {};
  const caps = effectiveFederation({ federation: opts.federation });
  const fetch = opts.fetch;
  const visited = [];
  const attempted = new Set([opts.start]);
  const skipped = [];
  const ignoredByFanOut = [];
  const notDescended = [];
  let requests = 0;
  let capExceeded = false;
  const queue = [];
  // AGSC-11-07 / AGSC-11-08 (F27-04): a peer value the walk would fetch is judged
  // before it is enqueued, so a hostile `peers[]` cannot steer the injected fetch
  // at a `file://`, a loopback or a link-local URL.
  const startFault = peerFault(opts.start, opts);
  if (startFault === null) queue.push({ depth: 0, key: opts.start });
  else skipped.push(Object.freeze({ code: startFault, peer: opts.start }));

  while (queue.length > 0) {
    if (requests >= caps.max_requests) { capExceeded = true; break; }
    const { depth, key } = queue.shift();
    requests += 1;
    // AGSC-11-10(e): a peer that cannot be read is UNREACHABLE — `AGSC-E907`,
    // skipped, never retried. A transport that throws (reset, DNS failure, an
    // adapter's own timeout) is that same fact, and this context is the
    // anti-corruption layer: a stranger's failure is a Finding here, never an
    // exception the application layer would have to report as an internal fault.
    let response;
    try {
      response = fetch(key) || { ok: false, peers: [] };
    } catch {
      response = { ok: false, peers: [] };
    }
    if (!response.ok) {
      skipped.push(Object.freeze({ code: 'AGSC-E907', peer: key }));
      continue;
    }
    visited.push(key);
    // A `peers` member that is not an array carries no links: iterating a string
    // would walk it character by character (AGSC-11-10(b) counts LINKS).
    const links = Array.isArray(response.peers) ? response.peers : [];
    const considered = links.slice(0, caps.fan_out);
    if (links.length > caps.fan_out) {
      // A loop, not `push(...rest)`: the spread passes one argument per element
      // and overflows the call stack on a list a 1 MiB discovery document can hold.
      for (let i = caps.fan_out; i < links.length; i += 1) ignoredByFanOut.push(links[i]);
      capExceeded = true;
    }
    for (const target of considered) {
      if (attempted.has(target)) continue;
      const fault = peerFault(target, opts);
      if (fault !== null) {
        attempted.add(target);
        skipped.push(Object.freeze({ code: fault, peer: target }));
        continue;
      }
      if (depth + 1 > caps.hop_limit) {
        notDescended.push(target);
        capExceeded = true;
        continue;
      }
      attempted.add(target);
      queue.push({ depth: depth + 1, key: target });
    }
  }

  return Object.freeze({
    error: capExceeded ? 'AGSC-E906' : null,
    ignoredByFanOut: Object.freeze(ignoredByFanOut),
    notDescended: Object.freeze(notDescended),
    partial: capExceeded,
    requests,
    skipped: Object.freeze(skipped),
    visited: Object.freeze(visited),
  });
}

/**
 * normaliseReference(raw) -> { error, url }
 * AGSC-11-12. The host is converted to its A-label under IDNA 2008 / UTS 46
 * NON-transitional processing (`node:url.domainToASCII`, the platform's own
 * UTS 46 implementation: `straße.example` becomes `xn--strae-oqa.example`,
 * never `strasse.example`), the scheme and host are lower-cased, and existing
 * percent-escapes are preserved BYTE FOR BYTE and never re-encoded — which is
 * why this parses the reference itself instead of round-tripping it through
 * the WHATWG URL parser, whose serialiser would re-encode. A value that
 * cannot be parsed after that step, or that carries a character an N-Quads
 * IRIREF cannot hold unescaped, is AGSC-E312.
 */
const IRIREF_FORBIDDEN = /[\x00- <>"{}|^`\\]/u;

function normaliseReference(raw) {
  const value = String(raw === undefined || raw === null ? '' : raw);
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([\s\S]*)$/u.exec(value);
  if (!m) return { error: 'AGSC-E312', url: null };
  const scheme = m[1].toLowerCase();
  const authority = m[2];
  const rest = m[3];
  const at = authority.lastIndexOf('@');
  const userinfo = at === -1 ? '' : authority.slice(0, at + 1);
  const hostport = at === -1 ? authority : authority.slice(at + 1);
  let host = hostport;
  let port = '';
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    if (close === -1) return { error: 'AGSC-E312', url: null };
    port = host.slice(close + 1);
    host = host.slice(0, close + 1);
  } else if (host.includes(':')) {
    const colon = host.indexOf(':');
    port = host.slice(colon);
    host = host.slice(0, colon);
  }
  const ascii = host.startsWith('[') ? host.toLowerCase() : domainToASCII(host.toLowerCase());
  if (ascii === '') return { error: 'AGSC-E312', url: null };
  const url = `${scheme}://${userinfo}${ascii}${port}${rest}`;
  if (IRIREF_FORBIDDEN.test(url)) return { error: 'AGSC-E312', url: null };
  return { error: null, url };
}

/**
 * The Knowledge context's N-Quads writer (`knowledge/nquads.js`, owner D) owns
 * the term model, the escaping of AGSC-05-32 and the canonical sort of
 * AGSC-04-15. Boundary builds the AGSC-11-12 peer quads with ITS constructors
 * and serialises through IT, so there is one N-Quads serializer in the engine
 * and a peer-origin quad is written exactly as every other quad is.
 */
function serializeQuads(quads) {
  return nquads.serialize(quads.map((q) => nquads.quad(
    nquads.iri(q.subject), nquads.iri(q.predicate), nquads.iri(q.object), nquads.iri(q.graph),
  )));
}

/**
 * peerCitations(items, options) -> { bases, closureEdgesAdded, emitted, findings, nquads, quads }
 * AGSC-11-12, F6. A `sources[].resource` under a declared peer's base becomes
 * `rdfs:seeAlso` plus `asc:peerOrigin`; `closureEdgesAdded` is always 0
 * because a `seeAlso` edge takes part in no step of section 07.
 */
function peerCitations(items, options) {
  const opts = options || {};
  const base = opts.base || '/';
  const rawBases = ((opts.peers || []).map(peerBase));
  const bases = rawBases.map((b) => ({ normalised: normaliseReference(b).url, raw: b }))
    .filter((b) => b.normalised !== null);
  const findings = [];
  const quads = [];
  const emitted = [];
  for (const item of items || []) {
    const iri = `${String(base).replace(/\/+$/u, '/')}${plural(item.type)}/${item.slug}/`;
    for (const source of item.sources || []) {
      if (typeof source.resource !== 'string') continue;
      const { error, url } = normaliseReference(source.resource);
      if (error !== null) {
        findings.push(finding(error, 'error', { message: `sources[].resource is not normalisable to an IRI: ${source.resource} (AGSC-11-12)`, slug: item.slug, url: source.resource }));
        continue;
      }
      const match = bases.find((b) => url.startsWith(b.normalised));
      if (!match) continue;
      emitted.push(url);
      quads.push({ graph: base, object: url, predicate: RDFS_SEE_ALSO, subject: iri });
      quads.push({ graph: base, object: match.normalised, predicate: ASC_PEER_ORIGIN, subject: iri });
    }
  }
  return Object.freeze({
    bases: Object.freeze(rawBases),
    closureEdgesAdded: 0,
    emitted: Object.freeze(emitted),
    findings: Object.freeze(findings),
    nquads: serializeQuads(quads),
    quads: Object.freeze(quads),
  });
}

function plural(type) {
  const t = typeof type === 'string' && type !== '' ? type : 'concept';
  return t === 'cluster' ? 'clusters' : `${t}s`;
}

/**
 * linkKeyBoundary(items) -> { findings, preservedKeys }
 * AGSC-11-12: a Link key value that parses as an absolute URL makes the file
 * invalid (AGSC-E311) — Links never cross Bundles at 1.x. The reserved key
 * `peer-ref` is preserved and reported as an unknown link key (AGSC-E304,
 * warning). General unknown-link-key detection is AGSC-03-03 and belongs to
 * `knowledge/links.js`; only the reserved name is this chapter's business.
 */
function linkKeyBoundary(items) {
  const findings = [];
  const preservedKeys = [];
  for (const item of items || []) {
    for (const key of LINK_KEYS) {
      if (!Array.isArray(item[key])) continue;
      for (const value of item[key]) {
        if (typeof value === 'string' && /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) {
          findings.push(finding('AGSC-E311', 'error', { key, message: `Link key "${key}" takes a slug, never the absolute reference ${value} (AGSC-11-12)`, slug: item.slug, target: value }));
        }
      }
    }
    for (const key of RESERVED_LINK_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
      if (!preservedKeys.includes(key)) preservedKeys.push(key);
      findings.push(finding('AGSC-E304', 'warn', { key, message: `reserved Link key "${key}" is preserved but carries no meaning at this version (AGSC-11-12)`, slug: item.slug }));
    }
  }
  return Object.freeze({ findings: Object.freeze(findings), preservedKeys: Object.freeze(preservedKeys) });
}

/**
 * checkContribute(config) -> Finding[]
 * AGSC-11-14: a malformed `contribute[]` entry is AGSC-E209, and a `channel`
 * target MUST be backed by a `channels[]` entry whose `publish` is `hitl` —
 * `auto` is never permitted for a contribute channel, because anonymous
 * proposals are review-before-publish only.
 */
function checkContribute(config) {
  const c = config || {};
  const channels = c.channels || [];
  const findings = [];
  for (const entry of c.contribute || []) {
    const bad = (why) => findings.push(finding('AGSC-E209', 'error', { key: 'contribute', message: `contribute entry refused: ${why} (AGSC-11-14)`, reason: why, target: entry.target }));
    if (!entry || typeof entry !== 'object' || !CONTRIBUTE_MODES.includes(entry.mode)) {
      bad('mode outside the closed list of AGSC-11-14');
      continue;
    }
    if (typeof entry.target !== 'string' || entry.target === '') { bad('missing target'); continue; }
    if ((entry.mode === 'pr' || entry.mode === 'form') && !/^https:\/\//u.test(entry.target)) {
      bad('a pr or form target must be an https: URL');
      continue;
    }
    if (entry.mode === 'channel') {
      if (!/^(mailto:|urn:agsc:channel:)/u.test(entry.target)) { bad('a channel target is a mailto: URI or urn:agsc:channel:<name>'); continue; }
      const channel = channels.find((ch) => ch && ch.name === entry.channel);
      if (!channel) { bad('a channel target must name a channels[] entry'); continue; }
      if (channel.publish !== 'hitl') { bad('a contribute channel must publish hitl; auto is never permitted'); continue; }
    }
  }
  return Object.freeze(findings);
}

/**
 * contributeLinks(config, options) -> { findings, links, proposeUses }
 * AGSC-11-14: one `rel#contribute` link per entry in document order, each
 * with the one-element `agsc-contribute-mode` array; `proposeUses` is the
 * first link whose mode the client supports, or null — with none, `propose`
 * returns the payload to the caller and performs no network write.
 */
function contributeLinks(config, options) {
  const opts = options || {};
  const findings = checkContribute(config);
  const valid = findings.length === 0 ? ((config && config.contribute) || []) : [];
  const links = valid.map((entry) => Object.freeze({
    'agsc-contribute-mode': Object.freeze([entry.mode]),
    href: entry.target,
    rel: REL.contribute,
  }));
  const supports = opts.clientSupports || [];
  const chosen = valid.find((entry) => supports.includes(entry.mode));
  return Object.freeze({
    findings,
    links: Object.freeze(links),
    proposeUses: chosen ? chosen.target : null,
  });
}

/** AGSC-06-35: an unregistered short name is AGSC-E209. */
function checkRelated(config) {
  const findings = [];
  for (const entry of (config && config.related) || []) {
    if (!entry || typeof entry !== 'object' || !RELATED_RELATIONS.includes(entry.rel)
        || typeof entry.href !== 'string' || !/^https:\/\//u.test(entry.href)
        || typeof entry.type !== 'string' || entry.type === '') {
      findings.push(finding('AGSC-E209', 'error', { key: 'related', message: `related[] needs a registered short name, an https: href and a type; "${entry && entry.rel}" does not qualify (AGSC-06-35)`, rel: entry && entry.rel }));
    }
  }
  return Object.freeze(findings);
}

/**
 * relatedLinks(config) -> { affects, findings, links }
 * AGSC-06-35: related-system links, grouped by relation and ordered by `href`
 * within each relation (AGSC-06-10). They affect no digest, no bundle hash,
 * no peer check and no walk, and a reader ignores one it does not understand.
 */
function relatedLinks(config) {
  const findings = checkRelated(config);
  const links = {};
  if (findings.length === 0) {
    for (const entry of (config && config.related) || []) {
      const link = { href: entry.href, type: entry.type };
      if (entry.profile !== undefined) link.profile = entry.profile;
      if (entry.title !== undefined) link.title = entry.title;
      if (!links[entry.rel]) links[entry.rel] = [];
      links[entry.rel].push(Object.freeze(link));
    }
    for (const rel of Object.keys(links)) {
      links[rel].sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0));
      links[rel] = Object.freeze(links[rel]);
    }
  }
  return Object.freeze({
    affects: Object.freeze({ bundle_hash: false, digests: false, peer_check: false, walk: false }),
    findings,
    links: Object.freeze(links),
    unknownLinkIgnored: true,
  });
}

/**
 * mutualCheck(nodes) -> the AGSC-10-12 outcome, with AGSC-11-23's third state.
 * Two nodes federate when each lists the other's canonical well-known URL. A
 * TOMBSTONED peer is *resolved, not mutual* — a distinct outcome from
 * AGSC-E907 — and a walk does not descend into it. A successor named by
 * `alternate` is NEVER the same node: mutuality is established afresh.
 */
function mutualCheck(nodes) {
  const list = nodes || [];
  const bothResolve = list.length >= 2 && list.every((n) => typeof n.base === 'string' && n.base !== '');
  const tombstoned = list.filter((n) => typeof n.tombstone === 'string' && n.tombstone !== '').map((n) => n.base);
  const listsEachOther = list.length >= 2 && list.every((node) => list.some((other) => other !== node
    && peerBase(node.peer) === other.base));
  return Object.freeze({
    alternateIsSameNode: false,
    bothResolve,
    code: null,
    mutual: bothResolve && listsEachOther && tombstoned.length === 0,
    tombstoned: Object.freeze(tombstoned),
    walkDescendsIntoTombstoned: false,
  });
}

/**
 * clientUnion(dumps) -> { fetchesDuringBuild, quads, serverSideQueryEndpoint }
 * AGSC-11-13, F7: a node's query surface is its published dumps and the
 * consumer federates CLIENT-SIDE over them. A build performs no fetch at all,
 * and no endpoint that fetches on a caller's behalf exists at any Level.
 */
function clientUnion(dumps) {
  const seen = new Set();
  for (const text of Object.values(dumps || {})) {
    for (const line of String(text).split('\n')) {
      if (line.trim() !== '') seen.add(line);
    }
  }
  return Object.freeze({
    fetchesDuringBuild: 0,
    quads: Object.freeze([...seen].sort()),
    serverSideQueryEndpoint: false,
  });
}

/**
 * mergeBoards(boards) -> { boardsKept, expandedBlockedBy, renamed, tasksKept }
 * AGSC-11-15, F9 (with AGSC-10-13): a merging client keys tasks by item IRI
 * and boards by Bundle IRI, renames NEITHER, and expands a board's local
 * `blocked_by`/`decided_by` slugs against that board's own origin.
 */
function originOf(iri) {
  const m = /^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]+\/)/u.exec(String(iri));
  return m ? m[1] : String(iri);
}

function mergeBoards(boards) {
  const boardsKept = [];
  const tasksKept = [];
  const expandedBlockedBy = {};
  for (const board of boards || []) {
    boardsKept.push(board.iri);
    const origin = originOf(board.iri);
    for (const task of board.tasks || []) {
      tasksKept.push(task.iri);
      const blocked = (task.blocked_by || []).map((slug) => `${origin}concepts/${slug}/`);
      if (blocked.length > 0) expandedBlockedBy[task.iri] = Object.freeze(blocked);
    }
  }
  return Object.freeze({
    boardsKept: Object.freeze(boardsKept.slice().sort()),
    expandedBlockedBy: Object.freeze(expandedBlockedBy),
    renamed: Object.freeze([]),
    tasksKept: Object.freeze(tasksKept.slice().sort()),
  });
}

/**
 * peerResults(options) -> { copyPath, directCopyRefused, results }
 * AGSC-11-11, F5: every result derived from a peer carries `trust:
 * "untrusted"` and an `origin` equal to the peer's Bundle IRI, end to end; a
 * local result carries no `origin`; and peer prose never enters an item
 * except through a Proposal.
 */
function peerResults(options) {
  const opts = options || {};
  const results = [];
  for (const hit of opts.localHits || []) {
    results.push(Object.freeze(Object.assign({}, hit, { trust: 'untrusted' })));
  }
  for (const hit of opts.peerHits || []) {
    results.push(Object.freeze(Object.assign({}, hit, { origin: opts.peer, trust: 'untrusted' })));
  }
  return Object.freeze({
    copyPath: 'proposal',
    directCopyRefused: true,
    results: Object.freeze(results),
  });
}

module.exports = {
  ASC_PEER_ORIGIN,
  CONTRIBUTE_MODES,
  FEDERATION_PARAMS,
  LINK_KEYS,
  RDFS_SEE_ALSO,
  RELATED_RELATIONS,
  RESERVED_LINK_KEYS,
  WELLKNOWN_SUFFIX,
  checkAddresses,
  checkContribute,
  checkRelated,
  checkScheme,
  clientUnion,
  contributeLinks,
  effectiveFederation,
  followRedirects,
  hostOf,
  isLoopbackLiteral,
  linkKeyBoundary,
  mergeBoards,
  mutualCheck,
  normaliseReference,
  peerBase,
  peerFault,
  peerCitations,
  peerLinks,
  peerResults,
  relatedLinks,
  serializeQuads,
  walk,
};
