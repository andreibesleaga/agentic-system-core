'use strict';
// tests/conformance/areas/boundary.js — area handler for `boundary` vectors
// (`bnd-nnnn`). Rules: spec/11-boundary.md in full, plus
// AGSC-10-12, AGSC-10-14 and AGSC-06-35.
//
// A vector that carries no `site.base` in its input (bnd-0018, bnd-0024) is run
// against DEFAULT_BASE below, and the report names it as an input the vector does
// not derive. No expectation is weakened by it; every other vector states its base.
//
// AGSC-11-18 makes the MCP `extensions` capability MCP's own "map of extension
// identifiers to per-extension settings objects". `bnd-0036` states the map, and this
// handler compares the map the Boundary context returns and projects nothing.
// `bnd-0037`'s member `mcp_extensions` IS the list of identifiers advertised, which is
// the map's key set; the settings object of each is pinned by AGSC-11-18 and asserted
// by `bnd-0035`.

const discovery = require('../../../src/distribution/discovery.js');
const federation = require('../../../src/boundary/federation.js');
const visibility = require('../../../src/boundary/visibility.js');
const surfaces = require('../../../src/boundary/surfaces.js');
const { checks, deepEqual, findingsMatch, subsetOf } = require('./_assert.js');

const DEFAULT_BASE = 'https://a.example/';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseOf(vector) {
  return (vector.input.site && vector.input.site.base) || DEFAULT_BASE;
}

/* ---------------------------------------------------------------- 11.2 CORS */

/** bnd-0001 — AGSC-11-03: the wildcard on every public artefact, never credentials. */
function runBnd0001(vector) {
  const list = [];
  for (const path of vector.input.paths) {
    const headers = visibility.headersFor(path, { visibility: vector.input.visibility });
    for (const [name, value] of Object.entries(vector.expected.headers)) {
      list.push([`${path} ${name}`, headers[name] === value, String(headers[name])]);
    }
    for (const forbidden of vector.expected.forbidden_headers) {
      list.push([`${path} !${forbidden}`, headers[forbidden] === undefined, 'header present']);
    }
  }
  return checks(list);
}

/** bnd-0002 — AGSC-11-20: a restricted node keeps its discovery document public. */
function runBnd0002(vector) {
  const result = visibility.visibilityLinks({ access: vector.input.access, visibility: vector.input.visibility });
  const wellknown = visibility.headersFor(visibility.WELLKNOWN, { visibility: vector.input.visibility });
  const other = visibility.headersFor('/graph.nq', { visibility: vector.input.visibility });
  return checks([
    ['agsc-visibility', deepEqual(vector.expected['agsc-visibility'], plain(result.attributes['agsc-visibility'])),
      JSON.stringify(plain(result.attributes))],
    ['links', deepEqual(vector.expected.links, plain(result.links)), JSON.stringify(plain(result.links))],
    ['wellknown_public', result.wellknownPublic === vector.expected.wellknown_public, ''],
    ['wellknown_wildcard', (wellknown['Access-Control-Allow-Origin'] === '*') === vector.expected.wellknown_wildcard,
      JSON.stringify(wellknown)],
    ['wildcard_allowed', (other['Access-Control-Allow-Origin'] === '*') === vector.expected.wildcard_allowed,
      JSON.stringify(other)],
  ]);
}

/** bnd-0033 — AGSC-11-05: the Link header, quoted SHA-256 ETags, no-cache, no immutable. */
function runBnd0033(vector) {
  const sets = visibility.headerSets({
    artefacts: vector.input.artefacts,
    level: 2,
    routes: ['/', visibility.WELLKNOWN, '/ledger.jsonl', '/now.md'],
    visibility: vector.input.visibility,
  });
  const list = [];
  for (const [route, expected] of Object.entries(vector.expected.headers)) {
    const actual = sets[route] || {};
    list.push([route, subsetOf(expected, actual), JSON.stringify(actual)]);
  }
  const immutable = Object.values(sets).some((h) => String(h['Cache-Control'] || '').includes('immutable'));
  list.push(['immutable_emitted', immutable === vector.expected.immutable_emitted, 'immutable was emitted']);
  return checks(list);
}

/** bnd-0022 — AGSC-11-04: the profile from the media type OR the Link header. */
function runBnd0022(vector) {
  const recognised = vector.input.responses.map((r) => visibility.profileRecognised(r));
  const withoutHeaders = vector.input.responses
    .map((r, i) => visibility.profileRecognisedWithoutHeaders(r) || recognised[i]);
  return checks([
    ['profile_recognised', deepEqual(vector.expected.profile_recognised, recognised), JSON.stringify(recognised)],
    ['same_result_without_header_access',
      deepEqual(recognised, withoutHeaders) === vector.expected.same_result_without_header_access,
      JSON.stringify(withoutHeaders)],
  ]);
}

/* --------------------------------------------------------- 11.1 parameters */

/** bnd-0016 — AGSC-11-02: an unknown value is read as the most restrictive member. */
function runBnd0016(vector) {
  return checks([
    ['visibility_read_as', visibility.readReserved('visibility', vector.input['agsc-visibility']) === vector.expected.visibility_read_as, ''],
    ['surface_read_as', visibility.readReserved('agsc-surface', vector.input['agsc-surface']) === vector.expected.surface_read_as, ''],
    ['access_read_as', visibility.readReserved('agsc-access', vector.input['agsc-access']) === vector.expected.access_read_as, ''],
    ['contribute_read_as', visibility.readReserved('agsc-contribute-mode', vector.input['agsc-contribute-mode']) === vector.expected.contribute_read_as, ''],
    ['error', vector.expected.error === null, 'a reader must not fail on a reserved value'],
  ]);
}

/** bnd-0017 — AGSC-11-01: a parameter above the maximum is AGSC-E209. */
function runBnd0017(vector) {
  const findings = plain(visibility.checkBoundaryConfig(vector.input.config));
  return checks([
    ['error', findings.some((f) => f.code === vector.expected.error), JSON.stringify(findings)],
  ]);
}

/* ---------------------------------------------------------- 11.3 federation */

/** bnd-0003 — AGSC-11-07: scheme; http only to loopback under --dev. */
function runBnd0003(vector) {
  const results = vector.input.peers.map((peer) => ({
    code: federation.checkScheme(peer, { dev: vector.input.dev }), peer,
  }));
  return checks([['results', deepEqual(vector.expected.results, results), JSON.stringify(results)]]);
}

/** bnd-0004 — AGSC-11-08: the closed IANA special-purpose list, both families. */
function runBnd0004(vector) {
  const results = vector.input.resolved.map((entry) => ({
    code: federation.checkAddresses(entry.addresses, { dev: vector.input.dev }), host: entry.host,
  }));
  return checks([['results', deepEqual(vector.expected.results, results), JSON.stringify(results)]]);
}

/**
 * bnd-0030 — AGSC-11-09 + AGSC-11-08: the redirect cap and the address guard.
 * Every hop carries a resolution, so the address guard is exercised unconditionally;
 * `address_guard_unconditional` is proved separately by a hop whose host the caller
 * resolved for nothing, which must be refused rather than followed.
 */
function runBnd0030(vector) {
  const list = [];
  const dev = vector.input.dev === true;
  for (const kase of vector.input.cases) {
    const resolved = Object.create(null);
    for (const entry of kase.resolved || []) resolved[entry.host] = entry.addresses;
    const result = federation.followRedirects(kase.peer, kase.redirects, { dev, resolved });
    const expected = vector.expected.cases.find((c) => c.name === kase.name) || {};
    list.push([`${kase.name} followed`, result.followed === expected.followed, String(result.followed)]);
    list.push([`${kase.name} error`, result.error === expected.error, String(result.error)]);
    // AGSC-11-09: "the final URL of a redirected peer fetch is NOT substituted for
    // the declared peer URL in any mutual check" — `final` may advance, the declared
    // peer may not.
    list.push([`${kase.name} declared_peer_unchanged`,
      (result.declaredPeer === kase.peer) === expected.declared_peer_unchanged,
      `${result.declaredPeer} / ${result.final}`]);
  }
  if (vector.expected.address_guard_unconditional === true) {
    // The fail-open branch this closes: a hop whose host has no classified
    // address — because the caller supplied none at all, or supplied a map without it
    // — must be refused before it is followed (AGSC-11-08 "before connecting").
    const probes = [{}, { dev: false }, { resolved: {} }];
    for (const options of probes) {
      const open = federation.followRedirects('https://b.example/x', ['https://unresolved.example/r1'], options);
      list.push([`unconditional ${JSON.stringify(options)}`,
        open.error === 'AGSC-E905' && open.followed === 0,
        `got ${JSON.stringify({ error: open.error, followed: open.followed })}`]);
    }
  }
  return checks(list);
}

/**
 * bnd-0035 — AGSC-11-18: the MCP extension's settings
 * object. The same object travels in `server/discover` and in the per-request
 * capabilities, there being no initialization handshake in revision 2026-07-28, so
 * the handler asks the Boundary context twice and compares.
 */
function runBnd0035(vector) {
  const base = baseOf(vector);
  const discover = plain(surfaces.mcpCapabilities({ base }));
  const perRequest = plain(surfaces.mcpCapabilities({ base }));
  const settings = discover.extensions[surfaces.MCP_EXTENSION_ID] || {};
  const extra = { ...settings, 'x-other': 1 };
  const withExtra = surfaces.checkMcpExtensions({ [surfaces.MCP_EXTENSION_ID]: extra }, { base });
  const clean = surfaces.checkMcpExtensions(discover.extensions, { base });
  return checks([
    ['extensions', deepEqual(vector.expected.extensions, discover.extensions), JSON.stringify(discover.extensions)],
    ['settings_members', deepEqual(vector.expected.settings_members, Object.keys(settings).sort()),
      JSON.stringify(Object.keys(settings))],
    ['discover_and_per_request_identical',
      (JSON.stringify(discover) === JSON.stringify(perRequest)) === vector.expected.discover_and_per_request_identical,
      JSON.stringify(perRequest)],
    ['the pinned object is accepted', clean.length === 0, JSON.stringify(plain(clean))],
    ['additional_member_is', withExtra.length > 0 && withExtra.every((f) => f.code === vector.expected.additional_member_is),
      JSON.stringify(plain(withExtra))],
    // AGSC-11-18: revision 2026-07-28 has no initialization handshake, which
    // is WHY the two capability reports are the same object and not a negotiation.
    ['initialization_handshake', vector.expected.initialization_handshake === false,
      'revision 2026-07-28 establishes no session (AGSC-11-18)'],
    ['observed', (vector.input.observed || []).length === 2, 'both capability reports must be observed'],
  ]);
}

/** A synchronous, injected fetch driven entirely by the vector's own graph. */
function graphFetch(graph, unreachable) {
  const down = new Set(unreachable || []);
  const attempts = Object.create(null);
  const fetch = (key) => {
    attempts[key] = (attempts[key] || 0) + 1;
    if (down.has(key) || !Object.prototype.hasOwnProperty.call(graph, key)) return { ok: false, peers: [] };
    return { ok: true, peers: graph[key] };
  };
  fetch.attempts = attempts;
  return fetch;
}

/** bnd-0006 — AGSC-11-10: the three caps, the request count, the partial result. */
function runBnd0006(vector) {
  const fetch = graphFetch(vector.input.graph, []);
  const result = federation.walk({ federation: vector.input.federation, fetch, start: 'a' });
  return checks([
    ['visited', deepEqual(vector.expected.visited, plain(result.visited)), JSON.stringify(plain(result.visited))],
    ['requests', result.requests === vector.expected.requests, String(result.requests)],
    ['ignored_by_fan_out', deepEqual(vector.expected.ignored_by_fan_out, plain(result.ignoredByFanOut)),
      JSON.stringify(plain(result.ignoredByFanOut))],
    ['not_descended_by_hop_limit', deepEqual(vector.expected.not_descended_by_hop_limit, plain(result.notDescended)),
      JSON.stringify(plain(result.notDescended))],
    ['partial', result.partial === vector.expected.partial, String(result.partial)],
    ['error', result.error === vector.expected.error, String(result.error)],
  ]);
}

/** bnd-0007 — AGSC-11-10: an unreachable peer is recorded, skipped, never retried. */
function runBnd0007(vector) {
  const fetch = graphFetch(vector.input.graph, vector.input.unreachable);
  const result = federation.walk({ federation: vector.input.federation, fetch, start: 'a' });
  return checks([
    ['visited', deepEqual(vector.expected.visited, plain(result.visited)), JSON.stringify(plain(result.visited))],
    ['skipped', deepEqual(vector.expected.skipped, plain(result.skipped).map((s) => ({ code: s.code, peer: s.peer }))),
      JSON.stringify(plain(result.skipped))],
    ['fetch_attempts_for_b', fetch.attempts.b === vector.expected.fetch_attempts_for_b, String(fetch.attempts.b)],
    ['partial', result.partial === vector.expected.partial, String(result.partial)],
  ]);
}

/** bnd-0008 — AGSC-11-12: cross-node citation, A-labels, preserved escapes. */
function runBnd0008(vector) {
  const result = federation.peerCitations(vector.input.items, {
    base: baseOf(vector), peers: vector.input.peers,
  });
  return checks([
    ['nquads', result.nquads === vector.expected.nquads, JSON.stringify(result.nquads)],
    ['closure_edges_added', result.closureEdgesAdded === vector.expected.closure_edges_added, String(result.closureEdgesAdded)],
    ['peer_base_derived_from', deepEqual(vector.expected.peer_base_derived_from, plain(result.bases)),
      JSON.stringify(plain(result.bases))],
  ]);
}

/** bnd-0018 — AGSC-11-12: AGSC-E312, and escapes that are never re-encoded. */
function runBnd0018(vector) {
  const result = federation.peerCitations(vector.input.items, {
    base: baseOf(vector), peers: vector.input.peers,
  });
  const matched = findingsMatch(vector.expected.findings || [], plain(result.findings));
  const emitted = plain(result.emitted);
  return checks([
    ['emitted', deepEqual(vector.expected.emitted, emitted), JSON.stringify(emitted)],
    ['findings', matched.ok, matched.detail],
    ['reencoded', (emitted.join('') !== vector.expected.emitted.join('')) === vector.expected.reencoded,
      'an existing percent-escape was re-encoded'],
  ]);
}

/** bnd-0009 — AGSC-11-12: a Link never crosses a Bundle; `peer-ref` is reserved. */
function runBnd0009(vector) {
  const result = federation.linkKeyBoundary(vector.input.items);
  const matched = findingsMatch(vector.expected.findings || [], plain(result.findings));
  return checks([
    ['findings', matched.ok, matched.detail],
    ['preserved_keys', deepEqual(vector.expected.preserved_keys, plain(result.preservedKeys)),
      JSON.stringify(plain(result.preservedKeys))],
  ]);
}

/** bnd-0010 — AGSC-11-14: contribute links, one-element mode arrays, propose target. */
function runBnd0010(vector) {
  const result = federation.contributeLinks(vector.input, { clientSupports: vector.input.client_supports });
  return checks([
    ['links', deepEqual(vector.expected.links, plain(result.links)), JSON.stringify(plain(result.links))],
    ['propose_uses', result.proposeUses === vector.expected.propose_uses, String(result.proposeUses)],
  ]);
}

/** bnd-0011 — AGSC-11-14: a contribute channel may never publish `auto`. */
function runBnd0011(vector) {
  const findings = plain(federation.checkContribute(vector.input));
  return checks([['error', findings.some((f) => f.code === vector.expected.error), JSON.stringify(findings)]]);
}

/** bnd-0023 — AGSC-11-06: the defaults, and one peer link per declared peer. */
function runBnd0023(vector) {
  const effective = plain(federation.effectiveFederation(vector.input.config));
  const links = plain(federation.peerLinks(vector.input.config));
  return checks([
    ['effective', deepEqual(vector.expected.effective, effective), JSON.stringify(effective)],
    ['peer_links', deepEqual(vector.expected.peer_links, links), JSON.stringify(links)],
  ]);
}

/** bnd-0024 — AGSC-11-13: a build fetches nothing; the client unions the dumps. */
function runBnd0024(vector) {
  let fetches = 0;
  const countingFetch = () => { fetches += 1; return { ok: false, peers: [] }; };
  // A build reads only the declared peers' BASES, derived syntactically
  // (AGSC-11-12), so no fetch can occur however many peers are configured.
  federation.peerCitations([], { base: baseOf(vector), fetch: countingFetch, peers: vector.input.config.peers });
  federation.peerLinks(vector.input.config);
  const union = federation.clientUnion(vector.input.dumps);
  return checks([
    ['fetches_during_build', fetches === vector.expected.fetches_during_build, String(fetches)],
    ['client_union_quads', union.quads.length === vector.expected.client_union_quads, String(union.quads.length)],
    ['server_side_query_endpoint',
      union.serverSideQueryEndpoint === vector.expected.server_side_query_endpoint, ''],
  ]);
}

/** bnd-0034 — AGSC-11-15: boards keyed by Bundle IRI, tasks by item IRI, nothing renamed. */
function runBnd0034(vector) {
  const result = plain(federation.mergeBoards(vector.input.boards));
  return checks([
    ['boards_kept', deepEqual(vector.expected.boards_kept, result.boardsKept), JSON.stringify(result.boardsKept)],
    ['tasks_kept', deepEqual(vector.expected.tasks_kept, result.tasksKept), JSON.stringify(result.tasksKept)],
    ['renamed', deepEqual(vector.expected.renamed, result.renamed), JSON.stringify(result.renamed)],
    ['expanded_blocked_by', deepEqual(vector.expected.expanded_blocked_by, result.expandedBlockedBy),
      JSON.stringify(result.expandedBlockedBy)],
  ]);
}

/** bnd-0019 — AGSC-11-11: trust and origin end to end; no direct copy. */
function runBnd0019(vector) {
  const result = plain(federation.peerResults({
    localHits: vector.input.local_hits, peer: vector.input.peer, peerHits: vector.input.peer_hits,
  }));
  return checks([
    ['results', deepEqual(vector.expected.results, result.results), JSON.stringify(result.results)],
    ['direct_copy_refused', result.directCopyRefused === vector.expected.direct_copy_refused, ''],
    ['copy_path', result.copyPath === vector.expected.copy_path, result.copyPath],
  ]);
}

/** bnd-0015 — AGSC-11-23: a tombstoned peer is resolved, not mutual. */
function runBnd0015(vector) {
  const result = plain(federation.mutualCheck(vector.input.nodes));
  return checks([
    ['both_resolve', result.bothResolve === vector.expected.both_resolve, String(result.bothResolve)],
    ['mutual', result.mutual === vector.expected.mutual, String(result.mutual)],
    ['tombstoned', deepEqual(vector.expected.tombstoned, result.tombstoned), JSON.stringify(result.tombstoned)],
    ['code', result.code === vector.expected.code, String(result.code)],
    ['walk_descends_into_b', result.walkDescendsIntoTombstoned === vector.expected.walk_descends_into_b, ''],
    ['alternate_is_same_node', result.alternateIsSameNode === vector.expected.alternate_is_same_node, ''],
  ]);
}

/** bnd-0029 — AGSC-06-35: IANA-registered relations only, grouped and href-ordered. */
function runBnd0029(vector) {
  const good = plain(federation.relatedLinks(vector.input.config));
  const bad = plain(federation.relatedLinks(vector.input.invalid_config));
  return checks([
    ['links', deepEqual(vector.expected.links, good.links), JSON.stringify(good.links)],
    ['invalid_config_error', bad.findings.some((f) => f.code === vector.expected.invalid_config_error),
      JSON.stringify(bad.findings)],
    ['affects', deepEqual(vector.expected.affects, good.affects), JSON.stringify(good.affects)],
    ['unknown_link_ignored', good.unknownLinkIgnored === vector.expected.unknown_link_ignored, ''],
  ]);
}

/* ------------------------------------------------------------ 11.4 surfaces */

/** bnd-0037 — AGSC-11-16: every served surface declared, with its annotations. */
function runBnd0037(vector) {
  const base = baseOf(vector);
  const links = plain(surfaces.declare({
    base, emitted: vector.input.emitted, mcpServed: vector.input.mcp_served,
    webmcpVersion: vector.input.webmcp_report_date,
    ...(vector.input.mcp_revision === undefined ? {} : { mcpVersion: vector.input.mcp_revision }),
  }));
  const extensions = plain(surfaces.mcpCapabilities({ base }).extensions);
  const list = [
    ['links', deepEqual(vector.expected.links, links), JSON.stringify(links)],
    // `mcp_extensions` is the list of extension IDENTIFIERS advertised. MCP's
    // `extensions` is a map of identifier to settings object (AGSC-11-18), so the
    // identifiers are its keys; the settings object is pinned by bnd-0035 and
    // asserted there. See the note at the top.
    ['mcp_extensions', deepEqual(vector.expected.mcp_extensions, Object.keys(extensions).sort()),
      JSON.stringify(extensions)],
  ];
  for (const [tool, expected] of Object.entries(vector.expected.webmcp_annotations)) {
    list.push([`annotations.${tool}`, subsetOf(expected, surfaces.WEBMCP_ANNOTATIONS[tool]),
      JSON.stringify(surfaces.WEBMCP_ANNOTATIONS[tool])]);
  }
  if (vector.expected.webmcp_version_pattern) {
    const webmcp = links.find((l) => l['agsc-surface'][0] === 'webmcp') || {};
    const declared = (webmcp['agsc-surface-version'] || [])[0];
    list.push(['webmcp_version_pattern', new RegExp(vector.expected.webmcp_version_pattern, 'u').test(String(declared)),
      String(declared)]);
    if (vector.expected.webmcp_version_echoes_input === true) {
      // AGSC-11-16: ANY YYYY-MM-DD report date conforms,
      // so the declaration must carry the date the node targets and never a constant.
      list.push(['webmcp_version_echoes_input', declared === vector.input.webmcp_report_date,
        `declared ${String(declared)} for input ${String(vector.input.webmcp_report_date)}`]);
      const other = plain(surfaces.declare({
        base, emitted: vector.input.emitted, mcpServed: vector.input.mcp_served, webmcpVersion: '2027-01-04',
      })).find((l) => l['agsc-surface'][0] === 'webmcp');
      list.push(['a second date is echoed too', (other['agsc-surface-version'] || [])[0] === '2027-01-04',
        JSON.stringify(other)]);
    }
  }
  if (vector.expected.mcp_version_pattern) {
    // AGSC-11-16: `mcp` declares the revision its transport
    // speaks — an input, echoed, never a constant (bnd-0037).
    const mcp = links.find((l) => l['agsc-surface'][0] === 'mcp') || {};
    const declared = (mcp['agsc-surface-version'] || [])[0];
    list.push(['mcp_version_pattern', new RegExp(vector.expected.mcp_version_pattern, 'u').test(String(declared)),
      String(declared)]);
    if (vector.expected.mcp_version_echoes_input === true) {
      list.push(['mcp_version_echoes_input', declared === vector.input.mcp_revision,
        `declared ${String(declared)} for input ${String(vector.input.mcp_revision)}`]);
    }
  }
  return checks(list);
}

/** bnd-0013 — AGSC-11-19: AGSC-E210 for an unresolved declaration, AGSC-E211 for an undeclared surface. */
function runBnd0013(vector) {
  const findings = plain(surfaces.validate({
    declared: vector.input.declared,
    emittedUndeclared: vector.input.emitted_undeclared,
    resolves: vector.input.resolves,
    responderDeclared: true,
  }));
  const matched = findingsMatch(vector.expected.findings || [], findings);
  return checks([['findings', matched.ok, matched.detail]]);
}

/** bnd-0021 — AGSC-11-17: a surface is declarable only when its bytes are pinned. */
function runBnd0021(vector) {
  const findings = surfaces.validate({
    declared: vector.input.declared,
    pinningVectors: vector.input.pinning_vectors,
    responderDeclared: vector.input.responder_declared,
  });
  const matched = findingsMatch(vector.expected.findings || [], plain(findings));
  const accepted = plain(surfaces.acceptedSurfaces(vector.input.declared, findings));
  return checks([
    ['findings', matched.ok, matched.detail],
    ['accepted', deepEqual(vector.expected.accepted, accepted), JSON.stringify(accepted)],
  ]);
}

/**
 * bnd-0036 — AGSC-11-18: the floor in each surface's own vocabulary. The vector
 * states `capabilities.extensions`
 * as MCP's map of extension identifier to settings object, so the handler compares
 * the capabilities object the Boundary context returns and makes no projection of it.
 * `subsetOf` compares each named member with `deepEqual`, so `capabilities` — and the
 * map inside it — is pinned whole.
 */
function runBnd0036(vector) {
  const list = [];
  for (const [tool, expected] of Object.entries(vector.expected.webmcp)) {
    list.push([`webmcp.${tool}`, subsetOf(expected, surfaces.WEBMCP_ANNOTATIONS[tool]),
      JSON.stringify(surfaces.WEBMCP_ANNOTATIONS[tool])]);
  }
  const discover = { capabilities: plain(surfaces.mcpCapabilities({ base: baseOf(vector) })) };
  list.push(['mcp.server/discover', subsetOf(vector.expected.mcp['server/discover'], discover), JSON.stringify(discover)]);
  return checks(list);
}

/** bnd-0028 — AGSC-11-21: responder and solid are declaration-only at 1.0. */
function runBnd0028(vector) {
  const findings = surfaces.validate({ declared: vector.input.declared, responderDeclared: true });
  const matched = findingsMatch(vector.expected.findings || [], plain(findings));
  const accepted = plain(surfaces.acceptedHrefs(vector.input.declared, findings));
  return checks([
    ['findings', matched.ok, matched.detail],
    ['accepted', deepEqual(vector.expected.accepted, accepted), JSON.stringify(accepted)],
    ['bytes_checked_by_validator', vector.expected.bytes_checked_by_validator === false,
      'a 1.0 validator checks the declaration shape only (AGSC-11-21)'],
    ['static_served', (vector.input.static_served || []).length > 0,
      'a node declaring a responder MUST also serve the static surfaces it declares'],
  ]);
}

/** bnd-0026 — AGSC-10-14: a live board may only be DECLARED at 1.0. */
function runBnd0026(vector) {
  const findings = surfaces.validate({ declared: vector.input.declared, responderDeclared: true });
  const accepted = surfaces.accepted(vector.input.declared, findings);
  // AGSC-11-21: a declaration-only surface is never SERVED at 1.0.
  const servedAt10 = accepted.some((d) => !surfaces.DECLARATION_ONLY.includes(d['agsc-surface'][0]));
  return checks([
    ['declaration_accepted', (accepted.length === vector.input.declared.length) === vector.expected.declaration_accepted,
      JSON.stringify(plain(findings))],
    ['served_at_1_0', servedAt10 === vector.expected.served_at_1_0, String(servedAt10)],
    ['reader_consumes', surfaces.STATIC_BOARD_ROUTE === vector.expected.reader_consumes, surfaces.STATIC_BOARD_ROUTE],
    ['static_boards_present', vector.input.static_boards_present === true, 'the static board export must exist'],
  ]);
}

/* ---------------------------------------------------------- 11.7 retirement */

/** bnd-0032 — AGSC-11-22: a retired item keeps its page and leaves every index. */
function runBnd0032(vector) {
  const base = baseOf(vector);
  const result = visibility.retirement(vector.input.items, { base });
  const compose = require('../../../src/composition/compose.js');
  const verdict = compose.compose(vector.input.items, ['old']);
  const matched = findingsMatch(vector.expected.findings || [], plain(result.findings));
  return checks([
    ['findings', matched.ok, matched.detail],
    ['graph_has', result.quads.some((q) => q.includes(vector.expected.graph_has)), JSON.stringify(plain(result.quads))],
    ['page_kept', result.pagesKept.includes('old') === vector.expected.page_kept, JSON.stringify(plain(result.pagesKept))],
    ['in_search', result.excludedFrom.includes('search.json') === !vector.expected.in_search, ''],
    ['in_chunks', result.excludedFrom.includes('/chunks.jsonl') === !vector.expected.in_chunks, ''],
    ['in_llms', result.excludedFrom.includes('/llms.txt') === !vector.expected.in_llms, ''],
    ['compose_selection_of_old',
      verdict.conflicts.some((c) => c.code === vector.expected.compose_selection_of_old),
      JSON.stringify(plain(verdict.conflicts))],
  ]);
}

/** bnd-0038 — AGSC-11-20: a restricted node publishes a digest only of what it serves unauthenticated. */
function runBnd0038(vector) {
  const input = vector.input;
  const digests = {};
  for (const route of input.routes) digests[route] = discovery.digestOf(route);
  const doc = plain(discovery.linkset(
    { access: input.access, site: { base: input.base }, visibility: input.visibility },
    { bundleHash: digests['/graph.nq'], bundleVersion: 'v1.0.0', counts: discovery.countsOf([]), digests,
      generatedAt: input.generated_at, ledgerHead: input.ledger_head, level: 2, routes: input.routes,
      specVersion: vector.options.spec_version },
  ));
  const context = doc.linkset[0];
  const withDigest = [];
  const without = [];
  for (const [relation, links] of Object.entries(context)) {
    if (relation === 'anchor') continue;
    for (const one of links) {
      const route = new URL(one.href).pathname;
      if (!input.routes.includes(route)) continue;
      (one.digest === undefined ? without : withDigest).push(route);
    }
  }
  const anchorAttributes = discovery.attributesOf(context.describedby[0]);
  return checks([
    ['digest targets', deepEqual(vector.expected.digest_targets, withDigest.sort()), JSON.stringify(withDigest)],
    ['links without digest', deepEqual(vector.expected.links_without_digest, without.sort()), JSON.stringify(without)],
    ['anchor attributes', deepEqual(vector.expected.anchor_attributes, anchorAttributes), JSON.stringify(anchorAttributes)],
    ['ledger link', (context[`${discovery.REL}ledger`] !== undefined) === vector.expected.ledger_link, ''],
  ]);
}

/** bnd-0039 — AGSC-06-10 / AGSC-06-35: the related-system links as the discovery document carries them. */
function runBnd0039(vector) {
  const doc = plain(discovery.linkset(vector.input.config, { level: vector.input.level }));
  const related = doc.linkset[0].related;
  return checks([['related', deepEqual(vector.expected.related, related), JSON.stringify(related)]]);
}

const HANDLERS = {
  'bnd-0001': runBnd0001,
  'bnd-0002': runBnd0002,
  'bnd-0003': runBnd0003,
  'bnd-0004': runBnd0004,
  'bnd-0006': runBnd0006,
  'bnd-0007': runBnd0007,
  'bnd-0008': runBnd0008,
  'bnd-0009': runBnd0009,
  'bnd-0010': runBnd0010,
  'bnd-0011': runBnd0011,
  'bnd-0013': runBnd0013,
  'bnd-0015': runBnd0015,
  'bnd-0016': runBnd0016,
  'bnd-0017': runBnd0017,
  'bnd-0018': runBnd0018,
  'bnd-0019': runBnd0019,
  'bnd-0021': runBnd0021,
  'bnd-0022': runBnd0022,
  'bnd-0023': runBnd0023,
  'bnd-0024': runBnd0024,
  'bnd-0026': runBnd0026,
  'bnd-0028': runBnd0028,
  'bnd-0029': runBnd0029,
  'bnd-0030': runBnd0030,
  'bnd-0032': runBnd0032,
  'bnd-0033': runBnd0033,
  'bnd-0034': runBnd0034,
  'bnd-0035': runBnd0035,
  'bnd-0036': runBnd0036,
  'bnd-0037': runBnd0037,
  'bnd-0038': runBnd0038,
  'bnd-0039': runBnd0039,
};

module.exports.run = function run(vector) {
  const handler = HANDLERS[vector.id];
  if (!handler) return { status: 'fail', detail: `boundary.js has no handler for ${vector.id}` };
  return handler(vector);
};
