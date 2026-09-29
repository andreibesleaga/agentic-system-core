'use strict';
/**
 * CONTEXT Boundary — the anti-corruption layer around every agent surface.
 * Implements AGSC-11-16 (DECLARE: one `rel#surface` link per served surface,
 * its target, its `agsc-surface`/`agsc-surface-version`/`agsc-access` target
 * attributes, derived from what the writer emits), AGSC-11-17 (PIN: a surface
 * may be declared only when its bytes are pinned by a rule and proved by a
 * required vector), AGSC-11-18 (INHERIT: the security floor expressed in each
 * external surface's own vocabulary — WebMCP annotation hints, the MCP
 * extension identifier), AGSC-11-19 (PROVE: AGSC-E210 for a declaration with
 * no implementation, the warning AGSC-E211 for an emitted surface with no
 * declaration), AGSC-11-21 (responder and solid are declaration-only at 1.0;
 * a responder names its protocol by the prefix of its version) and
 * AGSC-10-14 (a live board is a responder, never served at 1.0).
 * Requirements: PRD-057.
 *
 * THIS MODULE IS THE ONE PLACE THAT NAMES AN EXTERNAL PROTOCOL VERSION.
 * The wire version the stdio transport negotiates, the revision the `mcp`
 * surface declares and the WebMCP report date live here and nowhere else:
 * a tool function must never carry a foreign version string (the
 * anti-corruption rule of docs/ARCHITECTURE-DDD.md 2).
 *
 * Security rows of docs/SECURITY-CONSIDERATIONS.md this module addresses:
 * "surface spoofing through a false declaration" (AGSC-11-17/11-19 — a
 * surface is declarable only when a rule pins its bytes and a required vector
 * proves them) and the consent class carried by `agsc-access`.
 */

/** The MCP wire revision `@modelcontextprotocol/sdk@1.30.0` speaks. */
const MCP_PROTOCOL_VERSION = '2025-11-25';
/** The oldest revision that transport negotiates down to. */
const MCP_PROTOCOL_MIN_VERSION = '2025-03-26';
/**
 * AGSC-11-16: the MCP revision the specification targets.
 * (2026-09-24) the `mcp` surface declares the revision its transport actually speaks
 * — `MCP_PROTOCOL_VERSION` by default — and this target is no longer a pin.
 */
const MCP_SURFACE_VERSION = '2026-07-28';
/**
 * AGSC-11-16: the WebMCP Draft Community Group Report date this node targets by
 * default. The rule pins NO particular date — "any such
 * date is conforming" — because the report is a living document. This constant is
 * therefore a default, not a pin: `declare({webmcpVersion})` echoes whatever date the
 * node targets, and `bnd-0037` asserts the echo and the `YYYY-MM-DD` shape, never a
 * value.
 */
const WEBMCP_SURFACE_VERSION = '2026-09-15';
/** AGSC-11-16: the shape every `agsc-surface-version` of `webmcp` takes. */
const WEBMCP_VERSION_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
/** AGSC-11-18 / MCP SEP-2133: the extension identifier this node advertises. */
const MCP_EXTENSION_ID = 'com.agenticsystemcore/knowledge';
/** AGSC-11-18: the ONE member of this extension's settings object. */
const MCP_EXTENSION_SETTINGS_MEMBERS = Object.freeze(['linkset']);
/** AGSC-06-07: the discovery document's route, which is that member's value. */
const WELLKNOWN_ROUTE = '/.well-known/knowledge-linkset';

/** AGSC-06-10: the extension relation URIs of the boundary chapter. */
const REL = Object.freeze({
  access: 'https://w3id.org/agentic-system-core/rel#access',
  contribute: 'https://w3id.org/agentic-system-core/rel#contribute',
  peer: 'https://w3id.org/agentic-system-core/rel#peer',
  surface: 'https://w3id.org/agentic-system-core/rel#surface',
});

/** AGSC-09-13: the seven tools, in code-point order. */
const TOOL_NAMES = Object.freeze(['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search']);

/**
 * AGSC-11-18, the WebMCP half: `readOnlyHint` on the five read tools,
 * `consequentialHint` on the two write tools, `untrustedContentHint` on every
 * tool whose result carries prose (`links` returns edges, so it carries none).
 */
const WEBMCP_ANNOTATIONS = Object.freeze({
  ask: Object.freeze({ readOnlyHint: true, untrustedContentHint: true }),
  compose: Object.freeze({ readOnlyHint: true, untrustedContentHint: true }),
  links: Object.freeze({ readOnlyHint: true, untrustedContentHint: false }),
  propose: Object.freeze({ consequentialHint: true, readOnlyHint: false, untrustedContentHint: true }),
  read: Object.freeze({ readOnlyHint: true, untrustedContentHint: true }),
  remember: Object.freeze({ consequentialHint: true, readOnlyHint: false, untrustedContentHint: true }),
  search: Object.freeze({ readOnlyHint: true, untrustedContentHint: true }),
});

/**
 * AGSC-11-16: the built-in surfaces, their entry route, their fixed access
 * class and whether `agsc-surface-version` is REQUIRED. `responder`, `solid`
 * and `a2a-card` carry no derivable route — they come from `surfaces[]`.
 */
const BUILT_IN = Object.freeze({
  chunks: Object.freeze({ access: 'none', emitted: '/chunks.jsonl', route: '/chunks.jsonl', version: null }),
  'llms-txt': Object.freeze({ access: 'none', emitted: '/llms.txt', route: '/llms.txt', version: null }),
  mcp: Object.freeze({ access: 'consent', emitted: null, route: '/specs/mcp/', version: MCP_PROTOCOL_VERSION }),
  webmcp: Object.freeze({ access: 'consent', emitted: '/compose/', route: '/compose/', version: WEBMCP_SURFACE_VERSION }),
});

/** AGSC-11-16: the closed `agsc-surface` list; anything else must be `x-<vendor>-<name>`. */
const SURFACE_NAMES = Object.freeze(['llms-txt', 'chunks', 'mcp', 'webmcp', 'a2a-card', 'solid', 'responder']);
/** AGSC-11-16: the closed `agsc-access` list, most restrictive last (AGSC-11-02). */
const ACCESS_CLASSES = Object.freeze(['none', 'consent', 'credential']);
/** AGSC-11-21: surfaces that require `agsc-surface-version`. */
const VERSION_REQUIRED = Object.freeze(['mcp', 'webmcp', 'a2a-card', 'solid', 'responder']);
/** AGSC-11-21: surfaces that are declaration-only at 1.0 — a validator checks the shape. */
const DECLARATION_ONLY = Object.freeze(['a2a-card', 'solid', 'responder']);
/**
 * AGSC-11-17: the surfaces whose bytes THIS specification pins and a required
 * vector proves. A declaration outside this set needs an external pin
 * (`agsc-surface-version`) or a pinning vector, or it is AGSC-E210.
 */
const PINNED_BY_SPEC = Object.freeze(['llms-txt', 'chunks', 'mcp', 'webmcp']);
/** AGSC-10-14 / AGSC-11-21: the protocol prefixes a responder's version may name. */
const RESPONDER_PROTOCOLS = Object.freeze(['mcp', 'a2a']);
/** AGSC-10-13: the only board a 1.0 reader consumes. */
const STATIC_BOARD_ROUTE = '/boards/index.json';

function finding(code, severity, extra) {
  return Object.freeze(Object.assign({ code, message: '', severity }, extra || {}));
}

function firstValue(value) {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined;
  return value;
}

function absolute(base, route) {
  return String(base).replace(/\/+$/u, '/') + String(route).replace(/^\//u, '');
}

/**
 * declare({ base, emitted, mcpServed, mcpVersion, surfaces, webmcpVersion }) -> link objects
 * AGSC-11-16. One `rel#surface` link per surface actually served, ordered by
 * `href` within the relation (AGSC-06-10). `emitted[]` names the routes the
 * writer emitted; `mcpServed` says whether the local tool server is served;
 * `surfaces[]` is the configuration for the three declaration-only surfaces.
 *
 * `webmcpVersion` is the `YYYY-MM-DD` Draft Community Group Report date this node
 * targets. It is an INPUT, not a constant: AGSC-11-16
 * conforms any such date, and a hard-coded date would fail every node that targets
 * a later report than the one written here. Vector `bnd-0037` asserts only that the declared value echoes the input and matches the shape.
 * A value that is not a `YYYY-MM-DD` date is not declared: the default — itself a
 * conforming date — stands, because AGSC-11-16 admits no other form and this
 * specification registers no code for a malformed one.
 */
function declare(options) {
  const opts = options || {};
  const base = opts.base || '/';
  const emitted = new Set(opts.emitted || []);
  const webmcpVersion = WEBMCP_VERSION_RE.test(String(opts.webmcpVersion || ''))
    ? String(opts.webmcpVersion) : WEBMCP_SURFACE_VERSION;
  // AGSC-11-16: `mcp` declares the revision its transport
  // speaks, an input echoed like the WebMCP date, defaulting to the one the
  // pinned SDK speaks.
  const mcpVersion = WEBMCP_VERSION_RE.test(String(opts.mcpVersion || ''))
    ? String(opts.mcpVersion) : MCP_PROTOCOL_VERSION;
  const links = [];
  for (const [name, spec] of Object.entries(BUILT_IN)) {
    const served = name === 'mcp' ? Boolean(opts.mcpServed) : (spec.emitted !== null && emitted.has(spec.emitted));
    if (!served) continue;
    const link = { 'agsc-access': [spec.access], 'agsc-surface': [name], href: absolute(base, spec.route), rel: REL.surface };
    const version = name === 'webmcp' ? webmcpVersion : (name === 'mcp' ? mcpVersion : spec.version);
    if (version !== null) link['agsc-surface-version'] = [version];
    links.push(Object.freeze(sortMembers(link)));
  }
  for (const entry of opts.surfaces || []) {
    const link = {
      'agsc-access': [entry.access || 'credential'],
      'agsc-surface': [entry.surface],
      href: entry.target,
      rel: REL.surface,
    };
    if (entry.version !== undefined && entry.version !== null) link['agsc-surface-version'] = [entry.version];
    links.push(Object.freeze(sortMembers(link)));
  }
  links.sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0));
  return Object.freeze(links);
}

/** JSON member names in JCS order (AGSC-04-05) so the emitted link set is canonical. */
function sortMembers(object) {
  const out = {};
  for (const key of Object.keys(object).sort()) out[key] = object[key];
  return out;
}

/**
 * validate({ declared, emittedUndeclared, resolves, pinningVectors, responderDeclared, staticServed })
 *   -> Finding[]
 * AGSC-11-17/11-19/11-21. AGSC-E210 (error) for a declaration this node
 * cannot back: an unresolvable target, an extension surface with no pinning
 * vector, an `a2a-card` with no responder behind it (AGSC-06-07/06-34), a
 * declaration-only surface missing `agsc-surface-version`, a responder whose
 * version names no known protocol, or an `agsc-access` value outside the
 * closed list. AGSC-E211 (warning) for an emitted surface with no declaration.
 */
function validate(options) {
  const opts = options || {};
  const resolves = opts.resolves || {};
  const pinningVectors = opts.pinningVectors || {};
  const findings = [];
  for (const entry of opts.declared || []) {
    const href = entry.href;
    const name = firstValue(entry['agsc-surface']);
    const version = firstValue(entry['agsc-surface-version']);
    const access = firstValue(entry['agsc-access']);
    const reject = (why) => findings.push(finding('AGSC-E210', 'error', { href, message: `surface declaration ${href} refused: ${why}`, reason: why, surface: name }));

    if (Object.prototype.hasOwnProperty.call(resolves, href) && resolves[href] === false) {
      reject('declared surface target does not resolve');
      continue;
    }
    if (access !== undefined && !ACCESS_CLASSES.includes(access)) {
      reject('agsc-access outside the closed list of AGSC-11-16');
      continue;
    }
    if (VERSION_REQUIRED.includes(name) && (version === undefined || version === '')) {
      reject('agsc-surface-version is REQUIRED for this surface (AGSC-11-16, AGSC-11-21)');
      continue;
    }
    if (name === 'responder') {
      const protocol = String(version).split(':')[0];
      if (!RESPONDER_PROTOCOLS.includes(protocol)) {
        reject('a responder names its protocol by the prefix of agsc-surface-version (AGSC-11-21)');
        continue;
      }
    }
    if (name === 'a2a-card' && opts.responderDeclared !== true) {
      reject('an agent card without a declared responder endpoint is AGSC-E210 (AGSC-06-07, AGSC-11-17)');
      continue;
    }
    if (!SURFACE_NAMES.includes(name)) {
      const vectors = pinningVectors[name];
      if (!Array.isArray(vectors) || vectors.length === 0) {
        reject('an extension surface may not be declared without a pinning vector (AGSC-11-17)');
        continue;
      }
    }
  }
  for (const href of opts.emittedUndeclared || []) {
    findings.push(finding('AGSC-E211', 'warn', { href, message: `${href} is emitted but never declared in the discovery document (AGSC-11-16)` }));
  }
  return Object.freeze(findings);
}

/** The declarations `validate` did not reject, in declaration order. */
function accepted(declared, findings) {
  const rejected = new Set((findings || []).filter((f) => f.code === 'AGSC-E210').map((f) => f.href));
  return Object.freeze((declared || []).filter((d) => !rejected.has(d.href)));
}

/** AGSC-11-17: the surface NAMES a declaration set may keep. */
function acceptedSurfaces(declared, findings) {
  return Object.freeze(accepted(declared, findings).map((d) => firstValue(d['agsc-surface'])));
}

/** The surface TARGETS a declaration set may keep (AGSC-11-21's vocabulary). */
function acceptedHrefs(declared, findings) {
  return Object.freeze(accepted(declared, findings).map((d) => d.href));
}

/**
 * AGSC-11-18, the MCP half: what `server/discover` advertises in its capabilities,
 * and what the per-request capabilities carry. The two are THE SAME OBJECT — revision
 * `2026-07-28` has no initialization handshake, so there is no moment at which they
 * could differ.
 *
 * `extensions` is a MAP of extension identifier to that extension's settings object,
 * as MCP defines it. AGSC-11-18 pins this node's settings object:
 * exactly one member, `linkset`, the absolute `https` URL of `/.well-known/
 * knowledge-linkset` (AGSC-06-07), and no other. Vector `bnd-0035`.
 *
 * Vector `bnd-0036` states the map, so nothing reads this return value as a bare
 * identifier list. `bnd-0037`'s `mcp_extensions` member is the list of identifiers
 * advertised and is the map's key set by definition.
 *
 * @param {{base?:string}} options  the node's `site.base`
 */
function mcpCapabilities(options) {
  const base = (options || {}).base || '/';
  return Object.freeze({
    extensions: Object.freeze({
      [MCP_EXTENSION_ID]: Object.freeze({ linkset: absolute(base, WELLKNOWN_ROUTE) }),
    }),
  });
}

/**
 * checkMcpExtensions(extensions, { base }) -> Finding[]
 * AGSC-11-18: "a node MUST emit that member and MUST emit no
 * other". A missing, wrong or additional member is `AGSC-E210` from
 * `validate-wellknown` — the same code AGSC-11-16/11-19 already give a declaration a
 * node cannot back. Vector `bnd-0035`.
 */
function checkMcpExtensions(extensions, options) {
  const base = (options || {}).base || '/';
  const findings = [];
  const map = extensions && typeof extensions === 'object' && !Array.isArray(extensions) ? extensions : null;
  const reject = (why) => findings.push(finding('AGSC-E210', 'error',
    { message: `the MCP extensions map is refused: ${why} (AGSC-11-18)`, reason: why }));
  if (map === null) {
    reject('extensions must be a map of extension identifier to settings object');
    return Object.freeze(findings);
  }
  const settings = map[MCP_EXTENSION_ID];
  if (settings === undefined || settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    reject(`${MCP_EXTENSION_ID} must carry a settings object`);
    return Object.freeze(findings);
  }
  for (const member of Object.keys(settings)) {
    if (!MCP_EXTENSION_SETTINGS_MEMBERS.includes(member)) {
      reject(`${JSON.stringify(member)} is not a member of this extension's settings object`);
    }
  }
  for (const member of MCP_EXTENSION_SETTINGS_MEMBERS) {
    if (!Object.prototype.hasOwnProperty.call(settings, member)) reject(`${member} is REQUIRED`);
  }
  const expected = absolute(base, WELLKNOWN_ROUTE);
  if (Object.prototype.hasOwnProperty.call(settings, 'linkset') && settings.linkset !== expected) {
    reject(`linkset must be ${expected}, not ${JSON.stringify(settings.linkset)}`);
  }
  return Object.freeze(findings);
}

module.exports = {
  finding,
  ACCESS_CLASSES,
  BUILT_IN,
  DECLARATION_ONLY,
  MCP_EXTENSION_ID,
  MCP_PROTOCOL_MIN_VERSION,
  MCP_PROTOCOL_VERSION,
  MCP_SURFACE_VERSION,
  PINNED_BY_SPEC,
  REL,
  RESPONDER_PROTOCOLS,
  STATIC_BOARD_ROUTE,
  SURFACE_NAMES,
  TOOL_NAMES,
  VERSION_REQUIRED,
  WEBMCP_ANNOTATIONS,
  WEBMCP_SURFACE_VERSION,
  WEBMCP_VERSION_RE,
  accepted,
  acceptedHrefs,
  acceptedSurfaces,
  checkMcpExtensions,
  declare,
  mcpCapabilities,
  validate,
};
